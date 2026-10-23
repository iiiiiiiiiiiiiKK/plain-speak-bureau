import type { Variant } from '../engine/types';

interface ResultCardProps {
  variant: Variant;
  copied: boolean;
  favorited: boolean;
  onCopy: (variant: Variant) => void;
  onFavorite: (variant: Variant) => void;
}

const STYLE_TONE: Record<string, string> = {
  plain: 'tone-plain',
  highEq: 'tone-eq',
  sharp: 'tone-sharp',
  sarcasm: 'tone-sarcasm',
  office: 'tone-office',
  meme: 'tone-meme',
};

/** 单条结果卡片：语气标签 + 正文 + 两个动作 */
export default function ResultCard({ variant, copied, favorited, onCopy, onFavorite }: ResultCardProps) {
  const tone = STYLE_TONE[variant.style] ?? 'tone-plain';
  return (
    <article className={`result-card ${tone}`} data-testid="result-card" data-style={variant.style}>
      <header className="result-head">
        <span className="result-index">{String(variant.index).padStart(2, '0')}</span>
        <span className="result-tag">{variant.styleLabel}</span>
        {variant.role === 'contrast' ? <span className="result-role">对照</span> : null}
      </header>

      <p className="result-text" data-testid="result-text">
        {variant.text}
      </p>

      <p className="result-note">{variant.note}</p>

      <footer className="result-actions">
        <button
          type="button"
          className={`act-btn${copied ? ' act-btn-done' : ''}`}
          onClick={() => onCopy(variant)}
          data-testid="copy-variant"
        >
          {copied ? '已复制' : '复制'}
        </button>
        <button
          type="button"
          className={`act-btn act-btn-ghost${favorited ? ' act-btn-fav' : ''}`}
          onClick={() => onFavorite(variant)}
          aria-pressed={favorited}
          data-testid="favorite-variant"
        >
          {favorited ? '★ 已收藏' : '☆ 收藏'}
        </button>
      </footer>
    </article>
  );
}
