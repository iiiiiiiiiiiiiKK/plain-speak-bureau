/**
 * 模型调用封装（前端侧）。未来换供应商只需改服务端，前端不动。
 *
 * 行为契约：
 *  - 启动时探一次 /api/health，据此决定是否显示「AI 模式」开关；
 *  - 探测失败（静态托管没有后端）就永久走本地引擎，不弹错误打扰用户；
 *  - 请求带超时与 AbortController，重复点击由上层 single-flight 拦住；
 *  - 任何异常都归一成 { ok: false, code, message }，UI 只处理这一种形状。
 */
import type { SceneId } from '../data/scenes';
import type { StyleId } from '../data/styles';

export type ApiStatus = 'unknown' | 'online' | 'offline';

export interface AiHealth {
  configured: boolean;
  provider: string;
  model: string;
  mode: 'mock' | 'live' | 'offline';
}

export interface AiVariant {
  style: StyleId;
  text: string;
}

export interface AiSuccess {
  ok: true;
  source: 'ai';
  provider: string;
  model: string;
  variants: AiVariant[];
  intent: string;
  xPost: string;
  elapsedMs?: number;
}

export interface ApiFailure {
  ok: false;
  code: string;
  message: string;
  fallback?: 'local';
}

export type AiResult = AiSuccess | ApiFailure;

const HEALTH_TIMEOUT = 3000;
const TRANSLATE_TIMEOUT = 30000;

/** 同一页面内只探一次健康状态 */
let healthPromise: Promise<AiHealth | null> | null = null;

function withTimeout(ms: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

export async function probeHealth(force = false): Promise<AiHealth | null> {
  if (!force && healthPromise) return healthPromise;
  healthPromise = (async () => {
    const { signal, cleanup } = withTimeout(HEALTH_TIMEOUT);
    try {
      const res = await fetch('./api/health', { signal, headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      const data = (await res.json()) as { ok?: boolean; ai?: AiHealth };
      if (!data?.ok || !data.ai) return null;
      return data.ai;
    } catch {
      // 静态托管、离线、跨域被拒都在这里：静默走本地
      return null;
    } finally {
      cleanup();
    }
  })();
  return healthPromise;
}

export function resetHealthCache(): void {
  healthPromise = null;
}

interface TranslateParams {
  input: string;
  scene: SceneId;
  style: StyleId;
  count?: number;
  signal?: AbortSignal;
}

/**
 * 调服务端翻译。无论成败都返回结构化结果，不抛异常。
 */
export async function requestAiTranslation(params: TranslateParams): Promise<AiResult> {
  const { signal: timeoutSignal, cleanup } = withTimeout(TRANSLATE_TIMEOUT);
  const signal = params.signal
    ? mergeSignals(params.signal, timeoutSignal)
    : timeoutSignal;

  try {
    const res = await fetch('./api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: params.input,
        scene: params.scene,
        style: params.style,
        count: params.count ?? 5,
      }),
      signal,
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const body = (data ?? {}) as Partial<ApiFailure>;
      return {
        ok: false,
        code: typeof body.code === 'string' ? body.code : `http_${res.status}`,
        message: typeof body.message === 'string' ? body.message : '翻译服务暂时不可用',
        fallback: 'local',
      };
    }

    const body = data as Partial<AiSuccess> | null;
    if (!body || body.ok !== true || !Array.isArray(body.variants) || body.variants.length < 3) {
      return { ok: false, code: 'bad_payload', message: '模型返回内容不完整', fallback: 'local' };
    }

    return {
      ok: true,
      source: 'ai',
      provider: typeof body.provider === 'string' ? body.provider : 'unknown',
      model: typeof body.model === 'string' ? body.model : 'unknown',
      variants: body.variants,
      intent: typeof body.intent === 'string' ? body.intent : '',
      xPost: typeof body.xPost === 'string' ? body.xPost : '',
      elapsedMs: typeof body.elapsedMs === 'number' ? body.elapsedMs : undefined,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // 区分「用户取消」与「超时」：用户取消由上层静默处理
      return { ok: false, code: 'aborted', message: '请求已取消' };
    }
    return {
      ok: false,
      code: 'network_error',
      message: '连不上服务端，已切换到本地翻译',
      fallback: 'local',
    };
  } finally {
    cleanup();
  }
}

/** 把两个 AbortSignal 合成一个（任一触发即中断） */
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}
