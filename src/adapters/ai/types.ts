/**
 * Архитектура AI — раздел 15.1.
 *
 * Провайдер-независимый адаптер: добавление нового провайдера — один файл
 * в adapters/ai/providers/. У каждой функции есть детерминированная замена
 * (15.2), поэтому отсутствие ключа не отнимает у приложения возможностей,
 * кроме распознавания еды по фото.
 */

export interface AIPrompt {
  system?: string;
  user: string;
  /** Изображение в base64 без префикса data: — для vision-функций. */
  imageBase64?: string;
  imageMime?: string;
  /** Просим ответ строго в JSON. */
  json?: boolean;
  maxTokens?: number;
}

export interface AIResult {
  text: string;
  /** Разобранный JSON, если запрос был с json: true и ответ разобрался. */
  json?: unknown;
}

export interface AIAdapter {
  readonly id: string;
  readonly capabilities: ('text' | 'vision')[];
  readonly models: string[];
  complete(prompt: AIPrompt, config: AIRuntimeConfig): Promise<AIResult>;
  /** Текст для интерфейса, не цифра (15.1). */
  estimateCostHint(): string;
}

export interface AIRuntimeConfig {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export class AIError extends Error {
  constructor(public readonly kind: 'noKey' | 'network' | 'limit' | 'badResponse') {
    super(kind);
    this.name = 'AIError';
  }
}

/** Достаёт JSON из ответа, даже если модель обернула его в ```json. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return undefined;
  try {
    return JSON.parse(candidate.slice(start));
  } catch {
    return undefined;
  }
}
