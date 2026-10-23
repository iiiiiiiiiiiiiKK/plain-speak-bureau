/**
 * 组合层：把「分析结果 + 场景 + 风格」拼成具体句子。
 *
 * 关键设计是「句法配方」：
 * 每种风格有多条不同的句型模板（recipes），一条版本用一条配方，
 * 配方里只填该风格专用素材（truth / eq / sharp / office / sarcasm / meme）。
 * 因此同一句话的五个版本，句子结构本身就不同，而不是只换几个词。
 */
import { ACTIONS, METAPHORS, STAGES, STYLE_NOTES, WORK_METAPHORS, WORK_STAGES } from '../data/extras';
import { SCENE_MAP, type SceneId } from '../data/scenes';
import { STYLE_MAP, type StyleId } from '../data/styles';
import { INTENT_MAP, type Intent } from '../data/intents';
import { mulberry32, pickAt, shuffleWithSeed } from './random';
import type { Analysis, Variant } from './types';

/** 风格 → 该风格使用的素材字段 */
const STYLE_FIELD: Record<StyleId, 'truth' | 'eq' | 'sharp' | 'sarcasm' | 'office' | 'meme'> = {
  plain: 'truth',
  highEq: 'eq',
  sharp: 'sharp',
  sarcasm: 'sarcasm',
  office: 'office',
  meme: 'meme',
};

/** 选主风格时搭配的对照组：语气差距越大，对照越明显 */
const CONTRAST: Record<StyleId, [StyleId, StyleId]> = {
  plain: ['sharp', 'meme'],
  highEq: ['office', 'plain'],
  sharp: ['plain', 'sarcasm'],
  sarcasm: ['sharp', 'meme'],
  office: ['highEq', 'plain'],
  meme: ['sarcasm', 'plain'],
};

/**
 * 职场腔只在职场类场景成立。
 * 恋爱里冒出「请于今日内明确是否通过」不是「有张力」，是穿错衣服。
 * 因此非职场场景把 office 换成语气的第二顺位。
 */
const WORK_SCENES = new Set(['workplace', 'negotiation', 'service', 'buzzwords', 'refusal']);

function contrastFor(style: StyleId, scene: SceneId): [StyleId, StyleId] {
  const pair = CONTRAST[style];
  if (WORK_SCENES.has(scene)) return pair;
  const cleaned = pair.map((s) => (s === 'office' ? 'sharp' : s)) as [StyleId, StyleId];
  return cleaned;
}

interface FillContext {
  entity: string;
  address: string;
  surfaceShort: string;
  sceneClose: string;
  action: string;
  metaphor: string;
  stage: string;
  stake: string;
}

/**
 * 取素材：优先用没用过的。
 * 一批里出现两条「不帮。别问原因。」会让用户觉得是在凑数，
 * 所以这里做素材级去重，用完了才允许回绕。
 */
function material(
  intent: Intent,
  style: StyleId,
  seed: number,
  index: number,
  used: Set<string>,
): string {
  const field = STYLE_FIELD[style];
  const list = intent[field]?.length ? intent[field] : intent.truth;
  const start = ((seed + index * 3 + 1) % list.length + list.length) % list.length;
  for (let step = 0; step < list.length; step += 1) {
    const candidate = list[(start + step) % list.length] as string;
    const key = `${style}:${candidate}`;
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
  }
  return list[start] as string;
}

function fill(recipe: string, ctx: FillContext, body: string): string {
  return recipe
    .replace(/\{truth\}/g, body)
    .replace(/\{eq\}/g, body)
    .replace(/\{sharp\}/g, body)
    .replace(/\{sarcasm\}/g, body)
    .replace(/\{office\}/g, body)
    .replace(/\{meme\}/g, body)
    .replace(/\{entity\}/g, ctx.entity)
    .replace(/\{address\}/g, ctx.address)
    .replace(/\{surfaceShort\}/g, ctx.surfaceShort)
    .replace(/\{sceneClose\}/g, ctx.sceneClose)
    .replace(/\{action\}/g, ctx.action)
    .replace(/\{stake\}/g, ctx.stake)
    .replace(/\{metaphor\}/g, ctx.metaphor)
    .replace(/\{stage\}/g, ctx.stage);
}

/** 已有引导语时，素材自带的开场词要剥掉，否则会出现「好的，翻译一下：好的，……」 */
const LEAD_IN = /(翻译一下|翻译过来|意思是|说人话|翻译是|大白话)[：:]\s*/;
/** 素材自带的口头开场词：前面已经有引导语时要去掉，避免「好的，翻译一下：好的，」 */
const DISCOURSE_HEAD = /^(好的|懂了|嗯|行|妙啊|不敢当|承蒙关照|您这话|您说的都对)[，,、\s]*/;

function dedupeLeadIn(text: string): string {
  const marker = LEAD_IN.exec(text);
  if (!marker) return text;
  const cut = marker.index + marker[0].length;
  const head = text.slice(0, cut);
  const tail = text.slice(cut).replace(DISCOURSE_HEAD, '');
  return head + tail;
}

/** 统一收尾：去空白、去重复标点、去句首孤立标点 */
export function tidy(text: string): string {
  return dedupeLeadIn(text)
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*[，、；]+/g, '：')
    .replace(/[，、；]+\s*[：:]/g, '：')
    .replace(/[，、；：]\s*。/g, '。')
    .replace(/。{2,}/g, '。')
    .replace(/，{2,}/g, '，')
    .replace(/(懂了|妙啊|不敢当|好的|嗯)[，,]\s*(好的|懂了|嗯)[，,]/g, '$1，')
    .replace(/([。！？])\s*[，、；]\s*/g, '$1')
    .replace(/(——|—{1,2}|[：:])\s*[，、；]\s*/g, '$1')
    .replace(/^[，、；：。]/, '')
    .replace(/^[。！？…]+/, '')
    .replace(/([。！？])\1+/g, '$1')
    .trim();
}

export interface BuildOptions {
  analysis: Analysis;
  scene: SceneId;
  style: StyleId;
  seed: number;
  primaryCount?: number;
  contrastCount?: number;
}

export function buildVariants(options: BuildOptions): Variant[] {
  const { analysis, scene, style, seed } = options;
  const primaryCount = options.primaryCount ?? 3;
  const contrastCount = options.contrastCount ?? 2;
  const intent = INTENT_MAP[analysis.intentId];
  const sceneDef = SCENE_MAP[scene];
  const actions = ACTIONS[scene] ?? ACTIONS.workplace;
  const rng = mulberry32(seed);

  const base = {
    entity: analysis.entity,
    address: analysis.address,
    surfaceShort: analysis.surfaceShort,
  };

  const used = new Set<string>();
  /** 已用过的素材（按风格），避免一批里同一句话出现两次 */
  const usedMaterial = new Set<string>();
  /** 句子开头（前 4 字）也去重：五条结果全用「关于…」开头，读起来像同一句话改词 */
  const usedHeads = new Set<string>();
  const variants: Variant[] = [];
  let seq = 0;

  const headOf = (text: string): string => [...text].slice(0, 4).join('');

  const push = (text: string, styleId: StyleId, role: 'primary' | 'contrast'): boolean => {
    const clean = tidy(text);
    if (!clean || used.has(clean)) return false;
    const head = headOf(clean);
    if (usedHeads.has(head)) return false;
    used.add(clean);
    usedHeads.add(head);
    seq += 1;
    const notes = STYLE_NOTES[styleId] ?? STYLE_NOTES.plain;
    variants.push({
      id: `v${seq}`,
      style: styleId,
      styleLabel: STYLE_MAP[styleId].label,
      note: pickAt(notes, seq - 1 + (seed % 5)),
      text: clean,
      role,
      index: seq,
    });
    return true;
  };

  // 梗池按场景分流：职场梗只在职场类场景抽，恋爱/朋友场景用通用池
  const work = WORK_SCENES.has(scene);
  const stagePool = work ? [...STAGES, ...WORK_STAGES] : STAGES;
  const metaphorPool = work ? [...METAPHORS, ...WORK_METAPHORS] : METAPHORS;

  const ctxFor = (ri: number, salt: number): FillContext => ({
    ...base,
    sceneClose: pickAt(sceneDef.closers, seed + ri + salt),
    action: pickAt(actions, seed + ri * 2 + salt),
    metaphor: pickAt(metaphorPool, seed + ri + salt),
    stage: pickAt(stagePool, seed + ri * 5 + salt),
    stake: pickAt(intent.stake ?? ['说清楚比说漂亮重要'], seed + ri + salt),
  });

  /* ---- 主风格：把「会引用原文」的配方排到前面，用户才能确认它读的是自己那句 ---- */
  const recipes = STYLE_MAP[style].recipes;
  let order = shuffleWithSeed(
    recipes.map((_, i) => i),
    seed ^ 0x9e3779b9,
  );
  const quoteIdx = order.findIndex((ri) => recipes[ri]?.includes('{surfaceShort}'));
  if (quoteIdx > 0) {
    const [moved] = order.splice(quoteIdx, 1);
    order.unshift(moved as number);
  }

  /*
   * 输入里没有潜台词（generic）时，「进入某个阶段」「像把话放进抽屉」这类比喻会显得硬凑，
   * 「约个会定负责人」这类动作也不对症。所以把带这些槽位的配方排到后面，
   * 优先用更朴素的句式——不够花哨，但不会驴唇不对马嘴。
   */
  if (intent.id === 'generic') {
    const plainish = order.filter((ri) => !/\{(stage|metaphor|action)\}/.test(recipes[ri] ?? ''));
    const fancy = order.filter((ri) => /\{(stage|metaphor|action)\}/.test(recipes[ri] ?? ''));
    order = [...plainish, ...fancy];
  }

  for (const ri of order) {
    if (variants.filter((v) => v.role === 'primary').length >= primaryCount) break;
    push(composeOne(intent, style, ri, ctxFor(ri, 0), seed, usedMaterial), style, 'primary');
  }
  // 万一素材撞车导致主风格不足，继续补足
  for (let extra = 0; variants.filter((v) => v.role === 'primary').length < primaryCount && extra < 8; extra += 1) {
    push(composeOne(intent, style, extra, ctxFor(extra, 17), seed + extra, usedMaterial), style, 'primary');
  }

  /* ---- 对照风格：换成结构完全不同的语气，让差异一眼可见 ---- */
  const contrasts = contrastFor(style, scene);
  for (let c = 0; c < contrastCount; c += 1) {
    const altStyle = contrasts[c % contrasts.length] as StyleId;
    const altRecipes = STYLE_MAP[altStyle].recipes;
    let added = false;
    for (let attempt = 0; attempt < 8 && !added; attempt += 1) {
      const ri = Math.floor(rng() * altRecipes.length) + attempt;
      added = push(
        composeOne(intent, altStyle, ri, ctxFor(ri, c * 3), seed + c * 11, usedMaterial),
        altStyle,
        'contrast',
      );
    }
    if (!added) {
      push(composeOne(intent, altStyle, 0, ctxFor(0, c), seed + c, usedMaterial), altStyle, 'contrast');
    }
  }

  return variants;
}

function composeOne(
  intent: Intent,
  style: StyleId,
  recipeIndex: number,
  ctx: FillContext,
  seed: number,
  used: Set<string>,
): string {
  const recipe = STYLE_MAP[style].recipes[pickIndex(recipeIndex, STYLE_MAP[style].recipes.length)];
  const body = material(intent, style, seed, recipeIndex, used);
  return fill(recipe as string, ctx, body);
}

function pickIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
