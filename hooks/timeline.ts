// 座位配置與閒置行程。場景是 160×96 的像素格，側視角，所有人面朝右。

import type { RoleId } from '../types'
import { rng, type Pt } from './pixel'

/** 閒置行程一輪的秒數 */
export const CYCLE = 60
/** 走路速度，像素格／秒 */
const SPEED = 18

/** 每個座位的左緣 x 與腳底 y */
export const DESKS: Record<RoleId, { ox: number; base: number }> = {
  planner: { ox: 4, base: 60 },
  engineer: { ox: 42, base: 60 },
  art: { ox: 80, base: 60 },
  producer: { ox: 4, base: 90 },
  reviewer: { ox: 42, base: 90 },
  qa: { ox: 80, base: 90 },
}

export const ROLES: readonly RoleId[] = ['planner', 'engineer', 'art', 'producer', 'reviewer', 'qa']

/** 站在椅子旁的位置 */
export const standPoint = (role: RoleId): Pt => ({ x: DESKS[role].ox + 3, y: DESKS[role].base })

/** 茶水間與沙發每人有自己的位置，同時去才不會疊在一起 */
export const coffeeSpot = (role: RoleId): Pt => ({ x: 131 + (ROLES.indexOf(role) % 3) * 3, y: 64 })
export const WC: Pt = { x: 147, y: 64 }
export const sofaSpot = (role: RoleId): Pt => ({ x: 130 + (ROLES.indexOf(role) % 4) * 7, y: 94 })

/** 後排走道 y=64，前排走道 y=94；兩條走道在 x=114 相連 */
const aisle = (y: number) => (y <= 77 ? 64 : 94)

export function route(a: Pt, b: Pt): Pt[] {
  const ya = aisle(a.y)
  const yb = aisle(b.y)
  const pts: Pt[] = [a, { x: a.x, y: ya }]
  if (ya !== yb) pts.push({ x: 114, y: ya }, { x: 114, y: yb })
  pts.push({ x: b.x, y: yb }, b)
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y)
}

export type DeskPose = 'sit' | 'sleep' | 'stretch'

/** 一趟路：經過 pts，抵達每個點的時間是 times */
export type Walk = { kind: 'walk'; pts: Pt[]; times: number[]; t0: number; t1: number }

export type Seg =
  | { kind: 'desk'; pose: DeskPose; t0: number; t1: number }
  | Walk
  | { kind: 'drink' | 'gone' | 'sofa'; t0: number; t1: number }

export function walks(pts: Pt[], start: number): Walk {
  const times = [start]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    times.push(times[i - 1]! + (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / SPEED)
  }
  return { kind: 'walk', pts, times, t0: start, t1: times[times.length - 1]! }
}

/** 這趟路第 time 秒走到哪 */
export function pointOn(walk: Walk, time: number): Pt {
  for (let i = 1; i < walk.pts.length; i++) {
    if (time < walk.times[i]!) {
      const a = walk.pts[i - 1]!
      const b = walk.pts[i]!
      const k = (time - walk.times[i - 1]!) / Math.max(0.001, walk.times[i]! - walk.times[i - 1]!)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
  }
  return walk.pts[walk.pts.length - 1]!
}

/** 一輪 60 秒的閒置行程：從座位開始、在座位結束，中間隨機打瞌睡、滑手機、喝咖啡、上廁所、坐沙發 */
export function idleTimeline(role: RoleId, seed: number): Seg[] {
  const rnd = rng(seed)
  const home = standPoint(role)
  const segs: Seg[] = []
  let t = 0
  const desk = (pose: DeskPose, dur: number) => {
    segs.push({ kind: 'desk', pose, t0: t, t1: t + dur })
    t += dur
  }
  desk('stretch', 2.5)
  while (t < CYCLE - 4) {
    const left = CYCLE - t
    const roll = rnd()
    if (roll < 0.32) {
      desk('sleep', Math.min(left, 9 + rnd() * 8))
      continue
    }
    if (roll < 0.5) {
      desk('sit', Math.min(left, 5 + rnd() * 5))
      continue
    }
    const kind = roll < 0.68 ? 'drink' : roll < 0.82 ? 'gone' : 'sofa'
    const dest = kind === 'drink' ? coffeeSpot(role) : kind === 'gone' ? WC : sofaSpot(role)
    const there = walks(route(home, dest), t)
    const go = there.t1 - t
    const stay = kind === 'drink' ? 5 + rnd() * 3 : kind === 'gone' ? 4 + rnd() * 3 : 8 + rnd() * 5
    if (go * 2 + stay > left) {
      desk('sit', Math.min(left, 4 + rnd() * 4))
      continue
    }
    segs.push(there)
    t += go
    segs.push({ kind, t0: t, t1: t + stay })
    t += stay
    const back = walks(route(dest, home), t)
    segs.push(back)
    t = back.t1
  }
  if (t < CYCLE) desk('sit', CYCLE - t)
  return segs
}

/** 閒置行程第 t 秒在做什麼，給面板下方的文字用 */
export function activityAt(role: RoleId, seed: number, t: number): string {
  const time = ((t % CYCLE) + CYCLE) % CYCLE
  const seg = idleTimeline(role, seed).find(s => time >= s.t0 && time < s.t1)
  if (!seg) return '閒置'
  switch (seg.kind) {
    case 'desk':
      return seg.pose === 'sleep' ? '打瞌睡' : seg.pose === 'stretch' ? '伸懶腰' : '滑手機'
    case 'walk':
      return '走動中'
    case 'drink':
      return '喝咖啡'
    case 'gone':
      return '上廁所'
    case 'sofa':
      return '坐沙發'
  }
}

/** 整條閒置行程的文字版：[開始秒, 結束秒, 在做什麼] */
export function idleLabels(role: RoleId, seed: number): [number, number, string][] {
  return idleTimeline(role, seed).map(s => [Math.round(s.t0 * 10) / 10, Math.round(s.t1 * 10) / 10, activityAt(role, seed, (s.t0 + s.t1) / 2)])
}

/** 閒置行程第 t 秒時人在哪裡 */
export function whereAt(role: RoleId, seed: number, t: number): { x: number; y: number; isAtDesk: boolean } {
  const segs = idleTimeline(role, seed)
  const time = ((t % CYCLE) + CYCLE) % CYCLE
  const seg = segs.find(s => time >= s.t0 && time < s.t1) ?? segs[0]!
  const home = standPoint(role)
  switch (seg.kind) {
    case 'desk':
      return { ...home, isAtDesk: true }
    case 'walk':
      return { ...pointOn(seg, time), isAtDesk: false }
    case 'drink':
      return { ...coffeeSpot(role), isAtDesk: false }
    case 'gone':
      return { ...WC, isAtDesk: false }
    case 'sofa':
      return { ...sofaSpot(role), isAtDesk: false }
  }
}
