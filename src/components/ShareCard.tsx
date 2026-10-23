import { SITE_NAME } from '../data/site';
import type { Generation } from '../engine/types';

export type ShareRatio = '1x1' | '3x4';

export const SHARE_DIMENSIONS: Record<ShareRatio, { width: number; height: number; scale: number }> = {
  '1x1': { width: 360, height: 360, scale: 3 },
  '3x4': { width: 360, height: 480, scale: 3 },
};

/** 分享卡片尺寸固定，导出时按 pixelRatio=3 放大到 1080 宽 */
export const SHARE_CARD_WIDTH = 360;

function textSize(text: string, tall: boolean): number {
  const len = [...text].length;
  if (len <= 18) return tall ? 20 : 18;
  if (len <= 28) return tall ? 18 : 16;
  if (len <= 40) return tall ? 16 : 15;
  if (len <= 56) return tall ? 14.5 : 13.5;
  return tall ? 13 : 12;
}

function inputSize(text: string): number {
  const len = [...text].length;
  if (len <= 16) return 14;
  if (len <= 30) return 12.5;
  if (len <= 50) return 11;
  return 10;
}

interface ShareCardProps {
  generation: Generation;
  ratio: ShareRatio;
  innerRef: React.Ref<HTMLDivElement>;
}

/**
 * 分享卡：编辑部版式（米白纸 + 黑字 + 一点红）。
 * 正文选中「大白话/犀利」这类最抓人的一条，方便发朋友圈截图。
 */
export default function ShareCard({ generation, ratio, innerRef }: ShareCardProps) {
  const tall = ratio === '3x4';
  const pick =
    generation.variants.find((v) => v.style === generation.style) ??
    generation.variants.find((v) => v.style === 'sharp') ??
    generation.variants[0];

  const others = generation.variants.filter((v) => v.id !== pick?.id).slice(0, tall ? 2 : 1);
  const mainText = pick?.text ?? generation.input;

  return (
    <div className={`share-card share-${ratio}`} ref={innerRef} data-share-card={ratio}>
      <div className="share-inner">
        <div className="share-brand">
          <span className="share-mark">话</span>
          <span className="share-brand-text">
            <b>{SITE_NAME}</b>
            <i>PLAIN SPEAK BUREAU</i>
          </span>
        </div>

        <div className="share-body">
          <p className="share-eyebrow">原文 / {generation.meta.intentLabel}</p>
          <p className="share-input" style={{ fontSize: inputSize(generation.input) }}>
            「{generation.input.replace(/\n+/g, ' ')}」
          </p>

          <div className="share-rule" aria-hidden="true" />

          <p className="share-label">{pick?.styleLabel ?? '大白话'}</p>
          <p className="share-main" style={{ fontSize: textSize(mainText, tall) }}>
            {mainText}
          </p>

          {others.length > 0 ? (
            <ul className="share-others">
              {others.map((v) => (
                <li key={v.id}>
                  <span>{v.styleLabel}</span>
                  <em>{[...v.text].slice(0, tall ? 34 : 26).join('')}</em>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="share-foot">
          <span className="share-foot-left">本地生成 · 不上传输入</span>
          <span className="share-foot-right">
            {generation.meta.source === 'ai' ? 'AI 模式' : '离线引擎'}
          </span>
        </div>
      </div>
    </div>
  );
}
