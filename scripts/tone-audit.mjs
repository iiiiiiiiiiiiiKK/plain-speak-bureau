/**
 * 语气一致性抽查：把全部场景 × 全部风格的输出都过一遍，
 * 用规则找出「明显串味」的句子（恋爱里的公文腔、朋友间的会议纪要……）。
 *
 * 这是回归测试：改动素材后跑一次，能立刻发现新写进词库的串味句子。
 * 用法：node scripts/tone-audit.mjs
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = join(process.cwd(), '.selftest-tmp');
mkdirSync(tmp, { recursive: true });
const entry = join(tmp, 'tone-entry.ts');
writeFileSync(
  entry,
  `export * from '../src/engine/generate';\nexport * from '../src/data/scenes';\nexport * from '../src/data/styles';\n`,
  'utf8',
);
const outfile = join(tmp, 'tone.mjs');
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
const check = (name, cond, detail) => {
  if (cond) passed += 1;
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const section = (t) => console.log(`\n## ${t}`);

/** 公文/会议黑话：只在职场类场景里出现才合理 */
const CORPORATE = /(请知悉|后续再同步|另行通知|请于|烦请|同步至|备查|闭环|抓手|颗粒度|赋能|拉通|对齐机制|纪要|公司文化墙|文化墙|复盘会|排期表|项目组)/;
/** 恋爱/亲密语气 */
const INTIMATE = /(想你|抱抱|我们之间|等我|晚安|我等你)/;
/** 家庭/朋友客套 */
const SOCIAL = /(下次一定|改天|有空聚|江湖|兄弟|姐妹)/;

const WORK_SCENES = new Set(['workplace', 'negotiation', 'service', 'buzzwords', 'refusal']);

/** 每个场景取一句最有代表性的原话 */
const SENTENCES = {
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

section('1. 非职场场景不出现公文腔');
for (const scene of mod.SCENES) {
  if (WORK_SCENES.has(scene.id)) continue;
  const input = SENTENCES[scene.id];
  for (const style of mod.STYLES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: style.id, batchSeed: 0 });
    for (const v of out.variants) {
      // 主风格如果本身就是「职场生存版」，公文腔是刻意的；只查对照版本与其它主风格
      if (v.style === 'office') continue;
      check(
        `[${scene.label}/${style.label}] 第 ${v.index} 条无公文腔`,
        !CORPORATE.test(v.text),
        v.text,
      );
    }
  }
}

section('2. 职场场景不出现亲密语气');
for (const scene of mod.SCENES) {
  if (!WORK_SCENES.has(scene.id)) continue;
  const input = SENTENCES[scene.id];
  for (const style of mod.STYLES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: style.id, batchSeed: 0 });
    for (const v of out.variants) {
      check(
        `[${scene.label}/${style.label}] 第 ${v.index} 条无亲密语气`,
        !INTIMATE.test(v.text),
        v.text,
      );
    }
  }
}

section('3. 输入里的关键词不会被替换成无关素材');
for (const scene of mod.SCENES) {
  const input = SENTENCES[scene.id];
  for (const style of mod.STYLES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: style.id, batchSeed: 0 });
    const anyRef = out.variants.some((v) => {
      // 要么引用了原文片段，要么用到了该意图的素材
      const head = [...out.analysis.surfaceShort].slice(0, 4).join('');
      return head.length >= 2 && v.text.includes(head);
    });
    check(`[${scene.label}/${style.label}] 至少一条引用原文`, anyRef);
  }
}

section('4. 没有未替换槽位 / 没有空标点 / 没有重复句号');
for (const scene of mod.SCENES) {
  const input = SENTENCES[scene.id];
  for (const style of mod.STYLES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: style.id, batchSeed: 0 });
    for (const v of out.variants) {
      check(`[${scene.label}/${style.label}] 第 ${v.index} 条无槽位`, !/\{[a-zA-Z]+\}/.test(v.text), v.text);
      check(`[${scene.label}/${style.label}] 第 ${v.index} 条无空标点`, !/[，、；：]\s*[。！？]/.test(v.text), v.text);
      check(`[${scene.label}/${style.label}] 第 ${v.index} 条无重复标点`, !/[。！？]{2,}/.test(v.text), v.text);
      check(`[${scene.label}/${style.label}] 第 ${v.index} 条无连续空格`, !/\s{2,}/.test(v.text), v.text);
      check(`[${scene.label}/${style.label}] 第 ${v.index} 条不以标点开头`, !/^[，、；：。！？]/.test(v.text), v.text);
    }
  }
}

/* 额外样本：覆盖请假 / 催促 / 责备 / 画饼 等新意图，防止它们在某些场景下串味 */
const EXTRA_SENTENCES = [
  '老板，我最近想请两天假。',
  '你上次答应我的事还算数吗？',
  '你怎么又忘了？',
  '我们老板特别能画饼。',
  '这个功能做不了，你换个需求吧。',
  '我先忙，回头聊。',
];

section('4b. 新意图在全部场景下同样不串味');
for (const input of EXTRA_SENTENCES) {
  for (const scene of mod.SCENES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: 'plain', batchSeed: 0 });
    for (const v of out.variants) {
      if (v.style === 'office') continue;
      if (!WORK_SCENES.has(scene.id)) {
        check(`[${input.slice(0, 8)}…/${scene.label}] 无公文腔`, !CORPORATE.test(v.text), v.text);
      } else {
        check(`[${input.slice(0, 8)}…/${scene.label}] 无亲密语气`, !INTIMATE.test(v.text), v.text);
      }
      check(`[${input.slice(0, 8)}…/${scene.label}] 无空槽位`, !/\{[a-zA-Z]+\}/.test(v.text), v.text);
    }
  }
}

section('5. 同一批内不出现重复句式开头（除引用原文那条）');
for (const scene of mod.SCENES) {
  const input = SENTENCES[scene.id];
  for (const style of mod.STYLES) {
    const out = mod.localGenerate({ input, scene: scene.id, style: style.id, batchSeed: 0 });
    const heads = out.variants.map((v) => [...v.text].slice(0, 3).join(''));
    const dupes = heads.filter((h, i) => heads.indexOf(h) !== i);
    check(`[${scene.label}/${style.label}] 句子开头不重复`, dupes.length === 0, dupes.join(' / '));
  }
}

console.log(`\n${'='.repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ 语气一致性抽查全部通过：${passed} 项断言`);
} else {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${passed} 项`);
  console.log('\n失败明细（前 40 条）：');
  for (const f of failures.slice(0, 40)) console.log(`   - ${f}`);
  process.exitCode = 1;
}
