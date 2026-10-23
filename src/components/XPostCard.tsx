import { useState } from 'react';
import type { Generation } from '../engine/types';
import { SITE_NAME } from '../data/site';

interface XPostCardProps {
  generation: Generation;
  copied: boolean;
  onCopy: () => void;
}

/** X 短文案：单行钩子 + 原文 + 品牌尾巴，限制在 280 权重内 */
export default function XPostCard({ generation, copied, onCopy }: XPostCardProps) {
  const [open, setOpen] = useState(false);
  const { xPost } = generation;
  const percent = Math.min(100, Math.round((xPost.weight / 280) * 100));

  return (
    <section className="xpost-card" aria-labelledby="xpost-heading">
      <div className="xpost-head">
        <h3 id="xpost-heading" className="xpost-title">
          X 文案
        </h3>
        <span className={`xpost-weight${xPost.limited ? ' xpost-weight-over' : ''}`}>
          {xPost.weight}/280
        </span>
      </div>

      <pre className="xpost-text" data-testid="xpost-text">
        {xPost.text}
      </pre>

      <div className="xpost-bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="xpost-actions">
        <button
          type="button"
          className={`act-btn${copied ? ' act-btn-done' : ''}`}
          onClick={onCopy}
          data-testid="copy-xpost"
        >
          {copied ? '已复制' : '复制这条'}
        </button>
        <button type="button" className="act-btn act-btn-ghost" onClick={() => setOpen((v) => !v)}>
          {open ? '收起说明' : '发之前看一句'}
        </button>
      </div>

      {open ? (
        <p className="xpost-note">
          这条文案来自本次结果里最抓人的那句（{generation.meta.source === 'ai' ? '模型生成的犀利/大白话版本' : '本地引擎的犀利或大白话版本'}），
          已按 X 的字数权重估算（汉字记 2）。
          {xPost.limited ? ' 当前已超出单条上限，建议手动删短。' : ' 可以直接发，也可以自己再改。'}
          署名尾巴是「{SITE_NAME}」，如需去掉请在复制后手动删除。
        </p>
      ) : null}
    </section>
  );
}
