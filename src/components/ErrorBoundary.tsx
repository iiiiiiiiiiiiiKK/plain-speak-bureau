import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAllLocal } from '../lib/storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 顶层错误边界：出错时给可操作的恢复路径，而不是白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[plain-speak] render error', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleClear = (): void => {
    clearAllLocal();
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fatal">
        <div className="fatal-box">
          <p className="fatal-code">ERR / 排版出错</p>
          <h1>这一页排版炸了</h1>
          <p className="fatal-desc">
            这只是前端的渲染故障，和你的输入、隐私无关：翻译默认在本地完成，没有任何内容被上传。
            可以先刷新重试；如果反复出现，清除本地数据再进。
          </p>
          <pre className="fatal-msg">{error.message}</pre>
          <div className="fatal-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              刷新页面
            </button>
            <button type="button" className="btn" onClick={this.handleClear}>
              清除本机数据并重试
            </button>
          </div>
        </div>
      </div>
    );
  }
}
