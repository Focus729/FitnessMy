/**
 * Провайдер с OpenAI-совместимым API (/chat/completions).
 * Под него подходят OpenAI, OpenRouter и большинство совместимых сервисов —
 * поэтому один файл покрывает сразу несколько вариантов из списка настроек.
 */
import { AIError, extractJson, type AIAdapter, type AIPrompt, type AIRuntimeConfig } from '../types';

interface Options {
  id: string;
  baseUrl: string;
  models: string[];
  costHint: string;
  capabilities: ('text' | 'vision')[];
}

export function createOpenAICompatible(options: Options): AIAdapter {
  return {
    id: options.id,
    capabilities: options.capabilities,
    models: options.models,
    estimateCostHint: () => options.costHint,

    async complete(prompt: AIPrompt, config: AIRuntimeConfig) {
      if (!config.apiKey) throw new AIError('noKey');

      const content: unknown[] = [{ type: 'text', text: prompt.user }];
      if (prompt.imageBase64) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${prompt.imageMime ?? 'image/jpeg'};base64,${prompt.imageBase64}` },
        });
      }

      const body = {
        model: config.model,
        max_tokens: prompt.maxTokens ?? 1024,
        messages: [
          ...(prompt.system ? [{ role: 'system', content: prompt.system }] : []),
          { role: 'user', content },
        ],
        ...(prompt.json ? { response_format: { type: 'json_object' } } : {}),
      };

      let res: Response;
      try {
        res = await fetch(`${options.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: config.signal,
        });
      } catch {
        throw new AIError('network');
      }

      if (res.status === 429) throw new AIError('limit');
      if (!res.ok) throw new AIError('network');

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw new AIError('badResponse');

      return { text, json: prompt.json ? extractJson(text) : undefined };
    },
  };
}
