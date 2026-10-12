// 辦公室下方的團隊狀態面板，跟辦公室同一套雨夜像素風。160×96 像素格。
// 會動的東西全寫在圖裡：計時器是像素數字滾輪、閒置的人在做什麼依行程自己換、
// 工作中的進度條自己跑。只有 token 數字或狀態變了才需要換圖。

import type { Board, RoleId } from '../types'
import { headDef, ID, LOOKS, NAMES } from './characters'
import { draw, n, win, type Px } from './pixel'
import { CYCLE, idleLabels } from './timeline'
import { envAt, isWet, PHASE_NAMES, WEATHER_NAMES, type Env } from './weather'

const W = 160
const H = 96
const ROW_H = 11
const FONT = 'Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif'

export type StatusRow = {
  role: RoleId
  isWorking: boolean
  since: number
  idleSeed: number
  tokens: number
  /** 正在等總經理批准 */
  isAsking?: boolean
  task?: string
}

/* ---------- 像素數字 3×5 ---------- */

const GLYPHS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111']

function digitStrip(): string {
  const list: Px[] = []
  GLYPHS.forEach((bits, d) => {
    for (let i = 0; i < 15; i++) if (bits[i] === '1') list.push([i % 3, d * 6 + Math.floor(i / 3), 1, 1, '#eef0ff'])
  })
  return `<g id="dg">${draw(list)}</g>`
}

/** 一個數字滾輪：每 step 秒跳下一個數字，共 count 個數字一輪 */
function wheel(x: number, y: number, step: number, count: number, offset: number): string {
  const cycle = step * count
  const values = Array.from({ length: count }, (_, i) => `0 ${-i * 6}`).join(';')
  const times = Array.from({ length: count }, (_, i) => n(i / count)).join(';')
  const begin = -(offset % cycle)
  return `<g transform="translate(${x} ${y})"><g clip-path="url(#cd)"><g>` +
    `<use href="#dg"/><animateTransform attributeName="transform" type="translate" calcMode="discrete" values="${values}" keyTimes="${times}" dur="${cycle}s" begin="${n(begin)}s" repeatCount="indefinite"/>` +
    `</g></g></g>`
}

/** mm:ss 計時器，從 elapsed 秒開始自己跑 */
function timer(x: number, y: number, elapsed: number): string {
  return wheel(x, y, 600, 10, elapsed) + wheel(x + 4, y, 60, 10, elapsed) +
    draw([[x + 8, y + 1, 1, 1, '#9da3d8'], [x + 8, y + 3, 1, 1, '#9da3d8']]) +
    wheel(x + 10, y, 10, 6, elapsed) + wheel(x + 14, y, 1, 10, elapsed)
}

/* ---------- 文字 ---------- */

const text = (x: number, y: number, size: number, fill: string, body: string, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${FONT}"${extra}>${escape(body)}</text>`

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

function formatTokens(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)} 萬 tok`
  return `${count} tok`
}

/* ---------- 一列 ---------- */

/** 工作中的進度條：沒有百分比可算，所以是一道光在條裡來回跑，看得出「還在動」 */
function busyBar(x: number, y: number, w: number, color: string): string {
  return draw([[x - 1, y - 1, w + 2, 5, '#2e2538'], [x, y, w, 3, '#0e1030']]) +
    `<rect x="${x}" y="${y}" width="${w}" height="3" fill="url(#pStripe)" opacity="0.5"/>` +
    `<rect x="${x}" y="${y}" width="8" height="3" fill="${color}">` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${w - 8} 0;0 0" dur="2.4s" repeatCount="indefinite"/></rect>` +
    `<rect x="${x}" y="${y}" width="8" height="1" fill="#ffffff" opacity="0.35">` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${w - 8} 0;0 0" dur="2.4s" repeatCount="indefinite"/></rect>`
}

/** 閒置時在做什麼：依行程時間自動換字 */
function idleCaption(row: StatusRow, x: number, y: number, now: number): string {
  const spans: [number, number, string][] = []
  for (const [t0, t1, label] of idleLabels(row.role, row.idleSeed)) {
    const last = spans[spans.length - 1]
    if (last && last[2] === label) last[1] = t1
    else spans.push([t0, t1, label])
  }
  const begin = -(((now - row.since) / 1000) % CYCLE)
  return spans
    .map(([t0, t1, label]) => `<g opacity="${t0 <= 0 ? 1 : 0}">${win(t0, t1, CYCLE, begin)}${text(x, y, 3, '#cfd6ff', label)}</g>`)
    .join('')
}

/**
 * 一列分上下兩行，左右兩端對齊：
 *   上行（基線 y+4.2）：名字　　　　　進度條　　　計時器（靠右）
 *   下行（基線 y+9）  ：狀態　　　　　　　　　　　token（靠右）
 */
const COL = { avatar: 4, text: 15, barX: 66, barW: 66, right: 157, timerW: 17 }

function row(r: StatusRow, i: number, now: number): string {
  const y = 13 + i * ROW_H
  const look = LOOKS[r.role]
  const id = ID[r.role]
  const parts: string[] = []
  const top = y + 4.2
  const bottom = y + 9
  if (r.isWorking) {
    // 工作中：淡淡的底色＋左邊一條角色色細邊
    parts.push(`<rect x="2" y="${y - 0.5}" width="${W - 4}" height="${ROW_H - 1}" fill="${look.shirt}" opacity="0.1"/>`)
    parts.push(draw([[2, y - 0.5, 1, ROW_H - 1, r.isAsking ? '#e24b4a' : look.shirt]]))
  }
  // 頭像
  parts.push(draw([[COL.avatar, y, 9, 9, look.shirt], [COL.avatar + 1, y + 1, 7, 7, '#1e1a2b']]))
  parts.push(`<use href="#${id}H" x="${COL.avatar + 1.5}" y="${y + 2}"/>`)
  // 名字
  parts.push(text(COL.text, top, 3.4, look.shirt, NAMES[r.role], ' font-weight="bold"'))
  const elapsed = (now - r.since) / 1000
  if (r.isWorking) {
    const label = r.isAsking ? '✋ 等你批准' : r.role === 'producer' ? '通話中' : '工作中'
    const task = r.task && r.task !== '跟總經理通話中' ? '：' + r.task : ''
    parts.push(text(COL.text, bottom, 2.8, r.isAsking ? '#f09595' : '#eef0ff', clip(`${label}${task}`, 24), r.isAsking ? ' class="blink"' : ''))
    // 名字旁的小燈：工作中會閃
    parts.push(`<rect x="${COL.text + NAMES[r.role].length * 3.6 + 1}" y="${top - 2.2}" width="1.5" height="1.5" fill="${r.isAsking ? '#e24b4a' : '#97c459'}" class="blink"/>`)
    parts.push(busyBar(COL.barX, top - 2.6, COL.barW, r.isAsking ? '#e24b4a' : look.shirt))
    parts.push(timer(COL.right - COL.timerW, top - 4.2, elapsed))
    parts.push(text(COL.right, bottom, 2.8, '#ffd27a', formatTokens(r.tokens), ' text-anchor="end"'))
  } else {
    parts.push(idleCaption(r, COL.text, bottom, now))
    if (r.task) parts.push(text(COL.right, bottom, 2.6, '#8a8fbf', clip(`上一件：${r.task}（${formatTokens(r.tokens)}）`, 26), ' text-anchor="end"'))
  }
  if (i < 5) parts.push(draw([[COL.avatar, y + ROW_H - 1, W - 8, 0.5, '#23264f']]))
  return parts.join('')
}

/* ---------- 任務卡總進度 ---------- */



/** title 沒給＝還沒設定任務卡資料夾，只顯示提示 */
function boardBar(b: Board, title?: string): string {
  const total = b.todo + b.doing + b.done
  const y = 82
  if (!title) return text(3, y + 2, 3.2, '#ffd27a', '任務卡', ' font-weight="bold"') + text(157, y + 2, 2.8, '#8a90c8', '未設定（/config 設定任務卡資料夾）', ' text-anchor="end"')
  const parts: string[] = [
    text(3, y + 2, 3.2, '#ffd27a', title.slice(0, 24), ' font-weight="bold"'),
    text(157, y + 2, 2.8, '#cfd6ff', `完成 ${b.done} · 進行 ${b.doing} · 待辦 ${b.todo}`, ' text-anchor="end"'),
  ]
  if (total === 0) return parts.join('')
  const gap = 1
  const cell = (W - 6 - gap * (total - 1)) / total
  for (let k = 0; k < total; k++) {
    const x = n(3 + k * (cell + gap))
    const w = n(cell)
    if (k < b.done) parts.push(`<rect x="${x}" y="${y + 4}" width="${w}" height="5" fill="#97c459"/><rect x="${x}" y="${y + 4}" width="${w}" height="1" fill="#c0dd97"/>`)
    else if (k < b.done + b.doing) parts.push(`<rect x="${x}" y="${y + 4}" width="${w}" height="5" fill="#85b7eb" class="pulse" style="animation-delay:-${n(k * 0.25)}s"/>`)
    else parts.push(`<rect x="${x}" y="${y + 4}" width="${w}" height="5" fill="#2a2c58"/><rect x="${x}" y="${y + 8}" width="${w}" height="1" fill="#fac775" opacity="0.6"/>`)
  }
  return parts.join('')
}

/* ---------- 背景：深藍面板，下雨時有斜雨，標題列右邊寫目前時段與天氣 ---------- */

function backdrop(env: Env): string {
  const drops: Px[] = []
  for (let i = 0; i < 18; i++) drops.push([(i * 37) % W, (i * 23) % H - H, 1, 2, '#7f86c4'])
  for (let i = 0; i < 18; i++) drops.push([(i * 37) % W, (i * 23) % H, 1, 2, '#7f86c4'])
  return draw([[0, 0, W, H, '#14152f']]) +
    `<rect width="${W}" height="${H}" fill="url(#pDot)"/>` +
    (isWet(env.weather) ? `<g opacity="0.18"><g>${draw(drops)}<animateTransform attributeName="transform" type="translate" from="6 0" to="-6 ${H}" dur="2.2s" repeatCount="indefinite"/></g></g>` : '') +
    // 最上面接著辦公室的地板：地板色往下抖色漸層成面板的深藍，看起來是同一個畫面
    draw([[0, 0, W, 1, '#241e30'], [0, 1, W, 1, '#1e1a2b']]) +
    `<rect y="2" width="${W}" height="2" fill="url(#pFade)"/>` +
    draw([
      [0, H - 1, W, 1, '#0b0c22'],
      [2, 3, W - 4, 7, '#1d1e4d'], [2, 10, W - 4, 0.5, '#3a3c70'],
      [2, 79, W - 4, 0.5, '#3a3c70'],
    ]) +
    text(5, 8.2, 3.6, '#eef0ff', '團隊動態', ' font-weight="bold"') +
    text(157, 8.2, 3, '#cfd6ff', `${PHASE_NAMES[env.phase]} · ${WEATHER_NAMES[env.weather]}`, ' text-anchor="end"') +
    // 雷雨時跟辦公室一起閃電
    (env.weather === 'storm'
      ? `<rect width="${W}" height="${H}" fill="#cfd6ff" opacity="0"><animate attributeName="opacity" values="0;0;0.08;0;0.05;0" keyTimes="0;0.9;0.905;0.912;0.92;1" dur="17s" repeatCount="indefinite"/></rect>`
      : '')
}

const STYLE = `<style>
.blink{animation:bl 1s steps(1) infinite}@keyframes bl{0%{opacity:1}50%{opacity:.2}}
.pulse{animation:pu 1.6s steps(2) infinite}@keyframes pu{0%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`

export function statusSvg(rows: readonly StatusRow[], board: Board, now: number, boardTitle?: string): string {
  const defs =
    `<pattern id="pDot" width="4" height="4" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="1" height="1" fill="#1a1b3c"/></pattern>` +
    `<pattern id="pFade" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#14152f"/><rect width="1" height="1" fill="#1e1a2b"/><rect x="1" y="1" width="1" height="1" fill="#1e1a2b"/></pattern>` +
    `<pattern id="pStripe" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="2" height="3" fill="#23264f"/></pattern>` +
    `<clipPath id="cd"><rect width="3" height="5"/></clipPath>` +
    digitStrip() + rows.map(r => headDef(r.role)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" style="background:#14152f">` +
    `<defs>${defs}</defs>${STYLE}` +
    backdrop(envAt(now)) + rows.map((r, i) => row(r, i, now)).join('') + boardBar(board, boardTitle) +
    `</svg>`
  )
}
