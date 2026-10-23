/**
 * 把服务端模型返回的结果合并成前端统一的 Variant 形状。
 *
 * 服务端只返回 {style, text}，这里补上 UI 需要的 id、note、角色与序号，
 * 并做最后一次去重与长度保护 —— 保证界面上不会出现重复卡片。
 */
import { STYLE_MAP, type StyleId } from '../data/styles';
import { STYLE_NOTES } from '../data/extras';
import type { Variant, GenerationMeta } from './types';

export interface AiMergeInput {
  input: string;
  scene: string;
  style: StyleId;
  intent: string;
  provider: string;
  model: string;
  variants: { style: StyleId; text: string }[];
  rationale: string[];
  batchSeed: number;
}

function noteFor(style: StyleId, index: number): string {
  const notes = STYLE_NOTES[style] ?? STYLE_NOTES.plain;
  const list = notes ?? ['模型改写'];
  return list[index % list.length] ?? '模型改写';
}

export function mergeAiVariants(payload: AiMergeInput): { variants: Variant[]; meta: GenerationMeta } {
  const used = new Set<string>();
  const variants: Variant[] = [];

  for (const item of payload.variants) {
    const text = item.text.trim();
    if (!text || used.has(text)) continue;
    used.add(text);
    const style = (item.style in STYLE_MAP ? item.style : payload.style) as StyleId;
    const index = variants.length + 1;
    variants.push({
      id: `v${index}`,
      style,
      styleLabel: STYLE_MAP[style].label,
      note: noteFor(style, index - 1),
      text,
      role: style === payload.style ? 'primary' : 'contrast',
      index,
    });
    if (variants.length >= 5) break;
  }

  const meta: GenerationMeta = {
    source: 'ai',
    basis: `${payload.provider} · ${payload.model}`,
    confidence: 'high',
    intentLabel: payload.intent || '模型判定',
    entity: '',
    rationale:
      payload.rationale.length > 0
        ? payload.rationale
        : ['由服务端模型理解并改写', `主导风格：${STYLE_MAP[payload.style].label}`],
    batchSeed: payload.batchSeed,
    degraded: false,
  };

  return { variants, meta };
}

