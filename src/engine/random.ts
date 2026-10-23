/**
 * 确定性随机：同一个 seed 永远给出同一批结果。
 * 这样「换一批」可复现、可测试，也不会因为刷新页面就换脸。
 */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32：小、快、够随机 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从数组里按 rng 取一个，允许传入已用过的索引集合以避开重复 */
export function pickAt<T>(list: readonly T[], index: number): T {
  if (list.length === 0) throw new Error('pickAt: empty list');
  const i = ((index % list.length) + list.length) % list.length;
  return list[i] as T;
}


export function shuffleWithSeed<T>(list: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
