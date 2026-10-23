/**
 * AI 通路端到端验证（浏览器 + 服务端 mock 供应商）。
 *
 * 目的：证明「有模型时」这条路是真的通的，而不只是接口层能返回 JSON：
 *  - 前端探到 /api/health 后显示「模型通道」，并出现通道切换按钮；
 *  - 点翻译 → 结果来源徽标变「模型通道」，正文来自服务端；
 *  - 服务端挂掉 / 返回错误时，前端如实提示并自动降级到本地引擎（仍有结果）。
 *
 * 服务端用 SERVE_STATIC=true 直接托管 dist/，因此前端与 /api 同源，
 * 不需要额外的代理或 CORS 配置 —— 也就是生产环境的推荐部署形态。
 *
 * 用法：先 npm run build，再 node scripts/ai-path.mjs
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findBrowser } from './serve.mjs';

const DIST = join(process.cwd(), 'dist');
if (!existsSync(join(DIST, 'index.html'))) throw new Error('请先 npm run build');

let passed = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const section = (t) => console.log(`\n## ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8902;

async function startProdServer(mode) {
  const child = spawn(process.execPath, [join('server', 'index.mjs')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      SERVE_STATIC: 'true',
      AI_PROVIDER: 'mock',
      AI_API_KEY: 'dummy-key-for-smoke',
      AI_MOCK_MODE: mode,
      RATE_LIMIT_PER_MIN: '0',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  const url = `http://127.0.0.1:${PORT}/`;
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const res = await fetch(`${url}api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return { child, url };
    } catch {
      /* 等待启动 */
    }
    await sleep(150);
  }
  child.kill();
  throw new Error('服务启动超时');
}

/* ---------------- A. mock 正常：AI 通路成功 ---------------- */
section('A. 有模型时：前端走模型通道');
let ctxA = await startProdServer('ok');
const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const translateRequests = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/translate')) translateRequests.push(r.url());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(ctxA.url, { waitUntil: 'networkidle2' });
  await sleep(600);

  check('页面正确加载（由后端托管 dist）', (await page.title()).includes('人话翻译局'));
  const engineLabel = await page.$eval('[data-testid="engine-label"]', (n) => n.textContent ?? '');
  check('探测到模型后标为「模型通道」', engineLabel.includes('模型'), engineLabel);
  check('出现通道切换按钮', Boolean(await page.$('[data-testid="engine-ai"]')));

  await page.type('[data-testid="input-area"]', '这个方案我们再研究一下。');
  await page.click('[data-testid="translate"]');
  await page.waitForSelector('[data-testid="results-panel"]', { timeout: 20000 });
  await sleep(300);

  check('确实发出了 /api/translate 请求', translateRequests.length === 1, `${translateRequests.length}`);
  const sourceBadge = await page.$eval('[data-testid="result-source"]', (n) => n.textContent ?? '');
  check('结果来源徽标显示模型通道', sourceBadge.includes('模型'), sourceBadge);

  const resultTexts = await page.$$eval('[data-testid="result-text"]', (n) => n.map((x) => x.textContent.trim()));
  check('结果来自模型（含 mock 标记）', resultTexts.some((t) => t.includes('mock')), resultTexts[0]);
  check('返回 3~5 条', resultTexts.length >= 3 && resultTexts.length <= 5, `${resultTexts.length}`);

  await page.click('[data-testid="toggle-basis"]');
  await page.waitForSelector('[data-testid="basis-block"]');
  const basis = await page.$eval('[data-testid="basis-block"]', (n) => n.textContent ?? '');
  check('依据里写明模型来源', basis.includes('mock') || basis.includes('模型'), basis.slice(0, 60));

  /* 切回本地应立刻生效 */
  await page.click('[data-testid="engine-local"]');
  await sleep(150);
  await page.click('[data-testid="translate"]');
  await page.waitForSelector('[data-testid="results-panel"]', { timeout: 15000 });
  await sleep(300);
  const localTexts = await page.$$eval('[data-testid="result-text"]', (n) => n.map((x) => x.textContent.trim()));
  check('切回本地后不再请求模型', translateRequests.length === 1, `${translateRequests.length}`);
  check('切回本地后结果不含 mock 标记', !localTexts.some((t) => t.includes('mock')));
  check('本地结果仍是 5 条', localTexts.length === 5, `${localTexts.length}`);

  check('无未捕获异常', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  ctxA.child.kill();
  await sleep(300);
}

/* ---------------- B. 模型报错：自动降级 ---------------- */
section('B. 模型报错时：如实提示 + 自动降级到本地');
const ctxB = await startProdServer('error');
const browser2 = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser2.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(ctxB.url, { waitUntil: 'networkidle2' });
  await sleep(500);

  await page.type('[data-testid="input-area"]', '这个方案我们再研究一下。');
  await page.click('[data-testid="translate"]');
  await page.waitForSelector('[data-testid="results-panel"], [data-testid="results-error"]', { timeout: 20000 });
  await sleep(400);

  check('仍然给出了结果（没有空手而归）', Boolean(await page.$('[data-testid="results-panel"]')));
  const notice = await page.$eval('[data-testid="notice-bar"]', (n) => n.textContent ?? '').catch(() => '');
  check('显示了降级提示', notice.includes('本地'), notice);
  check('提示里带错误码', /mock_error|错误|失败/.test(notice), notice);
  const sourceBadge = await page.$eval('[data-testid="result-source"]', (n) => n.textContent ?? '');
  check('来源徽标改回本地引擎', sourceBadge.includes('本地'), sourceBadge);
  const texts = await page.$$eval('[data-testid="result-text"]', (n) => n.map((x) => x.textContent.trim()));
  check('降级结果仍是 3~5 条', texts.length >= 3, `${texts.length}`);
  check('降级结果不含 mock 标记', !texts.some((t) => t.includes('mock')));
} finally {
  await browser2.close();
  ctxB.child.kill();
}

/* ---------------- C. 服务端完全不可用：纯静态也能用 ---------------- */
section('C. 无后端（纯静态托管）：本地引擎照常工作');
{
  const { serveStatic } = await import('./serve.mjs');
  const staticServer = await serveStatic(DIST);
  const browser3 = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser3.newPage();
    await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
    const failedApi = [];
    page.on('requestfailed', (r) => {
      if (r.url().includes('/api/')) failedApi.push(r.url());
    });
    await page.goto(staticServer.url, { waitUntil: 'networkidle2' });
    await sleep(700);

    const label = await page.$eval('[data-testid="engine-label"]', (n) => n.textContent ?? '');
    check('health 探测失败后标为本地引擎', label.includes('本地'), label);
    check('不显示通道切换按钮', !(await page.$('[data-testid="engine-ai"]')));
    check('health 探测失败被静默处理（无报错弹层）', !(await page.$('.notice-bar')));

    await page.type('[data-testid="input-area"]', '下次一定！');
    await page.click('[data-testid="translate"]');
    await page.waitForSelector('[data-testid="results-panel"]', { timeout: 15000 });
    await sleep(250);
    const texts = await page.$$eval('[data-testid="result-text"]', (n) => n.map((x) => x.textContent.trim()));
    check('纯静态下仍能生成 5 条', texts.length === 5, `${texts.length}`);
    check('纯静态下结果与输入相关', texts.some((t) => /下次|改天|拒绝|不会/.test(t)), texts.join(' / '));
    check('失败请求只涉及 /api/health', failedApi.every((u) => u.includes('/api/health')), failedApi.join(','));
  } finally {
    await browser3.close();
    await staticServer.close();
  }
}

console.log(`\n${'='.repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ AI 通路验证全部通过：${passed} 项断言`);
} else {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
}
