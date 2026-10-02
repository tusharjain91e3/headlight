import { serverEnv } from './env';
import { buildRepairPrompt, buildUserPrompt, JSON_SCHEMA, SYSTEM_PROMPT } from './prompts';
import { parseLlmJson, type LlmOutputT } from './schema';
import type { Article, Stock } from './types';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function complete(messages: Msg[]): Promise<string> {
  const env = serverEnv();
  let useSchema = true;
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${env.openrouterBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openrouterKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openrouterModel,
        temperature: 0.1,
        messages,
        ...(useSchema ? { response_format: { type: 'json_schema', json_schema: JSON_SCHEMA } } : {}),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) return content;
      lastErr = 'empty completion';
      continue;
    }
    lastErr = `OpenRouter ${res.status}`;
    if (useSchema && [400, 404, 422].includes(res.status)) {
      useSchema = false; // model doesn't support structured output
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(800 * 2 ** attempt);
      continue;
    }
    break;
  }
  throw new Error(lastErr);
}

export async function classify(stock: Stock, articles: Article[]): Promise<LlmOutputT | null> {
  try {
    const user = buildUserPrompt(stock, articles);
    const base: Msg[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }];
    const first = await complete(base);
    const p1 = parseLlmJson(first, articles.length);
    if (p1.ok) return p1.data;
    const second = await complete([...base, { role: 'user', content: buildRepairPrompt(p1.error, user) }]);
    const p2 = parseLlmJson(second, articles.length);
    return p2.ok ? p2.data : null;
  } catch {
    return null;
  }
}
