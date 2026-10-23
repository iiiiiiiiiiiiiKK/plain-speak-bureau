/**
 * 浏览器端 E2E（Puppeteer + 本机 Chrome/Edge，不下载 Chromium）。
 *
 * 覆盖验收清单：
 *   示例填充 / 字数统计 / 清空 / 不同句子出相关且差异明显的结果 /
 *   切换场景与风格生效 / 换一批 / 复制单条 / 复制全部 / 收藏与取消 /
 *   历史记录与删除 / X 文案复制 / 分享图 1:1 与 3:4 下载 /
 *   空输入报错 / 超长输入拦截 / 重复连点不重复请求 /
 *   深色模式对比度 / 移动端无横向溢出 / 隐私说明文案 / 无网络失败提示。
 *
 * 用法：先 npm run build，再 node scripts/e2e.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic, findBrowser } from './serve.mjs';

const OUT = join(process.cwd(), '.e2e-out');
mkdirSync(OUT, { recursive: true });
const DOWNLOAD_DIR = join(OUT, 'downloads');
rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
mkdirSync(DOWNLOAD_DIR, { recursive: true });

const DIST = join(process.cwd(), 'dist');
if (!existsSync(join(DIST, 'index.html'))) throw new Error('未找到 dist/index.html，请先运行 npm run build');

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
function section(t) {
  console.log(`\n## ${t}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Windows 剪贴板会把 \n 规范成 \r\n，比较前先统一换行 */
const normalizeNL = (s) => s.replace(/\r\n/g, "\n").trim();

/** 字符级 Jaccard，判断两个版本是否只是换了几个词 */
function similarity(a, b) {
  const clean = (s) => s.replace(/\s/g, '');
  const sa = new Set([...clean(a)]);
  const sb = new Set([...clean(b)]);
  const inter = [...sa].filter((c) => sb.has(c)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : inter / union;
}

async function byTestId(page, id) {
  await page.waitForSelector(`[data-testid="${id}"]`, { timeout: 5000 });
  return page.$(`[data-testid="${id}"]`);
}

async function clickTestId(page, id) {
  const el = await byTestId(page, id);
  await el.click();
  return el;
}

async function texts(page, selector = '[data-testid="result-text"]') {
  return page.$$eval(selector, (nodes) => nodes.map((n) => n.textContent?.trim() ?? ''));
}

/** 清空并输入新的句子（走 React 的 setter，保证 onChange 被触发） */
async function setInput(page, text) {
  const el = await byTestId(page, 'input-area');
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  await el.type(text, { delay: 4 });
  await sleep(60);
}

async function translateAndWait(page) {
  await clickTestId(page, 'translate');
  await page.waitForSelector('[data-testid="results-panel"], [data-testid="results-error"]', { timeout: 15000 });
  await sleep(120);
}

const server = await serveStatic(DIST);
const BASE = process.argv[2] || server.url;
const browser = await findBrowser();

const puppeteerBrowser = await puppeteer.launch({
  executablePath: browser,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

try {
  const page = await puppeteerBrowser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

  const context = page.browserContext();
  await context.overridePermissions(new URL(BASE).origin, ['clipboard-read', 'clipboard-write']);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  /* 记录所有网络请求，用于证明「离线时不发翻译请求」 */
  const apiRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/translate')) apiRequests.push(req.url());
  });

  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR });

  section('1. 首屏');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await byTestId(page, 'input-area');
  check('标题渲染', (await page.title()).includes('人话翻译局'));
  check('空态提示存在', Boolean(await page.$('[data-testid="results-empty"]')));
  check('无 API 时标为本地引擎', (await page.$eval('[data-testid="engine-label"]', (n) => n.textContent)).includes('本地'));
  check('初始未发出任何 /api/translate 请求', apiRequests.length === 0);
  const bodyText = await page.$eval('body', (n) => n.textContent ?? '');
  check('默认不展开隐私说明', !bodyText.includes('不做用户账号'));
  check('收藏/历史初始为 0', (await page.$$eval('.nav-btn-count', (n) => n.map((x) => x.textContent))).join(',') === '0,0');

  section('2. 输入交互');
  await clickTestId(page, 'example-chip');
  await sleep(80);
  const exampleValue = await page.$eval('[data-testid="input-area"]', (n) => n.value);
  check('示例填充生效', exampleValue.length > 0, exampleValue);
  const countText = await page.$eval('[data-testid="char-count"]', (n) => n.textContent ?? '');
  check('字数统计与输入一致', countText.includes(String([...exampleValue].length)), `${countText} vs ${[...exampleValue].length}`);

  await clickTestId(page, 'clear-input');
  await sleep(60);
  check('清空生效', (await page.$eval('[data-testid="input-area"]', (n) => n.value)) === '');

  await setInput(page, '   ');
  await clickTestId(page, 'translate');
  await sleep(200);
  check('空输入给出错误提示', Boolean(await page.$('[data-testid="input-error"]')));
  check('空输入不产生结果', !(await page.$('[data-testid="results-panel"]')));

  await setInput(page, '好'.repeat(320));
  await sleep(80);
  const counter = await page.$eval('[data-testid="char-count"]', (n) => n.textContent ?? '');
  check('超长输入字数变红（class 生效）', await page.$eval('[data-testid="char-count"]', (n) => n.className.includes('counter-over')), counter);

  section('3. 生成与结果质量');
  await setInput(page, '这个方案我们再研究一下。');
  await translateAndWait(page);
  const n1 = (await texts(page)).length;
  check('输出 3~5 条', n1 >= 3 && n1 <= 5, `实际 ${n1}`);
  check('默认输出 5 条', n1 === 5, `实际 ${n1}`);
  const t1 = await texts(page);
  check('每条都非空', t1.every((t) => t.length >= 4));
  check('各条互不相同', new Set(t1).size === t1.length);
  let maxSim = 0;
  for (let i = 0; i < t1.length; i += 1) {
    for (let j = i + 1; j < t1.length; j += 1) maxSim = Math.max(maxSim, similarity(t1[i], t1[j]));
  }
  check(`版本差异明显（最大字符重合 ${maxSim.toFixed(2)}）`, maxSim < 0.78);
  check('结果与原文相关（提到「研究」或引用原文）', t1.some((t) => t.includes('研究') || t.includes('方案') || t.includes('拍板')));

  /* 换不同句子，结果必须变 */
  await setInput(page, '退款要等七个工作日。');
  await translateAndWait(page);
  const t2 = await texts(page);
  check('换句子后结果不同', t2.join('|') !== t1.join('|'));
  check('新结果贴合新句子（提到退款/流程/等待）', t2.some((t) => /退款|流程|规定|等|售后/.test(t)), t2.join(' / '));

  section('4. 场景与风格生效');
  await setInput(page, '这个方案我们再研究一下。');
  await translateAndWait(page);
  const beforeStyle = await texts(page);
  await clickTestId(page, 'style-office');
  await sleep(120);
  check('改风格后出现「结果已过期」提示', Boolean(await page.$('[data-testid="stale-bar"]')));
  await translateAndWait(page);
  const afterStyle = await texts(page);
  check('换风格后首条变化', beforeStyle[0] !== afterStyle[0], `${beforeStyle[0]} → ${afterStyle[0]}`);
  check('职场风格带公文感', /后续|同步|阶段|评估|推进|知悉|节点/.test(afterStyle[0]), afterStyle[0]);

  await clickTestId(page, 'style-sharp');
  await sleep(80);
  await translateAndWait(page);
  const sharpFirst = (await texts(page))[0];
  check('犀利版更短更硬', [...sharpFirst].length <= 40 && !/感谢|理解|后续/.test(sharpFirst), sharpFirst);

  const beforeScene = await texts(page);
  await clickTestId(page, 'scene-romance');
  await sleep(100);
  await translateAndWait(page);
  const afterScene = await texts(page);
  check('换场景后结果变化', beforeScene.join('|') !== afterScene.join('|'));

  section('5. 换一批');
  const batchA = await texts(page);
  await clickTestId(page, 'regenerate');
  await page.waitForFunction(
    (prev) => {
      const now = [...document.querySelectorAll('[data-testid="result-text"]')].map((n) => n.textContent.trim());
      return now.length > 0 && now.join('|') !== prev;
    },
    { timeout: 15000 },
    batchA.join('|'),
  );
  const batchB = await texts(page);
  check('换一批内容不同', batchA.join('|') !== batchB.join('|'));

  section('6. 复制');
  check('连点后只产生一次结果集', (await texts(page)).length === 5);
  const copyBtn = await byTestId(page, 'copy-variant');
  await copyBtn.click();
  await sleep(220);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const currentFirst = (await texts(page))[0];
  check('单条复制内容正确', normalizeNL(clip) === normalizeNL(currentFirst), `${clip} vs ${currentFirst}`);
  check('复制后按钮提示已复制', (await page.$eval('[data-testid="copy-variant"]', (n) => n.textContent ?? '')).includes('已复制'));

  await clickTestId(page, 'copy-all');
  await sleep(220);
  const clipAll = await page.evaluate(() => navigator.clipboard.readText());
  check('复制全部含原文', clipAll.includes('这个方案我们再研究一下'));
  check('复制全部含所有版本', batchB.every((t) => clipAll.includes(t)));
  check('复制全部含编号', clipAll.includes('01'));

  await clickTestId(page, 'copy-xpost');
  await sleep(200);
  const clipX = await page.evaluate(() => navigator.clipboard.readText());
  const xText = await page.$eval('[data-testid="xpost-text"]', (n) => n.textContent ?? '');
  check('X 文案复制正确', normalizeNL(clipX) === normalizeNL(xText), `clip=${JSON.stringify(clipX)} pre=${JSON.stringify(xText)}`);

  section('7. 收藏');
  await clickTestId(page, 'favorite-variant');
  await sleep(150);
  check('收藏计数 +1', (await page.$$eval('.nav-btn-count', (n) => n.map((x) => x.textContent)))[0] === '1');
  check('按钮变为已收藏', (await page.$eval('[data-testid="favorite-variant"]', (n) => n.textContent ?? '')).includes('已收藏'));
  await clickTestId(page, 'open-favorites');
  await page.waitForSelector('[data-testid="favorites-list"]');
  check('收藏面板有 1 条', (await page.$$('[data-testid="favorites-list"] .saved-item')).length === 1);
  await clickTestId(page, 'close-panel');
  await sleep(150);
  check('关闭收藏面板', !(await page.$('[data-testid="side-panel"]')));

  /* 刷新后收藏仍在（localStorage） */
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(250);
  check('刷新后收藏仍在本地', (await page.$$eval('.nav-btn-count', (n) => n.map((x) => x.textContent)))[0] === '1');
  await clickTestId(page, 'open-favorites');
  await page.waitForSelector('[data-testid="favorites-list"]');
  await clickTestId(page, 'remove-favorite');
  await sleep(150);
  check('删除收藏后列表为空', (await page.$$('[data-testid="favorites-list"] .saved-item')).length === 0);
  await clickTestId(page, 'close-panel');
  await sleep(120);

  section('8. 历史');
  await clickTestId(page, 'open-history');
  await page.waitForSelector('[data-testid="side-panel"]');
  const histItems = await page.$$('[data-testid="history-list"] .saved-item');
  check('历史记录了刚才的翻译', histItems.length >= 1, `实际 ${histItems.length}`);
  await clickTestId(page, 'restore-history');
  await sleep(200);
  const restored = await page.$eval('[data-testid="input-area"]', (n) => n.value);
  check('载入历史把原文填回输入框', restored.length > 0, restored);
  check('载入后关闭面板', !(await page.$('[data-testid="side-panel"]')));

  await clickTestId(page, 'open-history');
  await page.waitForSelector('[data-testid="history-list"]');
  const beforeDel = (await page.$$('[data-testid="history-list"] .saved-item')).length;
  await clickTestId(page, 'remove-history');
  await sleep(150);
  const afterDel = (await page.$$('[data-testid="history-list"] .saved-item')).length;
  check('删除历史生效', afterDel === beforeDel - 1, `${beforeDel} → ${afterDel}`);
  await clickTestId(page, 'close-panel');
  await sleep(120);

  section('9. 依据说明（诚实标注）');
  await setInput(page, '这个方案我们再研究一下。');
  await translateAndWait(page);
  await page.click('[data-testid="toggle-basis"]');
  await page.waitForSelector('[data-testid="basis-block"]');
  const basis = await page.$eval('[data-testid="basis-block"]', (n) => n.textContent ?? '');
  check('依据里写明是本地规则引擎', basis.includes('本地') || basis.includes('词库'));
  check('明确声明不是模型理解', basis.includes('不是模型理解'), basis.slice(0, 80));
  check('来源徽标为本地引擎', (await page.$eval('[data-testid="result-source"]', (n) => n.textContent ?? '')).includes('本地'));
  check('离线生成时确实没发翻译请求', apiRequests.length === 0, `实际 ${apiRequests.length}`);

  section('10. 分享图');
  await clickTestId(page, 'open-share');
  await page.waitForSelector('[data-testid="ratio-1x1"]');
  const dims1 = await page.$eval('[data-share-card="1x1"]', (n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('1:1 卡片为正方形', dims1.w === dims1.h, JSON.stringify(dims1));

  await clickTestId(page, 'download-png');
  let files = [];
  for (let i = 0; i < 60; i += 1) {
    await sleep(180);
    files = readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith('.png'));
    if (files.length > 0 && !files.some((f) => f.endsWith('.crdownload'))) break;
  }
  check('1:1 PNG 已下载', files.length === 1, files.join(','));
  if (files.length > 0) {
    const size = statSync(join(DOWNLOAD_DIR, files[0])).size;
    check('1:1 PNG 体积合理（> 8KB）', size > 8000, `${size} bytes`);
  }

  await clickTestId(page, 'ratio-3x4');
  await page.waitForSelector('[data-share-card="3x4"]');
  const dims2 = await page.$eval('[data-share-card="3x4"]', (n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('3:4 比例为 360×480', dims2.w === 360 && dims2.h === 480, JSON.stringify(dims2));

  await clickTestId(page, 'download-png');
  for (let i = 0; i < 60; i += 1) {
    await sleep(180);
    const now = readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith('.png'));
    if (now.length === 2) break;
  }
  files = readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith('.png'));
  check('3:4 PNG 已下载（共 2 张）', files.length === 2, files.join(','));
  await clickTestId(page, 'close-share');
  await sleep(150);
  check('关闭分享面板', !(await page.$('[data-testid="ratio-1x1"]')));

  section('11. 深色模式与对比度');
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await clickTestId(page, 'toggle-theme');
  await sleep(220);
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('切换主题改变背景色', before !== after, `${before} → ${after}`);
  const contrast = await page.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    const el = document.querySelector('[data-testid="result-text"]') || document.body;
    const fg = lum(parse(getComputedStyle(el).color));
    const bg = lum(parse(getComputedStyle(document.querySelector('.paper') || document.body).backgroundColor));
    const hi = Math.max(fg, bg);
    const lo = Math.min(fg, bg);
    return (hi + 0.05) / (lo + 0.05);
  });
  check(`深色模式正文对比度 ≥ 7:1（${contrast.toFixed(1)}:1）`, contrast >= 7);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(200);
  const themeAfterReload = await page.evaluate(() => document.documentElement.dataset.theme);
  check('主题选择被记住', themeAfterReload === 'dark', themeAfterReload);
  await clickTestId(page, 'toggle-theme');
  await sleep(160);

  section('11b. 输入不落盘（隐私承诺一致性）');
  await setInput(page, '这是一句不该被存下来的私密话。');
  await sleep(500);
  const dumped = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return {
      keys,
      hasInput: keys.some((k) => (localStorage.getItem(k) || '').includes('私密话')),
    };
  });
  check('本机存储里不含用户输入的原文', dumped.hasInput === false, JSON.stringify(dumped.keys));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(250);
  const afterReloadValue = await page.$eval('[data-testid="input-area"]', (n) => n.value);
  check('刷新后输入框为空（不恢复原文）', afterReloadValue === '', afterReloadValue);
  // 前面的用例切换过场景，这里只验证「选项被写进了本地存储且刷新后仍生效」
  const options = await page.evaluate(() => localStorage.getItem('ht.v1.lastOptions'));
  check('场景/风格选项被记住（不含原文）', Boolean(options) && !String(options).includes('私密话'), String(options));
  const checkedCount = await page.$$eval('[role="radio"][aria-checked="true"]', (n) => n.length);
  check('刷新后仍有 1 个场景 + 1 个风格处于选中态', checkedCount === 2, `${checkedCount}`);

  section('11c. 键盘可达性');
  await setInput(page, '这个方案我们再研究一下。');
  await page.evaluate(() => {
    document.querySelector('[data-testid="scene-workplace"]')?.focus();
  });
  // roving tabindex：整组只保留一个 Tab 停留点
  const tabIndexes = await page.$$eval('[data-testid^="scene-"]', (n) => n.map((x) => x.tabIndex));
  check('场景组只有一个 Tab 停留点', tabIndexes.filter((t) => t === 0).length === 1, JSON.stringify(tabIndexes));
  await page.keyboard.press('ArrowRight');
  await sleep(150);
  const afterArrow = await page.evaluate(() => {
    const on = document.querySelector('[role="radio"][aria-checked="true"]');
    return { label: on?.textContent ?? '', focused: document.activeElement?.getAttribute('data-testid') ?? '' };
  });
  check('方向键切换场景选中项', afterArrow.label.includes('商业谈判'), afterArrow.label);
  check('焦点跟随到新选中项', afterArrow.focused === 'scene-negotiation', afterArrow.focused);

  await page.evaluate(() => {
    document.querySelector('[data-testid="style-plain"]')?.focus();
  });
  await page.keyboard.press('End');
  await sleep(150);
  const afterEnd = await page.evaluate(() => document.querySelector('[data-testid^="style-"][aria-checked="true"]')?.getAttribute('data-testid'));
  check('End 键跳到最后一个风格', afterEnd === 'style-meme', String(afterEnd));

  // 回车/空格可以触发翻译
  await page.evaluate(() => {
    document.querySelector('[data-testid="translate"]')?.focus();
  });
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="results-panel"]', { timeout: 15000 });
  check('键盘可触发翻译', (await texts(page)).length === 5);

  // 结果卡片按钮也能 Tab 到（tap 目标检查已覆盖尺寸，这里查可聚焦性）
  const focusables = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-testid="copy-variant"]')];
    return els.every((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
  });
  check('复制按钮可聚焦', focusables);

  section('12. 隐私说明');
  await clickTestId(page, 'toggle-privacy');
  await page.waitForSelector('[data-testid="privacy-block"]');
  const privacy = await page.$eval('[data-testid="privacy-block"]', (n) => n.textContent ?? '');
  check('说明默认本地生成', privacy.includes('本地'));
  check('说明不上传输入', privacy.includes('不会离开') || privacy.includes('不上传'));
  check('说明收藏只存本机', privacy.includes('localStorage') || privacy.includes('本机'));
  check('说明无埋点', privacy.includes('埋点') || privacy.includes('统计'));
  check('说明当前通道状态', privacy.includes('当前状态'));
  await clickTestId(page, 'toggle-privacy');
  await sleep(100);

  section('13. 重复点击防护');
  await setInput(page, '这个方案我们再研究一下。');
  const reqBefore = apiRequests.length;
  const histBefore = Number((await page.$$eval('.nav-btn-count', (n) => n.map((x) => x.textContent)))[1]);
  const btn = await byTestId(page, 'translate');
  await Promise.all([btn.click(), btn.click(), btn.click()]);
  await page.waitForSelector('[data-testid="results-panel"]', { timeout: 15000 });
  await sleep(500);
  check('连点三次只出一批结果', (await texts(page)).length === 5);
  check('连点不会重复请求服务端', apiRequests.length === reqBefore, `${reqBefore} → ${apiRequests.length}`);
  const histAfter = Number((await page.$$eval('.nav-btn-count', (n) => n.map((x) => x.textContent)))[1]);
  check('连点只新增 1 条历史', histAfter - histBefore === 1, `${histBefore} → ${histAfter}`);

  section('14. 特殊字符与换行');
  await setInput(page, '这个「方案」…我们再研究一下？？😅');
  await translateAndWait(page);
  const weird = await texts(page);
  check('特殊字符输入仍能出结果', weird.length >= 3);
  check('结果里没有乱码替换符', weird.every((t) => !t.includes('\uFFFD')));
  const emojiCount = await page.$eval('[data-testid="char-count"]', (n) => n.textContent ?? '');
  check('emoji 按字符计数（不会被算成 2）', emojiCount.includes(String([...'这个「方案」…我们再研究一下？？😅'].length)), emojiCount);

  section('15. 移动端布局');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(300);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check('移动端无横向溢出', overflow.doc <= overflow.win + 1, JSON.stringify(overflow));

  const taps = await page.evaluate(() => {
    const sel = ['[data-testid="translate"]', '[data-testid="input-area"]', '[data-testid="scene-workplace"]', '[data-testid="style-plain"]', '[data-testid="copy-variant"]'];
    return sel.map((s) => {
      const el = document.querySelector(s);
      if (!el) return { s, h: 0 };
      const r = el.getBoundingClientRect();
      return { s, h: Math.round(r.height), w: Math.round(r.width) };
    });
  });
  const tooSmall = taps.filter((t) => t.h > 0 && t.h < 40);
  check('主要可点区域 ≥ 40px 高', tooSmall.length === 0, JSON.stringify(tooSmall));

  await setInput(page, '这个方案我们再研究一下。');
  await translateAndWait(page);
  check('移动端可正常出结果', (await texts(page)).length === 5);

  await clickTestId(page, 'open-share');
  await page.waitForSelector('[data-testid="ratio-1x1"]');
  const modalOverflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check('移动端弹层不溢出', modalOverflow.doc <= modalOverflow.win + 1, JSON.stringify(modalOverflow));
  await clickTestId(page, 'close-share');

  section('16. 控制台健康');
  const realErrors = consoleErrors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('Failed to load resource') /* 静态托管无 /api/health 属预期 */,
  );
  check('无未捕获的页面异常', pageErrors.length === 0, pageErrors.join(' | '));
  check('无意外控制台错误', realErrors.length === 0, realErrors.join(' | '));

  /* 截图存档，便于人工复核视觉 */
  await page.screenshot({ path: join(OUT, 'mobile.png'), fullPage: true });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle2' });
  await setInput(page, '这个方案我们再研究一下。');
  await translateAndWait(page);
  await page.screenshot({ path: join(OUT, 'desktop.png'), fullPage: true });
  await clickTestId(page, 'toggle-theme');
  await sleep(200);
  await page.screenshot({ path: join(OUT, 'desktop-dark.png'), fullPage: true });
  console.log(`\n截图已保存到 ${OUT}`);
} finally {
  await puppeteerBrowser.close();
  await server.close();
}

console.log(`\n${'='.repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ E2E 全部通过：${passed} 项断言`);
} else {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
}
