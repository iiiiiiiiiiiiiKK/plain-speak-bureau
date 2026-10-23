/**
 * 结果文本的序列化（复制到聊天/笔记用）。
 * 纯函数，方便自测。
 */
import { SITE_NAME } from '../data/site';
import { SCENE_MAP, type SceneId } from '../data/scenes';
import { STYLE_MAP, type StyleId } from '../data/styles';
import type { Variant } from '../engine/types';

export function sceneLabel(scene: SceneId): string {
  return SCENE_MAP[scene]?.label ?? '通用';
}

export function styleLabel(style: StyleId): string {
  return STYLE_MAP[style]?.label ?? '大白话';
}

/** 单条结果（复制按钮用）：只给正文，不加标签，方便直接粘贴 */
export function variantPlain(variant: Variant): string {
  return variant.text;
}

/** 全部结果（一键复制用）：带轻度结构，方便对照 */
export function allVariantsText(variants: Variant[], input: string, scene: SceneId): string {
  const lines: string[] = [];
  lines.push(`原文：${input.replace(/\n+/g, ' ')}`);
  lines.push(`场景：${sceneLabel(scene)}`);
  lines.push('');
  variants.forEach((v, i) => {
    lines.push(`${String(i + 1).padStart(2, '0')}［${v.styleLabel}］${v.text}`);
  });
  lines.push('');
  lines.push(`—— ${SITE_NAME}`);
  return lines.join('\n');
}


