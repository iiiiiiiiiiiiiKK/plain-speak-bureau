/**
 * 措辞抽样：把每个场景 × 风格的代表性输出打印出来，供人工复核。
 * 这不是断言测试，是给人看的「质检清单」。
 *
 * 用法：node scripts/sample-dump.mjs [句子]
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = join(process.cwd(), '.selftest-tmp');
mkdirSync(tmp, { recursive: true });
const entry = join(tmp, 'sample-entry.ts');
writeFileSync(
  entry,
  `export * from '../src/engine/generate';\nexport * from '../src/data/scenes';\nexport * from '../src/data/styles';\n`,
  'utf8',
);
const outfile = join(tmp, 'sample.mjs');
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

const SCENES = mod.SCENES;
const STYLES = mod.STYLES;

/* 每个场景挑一句最典型的原话 */
const SENTENCE = {
  workplace: '这个方案我们再研究一下。',
  negotiation: '这个价格我们再商量商量。',
  romance: '你最近是不是有点忙？',
  friends: '下次一定！',
  buzzwords: '我们要拉通对齐，形成闭环，找到抓手。',
  service: '退款要等七个工作日。',
  refusal: '这个忙我真帮不了。',
  passiveAggressive: '您说的都对。',
  smoothReply: '这件事你怎么看？',
};

const only = process.argv[2];

console.log('人话翻译局 · 措辞抽样\n');

for (const scene of SCENES) {
  if (only && scene.id !== only) continue;
  const input = SENTENCE[scene.id];
  console.log('='.repeat(70));
  console.log(`场景：${scene.label}（${scene.en}）  原话：${input}`);
  const base = mod.localGenerate({ input, scene: scene.id, style: 'plain', batchSeed: 0 });
  console.log(`判定意图：${base.analysis.intentId} / ${base.analysis.intentLabel}（置信度 ${base.analysis.confidence}）`);
  console.log(`识别对象：${base.analysis.entity}   称呼：${base.analysis.address}`);
  console.log('');

  for (const style of STYLES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: style.id, batchSeed: 0 });
    console.log(`【${style.label}】`);
    out.variants.forEach((v) => {
      const mark = v.role === 'contrast' ? '·' : ' ';
      console.log(`  ${mark}${String(v.index).padStart(2, '0')}［${v.styleLabel}］${v.text}`);
    });
    console.log('');
  }

  console.log(`X 文案：${base.xPost.text.replace(/\n/g, '\n         ')}`);
  console.log(`权重：${base.xPost.weight}/280`);
  console.log('');
}
