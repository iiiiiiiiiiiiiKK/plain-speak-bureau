/**
 * 文本分析层：把用户的一句话拆成「意图 + 实体 + 称呼」。
 *
 * 克制说明：这里只做关键词/句式匹配与轻量实体抽取。
 * 命中不了就给 generic + low，并在 UI 上如实标注，不假装理解。
 */
import { INTENTS, INTENT_MAP, type Intent, type IntentId } from '../data/intents';
import { SCENE_MAP, type SceneId } from '../data/scenes';
import type { Analysis, Confidence } from './types';

/** 常见被谈论的对象，用于从用户句子里捞实体 */
const ENTITY_SEEDS = [
  '方案',
  '预算',
  '价格',
  '报价',
  '合同',
  '条款',
  '需求',
  '排期',
  '项目',
  '订单',
  '退款',
  '保修',
  '物流',
  '售后',
  '汇报',
  '审批',
  '流程',
  '会议',
  '纪要',
  '数据',
  '报表',
  '消息',
  '关系',
  '聚会',
  '邀约',
  '时间',
  '心情',
  '想法',
  '指标',
  '预算表',
  '工单',
];

const MAX_SURFACE = 18;

/** 去掉首尾空白与成对包裹的引号，保留正文换行 */
export function normalizeInput(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 压平成一行，用于匹配与引用 */
export function flatten(text: string): string {
  return normalizeInput(text).replace(/\n+/g, ' ').trim();
}

/** 去掉句末标点，供「」引用 */
export function stripTailPunct(text: string): string {
  return text.replace(/[\s。！？!?…，,；;、：:·~～"'“”‘’]+$/u, '').trim();
}

/** 按字符（而非 UTF-16 单元）截断，避免切坏 emoji 与生僻字 */
export function truncateChars(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join('')}…`;
}

export function charCount(text: string): number {
  return [...text].length;
}

function detectEntity(flat: string): string {
  for (const seed of ENTITY_SEEDS) {
    const idx = flat.indexOf(seed);
    if (idx < 0) continue;
    const before = flat.slice(Math.max(0, idx - 2), idx);
    // 抓「这个方案」「那份预算」这类限定结构
    const m = /([这那该此])([个份次条款单项目])?$/.exec(before);
    if (m) return `${m[1]}${m[2] ?? ''}${seed}`;
    return seed;
  }
  // 句子里没有具体对象时，用中性的「这件事」。
  // 不要拿场景名词顶替（那会让「下次一定」凭空变成「这顿饭」，等于编造事实）。
  return '这件事';
}

function detectAddress(flat: string, scene: SceneId): string {
  // 先找「王总」「李经理」这类明确称呼
  const titled = /([\u4e00-\u9fa5]{1,2}(?:总|经理|老师|哥|姐|同学))/.exec(flat);
  if (titled?.[1]) return titled[1];
  const pool = SCENE_MAP[scene].address;
  for (const word of pool) {
    if (word.length >= 2 && flat.includes(word)) return word;
  }
  // 没识别到称呼就留空：宁可少一个称呼，也不要凭空给用户安一个「老板」。
  // 空值会被 tidy() 清掉随之产生的孤立标点。
  return '';
}

interface MatchResult {
  intent: Intent;
  confidence: Confidence;
  matched: string[];
}

function matchIntent(flat: string): MatchResult {
  let best: { intent: Intent; score: number; hits: string[] } | null = null;

  for (const intent of INTENTS) {
    if (intent.id === 'generic') continue;
    let score = 0;
    const hits: string[] = [];
    for (const pattern of intent.patterns) {
      const m = pattern.exec(flat);
      if (m) {
        // 命中的片段越长，信息量越大（「答应我的事还算数吗」比「又」可靠得多）
        score += 2 + Math.min(2, Math.floor([...m[0]].length / 4));
        hits.push(`句式：${m[0]}`);
      }
    }
    for (const keyword of intent.keywords) {
      if (flat.includes(keyword)) {
        score += 1;
        hits.push(keyword);
      }
    }
    if (score <= 0) continue;

    // 客套类意图（道谢/道歉）优先级为负：
    // 「不好意思，这个我做不了」的实质是拒绝，不该被判成道歉。
    const weighted = score + (intent.priority ?? 0);
    if (!best || weighted > best.score) {
      best = { intent, score: weighted, hits };
    }
  }

  if (!best) {
    return { intent: INTENT_MAP.generic, confidence: 'low', matched: [] };
  }
  const confidence: Confidence = best.score >= 5 ? 'high' : best.score >= 3 ? 'medium' : 'low';
  return { intent: best.intent, confidence, matched: best.hits.slice(0, 3) };
}

export function analyze(raw: string, scene: SceneId): Analysis {
  const normalized = normalizeInput(raw);
  const flat = flatten(raw);
  const surfaceShort = truncateChars(stripTailPunct(flat), MAX_SURFACE);
  const { intent, confidence, matched } = matchIntent(flat);

  return {
    raw,
    normalized,
    surfaceShort,
    entity: detectEntity(flat),
    address: detectAddress(flat, scene),
    intentId: intent.id as IntentId,
    intentLabel: intent.label,
    confidence,
    matched,
    isQuestion: /[？?]\s*$/.test(flat) || /(吗|呢|吧)\s*$/.test(flat),
    hasNegative: /(不|没|别|无|未)/.test(flat),
    charCount: charCount(normalized),
  };
}

/** 供自测使用：拿到某个意图的素材 */
export function intentById(id: IntentId): Intent {
  return INTENT_MAP[id];
}
