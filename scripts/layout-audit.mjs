/**
 * 排版与可读性审计（多视口 + 双主题）。
 *
 * 用真实浏览器测量，而不是靠目测：
 *  - 各视口是否横向溢出、是否出现元素重叠/超界；
 *  - 可点区域是否达到移动端最小尺寸；
 *  - 正文字号是否 ≥ 16px（输入框）/ ≥ 14px（结果）；
 *  - 浅色与深色模式下文本对比度是否达标（正文 ≥ 7:1，次要文字 ≥ 4.5:1）；
 *  - 分享卡在 1:1 / 3:4 下的实际渲染尺寸与内容溢出。
 *
 * 用法：node scripts/layout-audit.mjs
 */
import puppeteer from 'puppeteer-core';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { serveStatic, findBrowser } from './serve.mjs';

const OUT = join(process.cwd(), '.layout-out');
mkdirSync(OUT, { recursive: true });

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

const VIEWPORTS = [
  { name: 'iPhone SE', width: 320, height: 568, dsf: 2 },
  { name: 'iPhone 13 mini', width: 375, height: 812, dsf: 3 },
  { name: 'iPhone 15 Pro', width: 393, height: 852, dsf: 3 },
  { name: 'Android 大屏', width: 412, height: 915, dsf: 2.6 },
  { name: 'iPad 竖屏', width: 768, height: 1024, dsf: 2 },
  { name: '笔记本', width: 1280, height: 800, dsf: 1 },
  { name: '桌面宽屏', width: 1600, height: 1000, dsf: 1 },
];

const server = await serveStatic(DIST);
const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();

  /* ---------------- 1. 多视口布局 ---------------- */
  section('1. 多视口：无横向溢出 / 无内容越界');
  for (const vp of VIEWPORTS) {
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dsf,
      isMobile: vp.width < 700,
      hasTouch: vp.width < 700,
    });
    await page.goto(server.url, { waitUntil: 'networkidle2' });
    await page.type('[data-testid="input-area"]', '这个方案我们再研究一下。');
    await page.click('[data-testid="translate"]');
    await page.waitForSelector('[data-testid="results-panel"]', { timeout: 15000 });
    await sleep(250);

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const offenders = [];
      const vw = window.innerWidth;
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        // 允许 1px 的四舍五入误差
        if (r.right > vw + 1 || r.left < -1) {
          const style = getComputedStyle(el);
          if (style.position === 'fixed') return;
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 40),
            right: Math.round(r.right),
            left: Math.round(r.left),
          });
        }
      });
      return {
        scrollW: doc.scrollWidth,
        innerW: vw,
        offenders: offenders.slice(0, 4),
      };
    });

    check(
      `${vp.name} (${vp.width}px) 无横向滚动`,
      metrics.scrollW <= metrics.innerW + 1,
      `scrollWidth=${metrics.scrollW} inner=${metrics.innerW}`,
    );
    check(
      `${vp.name} 无元素越界`,
      metrics.offenders.length === 0,
      JSON.stringify(metrics.offenders),
    );

    /* 关键区块都应有宽度，且不重叠 */
    const blocks = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), w: Math.round(r.width) };
      };
      return {
        input: pick('.input-panel'),
        scene: pick('.picker-panel'),
        action: pick('.action-bar'),
        results: pick('[data-testid="results-panel"]'),
        footer: pick('.site-footer'),
      };
    });
    const twoCol = vp.width >= 960;
    if (twoCol) {
      // 桌面是左右两栏：左侧输入/选项，右侧执行条/结果；两栏各自纵向不重叠
      const leftOrder = ['input', 'scene'].filter((k) => blocks[k]);
      const leftOk = leftOrder.every((k, i) => i === 0 || blocks[k].top >= blocks[leftOrder[i - 1]].bottom - 2);
      const rightOk = blocks.results.top >= blocks.action.bottom - 2;
      check(`${vp.name} 左栏纵向不重叠`, leftOk, JSON.stringify(blocks));
      check(`${vp.name} 右栏执行条在结果上方`, rightOk, JSON.stringify(blocks));
      check(
        `${vp.name} 双栏并排（左栏在右栏左侧）`,
        (await page.evaluate(() => {
          const l = document.querySelector('.layout-col-left').getBoundingClientRect();
          const r = document.querySelector('.layout-col-right').getBoundingClientRect();
          return Math.round(r.left) >= Math.round(l.right) - 2;
        })),
      );
      const colW = await page.evaluate(() => Math.round(document.querySelector('.layout-col-left').getBoundingClientRect().width));
      check(`${vp.name} 输入框铺满左栏`, Math.abs(blocks.input.w - colW) <= 4, `input=${blocks.input.w} col=${colW}`);
    } else {
      const order = ['input', 'scene', 'action', 'results', 'footer'].filter((k) => blocks[k]);
      const ordered = order.every((k, i) => i === 0 || blocks[k].top >= blocks[order[i - 1]].bottom - 2);
      check(`${vp.name} 区块纵向顺序正常（无重叠）`, ordered, JSON.stringify(blocks));
      const paperW = await page.evaluate(() => Math.round(document.querySelector('.paper').getBoundingClientRect().width));
      check(`${vp.name} 输入框铺满内容宽度`, Math.abs(blocks.input.w - paperW) <= 4, `input=${blocks.input.w} paper=${paperW}`);
    }
  }

  /* ---------------- 2. 触控尺寸与字号 ---------------- */
  section('2. 移动端可点尺寸与字号');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(server.url, { waitUntil: 'networkidle2' });
  await page.type('[data-testid="input-area"]', '这个方案我们再研究一下。');
  await page.click('[data-testid="translate"]');
  await page.waitForSelector('[data-testid="results-panel"]');
  await sleep(250);

  const sizes = await page.evaluate(() => {
    const out = [];
    const push = (label, el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      out.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
    };
    push('翻译按钮', document.querySelector('[data-testid="translate"]'));
    push('复制单条', document.querySelector('[data-testid="copy-variant"]'));
    push('收藏按钮', document.querySelector('[data-testid="favorite-variant"]'));
    push('换一批', document.querySelector('[data-testid="regenerate"]'));
    push('分享图', document.querySelector('[data-testid="open-share"]'));
    push('复制全部', document.querySelector('[data-testid="copy-all"]'));
    push('场景按钮', document.querySelector('[data-testid="scene-workplace"]'));
    push('风格按钮', document.querySelector('[data-testid="style-plain"]'));
    push('示例chip', document.querySelector('[data-testid="example-chip"]'));
    push('清空按钮', document.querySelector('[data-testid="clear-input"]'));
    out.push({ label: '输入框字号', h: parseFloat(getComputedStyle(document.querySelector('[data-testid="input-area"]')).fontSize) });
    out.push({ label: '结果正文字号', h: parseFloat(getComputedStyle(document.querySelector('[data-testid="result-text"]')).fontSize) });
    return out;
  });

  for (const s of sizes) {
    if (s.label.includes('字号')) {
      const min = s.label.includes('输入') ? 16 : 14;
      check(`${s.label} ≥ ${min}px（实际 ${s.h}px）`, s.h >= min);
    } else if (s.label === '清空按钮' || s.label === '示例chip') {
      check(`${s.label} 高度 ≥ 28px（实际 ${s.h}px）`, s.h >= 28);
    } else {
      check(`${s.label} 高度 ≥ 40px（实际 ${s.h}px）`, s.h >= 40);
    }
  }

  /* ---------------- 3. 双主题对比度 ---------------- */
  section('3. 浅色 / 深色对比度');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await sleep(200);

    const results = await page.evaluate(() => {
      const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (fg, bg) => {
        const a = lum(parse(fg));
        const b = lum(parse(bg));
        const hi = Math.max(a, b);
        const lo = Math.min(a, b);
        return (hi + 0.05) / (lo + 0.05);
      };
      const bgOf = (el) => {
        let node = el;
        while (node) {
          const c = getComputedStyle(node).backgroundColor;
          if (c && !c.includes("rgba(0, 0, 0, 0)")) return c;
          node = node.parentElement;
        }
        return "rgb(255,255,255)";
      };
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return ratio(getComputedStyle(el).color, bgOf(el));
      };
      return [pick('[data-testid="result-text"]'), pick('.panel-title'), pick('.result-note'), pick('.picker-note')];
    });

    const labels = ['正文', '标题', '次要说明', '场景注释'];
    labels.forEach((label, i) => {
      const value = results[i];
      const min = i === 2 || i === 3 ? 4.5 : 7;
      check(`${theme === 'dark' ? '深色' : '浅色'} ${label} 对比度 ≥ ${min}:1（实际 ${value.toFixed(1)}:1）`, value >= min);
    });
  }

  /* ---------------- 4. 分享卡尺寸与溢出 ---------------- */
  section('4. 分享卡（1:1 与 3:4）');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  const shareBtn = await page.$('[data-testid="open-share"]');
  if (shareBtn) {
    await shareBtn.click();
    await page.waitForSelector('[data-testid="ratio-1x1"]');
    await sleep(200);

    for (const [ratio, expectW, expectH] of [
      ['1x1', 360, 360],
      ['3x4', 360, 480],
    ]) {
      if (ratio === '3x4') {
        await page.click('[data-testid="ratio-3x4"]');
        await sleep(200);
      }
      const card = await page.evaluate((r) => {
        const el = document.querySelector(`[data-share-card="${r}"]`);
        const rect = el.getBoundingClientRect();
        // 内容是否被卡片裁掉（scrollHeight 大于 clientHeight 说明有溢出风险）
        const inner = el.querySelector('.share-inner');
        const body = el.querySelector('.share-body');
        return {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          innerW: Math.round(inner.getBoundingClientRect().width),
          overflowY: inner.scrollHeight - inner.clientHeight,
          bodyOverflow: body ? body.scrollHeight - body.clientHeight : 0,
        };
      }, ratio);
      check(`分享卡 ${ratio} 渲染尺寸 ${expectW}×${expectH}`, card.w === expectW && card.h === expectH, `${card.w}×${card.h}`);
      check(`分享卡 ${ratio} 内容不溢出`, card.overflowY <= 1, `溢出 ${card.overflowY}px`);
      check(`分享卡 ${ratio} 正文区不溢出`, card.bodyOverflow <= 1, `溢出 ${card.bodyOverflow}px`);
    }
    await page.screenshot({ path: join(OUT, 'share-modal.png') });
    await page.click('[data-testid="close-share"]');
  } else {
    check('分享按钮存在', false);
  }

  /* ---------------- 5. 长文本时的排版 ---------------- */
  section('5. 极限文本（长句 / 多行 / 无空格长串）');
  const longInputs = [
    '这个方案我们再研究一下，但是我觉得里面的第二部分可能需要重新评估一下，因为客户那边的反馈还没有回来，而且预算也不是很确定。',
    '第一行\n第二行\n第三行',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '😅😅😅这个方案😅我们再研究😅一下😅',
  ];
  for (const text of longInputs) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const area = await page.$('[data-testid="input-area"]');
    await area.click({ clickCount: 3 });
    await page.keyboard.press('Delete');
    await page.type('[data-testid="input-area"]', text);
    await sleep(60);
    await page.click('[data-testid="translate"]');
    await page.waitForSelector('[data-testid="results-panel"], [data-testid="results-error"]', { timeout: 15000 });
    await sleep(200);
    const m = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      cards: document.querySelectorAll('[data-testid="result-card"]').length,
      overflowing: [...document.querySelectorAll('[data-testid="result-card"]')].filter(
        (el) => el.scrollWidth - el.clientWidth > 2,
      ).length,
    }));
    const label = text.slice(0, 10).replace(/\n/g, '⏎');
    check(`「${label}…」不横向溢出`, m.scrollW <= m.innerW + 1, `scroll=${m.scrollW} win=${m.innerW}`);
    check(`「${label}…」卡片内不溢出`, m.overflowing === 0, `${m.overflowing} 张卡片溢出`);
  }

  /* ---------------- 6. 深色模式截图存档 ---------------- */
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(OUT, 'mobile-dark.png'), fullPage: true });

  console.log(`\n截图已保存到 ${OUT}`);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${'='.repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ 排版审计全部通过：${passed} 项断言`);
} else {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
}
