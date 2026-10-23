import { useCallback, useEffect, useRef, useState } from 'react';
import ShareCard, { SHARE_DIMENSIONS, type ShareRatio } from './ShareCard';
import type { Generation } from '../engine/types';
import {
  canShareFiles,
  captureWithRetry,
  downloadBlob,
  isMobileViewport,
  safeFilename,
  shareFile,
} from '../lib/image';
import { copyImage, copyText } from '../lib/clipboard';

interface ShareModalProps {
  generation: Generation;
  onClose: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string };

export default function ShareModal({ generation, onClose }: ShareModalProps) {
  const [ratio, setRatio] = useState<ShareRatio>('1x1');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const mobile = isMobileViewport();

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const dims = SHARE_DIMENSIONS[ratio];

  const withBusy = useCallback(
    async (text: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setStatus({ kind: 'busy', text });
      try {
        await fn();
      } catch (error) {
        setStatus({ kind: 'err', text: error instanceof Error ? error.message : '操作失败，请重试。' });
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handleDownload = () =>
    withBusy('正在渲染 PNG…', async () => {
      const blob = await captureWithRetry(cardRef, { pixelRatio: dims.scale, backgroundColor: '#f4efe4' });
      const name = safeFilename(`plain-speak-${ratio}`, String(Date.now()).slice(-6));
      downloadBlob(blob, name);
      setStatus({ kind: 'ok', text: `已生成 ${dims.width * dims.scale}×${dims.height * dims.scale} PNG。` });
    });

  const handleCopyImage = () =>
    withBusy('正在复制图片…', async () => {
      const blob = await captureWithRetry(cardRef, { pixelRatio: dims.scale, backgroundColor: '#f4efe4' });
      const ok = await copyImage(blob);
      if (ok) {
        setStatus({ kind: 'ok', text: '图片已复制到剪贴板。' });
        return;
      }
      const pick =
        generation.variants.find((v) => v.style === generation.style) ?? generation.variants[0];
      const textOk = await copyText(pick?.text ?? generation.input);
      setStatus(
        textOk
          ? { kind: 'ok', text: '当前浏览器不支持复制图片，已改为复制文字。' }
          : { kind: 'err', text: '复制失败，请改用「下载 PNG」。' },
      );
    });

  const handleShare = () =>
    withBusy('正在调用系统分享…', async () => {
      const blob = await captureWithRetry(cardRef, { pixelRatio: dims.scale, backgroundColor: '#f4efe4' });
      const name = safeFilename(`plain-speak-${ratio}`, String(Date.now()).slice(-6));
      const file = new File([blob], name, { type: 'image/png' });
      if (!canShareFiles(file)) {
        downloadBlob(blob, name);
        setStatus({ kind: 'ok', text: '此环境不支持系统分享，已改为下载 PNG。' });
        return;
      }
      const outcome = await shareFile(file, generation.xPost.text, '人话翻译局');
      setStatus({ kind: 'ok', text: outcome === 'shared' ? '已打开系统分享。' : '已取消分享。' });
    });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <header className="modal-head">
          <h2 id="share-title">生成分享图</h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="关闭分享面板"
            data-testid="close-share"
          >
            ✕
          </button>
        </header>

        <div className="modal-ratio" role="group" aria-label="图片比例">
          <button
            type="button"
            className={`ratio-btn${ratio === '1x1' ? ' ratio-btn-on' : ''}`}
            onClick={() => setRatio('1x1')}
            data-testid="ratio-1x1"
          >
            1:1<span>1080 × 1080</span>
          </button>
          <button
            type="button"
            className={`ratio-btn${ratio === '3x4' ? ' ratio-btn-on' : ''}`}
            onClick={() => setRatio('3x4')}
            data-testid="ratio-3x4"
          >
            3:4<span>1080 × 1440</span>
          </button>
        </div>

        <div className="modal-preview">
          <div className="preview-scaler" style={{ width: dims.width, height: dims.height }}>
            <ShareCard generation={generation} ratio={ratio} innerRef={cardRef} />
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={busy}
            data-testid="download-png"
          >
            下载 PNG
          </button>
          <button type="button" className="btn" onClick={handleCopyImage} disabled={busy}>
            复制图片
          </button>
          {mobile ? (
            <button type="button" className="btn" onClick={handleShare} disabled={busy}>
              系统分享
            </button>
          ) : null}
        </div>

        <p className={`modal-status status-${status.kind}`} aria-live="polite">
          {status.kind === 'idle'
            ? '分享图在浏览器本地生成，不上传任何内容。手机上可直接长按保存。'
            : status.text}
        </p>
      </div>
    </div>
  );
}
