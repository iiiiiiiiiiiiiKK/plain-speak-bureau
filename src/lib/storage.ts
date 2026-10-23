/**
 * localStorage 封装。
 *
 * 原则：
 * - 隐私模式下读写会抛异常：一律静默降级，功能不受影响；
 * - 读出来的数据必须做形状校验，旧版本/坏数据直接丢弃，不让页面崩；
 * - 只存用户自己的收藏与历史，不存任何身份信息。
 */
import type { SceneId } from '../data/scenes';
import type { StyleId } from '../data/styles';

const NS = 'ht.v1';
export const KEY_FAVORITES = `${NS}.favorites`;
export const KEY_HISTORY = `${NS}.history`;
export const KEY_PREFS = `${NS}.prefs`;

export interface SavedVariant {
  id: string;
  text: string;
  style: StyleId;
  styleLabel: string;
  note: string;
  /** 这一条属于哪次生成 */
  batchId: string;
  input: string;
  scene: SceneId;
  /** 生成来源：本地规则 / 模型 */
  source: 'local' | 'ai';
  intentLabel: string;
  savedAt: number;
}

export interface HistoryEntry {
  id: string;
  input: string;
  scene: SceneId;
  style: StyleId;
  createdAt: number;
  source: 'local' | 'ai';
  /** 只留文本摘要，避免历史把整个结果塞满存储 */
  texts: string[];
}

export interface Prefs {
  theme: 'light' | 'dark';
  reduceMotion: boolean;
}

const FAVORITE_LIMIT = 200;
const HISTORY_LIMIT = 30;

export function storageAvailable(): boolean {
  try {
    const probe = `${NS}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/* ---------------- 收藏 ---------------- */
export function loadFavorites(): SavedVariant[] {
  const data = readJson<unknown>(KEY_FAVORITES);
  if (!Array.isArray(data)) return [];
  const out: SavedVariant[] = [];
  for (const item of data) {
    if (!isObject(item)) continue;
    const text = asString(item.text).trim();
    if (!text) continue;
    out.push({
      id: asString(item.id) || `f${out.length}`,
      text,
      style: asString(item.style, 'plain') as StyleId,
      styleLabel: asString(item.styleLabel, '大白话'),
      note: asString(item.note),
      batchId: asString(item.batchId),
      input: asString(item.input),
      scene: asString(item.scene, 'workplace') as SceneId,
      source: item.source === 'ai' ? 'ai' : 'local',
      intentLabel: asString(item.intentLabel),
      savedAt: asNumber(item.savedAt, Date.now()),
    });
  }
  return out.slice(0, FAVORITE_LIMIT);
}

export function saveFavorites(list: SavedVariant[]): boolean {
  return writeJson(KEY_FAVORITES, list.slice(0, FAVORITE_LIMIT));
}

/* ---------------- 历史 ---------------- */
export function loadHistory(): HistoryEntry[] {
  const data = readJson<unknown>(KEY_HISTORY);
  if (!Array.isArray(data)) return [];
  const out: HistoryEntry[] = [];
  for (const item of data) {
    if (!isObject(item)) continue;
    const input = asString(item.input).trim();
    if (!input) continue;
    const texts = Array.isArray(item.texts)
      ? item.texts.filter((t): t is string => typeof t === 'string').slice(0, 5)
      : [];
    out.push({
      id: asString(item.id) || `h${out.length}`,
      input,
      scene: asString(item.scene, 'workplace') as SceneId,
      style: asString(item.style, 'plain') as StyleId,
      createdAt: asNumber(item.createdAt, Date.now()),
      source: item.source === 'ai' ? 'ai' : 'local',
      texts,
    });
  }
  return out.slice(0, HISTORY_LIMIT);
}

export function saveHistory(list: HistoryEntry[]): boolean {
  return writeJson(KEY_HISTORY, list.slice(0, HISTORY_LIMIT));
}

/* ---------------- 偏好 ---------------- */
export function loadPrefs(): Prefs {
  const data = readJson<unknown>(KEY_PREFS);
  if (!isObject(data)) return { theme: 'light', reduceMotion: false };
  return {
    theme: data.theme === 'dark' ? 'dark' : 'light',
    reduceMotion: data.reduceMotion === true,
  };
}

export function savePrefs(prefs: Prefs): boolean {
  return writeJson(KEY_PREFS, prefs);
}

/** 页脚「清除本机数据」：三个键一起抹掉 */
export function clearAllLocal(): void {
  for (const key of [KEY_FAVORITES, KEY_HISTORY, KEY_PREFS]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* 存储不可用时本来就没有数据 */
    }
  }
}
