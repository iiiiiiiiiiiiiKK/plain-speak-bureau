/**
 * 剪贴板：优先 navigator.clipboard，失败降级到 execCommand。
 * 中文、多行、emoji 都原样保留；复制失败返回 false，由 UI 提示手动选择。
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof text !== 'string' || text.length === 0) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到降级方案 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 复制图片（分享图）：浏览器支持就给图片，不支持返回 false */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    const Ctor = window.ClipboardItem;
    if (!navigator.clipboard?.write || !Ctor) return false;
    await navigator.clipboard.write([new Ctor({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch {
    return false;
  }
}
