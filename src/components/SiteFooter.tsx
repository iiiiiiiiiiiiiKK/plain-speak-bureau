import { useState } from 'react';
import { FOOTER_NOTE, PRIVACY_POINTS, SITE_NAME } from '../data/site';

interface SiteFooterProps {
  onClearLocal: () => void;
  aiReady: boolean;
}

/** 页脚：隐私说明默认收纳，点开才展开全文 */
export default function SiteFooter({ onClearLocal, aiReady }: SiteFooterProps) {
  const [open, setOpen] = useState(false);
  const [pinged, setPinged] = useState(false);

  return (
    <footer className="site-footer">
      <div className="footer-rule" aria-hidden="true" />

      <div className="footer-main">
        <div className="footer-brand">
          <span className="footer-mark">话</span>
          <div>
            <b>{SITE_NAME}</b>
            <p>编辑部 & 语言实验室出品。只改说法，不改事实。</p>
          </div>
        </div>

        <div className="footer-actions">
          <button
            type="button"
            className="footer-link"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid="toggle-privacy"
          >
            隐私说明
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => {
              onClearLocal();
              setPinged(true);
              window.setTimeout(() => setPinged(false), 2400);
            }}
            data-testid="clear-local"
          >
            {pinged ? '已清除本机数据' : '清除本机数据'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="footer-privacy" data-testid="privacy-block">
          <p className="privacy-title">隐私说明（要点）</p>
          <ul>
            {PRIVACY_POINTS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="privacy-state">
            当前状态：
            {aiReady
              ? '本页面已连接服务端模型通道，点击「开始翻译」会把这句话发送给服务端再交给模型。'
              : '本页面未连接模型通道，全部内容在你的浏览器里本地生成 —— 你输入的文字不会离开这台设备。'}
          </p>
        </div>
      ) : null}

      <div className="footer-bottom">
        <span>{FOOTER_NOTE}</span>
        <span className="footer-en">PLAIN SPEAK BUREAU · NO DATA COLLECTED</span>
      </div>
    </footer>
  );
}
