/**
 * 人话翻译局 · 本地服务（零依赖，Node 18+ 原生 http + fetch）。
 *
 * 职责边界：
 *  - 唯一持有 AI_API_KEY 的地方（环境变量），前端永远拿不到；
 *  - 校验输入、限流、超时、错误码统一；
 *  - 未配置密钥时明确返回 503 + code=ai_unavailable，让前端走本地引擎；
 *  - 可选地托管 dist/ 静态文件，实现同源部署。
 *
 * 启动：node server/index.mjs
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderError } from './adapters/base.mjs';
import { createProvider, describeProvider } from './providers.mjs';
import { STYLE_IDS, SCENE_IDS, MAX_INPUT_CHARS } from './shared-schema.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..');

/** 读取 .env（Node 20.12+ 自带 loadEnvFile；不存在就跳过，绝不报错） */
function loadDotEnv() {
  const candidates = [join(ROOT, '.env.local'), join(ROOT, '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
      console.log(`[env] 已加载 ${file}`);
    } catch (error) {
      console.warn(`[env] 读取 ${file} 失败：${error?.message ?? error}`);
    }
  }
}
loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const SERVE_STATIC = (process.env.SERVE_STATIC || 'true') !== 'false';
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 0);
const BODY_LIMIT = 8 * 1024; // 8KB，足够 300 字中文

let provider = null;
let providerInitError = null;
try {
  provider = createProvider();
} catch (error) {
  providerInitError = error;
  console.error('[ai] 适配器初始化失败：', error?.message ?? error);
}

if (!provider && !providerInitError) {
  console.log('[ai] 未配置 AI_API_KEY —— 服务只提供离线能力，前端会自动走本地引擎。');
} else if (provider) {
  console.log(`[ai] 适配器已启用：${provider.id} / ${provider.model}`);
}

/* ---------------- 简易内存限流（按 IP，够单机小站用） ---------------- */
const hits = new Map();
function rateLimited(ip) {
  if (!RATE_LIMIT || RATE_LIMIT <= 0) return false;
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(ip) || []).filter((t) => t > windowStart);
  if (list.length >= RATE_LIMIT) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}
// 定期清理，避免长期运行内存上涨
setInterval(() => {
  const windowStart = Date.now() - 60_000;
  for (const [ip, list] of hits) {
    const kept = list.filter((t) => t > windowStart);
    if (kept.length === 0) hits.delete(ip);
    else hits.set(ip, kept);
  }
}, 60_000).unref?.();

/* ---------------- 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > limit) {
        aborted = true;
        // 不立刻 destroy：先把剩余数据读完再拒绝，否则客户端只看到「连接被重置」，
        // 拿不到 413 的错误体。这里只丢弃不缓存。
        chunks.length = 0;
        reject(Object.assign(new Error('payload_too_large'), { code: 'payload_too_large' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!aborted) resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => {
      if (!aborted) reject(error);
    });
  });
}

function validate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'bad_request', message: '请求体必须是 JSON 对象' };
  }
  const input = typeof body.input === 'string' ? body.input : '';
  const clean = input.replace(/\r\n?/g, '\n').trim();
  if (clean.length === 0) {
    return { ok: false, code: 'empty_input', message: '先写一句话' };
  }
  const length = [...clean].length;
  if (length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      code: 'too_long',
      message: `最多 ${MAX_INPUT_CHARS} 字，当前 ${length} 字`,
    };
  }
  const scene = SCENE_IDS.includes(body.scene) ? body.scene : 'workplace';
  const style = STYLE_IDS.includes(body.style) ? body.style : 'plain';
  const count = Math.min(5, Math.max(3, Number.isFinite(body.count) ? Math.floor(body.count) : 5));
  return { ok: true, input: clean, scene, style, count, length };
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow =
    allowed.length === 0
      ? null // 未配置则不加 CORS 头（同源部署不需要）
      : allowed.includes(origin || '')
        ? origin
        : null;
  const headers = {
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
  if (allow) {
    headers['access-control-allow-origin'] = allow;
    headers['vary'] = 'origin';
  }
  return headers;
}

/* ---------------- API ---------------- */
async function handleTranslate(req, res) {
  const ip = (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  if (rateLimited(ip)) {
    json(res, 429, { ok: false, code: 'rate_limited', message: '请求太频繁，等一分钟再试。' });
    return;
  }

  let raw;
  try {
    raw = await readBody(req, BODY_LIMIT);
  } catch (error) {
    const code = error?.code === 'payload_too_large' ? 'payload_too_large' : 'bad_request';
    json(res, code === 'payload_too_large' ? 413 : 400, {
      ok: false,
      code,
      message: code === 'payload_too_large' ? '输入太长了' : '读取请求失败',
    });
    return;
  }

  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    json(res, 400, { ok: false, code: 'bad_json', message: '请求体不是合法 JSON' });
    return;
  }

  const checked = validate(body);
  if (!checked.ok) {
    json(res, 400, { ok: false, code: checked.code, message: checked.message });
    return;
  }

  if (providerInitError) {
    json(res, 500, {
      ok: false,
      code: 'provider_misconfigured',
      message: '服务端模型配置有误，请检查环境变量',
    });
    return;
  }

  if (!provider) {
    json(res, 503, {
      ok: false,
      code: 'ai_unavailable',
      message: '服务端未配置模型，请使用本地翻译',
      fallback: 'local',
    });
    return;
  }

  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const startedAt = Date.now();
  try {
    const result = await provider.translate({
      input: checked.input,
      scene: checked.scene,
      style: checked.style,
      count: checked.count,
      signal: controller.signal,
    });
    json(res, 200, {
      ok: true,
      source: 'ai',
      provider: provider.id,
      model: result.model ?? provider.model,
      variants: result.variants,
      intent: result.intent || '',
      xPost: result.xPost || '',
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const isProvider = error instanceof ProviderError;
    const status = isProvider ? error.status : 502;
    const code = isProvider ? error.code : 'unknown_error';
    // 只记错误类别，不记用户原文，避免把用户内容写进日志
    console.warn(`[ai] translate failed: ${code} (${status})`);
    json(res, status, {
      ok: false,
      code,
      message: isProvider ? error.message : '模型服务异常，请稍后重试',
      fallback: 'local',
    });
  }
}

function handleHealth(req, res) {
  const info = describeProvider();
  json(res, 200, {
    ok: true,
    service: 'human-translator',
    ai: info,
    limits: { maxInputChars: MAX_INPUT_CHARS },
    time: new Date().toISOString(),
  });
}

/* ---------------- 静态托管 ---------------- */
function serveStatic(req, res, urlPath) {
  const dist = join(ROOT, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('dist/ 不存在，请先运行 npm run build');
    return;
  }
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const rel = normalize(cleanPath).replace(/^([/\\])+/, '');
  let filePath = join(dist, rel === '' ? 'index.html' : rel);
  // 防目录穿越
  if (!resolve(filePath).startsWith(resolve(dist) + sep) && resolve(filePath) !== resolve(dist)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) {
    // 单页应用回退
    filePath = join(dist, 'index.html');
  }
  res.writeHead(200, {
    'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';
  const path = url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  for (const [k, v] of Object.entries(corsHeaders(req))) res.setHeader(k, v);

  if (path === '/api/health') {
    handleHealth(req, res);
    return;
  }
  if (path === '/api/translate') {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, code: 'method_not_allowed', message: '请用 POST' });
      return;
    }
    await handleTranslate(req, res);
    return;
  }
  if (path.startsWith('/api/')) {
    json(res, 404, { ok: false, code: 'not_found', message: '没有这个接口' });
    return;
  }

  if (!SERVE_STATIC) {
    json(res, 404, { ok: false, code: 'not_found', message: '静态托管已关闭' });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`[server] http://${HOST}:${PORT}  (静态托管: ${SERVE_STATIC ? 'on' : 'off'})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
