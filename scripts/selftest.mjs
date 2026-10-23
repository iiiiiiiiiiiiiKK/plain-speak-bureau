/**
 * 引擎自测（不依赖浏览器）。
 * 用 esbuild 把 TS 源码打成一个临时 ESM，然后在 Node 里直接断言。
 * 运行：node scripts/selftest.mjs
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = join(process.cwd(), '.selftest-tmp');
mkdirSync(tmp, { recursive: true });

const entry = join(tmp, 'entry.ts');
writeFileSync(
  entry,
  `export * from '../src/engine/generate';\nexport * from '../src/engine/analyze';\nexport * from '../src/engine/compose';\nexport * from '../src/engine/xpost';\nexport * from '../src/engine/random';\nexport * from '../src/data/intents';\nexport * from '../src/data/scenes';\nexport * from '../src/data/styles';\nexport * from '../src/data/site';\nexport * from '../src/data/extras';\nexport * from '../src/lib/serialize';\n`,
  'utf8',
);

const outfile = join(tmp, 'bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile,
  logLevel: 'error',
});

const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(title) {
  console.log(`\n## ${title}`);
}
const norm = (s) => s.replace(/\s/g, '');

/* ------------------------------------------------------------------ */
section('1. 配置完整性');

check('场景数 ≥ 9', mod.SCENES.length >= 9, `实际 ${mod.SCENES.length}`);
check('风格数 ≥ 6', mod.STYLES.length >= 6, `实际 ${mod.STYLES.length}`);
for (const scene of mod.SCENES) {
  check(`场景 ${scene.id} 有 3 条以上示例`, scene.examples.length >= 3);
  check(`场景 ${scene.id} 有称呼词`, scene.address.length > 0);
  check(`场景 ${scene.id} 有收尾语`, scene.closers.length > 0);
}

for (const style of mod.STYLES) {
  check(`风格 ${style.id} 有 ≥5 条配方`, style.recipes.length >= 5, `实际 ${style.recipes.length}`);
  check(`风格 ${style.id} 有说明`, style.desc.length > 0);
}

/* 每个意图六种素材都必须齐，否则组合层会退化成「同风格换词」 */
const FIELDS = ['truth', 'eq', 'sharp', 'office', 'sarcasm', 'meme'];
for (const intent of mod.INTENTS) {
  for (const field of FIELDS) {
    check(`意图 ${intent.id}.${field} ≥ 3 条`, Array.isArray(intent[field]) && intent[field].length >= 3, `实际 ${intent[field]?.length}`);
  }
  check(`意图 ${intent.id} 有 label`, intent.label.length > 0);
}

check('存在 generic 兜底意图', Boolean(mod.INTENT_MAP.generic));

/* ------------------------------------------------------------------ */
section('2. 意图识别');

const intentCases = [
  ['这个方案我们再研究一下。', 'postpone'],
  ['我这边先看看，有消息同步你。', 'vaguePromise'],
  ['下次一定！', 'declineSoft'],
  ['这个忙我真帮不了。', 'refuseDirect'],
  ['我要找你们领导投诉。', 'complaint'],
  ['在干嘛？', 'waiting'],
  ['你觉得我是不是很烦？', 'askOpinion'],
  ['预算就这么多，你看能不能再让一步。', 'priceHaggle'],
  ['再这样我就走了。', 'bluffWarn'],
  ['都行，随你吧。', 'passiveJab'],
  ['我们要拉通对齐，形成闭环。', 'jargon'],
  ['这个已经过保了，修不了。', 'serviceRule'],
  ['谢谢你，辛苦了。', 'thanks'],
  ['对不起，是我的问题。', 'apology'],
  ['老板，我最近想请两天假。', 'askLeave'],
  ['你上次答应我的事还算数吗？', 'remindPromise'],
  ['你怎么又忘了？', 'blameForget'],
  ['我们老板特别能画饼。', 'paintPie'],
  ['这单我们就不接了，谢谢。', 'refuseDirect'],
  ['你先忙，我不打扰了。', 'passiveJab'],
  ['我已经等你三个小时了。', 'waiting'],
];

for (const [sentence, expected] of intentCases) {
  const a = mod.analyze(sentence, 'workplace');
  check(`识别「${sentence}」→ ${expected}`, a.intentId === expected, `实际 ${a.intentId}`);
}

const unknown = mod.analyze('今天天气不错。', 'friends');
check('未知句式降级为 generic', unknown.intentId === 'generic');
check('未知句式置信度为 low', unknown.confidence === 'low', `实际 ${unknown.confidence}`);

/* ------------------------------------------------------------------ */
section('3. 实体与文本处理');

const e1 = mod.analyze('这个方案我们再研究一下。', 'workplace');
check('抽出实体「这个方案」', e1.entity === '这个方案', `实际 ${e1.entity}`);
check('surfaceShort 去掉句末句号', !e1.surfaceShort.endsWith('。'), `实际「${e1.surfaceShort}」`);

const emojiText = '这个方案😀我们再研究一下。';
const e2 = mod.analyze(emojiText, 'workplace');
check('emoji 不破坏字数统计', e2.charCount === [...emojiText].length);

const multiline = '第一行\n第二行\n\n第三行';
const e3 = mod.analyze(multiline, 'workplace');
check('保留换行的 normalizeInput', e3.normalized.includes('\n'));
check('多行压平后不含换行', !e3.normalized.replace(/\n/g, ' ').match(/\n{3,}/));

check('超长文本可截断引用', [...mod.analyze('长'.repeat(200), 'workplace').surfaceShort].length <= 19);

const check1 = mod.checkInput('   ', 300);
check('空输入被拒', check1.ok === false && check1.reason === 'empty');
const check2 = mod.checkInput('好'.repeat(301), 300);
check('超长输入被拒', check2.ok === false && check2.reason === 'tooLong');
const check3 = mod.checkInput('好'.repeat(300), 300);
check('恰好上限可通过', check3.ok === true);

/* ------------------------------------------------------------------ */
section('4. 生成质量：条数、差异、相关性');

const cases = [
  ['这个方案我们再研究一下。', 'workplace', 'plain'],
  ['这个价格我们再商量商量。', 'negotiation', 'sharp'],
  ['你最近是不是有点忙？', 'romance', 'highEq'],
  ['下次一定！', 'friends', 'sarcasm'],
  ['我们要拉通对齐，形成闭环。', 'buzzwords', 'meme'],
  ['退款要等七个工作日。', 'service', 'office'],
  ['这个忙我真帮不了。', 'refusal', 'plain'],
  ['您说的都对。', 'passiveAggressive', 'sarcasm'],
  ['这件事你怎么看？', 'smoothReply', 'highEq'],
];

for (const [sentence, scene, style] of cases) {
  const out = mod.localGenerate({ input: sentence, scene, style, batchSeed: 0, count: 5 });

  check(`[${sentence}] 输出 3~5 条`, out.variants.length >= 3 && out.variants.length <= 5, `实际 ${out.variants.length}`);
  check(`[${sentence}] 条数=5（默认）`, out.variants.length === 5, `实际 ${out.variants.length}`);

  const texts = out.variants.map((v) => v.text);
  const uniq = new Set(texts.map(norm));
  check(`[${sentence}] 各条不重复`, uniq.size === texts.length, `${uniq.size}/${texts.length}`);

  // 差异度：两两之间字符级 Jaccard 必须低（不能只是换了几个词）
  let maxSim = 0;
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = new Set([...norm(texts[i])]);
      const b = new Set([...norm(texts[j])]);
      const inter = [...a].filter((c) => b.has(c)).length;
      const union = new Set([...a, ...b]).size;
      maxSim = Math.max(maxSim, inter / union);
    }
  }
  check(`[${sentence}] 版本差异足够大（最大字符重合 ${maxSim.toFixed(2)}）`, maxSim < 0.78);

  // 首句必须来自选定风格
  const primary = out.variants.find((v) => v.role === 'primary');
  check(`[${sentence}] 首条为主风格`, primary?.style === style, `实际 ${primary?.style}`);

  // 至少一条带对照风格
  check(`[${sentence}] 含对照版本`, out.variants.some((v) => v.role === 'contrast'));

  // 不能出现未替换的占位符
  check(
    `[${sentence}] 无未替换占位符`,
    texts.every((t) => !/\{[a-zA-Z]+\}/.test(t)),
    texts.find((t) => /\{[a-zA-Z]+\}/.test(t)),
  );

  // 相关性：结果里应出现该意图的特征词，或者引用了原文
  const intentId = out.analysis.intentId;
  const intentMaterial = mod.INTENT_MAP[intentId];
  const pool = [...intentMaterial.truth, ...intentMaterial.sharp, ...intentMaterial.office, ...intentMaterial.meme, ...intentMaterial.sarcasm, ...intentMaterial.eq].map(norm);
  const related = texts.filter((t) => {
    const n = norm(t);
    if (n.includes(norm(sentence).slice(0, 4))) return true;
    return pool.some((p) => {
      const head = p.split('{')[0];
      return head.length >= 4 && n.includes(norm(head).slice(0, 4));
    });
  });
  check(`[${sentence}] 至少 2 条与意图相关`, related.length >= 2, `${related.length}/${texts.length}`);

  // 长度控制：没有空串、没有超长
  check(`[${sentence}] 每条 4~80 字`, texts.every((t) => [...t].length >= 4 && [...t].length <= 80));
}

/* ------------------------------------------------------------------ */
section('4b. 没有潜台词时，不许硬编潜台词');

const neutral = [
  '我妈说让我早点回家。',
  '今天的会开得挺顺利的。',
  '这个季度业绩还不错。',
  '你吃饭了吗？',
];

for (const sentence of neutral) {
  const out = mod.localGenerate({ input: sentence, scene: 'friends', style: 'plain', batchSeed: 0 });
  check(`[无潜台词] 「${sentence}」判为 generic`, out.analysis.intentId === 'generic', out.analysis.intentId);
  check(`[无潜台词] 「${sentence}」置信度为 low`, out.analysis.confidence === 'low', out.analysis.confidence);
  // 不能凭空断言一个用户没说的意思
  const fabricated = /(没人想拍板|没人负责|不想担责任|想砍价|没人愿意签字)/;
  check(
    `[无潜台词] 「${sentence}」不编造利益动机`,
    out.variants.every((v) => !fabricated.test(v.text)),
    out.variants.map((v) => v.text).join(' / '),
  );
  // 对应说明里必须自曝「按通用改写处理」
  check(
    `[无潜台词] 「${sentence}」依据里说明是通用改写`,
    out.meta.rationale.some((line) => line.includes('通用改写')),
    out.meta.rationale.join(' | '),
  );
}

/* ------------------------------------------------------------------ */
section('5. 场景与风格确实生效');

const base = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain', batchSeed: 0 });
const swapped = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'office', batchSeed: 0 });
check(
  '换风格得到不同结果',
  base.variants[0].text !== swapped.variants[0].text,
  `${base.variants[0].text} vs ${swapped.variants[0].text}`,
);
check('换风格后主风格标签变化', swapped.variants[0].style === 'office');

const negScene = mod.localGenerate({ input: '这个价格我们再商量商量。', scene: 'negotiation', style: 'plain', batchSeed: 0 });
const workScene = mod.localGenerate({ input: '这个价格我们再商量商量。', scene: 'workplace', style: 'plain', batchSeed: 0 });
check('同句不同场景结果不同', negScene.variants.map((v) => v.text).join('|') !== workScene.variants.map((v) => v.text).join('|'));

/* 六种风格两两之间必须有明显差异 */
const styleOutputs = {};
for (const style of mod.STYLES) {
  styleOutputs[style.id] = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: style.id, batchSeed: 0 });
}
for (let i = 0; i < mod.STYLES.length; i += 1) {
  for (let j = i + 1; j < mod.STYLES.length; j += 1) {
    const a = styleOutputs[mod.STYLES[i].id].variants[0].text;
    const b = styleOutputs[mod.STYLES[j].id].variants[0].text;
    check(`风格 ${mod.STYLES[i].id} ≠ ${mod.STYLES[j].id}`, a !== b, `${a} / ${b}`);
  }
}

/* ------------------------------------------------------------------ */
section('6. 换一批（种子）');

const batch0 = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain', batchSeed: 0 });
const batch1 = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain', batchSeed: 1 });
const batch1again = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain', batchSeed: 1 });
check('换一批内容不同', batch0.variants[0].text !== batch1.variants[0].text, `${batch0.variants[0].text} / ${batch1.variants[0].text}`);
check(
  '同种子可复现',
  batch1.variants.map((v) => v.text).join('|') === batch1again.variants.map((v) => v.text).join('|'),
);

/* ------------------------------------------------------------------ */
section('7. X 文案');

const xOut = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'sharp', batchSeed: 0 });
check('X 文案非空', xOut.xPost.text.trim().length > 0);
check('X 权重 ≤ 280', xOut.xPost.weight <= 280, `实际 ${xOut.xPost.weight}`);
check('X limited 标记正确', xOut.xPost.limited === (xOut.xPost.weight > 280));
check('汉字权重记 2', mod.xWeight('中文') === 4, `实际 ${mod.xWeight('中文')}`);
check('ASCII 权重记 1', mod.xWeight('abc') === 3);
check('X 文案含多行结构', xOut.xPost.text.includes('\n'));

const longX = mod.buildXPost({
  analysis: mod.analyze('长'.repeat(60), 'workplace'),
  variants: [{ id: 'v1', style: 'sharp', styleLabel: '犀利版', note: '', text: '长'.repeat(60), role: 'primary', index: 1 }],
});
check('超长输入时 X 文案仍被裁剪到限内', longX.weight <= 280, `实际 ${longX.weight}`);

/* ------------------------------------------------------------------ */
section('8. 序列化');

const sample = mod.localGenerate({ input: '这个方案我们再研究一下。', scene: 'workplace', style: 'plain', batchSeed: 0 });
const all = mod.allVariantsText(sample.variants, '这个方案我们再研究一下。', 'workplace');
check('复制全部包含原文', all.includes('这个方案我们再研究一下'));
check('复制全部包含每条正文', sample.variants.every((v) => all.includes(v.text)));
check('复制全部含条数编号', all.includes('01'));
check('单条复制纯正文', mod.variantPlain(sample.variants[0]) === sample.variants[0].text);

/* ------------------------------------------------------------------ */
section('9. 确定性随机');

check('hashString 稳定', mod.hashString('abc') === mod.hashString('abc'));
check('hashString 区分输入', mod.hashString('abc') !== mod.hashString('abd'));
const rngA = mod.mulberry32(42);
const rngB = mod.mulberry32(42);
check('mulberry32 可复现', [0, 1, 2].every(() => rngA() === rngB()));
const rngVals = [mod.mulberry32(7)(), mod.mulberry32(8)(), mod.mulberry32(9)()];
check('mulberry32 有区分度', new Set(rngVals).size > 1);

/* ------------------------------------------------------------------ */
console.log(`\n${'='.repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ 引擎自测全部通过：${passed} 项断言`);
} else {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
}

/* 输出样例，便于人工复核措辞 */
console.log('\n## 样例输出（人工复核）');
for (const [sentence, scene, style] of cases.slice(0, 4)) {
  const out = mod.localGenerate({ input: sentence, scene, style, batchSeed: 0 });
  console.log(`\n> ${sentence}  [${scene}/${style}] 意图=${out.analysis.intentId}`);
  out.variants.forEach((v) => console.log(`  ${String(v.index).padStart(2, '0')}［${v.styleLabel}］${v.text}`));
  console.log(`  X: ${out.xPost.text.replace(/\n/g, ' / ')}`);
}
