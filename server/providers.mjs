/**
 * 供应商注册表：新增供应商只需在此登记 + 增加一个 adapters/*.mjs。
 * 前端永远不知道用哪家，只看到 {source: 'ai'}。
 */
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.mjs';
import { createMockAdapter } from './adapters/mock.mjs';
import { ProviderError } from './adapters/base.mjs';

export function createProvider(env = process.env) {
  const kind = (env.AI_PROVIDER || 'openai-compatible').toLowerCase().trim();

  if (kind === 'mock') return createMockAdapter();

  if (kind === 'openai-compatible' || kind === 'openai' || kind === 'deepseek') {
    if (!env.AI_API_KEY) {
      // 没有密钥就不注册模型：/api/translate 会明确告诉前端「走本地」，
      // 而不是假装成功再返回编造的内容。
      return null;
    }
    return createOpenAICompatibleAdapter({
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1',
      model: env.AI_MODEL || 'gpt-4o-mini',
      timeoutMs: Number(env.AI_TIMEOUT_MS || 25000),
      temperature: Number(env.AI_TEMPERATURE || 0.9),
    });
  }

  throw new ProviderError(`未知的 AI_PROVIDER：${kind}`, { code: 'bad_provider', status: 500 });
}

/** 供 /api/health 使用：只报「有没有配置」，绝不回显密钥 */
export function describeProvider(env = process.env) {
  const kind = (env.AI_PROVIDER || 'openai-compatible').toLowerCase().trim();
  const hasKey = Boolean(env.AI_API_KEY);
  return {
    provider: kind,
    model: env.AI_MODEL || (kind === 'mock' ? 'mock-plain-speak' : 'gpt-4o-mini'),
    configured: kind === 'mock' ? true : hasKey,
    mode: kind === 'mock' ? 'mock' : hasKey ? 'live' : 'offline',
  };
}
