/**
 * 服务端接口冒烟测试。
 *
 * 覆盖：
 *  - /api/health 是否如实报告「有没有配模型」，且不泄漏密钥；
 *  - 无密钥时，/api/translate 必须返回 503 + code=ai_unavailable（前端据此走本地）；
 *  - mock 模式下正常返回 3~5 条、字段结构正确；
 *  - 空输入 / 超长输入 / 非法 JSON / 非 POST / 未知路径的错误码；
 *  - 模型异常（mock error / badjson / timeout）时的错误映射与 fallback 字段。
 *
 * 用子进程启动服务：stdio 设为 ignore，避免管道限制；用 HTTP 轮询确认就绪。
 * 运行：node scripts/api-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const SERVER = join(process.cwd(), 'server', 'index.mjs');
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n## ${title}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(env, port) {
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      SERVE_STATIC: 'false',
      RATE_LIMIT_PER_MIN: '0',
      ...env,
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  const url = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return { child, url };
    } catch {
      /* 还没起来 */
    }
    await sleep(150);
  }
  child.kill();
  throw new Error('服务启动超时');
}

async function stopServer(child) {
  child.kill();
  await sleep(120);
}

async function post(url, body, init = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/* ================================================================== */
section('A. 无 API Key（默认部署形态）');
{
  const { child, url } = await startServer(
    { AI_PROVIDER: 'openai-compatible', AI_API_KEY: '' },
    8891,
  );
  try {
    const health = await fetch(`${url}/api/health`);
    const body = await health.json();
    check('health 返回 200', health.status === 200);
    check('health 报告未配置', body.ai?.configured === false, JSON.stringify(body.ai));
    check('health 模式为 offline', body.ai?.mode === 'offline', JSON.stringify(body.ai?.mode));
    check('health 回显字数上限', body.limits?.maxInputChars === 300);
    check('health 不包含任何密钥字段', !JSON.stringify(body).toLowerCase().includes('key'));

    const r = await post(`${url}/api/translate`, { input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain' });
    check('未配模型时返回 503', r.status === 503, `实际 ${r.status}`);
    check('错误码为 ai_unavailable', r.json?.code === 'ai_unavailable', JSON.stringify(r.json));
    check('提示前端降级 local', r.json?.fallback === 'local');
  } finally {
    await stopServer(child);
  }
}

/* ================================================================== */
section('B. mock 供应商（验证 AI 通路本身）');
{
  const { child, url } = await startServer({ AI_PROVIDER: 'mock', AI_API_KEY: 'dummy-not-used' }, 8892);
  try {
    const health = await (await fetch(`${url}/api/health`)).json();
    check('mock 模式 configured=true', health.ai?.configured === true);
    check('mock 模式 mode=mock', health.ai?.mode === 'mock', health.ai?.mode);

    const ok = await post(`${url}/api/translate`, {
      input: '这个方案我们再研究一下。',
      scene: 'workplace',
      style: 'sharp',
    });
    check('正常请求返回 200', ok.status === 200, `实际 ${ok.status} ${JSON.stringify(ok.json)}`);
    check('source 为 ai', ok.json?.source === 'ai');
    check('返回 3~5 条', Array.isArray(ok.json?.variants) && ok.json.variants.length >= 3 && ok.json.variants.length <= 5, `${ok.json?.variants?.length}`);
    check(
      '每条带 style + text',
      ok.json?.variants?.every((v) => typeof v.style === 'string' && typeof v.text === 'string' && v.text.length > 0),
    );
    check('不含未替换占位符', ok.json?.variants?.every((v) => !/\{[a-zA-Z]+\}/.test(v.text)));
    check('带 xPost 字段', typeof ok.json?.xPost === 'string' && ok.json.xPost.length > 0);
    check('带耗时字段', typeof ok.json?.elapsedMs === 'number');

    /* ---- 输入校验 ---- */
    const empty = await post(`${url}/api/translate`, { input: '   ', scene: 'workplace', style: 'plain' });
    check('空输入返回 400', empty.status === 400, `实际 ${empty.status}`);
    check('空输入错误码 empty_input', empty.json?.code === 'empty_input', JSON.stringify(empty.json));

    const tooLong = await post(`${url}/api/translate`, {
      input: '长'.repeat(400),
      scene: 'workplace',
      style: 'plain',
    });
    check('超长输入返回 400', tooLong.status === 400, `实际 ${tooLong.status}`);
    check('超长错误码 too_long', tooLong.json?.code === 'too_long', JSON.stringify(tooLong.json));

    const badJson = await post(`${url}/api/translate`, '{not json');
    check('非法 JSON 返回 400', badJson.status === 400, `实际 ${badJson.status}`);
    check('非法 JSON 错误码 bad_json', badJson.json?.code === 'bad_json');

    const wrongMethod = await fetch(`${url}/api/translate`, { method: 'GET' });
    check('GET /api/translate 返回 405', wrongMethod.status === 405, `实际 ${wrongMethod.status}`);

    const notFound = await fetch(`${url}/api/nope`);
    check('未知 API 返回 404', notFound.status === 404);

    /* ---- 未知场景 / 风格回落到默认值，不报错 ---- */
    const fallback = await post(`${url}/api/translate`, {
      input: '这个方案我们再研究一下。',
      scene: 'not-a-scene',
      style: 'not-a-style',
    });
    check('未知场景/风格不报错', fallback.status === 200, `实际 ${fallback.status}`);

    /* ---- 大请求体 ---- */
    const huge = await fetch(`${url}/api/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'x'.repeat(20000) }),
    });
    check('超大请求体被拒（413 或 400）', huge.status === 413 || huge.status === 400, `实际 ${huge.status}`);
  } finally {
    await stopServer(child);
  }
}

/* ================================================================== */
section('C. 模型异常时的错误映射');
for (const [mode, expectedCode, expectedStatus] of [
  ['error', 'mock_error', 502],
  ['badjson', 'bad_json', 502],
  ['timeout', 'timeout', 504],
]) {
  const port = 8893 + ['error', 'badjson', 'timeout'].indexOf(mode);
  const { child, url } = await startServer(
    { AI_PROVIDER: 'mock', AI_API_KEY: 'dummy', AI_MOCK_MODE: mode },
    port,
  );
  try {
    const r = await post(`${url}/api/translate`, { input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain' });
    check(`AI_MOCK_MODE=${mode} → ${expectedStatus}`, r.status === expectedStatus, `实际 ${r.status}`);
    check(`AI_MOCK_MODE=${mode} → code=${expectedCode}`, r.json?.code === expectedCode, JSON.stringify(r.json));
    check(`AI_MOCK_MODE=${mode} → fallback=local`, r.json?.fallback === 'local');
    check(`AI_MOCK_MODE=${mode} → 不回传内部堆栈`, !JSON.stringify(r.json).includes('at '));
  } finally {
    await stopServer(child);
  }
}

/* ================================================================== */
section('D. 限流');
{
  const { child, url } = await startServer(
    { AI_PROVIDER: 'mock', AI_API_KEY: 'dummy', RATE_LIMIT_PER_MIN: '3' },
    8896,
  );
  try {
    const codes = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await post(`${url}/api/translate`, { input: `测试第${i}句`, scene: 'workplace', style: 'plain' });
      codes.push(r.status);
    }
    check('前 3 次通过', codes.slice(0, 3).every((c) => c === 200), codes.join(','));
    check('超过限流返回 429', codes.slice(3).every((c) => c === 429), codes.join(','));
  } finally {
    await stopServer(child);
  }
}

/* ================================================================== */
console.log(`\n${'='.repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ 接口冒烟全部通过：${passed} 项断言`);
} else {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
}
