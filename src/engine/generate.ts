/**
 * 离线引擎入口（无 API Key 时的默认实现）。
 *
 * 它做的事，用一句话说清：读输入 → 判定意图 → 抽实体 → 按风格配方重排。
 * 它不是大模型：判定不了意图时会如实降级（confidence=low，intentLabel=通用改写），
 * 并把「依据」写进 meta.rationale，交给 UI 显示，不假装理解。
 */
import { analyze, charCount, flatten } from './analyze';
import { buildVariants } from './compose';
import { hashString } from './random';
import { buildXPost } from './xpost';
import type { Analysis, GeneratedPayload, GenerationMeta } from './types';
import type { StyleId } from '../data/styles';
import type { SceneId } from '../data/scenes';
import { SOFT_INPUT_CHARS } from '../data/site';

export { analyze } from './analyze';
export { buildVariants, tidy } from './compose';
export { buildXPost, xWeight, X_WEIGHT_LIMIT } from './xpost';
export type * from './types';

export interface LocalGenerateOptions {
  input: string;
  scene: SceneId;
  style: StyleId;
  /** 批次种子：换一批时由调用方递增，保证可复现 */
  batchSeed?: number;
  /** 结果条数（3~5），默认 5 */
  count?: number;
}

const CONFIDENCE_LABEL: Record<Analysis['confidence'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 依据说明：把「凭什么这么翻译」摊开给用户 */
export function explainAnalysis(a: Analysis): string[] {
  const out: string[] = [];
  if (a.matched.length > 0) {
    out.push(`命中依据：${a.matched.join('、')}`);
  } else {
    out.push('没有命中任何已知句式，按通用改写处理（置信度低）');
  }
  out.push(`判定意图：${a.intentLabel}（置信度${CONFIDENCE_LABEL[a.confidence]}）`);
  out.push(`识别对象：「${a.entity}」，称呼：「${a.address}」`);
  if (a.charCount > SOFT_INPUT_CHARS) {
    out.push(`输入共 ${a.charCount} 字，偏长，结果会偏向概括`);
  }
  return out;
}

export function localGenerate(options: LocalGenerateOptions): GeneratedPayload {
  const { input, scene, style } = options;
  const batchSeed = options.batchSeed ?? 0;
  const count = Math.min(5, Math.max(3, options.count ?? 5));

  const analysis = analyze(input, scene);
  const seed = hashString(`${flatten(input)}|${scene}|${style}|${batchSeed}`);
  const primaryCount = Math.max(2, count - 2);
  const contrastCount = count - primaryCount;

  const variants = buildVariants({ analysis, scene, style, seed, primaryCount, contrastCount });
  const meta: GenerationMeta = {
    source: 'local',
    basis: `本地规则引擎 · 意图词库 ${analysis.intentLabel} · 场景「${scene}」`,
    confidence: analysis.confidence,
    intentLabel: analysis.intentLabel,
    entity: analysis.entity,
    rationale: explainAnalysis(analysis),
    batchSeed,
    degraded: true,
  };

  return {
    variants,
    meta,
    xPost: buildXPost({ analysis, variants }),
    analysis,
  };
}

/** 输入校验（前后端共用同一套规则，避免两边说法不一致） */
export interface InputCheck {
  ok: boolean;
  reason?: 'empty' | 'tooLong';
  message?: string;
  length: number;
}

export function checkInput(raw: string, maxChars: number): InputCheck {
  const length = charCount(raw.trim());
  if (length === 0) {
    return { ok: false, reason: 'empty', message: '先写一句话，再让翻译局开工。', length };
  }
  if (length > maxChars) {
    return {
      ok: false,
      reason: 'tooLong',
      message: `最多 ${maxChars} 字，现在 ${length} 字。删一点再试，或拆成两句分别翻译。`,
      length,
    };
  }
  return { ok: true, length };
}


export type { StyleId };
