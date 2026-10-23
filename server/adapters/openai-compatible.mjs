/**
 * OpenAI 兼容适配器。
 * 适用于 OpenAI / DeepSeek / Moonshot / 通义 / 自建网关等提供 /chat/completions 的服务。
 * 密钥只从环境变量读取，绝不下发到前端，也不写进日志。
 */
import { ProviderError, parseModelJson, sanitizeModelPayload } from './base.mjs';
import { buildSystemPrompt, buildUserPrompt } from '../prompts.mjs';

export function createOpenAICompatibleAdapter(config) {
  const {
    apiKey,
    baseUrl = 'https://api.openai.com/v1',
    model = 'gpt-4o-mini',
    timeoutMs = 25000,
    temperature = 0.9,
  } = config;

  if (!apiKey) throw new ProviderError('缺少 AI_API_KEY', { code: 'missing_key', status: 503 });

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    id: 'openai-compatible',
    model,

    async translate({ input, scene, style, count = 5, signal }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // 外部取消（客户端断开）也要能中断上游请求，别让模型白跑
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            stream: false,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              { role: 'user', content: buildUserPrompt({ input, scene, style, count }) },
            ],
          }),
        });
      } catch (error) {
        clearTimeout(timer);
        if (error?.name === 'AbortError') {
          throw new ProviderError('模型响应超时，请稍后重试', {
            code: 'timeout',
            status: 504,
            retryable: true,
          });
        }
        throw new ProviderError('无法连接模型服务', {
          code: 'network_error',
          status: 502,
          retryable: true,
        });
      }

      clearTimeout(timer);

      if (!response.ok) {
        const status = response.status;
        let detail = '';
        try {
          const text = await response.text();
          detail = text.slice(0, 200);
        } catch {
          detail = '';
        }
        if (status === 401 || status === 403) {
          throw new ProviderError('模型密钥无效或权限不足（服务端配置问题）', {
            code: 'unauthorized',
            status: 502,
          });
        }
        if (status === 429) {
          throw new ProviderError('模型服务限流，请稍后再试', {
            code: 'rate_limited',
            status: 503,
            retryable: true,
          });
        }
        throw new ProviderError(`模型服务返回 ${status}${detail ? `：${detail}` : ''}`, {
          code: 'upstream_error',
          status: 502,
          retryable: status >= 500,
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ProviderError('模型返回内容无法解析', { code: 'bad_response' });
      }

      const content = payload?.choices?.[0]?.message?.content;
      const data = parseModelJson(typeof content === 'string' ? content : '');
      const clean = sanitizeModelPayload(data, { fallbackStyle: style });

      return {
        ...clean,
        model: payload?.model || model,
        usage: payload?.usage ?? null,
      };
    },
  };
}
