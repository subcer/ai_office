// 像素工具：[x, y, 寬, 高, 顏色] 的清單，連續同色的格子合併成一個 <path>，讓 SVG 小很多。

export type Px = readonly [number, number, number, number, string]

export function draw(list: readonly Px[], attrs = ''): string {
  let out = ''
  let color = ''
  let d = ''
  const flush = () => {
    if (d) out += `<path${attrs} fill="${color}" d="${d}"/>`
    d = ''
  }
  for (const [x, y, w, h, c] of list) {
    if (c !== color) {
      flush()
      color = c
    }
    d += `M${x} ${y}h${w}v${h}h${-w}z`
  }
  flush()
  return out
}

export function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const n = (v: number) => String(Math.round(v * 1000) / 1000)

/** 一段時間內可見：t0～t1 秒（循環長度 dur）。repeat 為 false 時只播一次並停在最後。 */
export function win(t0: number, t1: number, dur: number, begin: number, repeat = true): string {
  const a = t0 / dur
  const b = t1 / dur
  let values: string
  let times: string
  if (a <= 0 && b >= 1) return ''
  if (a <= 0) {
    values = '1;0'
    times = `0;${n(b)}`
  } else if (b >= 1) {
    values = '0;1'
    times = `0;${n(a)}`
  } else {
    values = '0;1;0'
    times = `0;${n(a)};${n(b)}`
  }
  const tail = repeat ? 'repeatCount="indefinite"' : 'fill="freeze"'
  return `<animate attributeName="opacity" calcMode="discrete" values="${values}" keyTimes="${times}" dur="${n(dur)}s" begin="${n(begin)}s" ${tail}/>`
}

export type Pt = { x: number; y: number }

/** 依序經過 pts，第 i 個點在 times[i] 秒抵達（循環長度 dur）。 */
export function moveAlong(pts: readonly Pt[], times: readonly number[], dur: number, begin: number, repeat = true): string {
  const values: string[] = []
  const keys: string[] = []
  const at = (p: Pt, t: number) => {
    values.push(`${n(p.x)} ${n(p.y)}`)
    keys.push(n(Math.min(1, Math.max(0, t / dur))))
  }
  if (times[0]! > 0) at(pts[0]!, 0)
  pts.forEach((p, i) => at(p, times[i]!))
  if (times[times.length - 1]! < dur) at(pts[pts.length - 1]!, dur)
  const tail = repeat ? 'repeatCount="indefinite"' : 'fill="freeze"'
  return `<animateTransform attributeName="transform" type="translate" values="${values.join(';')}" keyTimes="${keys.join(';')}" dur="${n(dur)}s" begin="${n(begin)}s" ${tail}/>`
}

export const moveLine = (from: Pt, to: Pt, t0: number, t1: number, dur: number, begin: number) =>
  moveAlong([from, to], [t0, t1], dur, begin)
