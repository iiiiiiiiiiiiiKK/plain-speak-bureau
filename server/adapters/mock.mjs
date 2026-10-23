/**
 * Mock 适配器：只在测试与本地演示「AI 通路」时使用，不联网、不花钱。
 *
 * 它的输出是固定结构，用来验证：
 *  - 服务端解析 → 清洗 → 返回；
 *  - 前端拿到 source='ai' 时是否正确展示；
 *  - 异常路径（AI_MOCK_MODE=error / badjson）是否触发降级。
 */
import { ProviderError, sanitizeModelPayload } from './base.mjs';

const MODE = process.env.AI_MOCK_MODE || 'ok';

export function createMockAdapter() {
  return {
    id: 'mock',
    model: 'mock-plain-speak',

    async translate({ input, style }) {
      if (MODE === 'error') {
        throw new ProviderError('模拟上游失败', { code: 'mock_error', status: 502, retryable: true });
      }
      if (MODE === 'badjson') {
        throw new ProviderError('模型返回的不是合法 JSON', { code: 'bad_json' });
      }
      if (MODE === 'timeout') {
        throw new ProviderError('模型响应超时，请稍后重试', { code: 'timeout', status: 504 });
      }
      const quote = input.trim().slice(0, 20);
      const data = {
        variants: [
          { style, text: `【mock】这句话的实际意思是：${quote}（示例数据，仅供联调）` },
          { style: 'sharp', text: `【mock】犀利版：${quote}，就这么回事。` },
          { style: 'meme', text: `【mock】段子版：${quote} 已经进入传说中的「下周启动」。` },
          { style: 'office', text: `【mock】职场版：关于该事项，现阶段仍在评估中。` },
        ],
        intent: '联调样例',
        xPost: `【mock】${quote}—— 人话翻译局`,
      };
      const clean = sanitizeModelPayload(data, { fallbackStyle: style });
      return { ...clean, model: 'mock-plain-speak', usage: null };
    },
  };
}
