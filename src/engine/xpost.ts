/**
 * X（推特）短文案生成。
 *
 * 规则按 X 的公开限制近似：一条推文权重上限 280，其中 CJK 字符按 2 计。
 * 我们只做「能直接发出去」的短句，不堆话题标签。
 */
import { SITE_NAME } from '../data/site';
import type { Analysis, Variant, XPost } from './types';

export const X_WEIGHT_LIMIT = 280;

/** 估算推文权重：CJK / 全角符号记 2，其余记 1 */
export function xWeight(text: string): number {
  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    total += wide ? 2 : 1;
  }
  return total;
}

function cutToWeight(text: string, limit: number): string {
  let total = 0;
  const out: string[] = [];
  for (const ch of text) {
    const add = xWeight(ch);
    if (total + add > limit) break;
    out.push(ch);
    total += add;
  }
  return out.join('');
}

interface BuildXOptions {
  analysis: Analysis;
  variants: Variant[];
  /** AI 模式可直接给一条候选，覆盖离线拼装 */
  override?: string;
}

/**
 * 拼装 X 文案：一句结论 + 一行「原文 → 人话」+ 品牌尾巴。
 * 结论优先取大白话/犀利版（短、有钩子），没有就取第一条。
 */
export function buildXPost({ analysis, variants, override }: BuildXOptions): XPost {
  if (override && override.trim()) {
    const text = override.trim();
    const weight = xWeight(text);
    return { text, weight, limited: weight > X_WEIGHT_LIMIT };
  }

  const punchy =
    variants.find((v) => v.style === 'sharp') ??
    variants.find((v) => v.style === 'plain') ??
    variants[0];

  const head = punchy ? punchy.text : '有些话不用翻译，听的人自己会补完。';
  const quote =
    analysis.surfaceShort.length > 0 && [...analysis.surfaceShort].length <= 24
      ? `原文：「${analysis.surfaceShort}」`
      : '';
  const tail = `—— ${SITE_NAME}`;

  const compose = (parts: string[]): string => parts.filter(Boolean).join('\n');

  let text = compose([head, quote, tail]);
  if (xWeight(text) <= X_WEIGHT_LIMIT) {
    return { text, weight: xWeight(text), limited: false };
  }

  // 超了就先砍引用，再砍结论
  text = compose([head, tail]);
  if (xWeight(text) <= X_WEIGHT_LIMIT) {
    return { text, weight: xWeight(text), limited: false };
  }
  const budget = X_WEIGHT_LIMIT - xWeight(`\n${tail}`);
  const trimmed = `${cutToWeight(head, Math.max(20, budget - 2))}…`;
  text = compose([trimmed, tail]);
  const weight = xWeight(text);
  return { text, weight, limited: weight > X_WEIGHT_LIMIT };
}
