import { useMemo, useRef } from 'react';
import { MAX_INPUT_CHARS, SOFT_INPUT_CHARS } from '../data/site';
import { SCENE_MAP, type SceneId } from '../data/scenes';
import { charCount } from '../engine/analyze';

interface InputPanelProps {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  scene: SceneId;
  onUseExample: (text: string) => void;
  disabled: boolean;
  error: string | null;
}

export default function InputPanel({
  value,
  onChange,
  onClear,
  scene,
  onUseExample,
  disabled,
  error,
}: InputPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const length = useMemo(() => charCount(value), [value]);
  const over = length > MAX_INPUT_CHARS;
  const soft = length > SOFT_INPUT_CHARS && !over;
  const examples = SCENE_MAP[scene].examples;

  return (
    <section className="panel input-panel" aria-labelledby="input-heading">
      <div className="panel-head">
        <h2 id="input-heading" className="panel-title">
          <span className="panel-index">01</span>
          把那句话放进来
        </h2>
        <div className={`counter${over ? ' counter-over' : soft ? ' counter-soft' : ''}`} data-testid="char-count">
          {length}
          <span className="counter-max">/{MAX_INPUT_CHARS}</span>
        </div>
      </div>

      <div className={`input-shell${error ? ' input-shell-error' : ''}`}>
        <textarea
          ref={textareaRef}
          className="input-area"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例：这个方案我们再研究一下。&#10;（一句话就够，别写论文。）"
          rows={4}
          maxLength={MAX_INPUT_CHARS + 50}
          aria-label="要翻译的原话"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'input-error' : undefined}
          disabled={disabled}
          data-testid="input-area"
        />
        {value.length > 0 ? (
          <button
            type="button"
            className="input-clear"
            onClick={onClear}
            aria-label="清空输入"
            title="清空"
            data-testid="clear-input"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="input-meta">
        <div className="example-row" role="group" aria-label="示例句子">
          <span className="example-label">试试：</span>
          {examples.slice(0, 3).map((text) => (
            <button
              key={text}
              type="button"
              className="chip"
              onClick={() => {
                onUseExample(text);
                textareaRef.current?.focus();
              }}
              disabled={disabled}
              data-testid="example-chip"
            >
              {text.length > 14 ? `${text.slice(0, 13)}…` : text}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="field-error" id="input-error" role="alert" data-testid="input-error">
          {error}
        </p>
      ) : soft ? (
        <p className="field-hint">有点长了：越短越能翻得准，超过 {SOFT_INPUT_CHARS} 字会偏向概括。</p>
      ) : null}
    </section>
  );
}
