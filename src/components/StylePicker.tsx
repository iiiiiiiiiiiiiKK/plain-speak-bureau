import { STYLES, type StyleId } from '../data/styles';
import { useRadioGroup } from '../hooks/useRadioGroup';

interface StylePickerProps {
  value: StyleId;
  onChange: (next: StyleId) => void;
  disabled: boolean;
}

const IDS: StyleId[] = STYLES.map((s) => s.id);

export default function StylePicker({ value, onChange, disabled }: StylePickerProps) {
  const { register, onKeyDown, tabIndexFor } = useRadioGroup(IDS, value, onChange);

  return (
    <section className="panel picker-panel" aria-labelledby="style-heading">
      <div className="panel-head">
        <h2 id="style-heading" className="panel-title">
          <span className="panel-index">03</span>
          想要哪种口气
        </h2>
      </div>
      <div className="picker-grid picker-grid-style" role="radiogroup" aria-labelledby="style-heading">
        {STYLES.map((style) => {
          const on = style.id === value;
          return (
            <button
              key={style.id}
              ref={register(style.id)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={tabIndexFor(style.id)}
              className={`pick pick-tall${on ? ' pick-on' : ''}`}
              onClick={() => onChange(style.id)}
              onKeyDown={(e) => onKeyDown(e, style.id)}
              disabled={disabled}
              data-testid={`style-${style.id}`}
            >
              <span className="pick-label">{style.label}</span>
              <span className="pick-desc">{style.desc}</span>
            </button>
          );
        })}
      </div>
      <p className="picker-note">
        选一种当主调，另外会附上 2 条对照版本 —— 同一件事，换个语气看。
      </p>
    </section>
  );
}
