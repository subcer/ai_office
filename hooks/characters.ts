// 六個角色的長相與姿勢。坐姿用座位的區域座標（椅子在 x 28～36、腳底 y 32），
// 站姿以腳底中央附近為原點（x 0～6、腳底 y 0），全部面朝右，往左走時再翻面。

import type { RoleId } from '../types'
import { draw, type Px } from './pixel'

type Accessory = 'tie' | 'bun' | 'phones' | 'beret' | 'glasses' | 'cap'

type Look = { skin: string; hair: string; shirt: string; dark: string; pants: string; acc: Accessory }

export const LOOKS: Record<RoleId, Look> = {
  producer: { skin: '#f0c8a0', hair: '#2b2235', shirt: '#d97757', dark: '#b4553a', pants: '#3b3350', acc: 'tie' },
  planner: { skin: '#e8c39e', hair: '#7a3b3b', shirt: '#3f8a5a', dark: '#2f6e4c', pants: '#2e2538', acc: 'bun' },
  engineer: { skin: '#e8c39e', hair: '#3b2a2a', shirt: '#3a6ea5', dark: '#2c5585', pants: '#2e2538', acc: 'phones' },
  art: { skin: '#f0c8a0', hair: '#e0b25c', shirt: '#8a5cc2', dark: '#6b44a0', pants: '#2e2538', acc: 'beret' },
  reviewer: { skin: '#d9b08c', hair: '#cfc8b8', shirt: '#6b6a88', dark: '#555470', pants: '#2e2538', acc: 'glasses' },
  qa: { skin: '#c99a74', hair: '#3b2a2a', shirt: '#1d9e75', dark: '#0f6e56', pants: '#2e2538', acc: 'cap' },
}

export const NAMES: Record<RoleId, string> = {
  producer: '製作人',
  planner: '企劃',
  engineer: '工程師',
  art: '美術',
  reviewer: '審查員',
  qa: '測試員',
}

/** 滑鼠停在座位上時的說明 */
export const JOBS: Record<RoleId, string> = {
  producer: '製作人（主對話）：派工、追進度、跟總經理講電話',
  planner: '企劃（planner）：寫規格、拆任務卡',
  engineer: '工程師（game-engineer）：寫 Godot 程式',
  art: '美術（art-director）：美術規格、素材清單、提示詞',
  reviewer: '審查員（reviewer）：審程式、核對驗收條件',
  qa: '測試員（qa-tester）：試玩清單、自動測試、bug 單',
}

export const ID: Record<RoleId, string> ={ producer: 'p', planner: 'l', engineer: 'e', art: 'a', reviewer: 'r', qa: 'q' }

const SHOE = '#1c1a2e'
const EYE = '#1c1a2e'
const SHADOW = 'rgba(0,0,0,0.3)'

function accessory(look: Look, hx: number, hy: number): Px[] {
  switch (look.acc) {
    case 'bun':
      return [[hx - 2, hy + 1, 2, 2, look.hair], [hx - 2, hy + 1, 1, 1, '#9a5050']]
    case 'phones':
      return [[hx + 1, hy - 2, 4, 1, '#444441'], [hx + 1, hy + 1, 2, 3, '#444441'], [hx + 1, hy + 2, 1, 1, '#e24b4a']]
    case 'beret':
      return [[hx - 1, hy - 2, 7, 2, '#b8373a'], [hx + 1, hy - 3, 3, 1, '#b8373a'], [hx + 4, hy - 2, 2, 1, '#d0545a'], [hx + 2, hy - 4, 1, 1, '#b8373a']]
    case 'glasses':
      return [[hx + 3, hy + 2, 3, 1, '#1c1a2e'], [hx + 4, hy + 2, 1, 1, '#cfe3f5']]
    case 'cap':
      return [[hx, hy - 2, 6, 2, '#e24b4a'], [hx + 5, hy - 1, 3, 1, '#c03a3a'], [hx + 2, hy - 2, 1, 1, '#f09595']]
    case 'tie':
      return []
  }
}

function head(look: Look, hx: number, hy: number, eyes: 'open' | 'closed' = 'open'): Px[] {
  return [
    [hx, hy, 6, 6, look.skin],
    [hx + 5, hy + 1, 1, 4, '#ffffff22'],
    [hx, hy - 1, 6, 2, look.hair],
    [hx - 1, hy, 2, 4, look.hair],
    [hx + 1, hy - 1, 2, 1, '#ffffff33'],
    eyes === 'open' ? [hx + 4, hy + 2, 1, 1, EYE] : [hx + 3, hy + 2, 2, 1, '#a0705a'],
    [hx + 3, hy + 4, 1, 1, '#d9a07a'],
    ...accessory(look, hx, hy),
  ]
}

function torso(look: Look, x: number, y: number, h: number): Px[] {
  const list: Px[] = [[x, y, 5, h, look.shirt], [x, y, 1, h, look.dark], [x + 1, y, 3, 1, '#ffffff22']]
  if (look.acc === 'tie') list.push([x + 4, y + 1, 1, 4, '#712b13'], [x + 4, y + 1, 1, 1, '#993c1d'])
  return list
}

/* ---------- 坐姿（座位區域座標） ---------- */

const seatedLegs = (look: Look): Px[] => [
  [33, 24, 5, 2, look.pants],
  [37, 26, 2, 5, look.pants],
  [37, 31, 3, 1, SHOE],
]


const idleArms = (look: Look): Px[] => [
  [35, 20, 3, 2, look.shirt],
  [37, 21, 2, 2, look.shirt],
  [38, 19, 2, 3, '#1e1a2b'],
  [38, 19, 2, 2, '#5fb3b8'],
  [37, 22, 2, 1, look.skin],
]

const stretchArms = (look: Look): Px[] => [
  [29, 6, 2, 11, look.shirt],
  [37, 6, 2, 11, look.shirt],
  [29, 5, 2, 1, look.skin],
  [37, 5, 2, 1, look.skin],
  [34, 15, 2, 1, '#712b13'],
  ...head(look, 31, 11, 'closed').slice(5, 6),
]

function sleeping(look: Look): Px[] {
  const hat: Px[] =
    look.acc === 'beret' ? [[37, 15, 6, 2, '#b8373a']] :
    look.acc === 'cap' ? [[37, 15, 6, 2, '#e24b4a']] :
    look.acc === 'phones' ? [[38, 16, 4, 1, '#444441']] : []
  return [
    [32, 19, 5, 6, look.shirt],
    [33, 18, 4, 1, look.shirt],
    [32, 19, 1, 6, look.dark],
    [37, 17, 6, 5, look.hair],
    [38, 16, 4, 1, look.hair],
    [39, 20, 1, 2, look.skin],
    ...hat,
    [35, 22, 10, 2, look.shirt],
    [35, 22, 10, 1, '#ffffff22'],
    [45, 22, 1, 2, look.skin],
  ]
}

/** 每個角色工作時的手，兩格輪流 */
function workArms(role: RoleId, look: Look): [Px[], Px[]] {
  const s = look.shirt
  const k = look.skin
  switch (role) {
    case 'engineer':
    case 'planner':
      return [
        [[35, 19, 3, 2, s], [38, 21, 3, 2, s], [41, 23, 2, 1, k]],
        [[35, 19, 3, 2, s], [38, 20, 3, 2, s], [41, 21, 2, 2, k]],
      ]
    case 'art':
      return [
        [[35, 18, 3, 2, s], [38, 16, 2, 3, s], [39, 14, 2, 2, k], [40, 11, 1, 3, '#6b4a35'], [40, 10, 1, 1, '#d85a30']],
        [[35, 18, 3, 2, s], [38, 17, 3, 2, s], [40, 16, 2, 2, k], [41, 13, 1, 3, '#6b4a35'], [41, 12, 1, 1, '#378add']],
      ]
    case 'reviewer': {
      const loupe = (dx: number): Px[] => [
        [35, 19, 3, 2, s], [38, 21, 2 + dx, 2, s], [40 + dx, 22, 2, 1, k],
        [41 + dx, 18, 4, 4, '#cfc8b8'], [42 + dx, 19, 2, 2, '#9fc2e8'], [42 + dx, 19, 1, 1, '#eef0ff'],
      ]
      return [loupe(0), loupe(3)]
    }
    case 'qa':
      return [
        [[35, 20, 3, 2, s], [37, 21, 3, 2, s], [39, 20, 4, 2, '#5f5e5a'], [42, 20, 1, 1, '#e24b4a'], [40, 21, 1, 1, k]],
        [[35, 20, 3, 2, s], [37, 20, 3, 2, s], [39, 19, 4, 2, '#5f5e5a'], [42, 19, 1, 1, '#f09595'], [40, 20, 1, 1, k]],
      ]
    case 'producer': {
      const call = (mouth: boolean): Px[] => [
        // 聽筒貼在耳朵（頭的後半邊），臉露出來
        [33, 17, 3, 3, s], [32, 15, 2, 2, k], [31, 11, 2, 6, '#1e1a2b'], [31, 11, 1, 1, '#444441'], [31, 16, 2, 1, '#444441'],
        ...(mouth ? ([[35, 15, 1, 1, '#712b13']] as Px[]) : []),
      ]
      return [call(true), call(false)]
    }
  }
}

/* ---------- 站姿（原點在腳底） ---------- */

/** 頭只畫一次（<defs> 裡的 xH，原點在臉的左上角），各姿勢用 <use> 擺到對的位置 */
const headAt = (id: string, x: number, y: number) => `<use href="#${id}H" x="${x}" y="${y}"/>`

function standing(id: string, look: Look, frame: 0 | 1): string {
  const legs: Px[] = frame === 0
    ? [[0, -7, 2, 6, look.pants], [4, -7, 2, 6, look.pants], [0, -1, 3, 1, SHOE], [4, -1, 3, 1, SHOE]]
    : [[1, -7, 2, 6, look.pants], [3, -7, 2, 6, look.pants], [1, -1, 3, 1, SHOE], [3, -1, 3, 1, SHOE]]
  const arm: Px[] = frame === 0
    ? [[2, -13, 2, 6, look.dark], [2, -7, 2, 1, look.skin]]
    : [[3, -13, 2, 5, look.dark], [3, -8, 2, 1, look.skin]]
  return draw([[-1, 0, 8, 1, SHADOW], ...legs, ...torsoStanding(look), ...arm]) + headAt(id, 0, -21)
}

function torsoStanding(look: Look): Px[] {
  const list: Px[] = [[0, -15, 6, 8, look.shirt], [0, -15, 1, 8, look.dark], [1, -15, 4, 1, '#ffffff22']]
  if (look.acc === 'tie') list.push([5, -14, 1, 4, '#712b13'])
  return list
}

function drinking(id: string, look: Look, frame: 0 | 1): string {
  const base: Px[] = [
    [-1, 0, 8, 1, SHADOW],
    [0, -7, 2, 6, look.pants], [3, -7, 2, 6, look.pants], [0, -1, 3, 1, SHOE], [3, -1, 3, 1, SHOE],
    ...torsoStanding(look),
  ]
  const arm: Px[] = frame === 0
    ? [[3, -14, 2, 2, look.shirt], [4, -17, 2, 3, look.shirt], [5, -20, 2, 3, '#eef0ff'], [5, -20, 2, 1, '#6b4a35']]
    : [[3, -13, 2, 5, look.dark], [4, -9, 2, 3, '#eef0ff'], [4, -9, 2, 1, '#6b4a35']]
  return draw(base) + headAt(id, 0, -21) + draw(arm)
}

/** 只有頭（給狀態面板當頭像），id 與 characterDefs 的頭相同 */
export function headDef(role: RoleId): string {
  return `<g id="${ID[role]}H">${draw(head(LOOKS[role], 0, 0))}</g>`
}

/** 這個角色所有姿勢的 <defs> 圖元，id 為「角色字母＋姿勢字母」 */
export function characterDefs(role: RoleId): string {
  const look = LOOKS[role]
  const id = ID[role]
  const [w0, w1] = workArms(role, look)
  const parts: Record<string, string> = {
    H: draw(head(look, 0, 0)),
    L: draw(seatedLegs(look)),
    B: draw(torso(look, 31, 17, 8)) + headAt(id, 31, 11),
    P: draw(idleArms(look)),
    T: draw(stretchArms(look)),
    Z: draw(sleeping(look)),
    W0: draw(w0),
    W1: draw(w1),
    S0: standing(id, look, 0),
    S1: standing(id, look, 1),
    D0: drinking(id, look, 0),
    D1: drinking(id, look, 1),
  }
  return Object.entries(parts).map(([k, svg]) => `<g id="${id}${k}">${svg}</g>`).join('') + nameTag(id, NAMES[role], look.shirt)
}

/** 頭上的名字標籤（xN），以 (0, 0) 為中心 */
function nameTag(id: string, name: string, color: string): string {
  const w = name.length * 3 + 3
  return `<g id="${id}N"><rect x="${-w / 2}" y="-3" width="${w}" height="4" fill="#1e1a2b" opacity="0.85"/>` +
    `<rect x="${-w / 2}" y="-3" width="1" height="4" fill="${color}"/>` +
    `<text x="0.5" y="0" font-size="2.8" text-anchor="middle" fill="#eef0ff" font-family="Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif">${name}</text></g>`
}

/** 總經理：深色西裝、紅領帶、灰髮，手提公事包。只有站姿（走進來、站著講話、走出去） */
const BOSS: Look = { skin: '#e8c39e', hair: '#8a8780', shirt: '#2e2a40', dark: '#1e1a2b', pants: '#2e2a40', acc: 'tie' }

export function bossDefs(): string {
  const id = 'k'
  const briefcase: Px[] = [[5, -8, 4, 3, '#6b4a35'], [6, -9, 2, 1, '#4a3328'], [5, -8, 4, 1, '#83603f']]
  const collar: Px[] = [[1, -15, 4, 1, '#eef0ff'], [3, -15, 1, 2, '#e24b4a']]
  return `<g id="kH">${draw(head(BOSS, 0, 0))}</g>` +
    `<g id="kS0">${standing(id, BOSS, 0)}${draw([...collar, ...briefcase])}</g>` +
    `<g id="kS1">${standing(id, BOSS, 1)}${draw([...collar, ...briefcase.map(([x, y, w, h, c]): Px => [x, y + 1, w, h, c])])}</g>` +
    nameTag(id, '總經理', '#ffd27a')
}
