import { SCENES, type SceneId } from '../data/scenes';
import { useRadioGroup } from '../hooks/useRadioGroup';

interface ScenePickerProps {
  value: SceneId;
  onChange: (next: SceneId) => void;
  disabled: boolean;
}

const IDS: SceneId[] = SCENES.map((s) => s.id);

export default function ScenePicker({ value, onChange, disabled }: ScenePickerProps) {
  const { register, onKeyDown, tabIndexFor } = useRadioGroup(IDS, value, onChange);

  return (
    <section className="panel picker-panel" aria-labelledby="scene-heading">
      <div className="panel-head">
        <h2 id="scene-heading" className="panel-title">
          <span className="panel-index">02</span>
          什么场合说的话
        </h2>
      </div>
      <div className="picker-grid picker-grid-scene" role="radiogroup" aria-labelledby="scene-heading">
        {SCENES.map((scene) => {
          const on = scene.id === value;
          return (
            <button
              key={scene.id}
              ref={register(scene.id)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={tabIndexFor(scene.id)}
              className={`pick${on ? ' pick-on' : ''}`}
              onClick={() => onChange(scene.id)}
              onKeyDown={(e) => onKeyDown(e, scene.id)}
              disabled={disabled}
              data-testid={`scene-${scene.id}`}
            >
              <span className="pick-label">{scene.label}</span>
              <span className="pick-en">{scene.en}</span>
            </button>
          );
        })}
      </div>
      <p className="picker-note">{SCENES.find((s) => s.id === value)?.blurb}</p>
    </section>
  );
}
