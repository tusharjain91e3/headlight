import { serverEnv } from './env';
import { ConfigError } from './errors';
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
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    lastErr = `OpenRouter ${res.status}${detail ? `: ${detail}` : ''}`;
    console.error(`[openrouter] ${lastErr}`);
    if (res.status === 401 || res.status === 403) throw new ConfigError('OpenRouter rejected the API key');
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

export async function classify(
  stock: Stock,
  articles: Article[],
  diag: { reason?: string } = {},
): Promise<LlmOutputT | null> {
  try {
    const user = buildUserPrompt(stock, articles);
    const base: Msg[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }];
    const first = await complete(base);
    const p1 = parseLlmJson(first, articles.length);
    if (p1.ok) return p1.data;
    console.warn(`[openrouter] ${stock.symbol}: invalid JSON from model (${p1.error}); retrying once`);
    const second = await complete([...base, { role: 'user', content: buildRepairPrompt(p1.error, user) }]);
    const p2 = parseLlmJson(second, articles.length);
    if (!p2.ok) {
      diag.reason = `Model output failed validation after repair: ${p2.error}`;
      console.error(`[openrouter] ${stock.symbol}: ${diag.reason}`);
    }
    return p2.ok ? p2.data : null;
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    diag.reason = (e as Error).message;
    console.error(`[openrouter] ${stock.symbol}: ${diag.reason}`);
    return null;
  }
}
