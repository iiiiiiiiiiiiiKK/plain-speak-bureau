import { useEffect, useRef, useState } from 'react';
import type { SavedVariant, HistoryEntry } from '../lib/storage';
import { sceneLabel, styleLabel } from '../lib/serialize';

export type PanelKind = 'favorites' | 'history';

interface SidePanelProps {
  open: PanelKind | null;
  favorites: SavedVariant[];
  history: HistoryEntry[];
  onClose: () => void;
  onCopy: (text: string) => void;
  onRemoveFavorite: (id: string) => void;
  onRemoveHistory: (id: string) => void;
  onClearFavorites: () => void;
  onClearHistory: () => void;
  onRestoreHistory: (entry: HistoryEntry) => void;
}

function stamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 右侧抽屉：收藏 / 历史。移动端从底部弹出 */
export default function SidePanel({
  open,
  favorites,
  history,
  onClose,
  onCopy,
  onRemoveFavorite,
  onRemoveHistory,
  onClearFavorites,
  onClearHistory,
  onRestoreHistory,
}: SidePanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const isFav = open === 'favorites';
  const list = isFav ? favorites : history;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" data-testid="side-panel">
        <header className="drawer-head">
          <h2 id="drawer-title">{isFav ? '收藏夹' : '翻译历史'}</h2>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="关闭面板" data-testid="close-panel">
            ✕
          </button>
        </header>

        <p className="drawer-note">
          只存在这台设备的浏览器里（localStorage）{isFav ? `，最多保留 200 条` : '，最多保留 30 条'}。
        </p>

        {list.length === 0 ? (
          <div className="drawer-empty">
            <p>{isFav ? '还没收藏。看到顺眼的版本，点一下「☆ 收藏」。' : '还没有历史。翻译一次就会自动记下来。'}</p>
          </div>
        ) : (
          <>
            <ul className="saved-list" data-testid={isFav ? 'favorites-list' : 'history-list'}>
              {isFav
                ? favorites.map((item) => (
                    <li className="saved-item" key={item.id}>
                      <div className="saved-top">
                        <span className="saved-tag">{item.styleLabel}</span>
                        <span className="saved-meta">
                          {sceneLabel(item.scene)} · {stamp(item.savedAt)}
                        </span>
                      </div>
                      <p className="saved-text">{item.text}</p>
                      <p className="saved-input">原文：{item.input}</p>
                      <div className="saved-actions">
                        <button type="button" className="act-btn act-btn-sm" onClick={() => onCopy(item.text)}>
                          复制
                        </button>
                        <button
                          type="button"
                          className="act-btn act-btn-sm act-btn-ghost"
                          onClick={() => onRemoveFavorite(item.id)}
                          data-testid="remove-favorite"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))
                : history.map((entry) => (
                    <li className="saved-item" key={entry.id}>
                      <div className="saved-top">
                        <span className="saved-tag">{styleLabel(entry.style)}</span>
                        <span className="saved-meta">
                          {sceneLabel(entry.scene)} · {stamp(entry.createdAt)}
                        </span>
                      </div>
                      <p className="saved-text saved-text-input">{entry.input}</p>
                      {entry.texts.length > 0 ? (
                        <ul className="saved-preview">
                          {entry.texts.slice(0, 2).map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="saved-actions">
                        <button
                          type="button"
                          className="act-btn act-btn-sm"
                          onClick={() => onRestoreHistory(entry)}
                          data-testid="restore-history"
                        >
                          载入重翻
                        </button>
                        <button
                          type="button"
                          className="act-btn act-btn-sm act-btn-ghost"
                          onClick={() => onRemoveHistory(entry.id)}
                          data-testid="remove-history"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
            </ul>

            <div className="drawer-foot">
              {confirmClear ? (
                <div className="confirm-row">
                  <span>确认清空{isFav ? '全部收藏' : '全部历史'}？</span>
                  <button
                    type="button"
                    className="act-btn act-btn-sm act-btn-danger"
                    onClick={() => {
                      if (isFav) onClearFavorites();
                      else onClearHistory();
                      setConfirmClear(false);
                    }}
                    data-testid="confirm-clear"
                  >
                    确认清空
                  </button>
                  <button type="button" className="act-btn act-btn-sm act-btn-ghost" onClick={() => setConfirmClear(false)}>
                    取消
                  </button>
                </div>
              ) : (
                <button type="button" className="act-btn act-btn-sm act-btn-ghost" onClick={() => setConfirmClear(true)}>
                  清空{isFav ? '收藏' : '历史'}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
