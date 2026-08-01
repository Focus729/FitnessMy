/**
 * Реестр AI-провайдеров и предохранитель по числу вызовов — раздел 15.1.
 *
 * Требования, реализованные здесь:
 *   • по умолчанию AI выключен целиком (см. data/defaults.ts);
 *   • локальный счётчик вызовов с месячным лимитом (по умолчанию 200);
 *   • любой ответ — черновик, он попадает в форму, а не в дневник;
 *   • при отсутствии сети или ключа функции не показываются вообще.
 */
import type { AISettings, Food } from '@/domain/model';
import type { Repositories } from '@/data/repositories/types';
import { anthropic } from './providers/anthropic';
import { createOpenAICompatible } from './providers/openaiCompatible';
import { AIError, type AIAdapter, type AIPrompt, type AIResult } from './types';

export { AIError } from './types';
export type { AIAdapter, AIPrompt, AIResult } from './types';

export const PROVIDERS: AIAdapter[] = [
  anthropic,
  createOpenAICompatible({
    id: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
    costHint: 'ai.estimateCost',
    capabilities: ['text', 'vision'],
  }),
  createOpenAICompatible({
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['google/gemini-flash-1.5', 'meta-llama/llama-3.1-8b-instruct'],
    costHint: 'ai.estimateCost',
    capabilities: ['text', 'vision'],
  }),
];

export function getProvider(id: string | null): AIAdapter | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export type AIFeature = keyof AISettings['features'];

/**
 * Доступна ли функция прямо сейчас.
 * Если нет — пункт НЕ показывается в интерфейсе (не серым и не с ошибкой).
 */
export function isFeatureAvailable(settings: AISettings, feature: AIFeature): boolean {
  if (!settings.enabled) return false;
  if (!settings.apiKey || !settings.provider || !settings.model) return false;
  if (!settings.features[feature]) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return !isLimitReached(settings);
}

export function isLimitReached(settings: AISettings): boolean {
  const monthKey = new Date().toISOString().slice(0, 7);
  if (settings.callsMonthKey !== monthKey) return false;
  return settings.callsThisMonth >= settings.monthlyCallLimit;
}

/**
 * Единственная точка вызова AI: считает вызовы и сбрасывает счётчик
 * при смене месяца.
 */
export async function callAI(
  repos: Repositories,
  prompt: AIPrompt,
  signal?: AbortSignal,
): Promise<AIResult> {
  const settings = await repos.settings.get();
  const ai = settings.ai;
  const provider = getProvider(ai.provider);

  if (!ai.enabled || !provider || !ai.apiKey || !ai.model) throw new AIError('noKey');
  if (isLimitReached(ai)) throw new AIError('limit');

  const monthKey = new Date().toISOString().slice(0, 7);
  const callsThisMonth = ai.callsMonthKey === monthKey ? ai.callsThisMonth + 1 : 1;
  await repos.settings.update({ ai: { ...ai, callsThisMonth, callsMonthKey: monthKey } });

  return provider.complete(prompt, { apiKey: ai.apiKey, model: ai.model, signal });
}

/* ───────────────────────────── Функции (15.2) ──────────────────────────────── */

export interface AIFoodDraft {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  confidence: 'low' | 'medium' | 'high';
}

const FOOD_SYSTEM =
  'You estimate nutrition from a description or a photo. Answer with JSON only: ' +
  '{"items":[{"name":string,"grams":number,"kcal":number,"proteinG":number,"fatG":number,"carbG":number,"confidence":"low"|"medium"|"high"}]}. ' +
  'Values are for the stated portion, not per 100 g. Be conservative when unsure.';

/**
 * Еда по фото. Единственная функция БЕЗ детерминированной замены:
 * без ключа этого пункта просто нет в интерфейсе (15.2).
 */
export async function recognizeFoodPhoto(
  repos: Repositories,
  imageBase64: string,
  imageMime: string,
  locale: string,
): Promise<AIFoodDraft[]> {
  const result = await callAI(repos, {
    system: FOOD_SYSTEM,
    user: `List the foods visible and estimate portion weights. Item names in ${locale}.`,
    imageBase64,
    imageMime,
    json: true,
  });
  return parseDrafts(result);
}

/** Еда текстом. Замена без AI — детерминированный парсер (domain/nutrition/textParse). */
export async function parseFoodTextAI(
  repos: Repositories,
  text: string,
  locale: string,
): Promise<AIFoodDraft[]> {
  const result = await callAI(repos, {
    system: FOOD_SYSTEM,
    user: `Parse this meal description into items with weights: "${text}". Item names in ${locale}.`,
    json: true,
  });
  return parseDrafts(result);
}

/** Этикетка по фото → черновик карточки продукта. Замена — ручное создание. */
export async function scanLabel(
  repos: Repositories,
  imageBase64: string,
  imageMime: string,
): Promise<Partial<Food> | null> {
  const result = await callAI(repos, {
    system:
      'Read the nutrition label. Answer with JSON only: ' +
      '{"name":string,"per100":{"kcal":number,"proteinG":number,"fatG":number,"carbG":number,"sugarG":number,"fiberG":number,"sodiumMg":number}}. ' +
      'All values per 100 g of product.',
    user: 'Extract the nutrition table from this label.',
    imageBase64,
    imageMime,
    json: true,
  });

  const data = result.json as { name?: string; per100?: Record<string, number> } | undefined;
  if (!data?.per100) return null;
  return {
    name: data.name ?? '',
    per100: {
      kcal: num(data.per100.kcal),
      proteinG: num(data.per100.proteinG),
      fatG: num(data.per100.fatG),
      carbG: num(data.per100.carbG),
      sugarG: data.per100.sugarG,
      fiberG: data.per100.fiberG,
      sodiumMg: data.per100.sodiumMg,
    },
  };
}

/** Недельный разбор. Замена — сводка с цифрами из 14.2. */
export async function weeklyReview(
  repos: Repositories,
  summaryText: string,
  locale: string,
): Promise<string> {
  const result = await callAI(repos, {
    system:
      'You comment on a personal weekly training and nutrition summary. Be factual and brief, ' +
      'no medical claims, no diagnoses, no causal statements. 4 sentences maximum.',
    user: `Summary:\n${summaryText}\n\nAnswer in ${locale}.`,
  });
  return result.text;
}

function parseDrafts(result: AIResult): AIFoodDraft[] {
  const data = result.json as { items?: unknown[] } | undefined;
  if (!Array.isArray(data?.items)) return [];
  return data.items
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        name: String(item.name ?? ''),
        grams: num(item.grams),
        kcal: num(item.kcal),
        proteinG: num(item.proteinG),
        fatG: num(item.fatG),
        carbG: num(item.carbG),
        confidence: (item.confidence as AIFoodDraft['confidence']) ?? 'low',
      };
    })
    .filter((d) => d.name.length > 0);
}

function num(v: unknown): number {
  const parsed = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
}
