/**
 * Провайдер Anthropic (Messages API).
 * Отдельный файл — ровно то, что обещает раздел 15.1: добавление провайдера
 * стоит одного файла.
 */
import { AIError, extractJson, type AIAdapter, type AIPrompt, type AIRuntimeConfig } from '../types';

const BASE = 'https://api.anthropic.com/v1';

export const anthropic: AIAdapter = {
  id: 'anthropic',
  capabilities: ['text', 'vision'],
  models: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5'],
  estimateCostHint: () => 'ai.estimateCost',

  async complete(prompt: AIPrompt, config: AIRuntimeConfig) {
    if (!config.apiKey) throw new AIError('noKey');

    const content: unknown[] = [];
    if (prompt.imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: prompt.imageMime ?? 'image/jpeg',
          data: prompt.imageBase64,
        },
      });
    }
    content.push({ type: 'text', text: prompt.user });

    let res: Response;
    try {
      res = await fetch(`${BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          // Ключ пользователя используется прямо из браузера — это осознанно:
          // сервера у приложения нет, и ключ никуда, кроме API, не уходит (15.1).
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: prompt.maxTokens ?? 1024,
          ...(prompt.system ? { system: prompt.system } : {}),
          messages: [{ role: 'user', content }],
        }),
        signal: config.signal,
      });
    } catch {
      throw new AIError('network');
    }

    if (res.status === 429) throw new AIError('limit');
    if (!res.ok) throw new AIError('network');

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? '';
    if (!text) throw new AIError('badResponse');

    return { text, json: prompt.json ? extractJson(text) : undefined };
  },
};
