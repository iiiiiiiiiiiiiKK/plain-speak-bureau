/** 引擎共享类型：UI、离线引擎、服务端响应都复用这一套形状。 */
import type { StyleId } from '../data/styles';
import type { SceneId } from '../data/scenes';
import type { IntentId } from '../data/intents';

export type Confidence = 'high' | 'medium' | 'low';

export interface Analysis {
  /** 原始输入（保留换行，仅用于回显） */
  raw: string;
  /** 压平后的单行文本 */
  normalized: string;
  /** 引号里用的短句（去标点、截断） */
  surfaceShort: string;
  /** 句子里在谈的那个东西 */
  entity: string;
  /** 称呼 */
  address: string;
  intentId: IntentId;
  intentLabel: string;
  confidence: Confidence;
  /** 命中的句式/关键词，用于给用户看「我凭什么叫这个意思」 */
  matched: string[];
  isQuestion: boolean;
  hasNegative: boolean;
  charCount: number;
}

export interface Variant {
  id: string;
  style: StyleId;
  styleLabel: string;
  /** 这一版的一句说明 */
  note: string;
  text: string;
  /** 主风格 or 对照 */
  role: 'primary' | 'contrast';
  /** 版本序号（01/02…） */
  index: number;
}

export type GenSource = 'local' | 'ai';

export interface GenerationMeta {
  source: GenSource;
  /** 离线时说明判定依据；AI 时说明模型 */
  basis: string;
  confidence: Confidence;
  intentLabel: string;
  /** 提供给用户核对解析结果的实体/称呼 */
  entity: string;
  rationale: string[];
  batchSeed: number;
  /** 离线引擎标注：本批次由本地规则生成 */
  degraded: boolean;
}

export interface Generation {
  batchId: string;
  input: string;
  scene: SceneId;
  style: StyleId;
  createdAt: number;
  variants: Variant[];
  meta: GenerationMeta;
  xPost: XPost;
}

export interface XPost {
  text: string;
  /** 按 X 的规则估算权重（汉字计 2） */
  weight: number;
  limited: boolean;
}

export interface GeneratedPayload {
  variants: Variant[];
  meta: GenerationMeta;
  xPost: XPost;
  analysis: Analysis;
}

export const VARIANT_MIN = 3;
export const VARIANT_MAX = 5;
