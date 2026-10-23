/**
 * 模型适配器基类与注册表。
 *
 * 目标：换供应商时只加一个文件，不碰 server/index.mjs。
 * 每个适配器只需实现 translate({input, scene, style, count, signal}) → {variants, intent, xPost, raw}
 */

/** 供应商抛出的可识别错误，index.mjs 据此决定 HTTP 状态码 */
export class ProviderError extends Error {
  constructor(message, { code = 'provider_error', status = 502, retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** 把模型返回的 JSON 文本解析成对象；容忍 ```json 包裹与前后废话 */
export function parseModelJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ProviderError('模型返回空内容', { code: 'empty_completion' });
  }
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence && fence[1]) body = fence[1].trim();
  if (!body.startsWith('{')) {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) body = body.slice(start, end + 1);
  }
  try {
    const data = JSON.parse(body);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('not an object');
    }
    return data;
  } catch {
    throw new ProviderError('模型返回的不是合法 JSON', { code: 'bad_json' });
  }
}

export const VALID_STYLES = ['plain', 'highEq', 'sharp', 'sarcasm', 'office', 'meme'];

/**
 * 统一清洗模型输出：只要格式可疑就报错，让前端走降级，而不是把脏数据塞进 UI。
 */
export function sanitizeModelPayload(data, { fallbackStyle = 'plain' } = {}) {
  const rawVariants = Array.isArray(data.variants) ? data.variants : [];
  const variants = [];
  const seen = new Set();
  for (const item of rawVariants) {
    if (!item || typeof item !== 'object') continue;
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (text.length === 0 || text.length > 160) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    const style = VALID_STYLES.includes(item.style) ? item.style : fallbackStyle;
    variants.push({ style, text });
    if (variants.length >= 5) break;
  }
  if (variants.length < 3) {
    throw new ProviderError('模型返回的版本不足 3 条', { code: 'too_few_variants' });
  }
  const intent = typeof data.intent === 'string' ? data.intent.trim().slice(0, 24) : '';
  const xPost = typeof data.xPost === 'string' ? data.xPost.trim().slice(0, 200) : '';
  return { variants, intent, xPost };
}
