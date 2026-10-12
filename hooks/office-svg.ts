// AI 辦公室：160×96 的像素場景，放大 3 倍顯示。
// 靜態的房間用 <path> 拼；角色姿勢放在 <defs>，用 <use> 依時間軸顯示。
// 動畫一律用 SMIL 與 CSS，begin 設成負數，讓重畫時從「現在」接著播，不會從頭來。

import type { Board, Review, RoleId, Seat } from '../types'
import { bossDefs, characterDefs, ID, JOBS, LOOKS, NAMES } from './characters'
import { draw, moveAlong, n, rng, win, type Pt, type Px } from './pixel'
import { envAt, isWet, type Env, type Phase } from './weather'
import { coffeeSpot, CYCLE, DESKS, idleTimeline, pointOn, ROLES, route, sofaSpot, standPoint, walks, type Seg, type Walk } from './timeline'

const W = 160
const H = 96

/* ---------- 房間 ---------- */

/** 每個時段的天空三段色（上、中、下）、雲色、遠方大樓色、亮燈機率 */
const SKY: Record<Phase, { bands: [string, string, string]; cloud: string; city: string; lit: number }> = {
  dawn: { bands: ['#3c3466', '#7a5a8c', '#d98a6a'], cloud: '#a08aa8', city: '#2a2850', lit: 0.15 },
  day: { bands: ['#5b8fd6', '#7fb0e8', '#a9cdf0'], cloud: '#eef0ff', city: '#4a5a80', lit: 0.04 },
  dusk: { bands: ['#2c2a5e', '#8c4a6a', '#e08a4a'], cloud: '#8c5a7a', city: '#1e1a3a', lit: 0.3 },
  night: { bands: ['#0e1030', '#121535', '#1a1d45'], cloud: '#2a2c58', city: '#0b0c22', lit: 0.35 },
}

function patterns(env: Env): string {
  const dither = (id: string, a: string, b: string) =>
    `<pattern id="${id}" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="${a}"/><rect width="1" height="1" fill="${b}"/><rect x="1" y="1" width="1" height="1" fill="${b}"/></pattern>`
  const [top, mid, low] = SKY[env.phase].bands
  return (
    dither('dWall', '#28265a', '#1d1e4d') +
    dither('dSky1', top, mid) +
    dither('dSky2', mid, low) +
    dither('dFog', 'rgba(207,214,255,0.35)', 'rgba(207,214,255,0.12)') +
    `<pattern id="tWall" width="7" height="5" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="1" height="1" fill="#2e2c63"/><rect x="5" y="3" width="1" height="1" fill="#24225a"/></pattern>` +
    `<pattern id="tCork" width="5" height="4" patternUnits="userSpaceOnUse"><rect width="5" height="4" fill="#8c6a46"/><rect x="1" y="1" width="1" height="1" fill="#7a5a3a"/><rect x="3" y="3" width="1" height="1" fill="#9c7a52"/></pattern>` +
    `<clipPath id="cWin"><rect x="6" y="6" width="24" height="22"/></clipPath>`
  )
}

function wall(): string {
  const list: Px[] = [
    [0, 0, W, 44, '#28265a'],
    [0, 0, W, 3, '#1d1e4d'],
  ]
  const wains: Px[] = [[0, 34, W, 10, '#1d1e4d'], [0, 33, W, 1, '#14152f'], [0, 34, W, 1, '#3a3c70']]
  for (let x = 4; x < W; x += 10) wains.push([x, 36, 1, 7, '#17183d'], [x + 1, 36, 1, 7, '#24265a'])
  wains.push([0, 44, W, 1, '#14152f'])
  return draw(list) + `<rect y="3" width="${W}" height="3" fill="url(#dWall)"/><rect y="6" width="${W}" height="27" fill="url(#tWall)"/>` + draw(wains)
}

function floor(): string {
  const rnd = rng(3)
  const list: Px[] = [[0, 45, W, 51, '#3a3046']]
  for (let y = 45; y < H; y += 4) {
    let x = -Math.floor(rnd() * 20)
    while (x < W) {
      const len = 16 + Math.floor(rnd() * 12)
      const tone = rnd()
      if (tone < 0.25) list.push([x + 1, y, len - 1, 3, '#40354d'])
      else if (tone > 0.85) list.push([x + 1, y, len - 1, 3, '#352b40'])
      list.push([x + 1, y, len - 1, 1, '#463a54'], [x, y, 1, 3, '#2c2438'])
      if (rnd() < 0.3) list.push([x + 4 + Math.floor(rnd() * (len - 8)), y + 2, 2, 1, '#30283c'])
      x += len
    }
    list.push([0, y + 3, W, 1, '#2c2438'])
  }
  list.push([0, 45, W, 2, 'rgba(0,0,0,0.28)'])
  // 同色的木條排在一起畫，合併成少數幾個 <path>；這些顏色彼此只在這個順序下疊加
  const order = ['#3a3046', '#40354d', '#352b40', '#463a54', '#30283c', '#2c2438', 'rgba(0,0,0,0.28)']
  return draw([...list].sort((a, b) => order.indexOf(a[4]) - order.indexOf(b[4])))
}

/** 窗外：天色跟著時段，雲、雨、雷、霧跟著天氣 */
function windowView(env: Env): string {
  const rnd = rng(9)
  const sky = SKY[env.phase]
  const [top, mid, low] = sky.bands
  const dark = env.weather === 'storm'
  const parts: string[] = [
    `<rect x="6" y="6" width="24" height="22" fill="${top}"/>`,
    `<rect x="6" y="11" width="24" height="3" fill="url(#dSky1)"/><rect x="6" y="14" width="24" height="3" fill="${mid}"/>`,
    `<rect x="6" y="17" width="24" height="3" fill="url(#dSky2)"/><rect x="6" y="20" width="24" height="8" fill="${low}"/>`,
  ]
  const clearish = env.weather === 'clear' || env.weather === 'cloudy'
  // 天上：深夜有月亮和星星，清晨與黃昏太陽在地平線附近，白天太陽在高處
  if (env.phase === 'night') {
    if (clearish) parts.push(draw([[9, 8, 1, 1, '#9da3d8'], [15, 7, 1, 1, '#eef0ff'], [21, 12, 1, 1, '#9da3d8'], [12, 13, 1, 1, '#9da3d8'], [19, 9, 1, 1, '#eef0ff']]))
    parts.push(draw([[24, 8, 4, 4, '#d9dcf0'], [23, 9, 1, 2, '#d9dcf0'], [28, 9, 1, 2, '#d9dcf0'], [25, 7, 2, 1, '#d9dcf0'], [27, 10, 1, 2, '#a9aed0'], [25, 9, 1, 1, '#bfc3df']]))
  } else if (env.phase === 'day') {
    parts.push(`<circle cx="25" cy="10" r="4" fill="#fff6d8" opacity="0.35"/>`)
    parts.push(draw([[23, 8, 4, 4, '#ffe9a8'], [22, 9, 1, 2, '#ffe9a8'], [27, 9, 1, 2, '#ffe9a8'], [24, 7, 2, 1, '#ffe9a8'], [24, 9, 2, 2, '#fff6d8']]))
  } else {
    const color = env.phase === 'dusk' ? '#ff9a4a' : '#ffc0a0'
    parts.push(`<circle cx="22" cy="20" r="5" fill="${color}" opacity="0.3"/>`)
    parts.push(draw([[20, 18, 5, 4, color], [19, 19, 1, 2, color], [25, 19, 1, 2, color], [21, 17, 3, 1, color]]))
  }
  // 雲：多雲、下雨、雷雨時慢慢飄過
  if (env.weather !== 'clear') {
    const cloud = dark ? '#3a3a5a' : sky.cloud
    const blob = (x: number, y: number, w: number): Px[] => [[x, y + 1, w, 2, cloud], [x + 1, y, w - 2, 1, cloud], [x + 2, y - 1, Math.max(1, w - 5), 1, cloud]]
    const clouds = draw([...blob(4, 9, 9), ...blob(17, 12, 7), ...blob(30, 8, 8), ...blob(-10, 13, 8)], env.weather === 'fog' ? ' opacity="0.5"' : '')
    parts.push(`<g clip-path="url(#cWin)"><g>${clouds}<animateTransform attributeName="transform" type="translate" values="0 0;-14 0;0 0" dur="${dark ? 40 : 90}s" repeatCount="indefinite"/></g></g>`)
  }
  // 遠方城市：天越暗，亮燈的窗越多
  const city: Px[] = []
  const lit: string[] = []
  let x = 6
  while (x < 30) {
    const w = 3 + Math.floor(rnd() * 3)
    const h = 4 + Math.floor(rnd() * 7)
    city.push([x, 28 - h, w, h, sky.city])
    for (let wy = 28 - h + 1; wy < 27; wy += 2) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        const roll = rnd()
        const delay = n(rnd() * 6)
        if (roll < sky.lit) lit.push(`<rect x="${wx}" y="${wy}" width="1" height="1" fill="#ffc845" class="twk" style="animation-delay:-${delay}s"/>`)
      }
    }
    x += w
  }
  parts.push(draw(city), lit.join(''))
  // 雨：雷雨更密更快
  if (isWet(env.weather)) {
    const count = env.weather === 'storm' ? 26 : 16
    const drops: Px[] = []
    for (let copy = 0; copy < 2; copy++) {
      for (let i = 0; i < count; i++) drops.push([6 + Math.floor(rnd() * 26), 4 + Math.floor(rnd() * 22) - copy * 22, 1, 2, env.phase === 'day' ? '#cfe3f5' : '#7f86c4'])
    }
    parts.push(`<g clip-path="url(#cWin)"><g>${draw(drops, ' opacity="0.8"')}<animateTransform attributeName="transform" type="translate" from="${env.weather === 'storm' ? 5 : 3} 0" to="-2 22" dur="${env.weather === 'storm' ? 0.4 : 0.6}s" repeatCount="indefinite"/></g></g>`)
  }
  // 霧：一層慢慢飄的白霧
  if (env.weather === 'fog') {
    parts.push(`<g clip-path="url(#cWin)"><g><rect x="-6" y="14" width="40" height="14" fill="url(#dFog)"/><rect x="-6" y="9" width="40" height="4" fill="url(#dFog)" opacity="0.6"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;6 0;0 0" dur="20s" repeatCount="indefinite"/></g></g>`)
  }
  // 閃電：只有雷雨
  if (env.weather === 'storm') {
    parts.push(`<rect x="6" y="6" width="24" height="22" fill="#eef0ff" opacity="0"><animate attributeName="opacity" values="0;0;0.7;0;0.45;0" keyTimes="0;0.9;0.905;0.912;0.92;1" dur="17s" repeatCount="indefinite"/></rect>`)
  }
  const frame: Px[] = [
    [2, 3, 32, 1, '#888780'],
    [5, 5, 26, 1, '#2e2538'], [5, 28, 26, 1, '#2e2538'], [5, 5, 1, 24, '#2e2538'], [30, 5, 1, 24, '#2e2538'],
    [17, 6, 1, 22, '#2e2538'], [6, 16, 24, 1, '#2e2538'],
    [6, 6, 11, 1, '#ffffff10'],
    [4, 29, 28, 1, '#7a6b8c'], [4, 30, 28, 1, '#5a4d6c'],
    [2, 4, 4, 25, '#7a3b3b'], [3, 4, 1, 25, '#5c2a2e'], [5, 4, 1, 25, '#8c4a46'],
    [30, 4, 4, 25, '#7a3b3b'], [32, 4, 1, 25, '#5c2a2e'], [30, 4, 1, 25, '#8c4a46'],
  ]
  return parts.join('') + draw(frame)
}

/** 時鐘：時針短粗、分針長細（都是深色），紅色秒針一秒跳一格 */
function clock(now: number, still: boolean): string {
  const d = new Date(now)
  const second = d.getSeconds()
  const minute = d.getMinutes() * 6 + second * 0.1
  const hour = (d.getHours() % 12) * 30 + d.getMinutes() * 0.5
  const hand = (len: number, w: number, deg: number, period: number, color: string) =>
    `<rect x="${n(40 - w / 2)}" y="${13 - len}" width="${w}" height="${len}" fill="${color}" transform="rotate(${n(deg)} 40 13)">` +
    (still ? '' : `<animateTransform attributeName="transform" type="rotate" from="${n(deg)} 40 13" to="${n(deg + 360)} 40 13" dur="${period}s" repeatCount="indefinite"/>`) +
    `</rect>`
  const secondHand = still
    ? `<rect x="39.8" y="9.2" width="0.4" height="4.3" fill="#e24b4a" transform="rotate(${second * 6} 40 13)"/>`
    : `<rect x="39.8" y="9.2" width="0.4" height="4.3" fill="#e24b4a" class="sec" style="animation-delay:-${second}s"/>`
  return (
    `<circle cx="40" cy="13" r="5" fill="#2e2538"/><circle cx="40" cy="13" r="4" fill="#d9dcf0"/>` +
    draw([[40, 9, 1, 1, '#5f5e5a'], [40, 17, 1, 1, '#5f5e5a'], [36, 13, 1, 1, '#5f5e5a'], [44, 13, 1, 1, '#5f5e5a']]) +
    hand(2.6, 1.2, hour, 43200, '#2e2538') + hand(3.8, 0.7, minute, 3600, '#3b3350') + secondHand +
    draw([[40, 13, 1, 1, '#b8373a']])
  )
}

/** 軟木板：顯示任務卡真實的待辦／進行／完成數量（沒設定任務卡資料夾就是空的） */
function corkboard(board: Board): string {
  const list: Px[] = [[47, 5, 40, 23, '#5a3a2a'], [47, 5, 40, 1, '#6b4a35']]
  const notes: Px[] = []
  const column = (x0: number, count: number, color: string, pin: string) => {
    for (let i = 0; i < count; i++) {
      const x = x0 + (i % 3) * 4
      const y = 9 + Math.floor(i / 3) * 4
      if (y > 23) break
      notes.push([x, y, 3, 3, color], [x, y + 2, 3, 1, '#00000022'], [x + 1, y, 1, 1, pin])
    }
  }
  column(49, board.todo, '#fac775', '#e24b4a')
  column(62, board.doing, '#85b7eb', '#e24b4a')
  column(75, board.done, '#97c459', '#e24b4a')
  const heads: Px[] = [[49, 7, 11, 1, '#ba7517'], [62, 7, 11, 1, '#185fa5'], [75, 7, 11, 1, '#3b6d11'], [61, 7, 1, 19, '#7a5a3a'], [74, 7, 1, 19, '#7a5a3a']]
  return draw(list) + `<rect x="48" y="6" width="38" height="21" fill="url(#tCork)"/>` + draw(heads) + draw(notes)
}

function bookshelf(): string {
  const rnd = rng(17)
  const colors = ['#b8373a', '#378add', '#3f8a5a', '#ba7517', '#8a5cc2', '#d9dcf0', '#1d9e75', '#d85a30']
  const list: Px[] = [[92, 9, 20, 35, '#4a3328'], [93, 10, 18, 33, '#2a1f22']]
  for (const shelfY of [18, 27, 36]) {
    let x = 93
    while (x < 110) {
      const w = 1 + Math.floor(rnd() * 2)
      const h = 5 + Math.floor(rnd() * 3)
      if (rnd() < 0.12) {
        x += 2
        continue
      }
      const c = colors[Math.floor(rnd() * colors.length)]!
      list.push([x, shelfY - h, w, h, c], [x, shelfY - h, w, 1, '#ffffff33'])
      x += w
    }
    list.push([92, shelfY, 20, 1, '#6b4a35'])
  }
  list.push([92, 9, 20, 1, '#6b4a35'], [92, 43, 20, 1, '#3b2a2a'])
  list.push([106, 13, 2, 3, '#ffc845'], [105, 16, 4, 1, '#ba7517'])
  list.push([99, 6, 5, 3, '#b8373a'], [98, 2, 2, 4, '#3f8a5a'], [101, 1, 2, 5, '#4fa36a'], [103, 3, 2, 3, '#2f6e4c'])
  return draw(list)
}

function breakArea(): string {
  const list: Px[] = [
    // 咖啡吧台
    [118, 36, 19, 8, '#5a3a2a'], [117, 35, 21, 1, '#83603f'], [127, 37, 1, 6, '#4a3328'],
    [124, 39, 1, 1, '#ffc845'], [130, 39, 1, 1, '#ffc845'],
    [120, 25, 9, 10, '#444441'], [120, 25, 9, 1, '#5f5e5a'], [121, 27, 4, 2, '#0e1030'], [122, 28, 2, 1, '#5fb3b8'],
    [123, 31, 2, 1, '#2c2c2a'], [123, 33, 2, 2, '#eef0ff'],
    // 飲水機
    [131, 25, 5, 5, '#5fb3b8'], [131, 25, 5, 1, '#9fe1cb'], [131, 30, 5, 5, '#d9dcf0'], [132, 32, 1, 1, '#378add'], [134, 32, 1, 1, '#e24b4a'],
    // 廁所門
    [139, 15, 18, 29, '#2e2538'], [140, 16, 16, 28, '#4a3328'], [142, 18, 12, 10, '#3b2a2a'], [142, 30, 12, 12, '#3b2a2a'],
    [140, 16, 1, 28, '#5a3e30'], [153, 30, 1, 1, '#ffc845'],
    [143, 9, 10, 5, '#d9dcf0'], [144, 10, 2, 3, '#378add'], [148, 9, 1, 5, '#888780'], [150, 10, 2, 3, '#e24b4a'],
    // 盆栽
    [86, 38, 4, 6, '#b8373a'], [86, 38, 4, 1, '#d0545a'], [85, 31, 2, 7, '#2f6e4c'], [88, 30, 2, 8, '#3f8a5a'], [87, 33, 2, 5, '#24563f'], [90, 33, 1, 4, '#4fa36a'],
  ]
  const steam = [0, 1, 2]
    .map(i => `<rect x="${123 + (i % 2)}" y="31" width="1" height="1" fill="#d9dcf0" class="stm" style="animation-delay:-${i * 0.7}s"/>`)
    .join('')
  const blink = `<rect x="127" y="27" width="1" height="1" fill="#e24b4a" class="twk"/>`
  const doorLight = `<rect x="140" y="43" width="16" height="1" fill="#ffd27a" opacity="0.5"/>`
  return draw(list) + steam + blink + doorLight
}

function lounge(): string {
  return draw([
    [122, 90, 38, 6, '#5c2a2e'], [122, 90, 38, 1, '#7a3b3b'], [124, 92, 34, 1, '#6a3238'],
    [128, 77, 30, 7, '#2c5585'], [128, 77, 30, 1, '#3d6fa8'], [142, 78, 1, 6, '#24497a'],
    [128, 84, 30, 4, '#3a6ea5'], [128, 84, 30, 1, '#4a80b8'], [128, 88, 30, 2, '#2c5585'],
    [125, 79, 4, 11, '#24497a'], [125, 79, 4, 1, '#3d6fa8'], [157, 79, 4, 11, '#24497a'], [157, 79, 4, 1, '#3d6fa8'],
    [126, 90, 2, 2, '#1c1a2e'], [158, 90, 2, 2, '#1c1a2e'],
    [150, 80, 5, 4, '#fac775'], [150, 80, 5, 1, '#ffd99a'],
    // 邊桌與檯燈
    [116, 84, 8, 1, '#83603f'], [117, 85, 1, 7, '#4a3328'], [122, 85, 1, 7, '#4a3328'],
    [119, 80, 2, 4, '#2e2538'], [117, 76, 6, 4, '#fac775'], [117, 76, 6, 1, '#ffe0a0'],
  ])
}

/** 白天吊燈關著，其他時段亮著 */
const lampsOn = (env: Env) => env.phase !== 'day' && !lateNow

function ceilingLamps(env: Env): string {
  const bulb = lampsOn(env) ? '#ffd27a' : '#5f5e5a'
  return [24, 66, 104].map(x => draw([[x, 0, 1, 3, '#14152f'], [x - 3, 3, 7, 2, '#2e2538'], [x - 3, 3, 7, 1, '#3b3350'], [x - 1, 5, 3, 1, bulb]])).join('')
}

/** 窗光的顏色與強度：白天最亮、深夜是淡淡的月光 */
const WINDOW_LIGHT: Record<Phase, { color: string; opacity: number }> = {
  dawn: { color: '#f4c0d1', opacity: 0.07 },
  day: { color: '#ffe9a8', opacity: 0.13 },
  dusk: { color: '#ffb347', opacity: 0.09 },
  night: { color: '#9fa6e8', opacity: 0.05 },
}

/** 整間房間的色調：白天偏暖亮、黃昏偏橘、清晨偏粉 */
const ROOM_TINT: Record<Phase, { color: string; opacity: number } | undefined> = {
  dawn: { color: '#f4a0c0', opacity: 0.07 },
  day: { color: '#fff6d8', opacity: 0.12 },
  dusk: { color: '#ff9a4a', opacity: 0.08 },
  night: undefined,
}

/** 光線：吊燈的光錐、窗光、檯燈，三階亮度疊起來；跟著時段與天氣變 */
function lighting(env: Env): string {
  const cones = lampsOn(env)
    ? [24, 66, 104]
      .map(x =>
        `<polygon points="${x - 3},6 ${x + 4},6 ${x + 20},${H} ${x - 19},${H}" fill="#ffd27a" opacity="0.035"/>` +
        `<polygon points="${x - 2},6 ${x + 3},6 ${x + 11},${H} ${x - 10},${H}" fill="#ffd27a" opacity="0.03"/>` +
        `<ellipse cx="${x + 0.5}" cy="78" rx="16" ry="3" fill="#ffd27a" opacity="0.04"/>`)
      .join('')
    : ''
  const light = WINDOW_LIGHT[env.phase]
  const dim = env.weather === 'clear' ? 1 : env.weather === 'storm' ? 0.4 : 0.65
  const windowLight =
    `<polygon points="6,46 30,46 46,72 22,72" fill="${light.color}" opacity="${n(light.opacity * dim)}"/>` +
    (env.phase === 'day' ? `<polygon points="8,46 28,46 40,66 20,66" fill="${light.color}" opacity="${n(0.06 * dim)}"/>` : '')
  const lamp = lampsOn(env) ? [14, 10, 6].map(r => `<circle cx="120" cy="79" r="${r}" fill="#ffd27a" opacity="0.06"/>`).join('') : ''
  const coffee = [8, 5].map(r => `<circle cx="125" cy="30" r="${r}" fill="#5fb3b8" opacity="0.05"/>`).join('')
  const moteColor = env.phase === 'day' ? '#fff6d8' : '#ffe9a8'
  const motes = [0, 1, 2, 3, 4]
    .map(i => {
      const x = [20, 28, 62, 70, 101][i]!
      return `<rect x="${x}" y="20" width="1" height="1" fill="${moteColor}" opacity="0.5"><animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 3 : -3} 30;0 60" dur="${14 + i * 3}s" begin="-${i * 4}s" repeatCount="indefinite"/></rect>`
    })
    .join('')
  const tint = ROOM_TINT[env.phase]
  const tintRect = tint ? `<rect width="${W}" height="${H}" fill="${tint.color}" opacity="${tint.opacity}"/>` : ''
  const gloom = env.weather === 'storm' ? `<rect width="${W}" height="${H}" fill="#000" opacity="0.1"/>` : ''
  const flash = env.weather === 'storm'
    ? `<rect width="${W}" height="${H}" fill="#cfd6ff" opacity="0"><animate attributeName="opacity" values="0;0;0.1;0;0.06;0" keyTimes="0;0.9;0.905;0.912;0.92;1" dur="17s" repeatCount="indefinite"/></rect>`
    : ''
  const vignette = `<rect width="${W}" height="4" fill="#000" opacity="0.18"/><rect y="${H - 3}" width="${W}" height="3" fill="#000" opacity="0.15"/>`
  return cones + windowLight + lamp + coffee + motes + tintRect + gloom + flash + vignette
}

/* ---------- 座位 ---------- */

function chair(): string {
  return draw([
    [28, 17, 2, 10, '#3b3350'], [28, 17, 1, 10, '#4a4263'],
    [29, 25, 7, 2, '#3b3350'], [29, 25, 7, 1, '#4a4263'],
    [32, 27, 1, 4, '#2e2538'], [29, 31, 7, 1, '#2e2538'], [29, 32, 1, 1, '#1c1a2e'], [35, 32, 1, 1, '#1c1a2e'],
  ])
}

function deskBase(): Px[] {
  return [
    [34, 32, 26, 1, 'rgba(0,0,0,0.3)'],
    [34, 25, 26, 2, '#6b4a35'], [34, 25, 26, 1, '#83603f'], [38, 26, 3, 1, '#5e4334'], [49, 26, 4, 1, '#5e4334'],
    [34, 27, 26, 1, '#4a3328'], [35, 28, 2, 4, '#4a3328'], [50, 28, 7, 4, '#5a3a2a'], [50, 28, 7, 1, '#6b4a35'], [53, 30, 2, 1, '#ffc845'],
  ]
}

const monitor: Px[] = [
  [49, 22, 2, 3, '#2e2538'], [47, 24, 6, 1, '#2e2538'],
  [43, 14, 14, 9, '#1e1a2b'], [43, 14, 14, 1, '#2e2a40'],
]

const keyboard: Px[] = [[40, 24, 7, 1, '#888780'], [41, 24, 1, 1, '#b4b2a9'], [43, 24, 1, 1, '#b4b2a9'], [45, 24, 1, 1, '#b4b2a9']]

const mug = (x: number): Px[] => [[x, 22, 2, 3, '#d9dcf0'], [x + 2, 23, 1, 1, '#d9dcf0'], [x, 22, 2, 1, '#6b4a35']]

const lines = (rows: readonly (readonly [number, number, number, string])[]) =>
  rows.map(([x, y, w, c], i) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}" class="ln" style="animation-delay:${n(i * 0.3)}s"/>`).join('')

const saver = () =>
  draw([[44, 15, 12, 7, '#0b0c22']]) +
  `<g>${draw([[45, 16, 1, 1, '#ffc845']])}<animateTransform attributeName="transform" type="translate" values="0 0;9 4;4 5;10 1;0 0" dur="6s" repeatCount="indefinite"/></g>`

const glow = '<rect x="37" y="11" width="8" height="13" fill="#5fb3b8" opacity="0.07"/><rect x="35" y="9" width="24" height="17" fill="#5fb3b8" opacity="0.04"/>'

const steamOn = (x: number) =>
  [0, 1].map(i => `<rect x="${x + i}" y="21" width="1" height="1" fill="#d9dcf0" class="stm" style="animation-delay:-${i * 0.8}s"/>`).join('')

/** 桌上的道具與螢幕，工作中與閒置不同 */
function deskProps(role: RoleId, isWorking: boolean): string {
  switch (role) {
    case 'engineer':
      return draw([...monitor, ...keyboard, ...mug(57), [54, 23, 2, 2, '#ffc845'], [56, 24, 1, 1, '#d85a30'], [55, 23, 1, 1, '#1c1a2e']]) +
        (isWorking
          ? draw([[44, 15, 12, 7, '#0e1030']]) + lines([[45, 16, 6, '#5fb3b8'], [46, 17, 7, '#ffb347'], [46, 18, 4, '#9da3d8'], [45, 19, 8, '#5fb3b8'], [46, 20, 5, '#9da3d8']]) +
            `<rect x="52" y="20" width="1" height="1" fill="#eef0ff" class="blink"/>` + glow + steamOn(57)
          : saver())
    case 'planner':
      return draw([...monitor, ...keyboard, ...mug(57), [53, 21, 5, 4, '#e8e4d8'], [53, 22, 5, 1, '#b4b2a9'],
        [43, 4, 3, 3, '#fac775'], [47, 5, 3, 3, '#f4c0d1'], [51, 4, 3, 3, '#9fe1cb'], [44, 4, 1, 1, '#e24b4a'], [48, 5, 1, 1, '#e24b4a'], [52, 4, 1, 1, '#e24b4a']]) +
        (isWorking
          ? draw([[44, 15, 12, 7, '#e8e4d8'], [45, 16, 6, 1, '#3c3489']]) + lines([[45, 18, 9, '#5f5e5a'], [45, 19, 7, '#5f5e5a'], [45, 20, 9, '#5f5e5a']]) + glow
          : saver())
    case 'art': {
      const easel: Px[] = [[44, 22, 1, 3, '#6b4a35'], [53, 22, 1, 3, '#6b4a35'], [42, 8, 13, 15, '#6b4a35'], [43, 9, 11, 13, '#e8e4d8'],
        [55, 24, 4, 1, '#cfc8b8'], [55, 24, 1, 1, '#e24b4a'], [57, 24, 1, 1, '#378add'], [58, 24, 1, 1, '#ffc845'],
        [57, 20, 2, 4, '#9fc2e8'], [57, 18, 1, 2, '#6b4a35'], [58, 17, 1, 3, '#6b4a35']]
      const strokes: [number, number, number, number, string][] = [
        [44, 10, 9, 5, '#28265a'], [50, 11, 2, 2, '#d9dcf0'], [44, 15, 9, 2, '#3f8a5a'], [45, 17, 7, 2, '#2f6e4c'], [47, 13, 3, 3, '#d85a30'], [44, 19, 9, 2, '#5c2a2e'],
      ]
      return draw(easel) + (isWorking
        ? strokes.map(([x, y, w, h, c], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" class="pnt" style="animation-delay:${n(i * 0.8)}s"/>`).join('')
        : draw(strokes.map(([x, y, w, h, c]) => [x, y, w, h, c] as Px)))
    }
    case 'reviewer':
      return draw([...monitor, [52, 20, 6, 5, '#e8e4d8'], [52, 21, 6, 1, '#b4b2a9'], [53, 19, 5, 1, '#d9dcf0'], [39, 24, 8, 1, '#eef0ff'], [40, 24, 3, 1, '#b4b2a9'], [58, 24, 2, 1, '#e24b4a']]) +
        (isWorking
          ? draw([[44, 15, 12, 7, '#0e1030']]) + lines([[45, 16, 7, '#97c459'], [45, 17, 5, '#f09595'], [45, 18, 8, '#97c459'], [45, 19, 6, '#9da3d8'], [45, 20, 4, '#f09595']]) +
            `<rect x="44" y="24" width="2" height="1" fill="#e24b4a" class="stamp"/>` + glow
          : saver())
    case 'qa':
      return draw([...monitor, [55, 21, 3, 4, '#9fc2e8'], [55, 21, 3, 1, '#cfe3f5'], [56, 23, 1, 1, '#3f8a5a'], ...(isWorking ? [] : ([[41, 24, 4, 1, '#5f5e5a']] as Px[]))]) +
        (isWorking
          ? draw([[44, 15, 12, 7, '#121535'], [44, 20, 12, 2, '#3f8a5a'], [44, 20, 12, 1, '#4fa36a'], [50, 16, 1, 1, '#d9dcf0']]) +
            `<g>${draw([[46, 18, 1, 2, '#ffc845']])}<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="0.7s" repeatCount="indefinite"/></g>` +
            `<g>${draw([[53, 19, 2, 1, '#e24b4a']])}<animateTransform attributeName="transform" type="translate" values="0 0;-4 0;0 0" dur="3s" repeatCount="indefinite"/></g>` + glow
          : saver())
    case 'producer':
      return draw([...monitor, ...mug(57), [52, 23, 4, 2, '#1e1a2b'], [53, 23, 1, 1, '#5fb3b8'], ...(isWorking ? [] : ([[52, 22, 4, 1, '#2e2538']] as Px[]))]) +
        (isWorking
          ? draw([[44, 15, 12, 7, '#0e1030'], [45, 16, 3, 1, '#ba7517'], [49, 16, 3, 1, '#185fa5'], [53, 16, 2, 1, '#3b6d11'],
              [45, 18, 3, 1, '#fac775'], [49, 18, 3, 1, '#85b7eb'], [53, 18, 2, 1, '#97c459'], [45, 20, 3, 1, '#fac775'], [53, 20, 2, 1, '#97c459']]) + glow + steamOn(57)
          : saver())
  }
}

/* ---------- 角色時間軸 ---------- */

/** 頭上名字標籤開關，每次產生場景時設定 */
let tagsOn = true

/** 深夜加班（23 點到 5 點有人在工作）：吊燈關掉，工作中的人桌上點檯燈 */
let lateNow = false

/** 正在等總經理批准的座位 */
let askingNow: Partial<Record<RoleId, boolean>> = {}

/** 等批准時：一隻手舉高、頭上冒問號、桌上紅燈閃 */
function raisedHand(role: RoleId): string {
  const look = LOOKS[role]
  return draw([[29, 7, 2, 11, look.shirt], [29, 6, 2, 1, look.skin], [37, 1, 7, 7, '#eef0ff'], [38, 8, 1, 1, '#eef0ff'],
    [39, 2, 3, 1, '#e24b4a'], [41, 3, 1, 1, '#e24b4a'], [40, 4, 1, 1, '#e24b4a'], [40, 6, 1, 1, '#e24b4a']]) +
    `<g class="blink"><rect x="55" y="19" width="2" height="2" fill="#e24b4a"/><circle cx="56" cy="20" r="4" fill="#e24b4a" opacity="0.18"/></g>`
}

/** 深夜加班的桌上檯燈 */
const deskLamp = () =>
  draw([[57, 24, 3, 1, '#2e2538'], [58, 19, 1, 5, '#2e2538'], [56, 17, 4, 2, '#ffc845'], [56, 17, 4, 1, '#ffe0a0']]) +
  [12, 8, 5].map(r => `<circle cx="57" cy="21" r="${r}" fill="#ffd27a" opacity="0.07"/>`).join('')

/** 頭上的名字標籤（<defs> 裡的 xN），以 (x, y) 為中心 */
const tag = (id: string, x: number, y: number) => (tagsOn ? `<use href="#${id}N" x="${x}" y="${y}"/>` : '')

const use = (id: string, cls = '') => `<use href="#${id}"${cls ? ` class="${cls}"` : ''}/>`

const Z_GLYPH: Px[] = [[0, 0, 5, 1, '#eef0ff'], [3, 1, 1, 1, '#eef0ff'], [2, 2, 1, 1, '#eef0ff'], [1, 3, 1, 1, '#eef0ff'], [0, 4, 5, 1, '#eef0ff']]

const zzz = () =>
  [0, 1, 2]
    .map(i => {
      const begin = `${n(i * 1.1)}s`
      return `<g opacity="0">${draw(Z_GLYPH)}` +
        `<animateTransform attributeName="transform" type="translate" from="42 13" to="37 0" dur="3.3s" begin="${begin}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;1;1;0" dur="3.3s" begin="${begin}" repeatCount="indefinite"/></g>`
    })
    .join('')

const bubble = () =>
  draw([[38, 2, 11, 6, '#eef0ff'], [37, 3, 1, 4, '#eef0ff'], [49, 3, 1, 4, '#eef0ff'], [39, 8, 2, 1, '#eef0ff'], [38, 9, 1, 1, '#eef0ff']]) +
  [0, 1, 2].map(i => `<rect x="${40 + i * 3}" y="4" width="2" height="2" fill="#28265a" class="ln" style="animation-delay:${n(i * 0.3)}s"/>`).join('')

const alert = () => draw([[39, 0, 2, 5, '#ffc845'], [39, 6, 2, 2, '#ffc845'], [38, 0, 1, 5, '#ba7517']])

type Layers = { legs: string[]; body: string[]; top: string[] }

/** 走一趟路：外層控制可見時間，中層沿路平移，內層往左走時翻面 */
function walkSeg(id: string, walk: Walk, dur: number, begin: number, repeat: boolean): string {
  const first = walk.pts[0]!
  const last = walk.pts[walk.pts.length - 1]!
  const flip = last.x < first.x ? ' transform="matrix(-1 0 0 1 6 0)"' : ''
  return `<g opacity="${walk.t0 <= 0 ? 1 : 0}">${win(walk.t0, walk.t1, dur, begin, repeat)}<g>${moveAlong(walk.pts, walk.times, dur, begin, repeat)}` +
    `${tag(id, 3, -25)}<g${flip}>${use(id + 'S0', 'fa')}${use(id + 'S1', 'fb')}</g></g></g>`
}

function idleLayers(role: RoleId, seat: Seat, now: number): Layers {
  const id = ID[role]
  const segs = idleTimeline(role, seat.idleSeed)
  const begin = -(((now - seat.since) / 1000) % CYCLE)
  const out: Layers = { legs: [], body: [], top: [] }
  const shown = (s: Seg, inner: string) => `<g opacity="${s.t0 <= 0 ? 1 : 0}">${win(s.t0, s.t1, CYCLE, begin)}${inner}</g>`
  for (const s of segs) {
    switch (s.kind) {
      case 'desk':
        out.legs.push(shown(s, use(id + 'L')))
        if (s.pose === 'sleep') out.body.push(shown(s, use(id + 'Z') + zzz() + tag(id, 36, 14)))
        else out.body.push(shown(s, use(id + 'B') + use(id + (s.pose === 'sit' ? 'P' : 'T')) + tag(id, 34, 6)))
        break
      case 'walk':
        out.top.push(walkSeg(id, s, CYCLE, begin, true))
        break
      case 'drink': {
        const at = coffeeSpot(role)
        out.top.push(shown(s, `<g transform="translate(${at.x} ${at.y})">${tag(id, 3, -25)}<g transform="matrix(-1 0 0 1 6 0)">${use(id + 'D0', 'sa')}${use(id + 'D1', 'sb')}</g></g>`))
        break
      }
      case 'sofa': {
        const at = sofaSpot(role)
        out.top.push(shown(s, `<g transform="translate(${at.x - 31} ${at.y - 35})">${use(id + 'L')}${use(id + 'B')}${use(id + 'P')}${tag(id, 34, 6)}</g>`))
        break
      }
      case 'gone':
        break
    }
  }
  return out
}

/** 定格畫面：算出每個人「此刻」的姿勢與位置，不帶任何動畫 */
function stillLayers(role: RoleId, seat: Seat, now: number): Layers {
  const id = ID[role]
  const out: Layers = { legs: [], body: [], top: [] }
  const standAt = (p: Pt, isFacingLeft: boolean, sprite = 'S0') =>
    `<g transform="translate(${n(p.x)} ${n(p.y)})">${tag(id, 3, -25)}<g${isFacingLeft ? ' transform="matrix(-1 0 0 1 6 0)"' : ''}>${use(id + sprite)}</g></g>`
  const facesLeft = (w: Walk) => w.pts[w.pts.length - 1]!.x < w.pts[0]!.x
  const elapsed = (now - seat.since) / 1000

  if (seat.isWorking) {
    const arrival = seat.arrival
    if (arrival && !arrival.isAtDesk) {
      const walk = walks(route(arrival, standPoint(role)), 0)
      if (elapsed < walk.t1) {
        out.top.push(standAt(pointOn(walk, elapsed), facesLeft(walk)))
        return out
      }
    }
    out.legs.push(use(id + 'L'))
    out.body.push(askingNow[role]
      ? use(id + 'B') + raisedHand(role) + tag(id, 30, 6)
      : use(id + 'B') + use(id + 'W0') + tag(id, role === 'producer' ? 30 : 34, 6) + (role === 'producer' ? bubble() : ''))
    return out
  }

  const t = ((elapsed % CYCLE) + CYCLE) % CYCLE
  const s = idleTimeline(role, seat.idleSeed).find(seg => t >= seg.t0 && t < seg.t1)
  if (!s) return out
  switch (s.kind) {
    case 'desk':
      out.legs.push(use(id + 'L'))
      out.body.push(s.pose === 'sleep'
        ? use(id + 'Z') + `<g transform="translate(40 8)">${draw(Z_GLYPH)}</g>` + tag(id, 36, 14)
        : use(id + 'B') + use(id + (s.pose === 'sit' ? 'P' : 'T')) + tag(id, 34, 6))
      break
    case 'walk':
      out.top.push(standAt(pointOn(s, t), facesLeft(s)))
      break
    case 'drink':
      out.top.push(standAt(coffeeSpot(role), true, 'D0'))
      break
    case 'sofa': {
      const at = sofaSpot(role)
      out.top.push(`<g transform="translate(${at.x - 31} ${at.y - 35})">${use(id + 'L')}${use(id + 'B')}${use(id + 'P')}${tag(id, 34, 6)}</g>`)
      break
    }
    case 'gone':
      break
  }
  return out
}

function workLayers(role: RoleId, seat: Seat, now: number): Layers {
  const id = ID[role]
  const elapsed = (now - seat.since) / 1000
  const out: Layers = { legs: [], body: [], top: [] }
  const extra = role === 'producer' ? bubble() : ''
  const working = askingNow[role]
    ? use(id + 'B') + raisedHand(role) + tag(id, 30, 6)
    : use(id + 'B') + use(id + 'W0', 'fa') + use(id + 'W1', 'fb') + tag(id, role === 'producer' ? 30 : 34, 6) + extra
  const arrival = seat.arrival
  if (arrival && !arrival.isAtDesk) {
    const walk = walks(route(arrival, standPoint(role)), 0)
    const walkEnd = walk.t1
    const total = walkEnd + 0.1
    if (elapsed < total) {
      const begin = -elapsed
      out.top.push(walkSeg(id, walk, total, begin, false))
      const seated = (inner: string) => `<g opacity="0">${win(walkEnd, total, total, begin, false)}${inner}</g>`
      out.legs.push(seated(use(id + 'L')))
      out.body.push(seated(working))
      return out
    }
  }
  out.legs.push(use(id + 'L'))
  out.body.push(working)
  if (arrival?.isAtDesk && elapsed < 1.6) {
    out.body.push(`<g>${alert()}${win(0, 1.5, 1.6, -elapsed, false)}</g>`)
  }
  return out
}

/* ---------- 組合 ---------- */

const STYLE = `<style>
.fa{animation:fa .28s steps(1) infinite}.fb{animation:fb .28s steps(1) infinite}
.sa{animation:fa 2.6s steps(1) infinite}.sb{animation:fb 2.6s steps(1) infinite}
@keyframes fa{0%{opacity:1}50%{opacity:0}}@keyframes fb{0%{opacity:0}50%{opacity:1}}
.ln{animation:ln 1.8s steps(1) infinite}@keyframes ln{0%{opacity:.3}25%{opacity:1}}
.pnt{animation:pnt 4.8s steps(1) infinite}@keyframes pnt{0%{opacity:0}17%{opacity:1}}
.blink{animation:fa 1s steps(1) infinite}
.twk{animation:twk 6s steps(1) infinite}@keyframes twk{0%{opacity:1}70%{opacity:.25}85%{opacity:1}}
.stamp{animation:stamp 3s steps(1) infinite}@keyframes stamp{0%{opacity:0}60%{opacity:1}}
.stm{animation:stm 2.1s linear infinite}@keyframes stm{0%{transform:translateY(0);opacity:.8}100%{transform:translateY(-6px);opacity:0}}
.sec{transform-box:view-box;transform-origin:40px 13px;animation:sec 60s steps(60) infinite}@keyframes sec{to{transform:rotate(360deg)}}
.ring{animation:ring .2s steps(2) infinite}
.zz{animation:zz 2.4s steps(4) infinite}@keyframes zz{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-3px);opacity:0}}@keyframes ring{0%{transform:translateX(0)}50%{transform:translateX(1px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`

/* ---------- 一次性特效：紙飛機、審查文件、煙火、咖啡杯 ---------- */

/** 座位上螢幕附近的點（全場景座標） */
const deskPoint = (role: RoleId, dx = 48, dy = 14): Pt => ({ x: DESKS[role].ox - 28 + dx, y: DESKS[role].base - 32 + dy })

/** 只播一次的飛行物：沿 pts 飛，飛完消失 */
function flight(sprite: string, pts: Pt[], times: number[], elapsed: number, flip: boolean): string {
  const end = times[times.length - 1]!
  const total = end + 0.1
  if (elapsed >= total) return ''
  const begin = -elapsed
  return `<g>${win(0, end, total, begin, false)}<g>${moveAlong(pts, times, total, begin, false)}` +
    `<g${flip ? ' transform="matrix(-1 0 0 1 4 0)"' : ''}>${sprite}</g></g></g>`
}

const arc = (a: Pt, b: Pt, lift: number): Pt[] => [a, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift }, b]

/** 派工：製作人桌上射出一架紙飛機，飛到上工的人桌上 */
function paperPlanes(seats: Record<RoleId, Seat>, now: number): string {
  const plane = draw([[0, 0, 4, 1, '#eef0ff'], [1, 1, 3, 1, '#b4b2a9'], [3, -1, 1, 1, '#eef0ff']])
  return ROLES.filter(r => r !== 'producer' && seats[r].isWorking)
    .map(role => {
      const from = deskPoint('producer', 46, 10)
      const to = deskPoint(role, 46, 10)
      return flight(plane, arc(from, to, 14), [0, 0.8, 1.6], (now - seats[role].since) / 1000, to.x < from.x)
    })
    .join('')
}

/** 審查結果：文件蓋章後飛走，退件飛回工程師桌上，通過飛到製作人桌上 */
function reviewFlight(review: Review, now: number): string {
  if (review.kind === 'none') return ''
  const elapsed = (now - review.at) / 1000
  const ink = review.kind === 'reject' ? '#e24b4a' : '#639922'
  const doc = draw([[0, 0, 4, 5, '#eef0ff'], [1, 1, 2, 1, '#b4b2a9'], [1, 2, 2, 1, '#b4b2a9'], [2, 3, 2, 2, ink]])
  const from = deskPoint('reviewer', 40, 18)
  const to = review.kind === 'reject' ? deskPoint('engineer', 40, 18) : deskPoint('producer', 40, 18)
  const stamp = elapsed < 1.2
    ? `<g>${win(0, 1, 1.2, -elapsed, false)}${draw([[from.x - 1, from.y - 1, 6, 7, ink]], ' opacity="0.8"')}</g>`
    : ''
  return stamp + flight(doc, [from, from, ...arc(from, to, 12).slice(1)], [0, 0.9, 1.7, 2.5], elapsed, to.x < from.x)
}

/** 有任務卡完成：窗外放三發煙火 */
function fireworks(doneAt: number, now: number): string {
  const elapsed = (now - doneAt) / 1000
  if (elapsed > 6) return ''
  const bursts: [number, number, string, number][] = [[13, 11, '#ffc845', 0], [24, 9, '#f09595', 0.9], [18, 14, '#9fe1cb', 1.8]]
  const parts = bursts.map(([cx, cy, color, start]) => {
    const begin = n(start - elapsed)
    const sparks = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]
      .map(([dx, dy]) =>
        `<rect width="1" height="1" fill="${color}" opacity="0">` +
        `<animateTransform attributeName="transform" type="translate" from="${cx} ${cy}" to="${n(cx + dx! * 5)} ${n(cy + dy! * 5)}" dur="1.1s" begin="${begin}s" fill="freeze"/>` +
        `<animate attributeName="opacity" values="1;1;0" dur="1.1s" begin="${begin}s" fill="freeze"/></rect>`)
      .join('')
    const rocket = `<rect width="1" height="2" fill="#ffe9a8" opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" from="${cx} 28" to="${cx} ${cy}" dur="0.5s" begin="${n(start - 0.5 - elapsed)}s" fill="freeze"/>` +
      `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.95;1" dur="0.5s" begin="${n(start - 0.5 - elapsed)}s" fill="freeze"/></rect>`
    return rocket + sparks
  })
  return `<g clip-path="url(#cWin)">${parts.join('')}</g>`
}

/** 咖啡杯疊在桌子右邊的地上，每 25 萬 token 一杯，最多 4 杯 */
const cupStack = (count: number): string =>
  draw(Array.from({ length: Math.min(4, count) }, (_, i): Px[] => [
    [60, 29 - i * 3, 2, 3, '#d9dcf0'], [60, 29 - i * 3, 2, 1, '#6b4a35'], [62, 30 - i * 3, 1, 1, '#d9dcf0'],
  ]).flat())

/**
 * 總經理來訪：你送出訊息時，總經理從左邊走進來，站到製作人桌前講幾句，再走出去；
 * 製作人的電話同時響起。全程約 11 秒，只播一次。
 */
const BOSS_VISIT = { enter: 2.4, leave: 8.5, gone: 10.9 }

function bossVisit(bossAt: number, now: number): string {
  const elapsed = (now - bossAt) / 1000
  const total = BOSS_VISIT.gone + 0.1
  if (bossAt <= 0 || elapsed >= total) return ''
  const begin = -elapsed
  const door: Pt = { x: -8, y: 94 }
  const desk: Pt = { x: 36, y: 94 }
  const body = (flip: boolean) =>
    `${tagsOn ? '<use href="#kN" x="3" y="-25"/>' : ''}<g${flip ? ' transform="matrix(-1 0 0 1 6 0)"' : ''}><use href="#kS0" class="fa"/><use href="#kS1" class="fb"/></g>`
  const segment = (t0: number, t1: number, from: Pt, to: Pt, flip: boolean, inner = body(flip)) =>
    `<g opacity="${t0 <= 0 ? 1 : 0}">${win(t0, t1, total, begin, false)}<g>${moveAlong([from, to], [t0, t1], total, begin, false)}${inner}</g></g>`
  // 站著講話：不用走路的兩格動畫，只用第一格，頭上冒「…」
  const talking = `${tagsOn ? '<use href="#kN" x="3" y="-25"/>' : ''}<g transform="matrix(-1 0 0 1 6 0)"><use href="#kS0"/></g>` +
    draw([[-7, -37, 9, 5, '#eef0ff'], [-2, -32, 2, 1, '#eef0ff']]) +
    [0, 1, 2].map(i => `<rect x="${-6 + i * 3}" y="-35" width="1" height="1" fill="#28265a" class="ln" style="animation-delay:${n(i * 0.3)}s"/>`).join('')
  // 電話響：製作人桌上的電話抖動，冒出兩個音符
  const phone = elapsed < 2.5
    ? `<g>${win(0, 2.4, 2.5, begin, false)}<g class="ring">${draw([[28, 78, 1, 2, '#ffd27a'], [29, 77, 2, 1, '#ffd27a'], [32, 76, 1, 2, '#ffd27a'], [33, 75, 2, 1, '#ffd27a']])}</g></g>`
    : ''
  return phone +
    segment(0, BOSS_VISIT.enter, door, desk, false) +
    segment(BOSS_VISIT.enter, BOSS_VISIT.leave, desk, desk, true, talking) +
    segment(BOSS_VISIT.leave, BOSS_VISIT.gone, desk, door, true)
}

export type Effects = { cups: Record<RoleId, number>; review: Review; doneAt: number; bossAt: number; asking: Partial<Record<RoleId, boolean>> }

/** 桌前掛的名牌：左邊一條角色代表色，中間寫職稱 */
function nameplate(role: RoleId): string {
  return draw([[39, 28, 11, 5, '#83603f'], [40, 29, 9, 3, '#1e1a2b'], [40, 29, 1, 3, LOOKS[role].shirt]]) +
    `<text x="45" y="31.4" font-size="2.8" text-anchor="middle" fill="#eef0ff" font-family="Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif">${NAMES[role]}</text>`
}

/**
 * 產生整間辦公室。still 為 true 時是「此刻的定格畫面」：沒有任何動畫，
 * 拿來墊在動畫圖底下，動畫圖重新載入的那一下看到的就是同一個畫面。
 */
export function officeSvg(seats: Record<RoleId, Seat>, board: Board, fx: Effects, now: number, still = false, showTags = true): string {
  tagsOn = showTags
  askingNow = fx.asking
  const hour = new Date(now).getHours()
  lateNow = (hour >= 23 || hour < 5) && ROLES.some(r => seats[r].isWorking)
  const defs = ROLES.map(characterDefs).join('')
  const top: string[] = []
  const stations = (row: readonly RoleId[]) =>
    row
      .map(role => {
        const seat = seats[role]
        const { ox, base } = DESKS[role]
        const layers = still ? stillLayers(role, seat, now) : seat.isWorking ? workLayers(role, seat, now) : idleLayers(role, seat, now)
        top.push(...layers.top)
        return `<g transform="translate(${ox - 28} ${base - 32})"><title>${JOBS[role]}</title>${chair()}${layers.legs.join('')}${draw(deskBase())}` +
          `${nameplate(role)}${deskProps(role, seat.isWorking)}${cupStack(fx.cups[role])}${lateNow && seat.isWorking ? deskLamp() : ''}${layers.body.join('')}</g>`
      })
      .join('')
  const back = stations(['planner', 'engineer', 'art'])
  const backTop = top.splice(0).join('')
  const front = stations(['producer', 'reviewer', 'qa'])
  const effects = still ? '' : cat(seats, now) + paperPlanes(seats, now) + reviewFlight(fx.review, now) + bossVisit(fx.bossAt, now)
  const env = envAt(now)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" style="background:#28265a">` +
    `<defs>${patterns(env)}${defs}${still ? '' : bossDefs()}</defs>${still ? '' : STYLE}` +
    wall() + floor() + windowView(env) + (still ? '' : fireworks(fx.doneAt, now)) + clock(now, still) + corkboard(board) + bookshelf() + breakArea() + ceilingLamps(env) + lounge() +
    back + backTop + front + top.join('') + effects + lighting(env) +
    `</svg>`
  )
}

/* ---------- 辦公室貓 ---------- */

/**
 * 貓的一輪（60 秒，跟著牆上時鐘對齊，重畫也接得上）：
 * 從左邊沿走道走到一張「沒人在工作」的桌子，跳上去趴在鍵盤上睡覺，睡醒跳下來走回去，坐著舔毛。
 * 挑哪張桌子：每小時換一個起點，依序找第一張沒人在工作的桌子，所以有人上工時不會亂換。
 * 如果貓正睡在某人桌上、那個人被派工了，貓會嚇一跳衝出畫面，這一輪剩下的時間都不出現。
 */
const CAT_CYCLE = 60
const CAT = { walkIn: 10, jumpUp: 10.6, wake: 38, jumpDown: 38.6, walkOut: 50 }
const CAT_HOME: Pt = { x: 6, y: 95 }

const catBody = (frame: 0 | 1): Px[] => [
  [1, -4, 6, 3, '#1c1a2e'], [6, -6, 3, 3, '#1c1a2e'], [6, -7, 1, 1, '#1c1a2e'], [8, -7, 1, 1, '#1c1a2e'],
  [8, -5, 1, 1, '#ffc845'], [0, -6, 1, 3, '#1c1a2e'], [-1, -7, 1, 1, '#1c1a2e'],
  ...(frame === 0 ? ([[1, -1, 1, 1, '#1c1a2e'], [5, -1, 1, 1, '#1c1a2e']] as Px[]) : ([[2, -1, 1, 1, '#1c1a2e'], [6, -1, 1, 1, '#1c1a2e']] as Px[])),
]
const catSit: Px[] = [[2, -5, 4, 5, '#1c1a2e'], [4, -8, 3, 3, '#1c1a2e'], [4, -9, 1, 1, '#1c1a2e'], [6, -9, 1, 1, '#1c1a2e'], [6, -7, 1, 1, '#ffc845'], [0, -1, 3, 1, '#1c1a2e']]
/** 捲成一團睡覺，眼睛閉著 */
const catCurl: Px[] = [[0, -3, 7, 3, '#1c1a2e'], [5, -4, 3, 2, '#1c1a2e'], [5, -5, 1, 1, '#1c1a2e'], [7, -5, 1, 1, '#1c1a2e'], [6, -3, 2, 1, '#3b3350'], [-1, -2, 2, 1, '#1c1a2e']]

/** 貓睡在這張桌子的鍵盤上（全場景座標，貓的腳底） */
const catBed = (role: RoleId): Pt => ({ x: DESKS[role].ox - 28 + 41, y: DESKS[role].base - 7 })

/** 這個時刻貓會挑哪張桌子；沒有空桌就回 undefined */
function catTarget(seats: Record<RoleId, Seat>, now: number, alsoFree?: RoleId): RoleId | undefined {
  const start = Math.floor(now / 3600000) % ROLES.length
  for (let i = 0; i < ROLES.length; i++) {
    const role = ROLES[(start + i) % ROLES.length]!
    if (!seats[role].isWorking || role === alsoFree) return role
  }
  return undefined
}

function cat(seats: Record<RoleId, Seat>, now: number): string {
  const cycleTime = (t: number) => ((t / 1000) % CAT_CYCLE + CAT_CYCLE) % CAT_CYCLE
  const begin = -cycleTime(now)
  const walking = (flip: boolean) =>
    `<g${flip ? ' transform="matrix(-1 0 0 1 8 0)"' : ''}><g class="fa">${draw(catBody(0))}</g><g class="fb">${draw(catBody(1))}</g></g>`
  const seg = (t0: number, t1: number, from: Pt, to: Pt, inner: string, dur = CAT_CYCLE, b = begin, repeat = true) =>
    `<g opacity="${t0 <= 0 ? 1 : 0}">${win(t0, t1, dur, b, repeat)}<g>${moveAlong([from, to], [t0, t1], dur, b, repeat)}${inner}</g></g>`

  // 有人剛上工、貓那時正睡在他桌上：嚇跑
  let flee = ''
  let hiddenUntil = 0
  for (const role of ROLES) {
    const seat = seats[role]
    if (!seat.isWorking) continue
    const t = cycleTime(seat.since)
    const sinceStart = (now - seat.since) / 1000
    const wasAsleep = t >= CAT.jumpUp && t < CAT.wake && catTarget(seats, seat.since, role) === role
    if (!wasAsleep || sinceStart > CAT_CYCLE) continue
    const bed = catBed(role)
    const total = 1.6
    if (sinceStart < total) {
      flee = seg(0, 1.5, bed, { x: 170, y: 95 }, walking(false) + draw([[4, -12, 1, 3, '#ffc845'], [4, -8, 1, 1, '#ffc845']]), total, -sinceStart, false)
    }
    // 這一輪剩下的時間貓不出現，下一輪才從頭走進來
    hiddenUntil = Math.max(hiddenUntil, seat.since + (CAT_CYCLE - t) * 1000)
  }

  const target = catTarget(seats, now)
  let loop: string
  if (!target) {
    // 大家都在工作：貓只在走道上來回散步
    const far: Pt = { x: 100, y: 95 }
    loop = seg(0, 16, CAT_HOME, far, walking(false)) +
      `<g opacity="0">${win(16, 22, CAT_CYCLE, begin)}<g transform="translate(${far.x} ${far.y})">${draw(catSit)}</g></g>` +
      seg(22, 38, far, CAT_HOME, walking(true)) +
      `<g opacity="0">${win(38, 60, CAT_CYCLE, begin)}<g transform="translate(${CAT_HOME.x} ${CAT_HOME.y}) matrix(-1 0 0 1 8 0)">${draw(catSit)}</g></g>`
  } else {
    const bed = catBed(target)
    const below: Pt = { x: bed.x, y: 95 }
    const z = `<g class="zz">${draw([[8, -9, 3, 1, '#eef0ff'], [9, -8, 1, 1, '#eef0ff'], [8, -7, 3, 1, '#eef0ff']])}</g>`
    loop = seg(0, CAT.walkIn, CAT_HOME, below, walking(below.x < CAT_HOME.x)) +
      seg(CAT.walkIn, CAT.jumpUp, below, bed, `<g>${draw(catSit)}</g>`) +
      `<g opacity="0">${win(CAT.jumpUp, CAT.wake, CAT_CYCLE, begin)}<g transform="translate(${bed.x} ${bed.y})">${draw(catCurl)}${z}</g></g>` +
      seg(CAT.wake, CAT.jumpDown, bed, below, `<g>${draw(catSit)}</g>`) +
      seg(CAT.jumpDown, CAT.walkOut, below, CAT_HOME, walking(true)) +
      `<g opacity="0">${win(CAT.walkOut, CAT_CYCLE, CAT_CYCLE, begin)}<g transform="translate(${CAT_HOME.x} ${CAT_HOME.y})">${draw(catSit)}</g></g>`
  }
  if (hiddenUntil > now) {
    const wait = (hiddenUntil - now) / 1000
    loop = `<g opacity="0"><set attributeName="opacity" to="1" begin="${n(wait)}s" fill="freeze"/>${loop}</g>`
  }
  return flee + loop
}
