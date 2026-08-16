/** Seedable RNG for reproducible matches / future online sync. */

export function createRng(seed = Date.now(), state) {
  let s = (state !== undefined ? state : seed) >>> 0;
  if (s === 0) s = 1;
  const rng = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  rng.seed = seed;
  rng.getState = () => s;
  rng.int = (max) => Math.floor(rng() * max);
  rng.pick = (arr) => arr[rng.int(arr.length)];
  rng.shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return rng;
}
