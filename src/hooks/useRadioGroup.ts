import { useCallback, useRef } from 'react';

/**
 * 单选组的键盘导航（WAI-ARIA radiogroup 模式）。
 *
 * 原生 <input type=radio> 自带方向键切换，但我们用的是 button + role="radio"，
 * 必须自己实现，否则键盘用户只能 Tab 进去、按空格，一个个点。
 *
 * 行为：
 *  - 只有「当前选中项」在 Tab 序列里（roving tabindex），Tab 一次就离开整组；
 *  - ↑↓←→ 在同组内切换并自动选中（radiogroup 的惯例：焦点即选中）；
 *  - Home / End 跳到第一个 / 最后一个。
 */
export function useRadioGroup<T extends string>(
  options: readonly T[],
  selected: T,
  onSelect: (next: T) => void,
) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const register = useCallback((id: T) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  }, []);

  const move = useCallback(
    (delta: number, from: T) => {
      const idx = options.indexOf(from);
      if (idx < 0) return;
      const next = options[(idx + delta + options.length) % options.length] as T;
      onSelect(next);
      // 等 React 提交后再移焦，否则焦点会落到旧节点
      requestAnimationFrame(() => refs.current.get(next)?.focus());
    },
    [onSelect, options],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, id: T) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          move(1, id);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          move(-1, id);
          break;
        case 'Home':
          event.preventDefault();
          onSelect(options[0] as T);
          requestAnimationFrame(() => refs.current.get(options[0] as T)?.focus());
          break;
        case 'End': {
          event.preventDefault();
          const last = options[options.length - 1] as T;
          onSelect(last);
          requestAnimationFrame(() => refs.current.get(last)?.focus());
          break;
        }
        default:
          break;
      }
    },
    [move, onSelect, options],
  );

  /** 选中项 tabIndex=0，其余 -1 */
  const tabIndexFor = useCallback((id: T) => (id === selected ? 0 : -1), [selected]);

  return { register, onKeyDown, tabIndexFor };
}
