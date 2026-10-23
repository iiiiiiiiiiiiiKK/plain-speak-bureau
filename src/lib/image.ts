/**
 * 分享图导出：DOM → PNG。
 *
 * 用 html-to-image（SVG foreignObject）复用真实排版，
 * 中文由浏览器自身字体渲染，因此不会出现 Canvas 缺字/乱码。
 * 导出失败会降级像素比后重试一次，再失败就抛错让 UI 提示改复制文字。
 */
import { toBlob } from 'html-to-image';
import type { RefObject } from 'react';

export interface ExportOptions {
  pixelRatio?: number;
  backgroundColor?: string;
}

async function waitForFonts(): Promise<void> {
  try {
    if (document.fonts?.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    }
  } catch {
    /* 字体 API 不可用时直接继续 */
  }
}

export async function nodeToBlob(node: HTMLElement, options: ExportOptions = {}): Promise<Blob> {
  await waitForFonts();
  const base = {
    pixelRatio: options.pixelRatio ?? 3,
    backgroundColor: options.backgroundColor ?? '#f4efe4',
    cacheBust: true,
  };
  let blob: Blob | null = null;
  try {
    blob = await toBlob(node, base);
  } catch {
    blob = null;
  }
  if (!blob) {
    blob = await toBlob(node, { ...base, pixelRatio: Math.min(2, base.pixelRatio) });
  }
  if (!blob) throw new Error('图片渲染失败，请重试，或改用「复制文字」。');
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function captureWithRetry(
  ref: RefObject<HTMLElement | null>,
  options: ExportOptions,
): Promise<Blob> {
  const node = ref.current;
  if (!node) throw new Error('分享图还没准备好，请稍后重试。');
  await nextFrame();
  return nodeToBlob(node, options);
}

export function safeFilename(label: string, suffix: string): string {
  const clean = label.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24) || 'plain-speak';
  return `${clean}-${suffix}.png`;
}

export function canShareFiles(file: File): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function' &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

export async function shareFile(file: File, text: string, title: string): Promise<'shared' | 'aborted'> {
  try {
    await navigator.share({ files: [file], text, title });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
      return 'aborted';
    }
    throw error;
  }
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || touch;
}
