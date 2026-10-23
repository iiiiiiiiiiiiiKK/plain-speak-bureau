import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'err' | 'info';
}

/** 轻量提示：3 秒自动消失，同时只显示一条，避免堆叠遮挡内容 */
export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setToast(null);
  }, []);

  const show = useCallback(
    (text: string, kind: Toast['kind'] = 'ok') => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      seq.current += 1;
      setToast({ id: seq.current, text, kind });
      timer.current = window.setTimeout(() => {
        setToast(null);
        timer.current = null;
      }, 3000);
    },
    [],
  );

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return { toast, show, clear };
}
