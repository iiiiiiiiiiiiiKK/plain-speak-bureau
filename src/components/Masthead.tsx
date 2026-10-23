import { SITE_NAME, SITE_NAME_EN, SITE_TAGLINE } from '../data/site';

interface MastheadProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  favoriteCount: number;
  historyCount: number;
  onOpenPanel: (panel: 'favorites' | 'history') => void;
  aiMode: boolean;
  aiReady: boolean;
  authorXLink?: string;
}

/** 报头：编辑部刊头 + 右侧功能按钮 */
export default function Masthead({
  theme,
  onToggleTheme,
  favoriteCount,
  historyCount,
  onOpenPanel,
  aiMode,
  aiReady,
  authorXLink,
}: MastheadProps) {
  return (
    <header className="masthead">
      <div className="masthead-top">
        <span className="masthead-issue">民间译稿 · 非官方发布</span>
        <span className="masthead-date" aria-hidden="true">
          {SITE_NAME_EN}
        </span>
        {authorXLink && (
          <a
            href={authorXLink}
            target="_blank"
            rel="noopener noreferrer"
            className="masthead-author-x"
            aria-label="作者 X 频道"
          >
            ‪𝕏‬
          </a>
        )}
      </div>

      <div className="masthead-main">
        <div className="masthead-title-wrap">
          <h1 className="masthead-title">
            {SITE_NAME}
            <span className="masthead-dot" aria-hidden="true" />
          </h1>
          <p className="masthead-sub">{SITE_TAGLINE}</p>
        </div>

        <nav className="masthead-nav" aria-label="工具按钮">
          <button type="button" className="nav-btn" onClick={() => onOpenPanel('favorites')} data-testid="open-favorites">
            <span className="nav-btn-label">收藏</span>
            <span className="nav-btn-count">{favoriteCount}</span>
          </button>
          <button type="button" className="nav-btn" onClick={() => onOpenPanel('history')} data-testid="open-history">
            <span className="nav-btn-label">历史</span>
            <span className="nav-btn-count">{historyCount}</span>
          </button>
          <button
            type="button"
            className="nav-btn nav-btn-icon"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            title={theme === 'dark' ? '浅色模式' : '深色模式'}
            data-testid="toggle-theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </nav>
      </div>

      <div className="masthead-rule" aria-hidden="true">
        <span />
        <span className={aiMode && aiReady ? 'status-dot status-dot-ai' : 'status-dot'} />
        <span className="masthead-mode" data-testid="engine-label">
          {aiMode && aiReady ? '模型通道' : '本地引擎'}
        </span>
      </div>
    </header>
  );
}
