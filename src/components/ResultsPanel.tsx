import { useState } from 'react';
import type { Generation, Variant } from '../engine/types';
import ResultCard from './ResultCard';
import XPostCard from './XPostCard';

interface ResultsPanelProps {
  generation: Generation | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  copiedKey: string | null;
  isFavorited: (variant: Variant) => boolean;
  onCopyVariant: (variant: Variant) => void;
  onFavorite: (variant: Variant) => void;
  onCopyAll: () => void;
  onCopyX: () => void;
  onRegenerate: () => void;
  onOpenShare: () => void;
  onRetry: () => void;
  styleLabel: string;
}

/** 结果区：骨架 + 结果卡片 + 批量动作 */
export default function ResultsPanel({
  generation,
  loading,
  error,
  stale,
  copiedKey,
  isFavorited,
  onCopyVariant,
  onFavorite,
  onCopyAll,
  onCopyX,
  onRegenerate,
  onOpenShare,
  onRetry,
  styleLabel,
}: ResultsPanelProps) {
  const [showBasis, setShowBasis] = useState(false);

  if (loading) {
    return (
      <section className="panel results-panel" aria-busy="true" data-testid="results-loading">
        <div className="panel-head">
          <h2 className="panel-title">
            <span className="panel-index">04</span>
            写着呢
          </h2>
        </div>
        <div className="skeleton-row">
          {[0, 1, 2].map((i) => (
            <div className="skeleton-card" key={i} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="skeleton-line skeleton-line-sm" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line-md" />
            </div>
          ))}
        </div>
        <p className="results-hint">正在按「{styleLabel}」的口气重写这句话…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel results-panel" data-testid="results-error">
        <div className="panel-head">
          <h2 className="panel-title">
            <span className="panel-index">04</span>
            没写成
          </h2>
        </div>
        <div className="error-block" role="alert">
          <p className="error-title">这次没翻成</p>
          <p className="error-desc">{error}</p>
          <button type="button" className="btn btn-primary" onClick={onRetry} data-testid="retry">
            再试一次
          </button>
        </div>
      </section>
    );
  }

  if (!generation) {
    return (
      <section className="panel results-panel results-empty" data-testid="results-empty">
        <div className="panel-head">
          <h2 className="panel-title">
            <span className="panel-index">04</span>
            译文会出现在这里
          </h2>
        </div>
        <div className="empty-stage">
          <p className="empty-quote">「这个方案我们再研究一下。」</p>
          <p className="empty-arrow" aria-hidden="true">
            ↓
          </p>
          <ul className="empty-list">
            <li>
              <b>大白话</b>目前还没人想拍板，先搁置。
            </li>
            <li>
              <b>犀利版</b>不是方案需要研究，是没人愿意负责。
            </li>
            <li>
              <b>段子版</b>方案进入了一个神秘阶段：没有否决，也没有未来。
            </li>
          </ul>
          <p className="empty-tip">写完上面那句，点「开始翻译」。</p>
        </div>
      </section>
    );
  }

  const { variants, meta } = generation;

  return (
    <section className="panel results-panel" data-testid="results-panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <span className="panel-index">04</span>
          译文 {variants.length} 版
        </h2>
        <div className="source-badge" data-testid="result-source">
          <span className={`source-dot${meta.source === 'ai' ? ' source-dot-ai' : ''}`} />
          {meta.source === 'ai' ? '模型通道' : '本地引擎'}
        </div>
      </div>

      <div className="meta-strip">
        <span className="meta-chip">意图：{meta.intentLabel}</span>
        <span className="meta-chip">主调：{styleLabel}</span>
        <button
          type="button"
          className="meta-link"
          onClick={() => setShowBasis((v) => !v)}
          aria-expanded={showBasis}
          data-testid="toggle-basis"
        >
          {showBasis ? '收起依据' : '凭什么这么翻'}
        </button>
      </div>

      {showBasis ? (
        <div className="basis-block" data-testid="basis-block">
          <p className="basis-line">
            <b>通道</b>
            {meta.basis}
          </p>
          {meta.rationale.map((line) => (
            <p className="basis-line" key={line}>
              · {line}
            </p>
          ))}
          {meta.source === 'local' ? (
            <p className="basis-warn">
              这是本地规则引擎：靠人工整理的意图词库 + 句法模板生成，不是模型理解。
              命中不了你的说法时，它会退化成通用改写 —— 这时结果仅供参考，别当成「它懂你」。
            </p>
          ) : null}
        </div>
      ) : null}

      {stale ? (
        <div className="stale-bar" data-testid="stale-bar">
          <span>场景或风格变了，下面还是上一批结果。</span>
          <button type="button" className="btn btn-small" onClick={onRegenerate}>
            按新设置再翻一次
          </button>
        </div>
      ) : null}

      <div className="results-grid">
        {variants.map((v) => (
          <ResultCard
            key={`${generation.batchId}-${v.id}`}
            variant={v}
            copied={copiedKey === `variant:${v.id}`}
            favorited={isFavorited(v)}
            onCopy={onCopyVariant}
            onFavorite={onFavorite}
          />
        ))}
      </div>

      <XPostCard
        generation={generation}
        copied={copiedKey === 'xpost'}
        onCopy={onCopyX}
      />

      <div className="results-actions">
        <button type="button" className="btn btn-primary" onClick={onCopyAll} data-testid="copy-all">
          {copiedKey === 'all' ? '已复制全部' : '复制全部'}
        </button>
        <button type="button" className="btn" onClick={onRegenerate} data-testid="regenerate">
          换一批
        </button>
        <button type="button" className="btn" onClick={onOpenShare} data-testid="open-share">
          分享图
        </button>
      </div>
    </section>
  );
}
