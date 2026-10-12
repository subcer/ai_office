import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Layout, Review, RoleId, Seat, Seats, Stat, View } from '../types'
import { LOOKS, NAMES } from './characters'
import { officeSvg } from './office-svg'
import { statusSvg, type StatusRow } from './status-svg'
import { ROLES, whereAt } from './timeline'
import { envAt } from './weather'

const PANE = 'ai-office'

/** 代理人類型 → 座位；製作人是主對話本身，不在這裡 */
const TYPE_ROLE: Record<string, RoleId> = {
  planner: 'planner',
  'game-engineer': 'engineer',
  'art-director': 'art',
  reviewer: 'reviewer',
  'qa-tester': 'qa',
}

const LIST_ORDER: readonly RoleId[] = ['producer', 'planner', 'engineer', 'art', 'reviewer', 'qa']

/** 任務卡看板的設定（plugin.json 的 userConfig）。資料夾留空＝不讀任務卡，看板保持空白 */
type BoardConfig = { dir: string; title: string; from: number; to: number }
const boardConfig = (options: Readonly<Record<string, unknown>>): BoardConfig => ({
  dir: typeof options.taskDir === 'string' ? options.taskDir.trim().replace(/^[/\\]+|[/\\]+$/g, '') : '',
  title: typeof options.boardTitle === 'string' && options.boardTitle.trim() ? options.boardTitle.trim() : '任務卡',
  from: typeof options.cardFrom === 'number' ? options.cardFrom : 0,
  to: typeof options.cardTo === 'number' ? options.cardTo : 0,
})

/** Svg 的 source 上限是 131072 字元，留一點餘裕 */
const SVG_LIMIT = 130000

/** 每 5 萬新增 token 一杯咖啡 */
const TOKENS_PER_CUP = 50000

const perRole = <T,>(make: (role: RoleId) => T) => Object.fromEntries(ROLES.map(r => [r, make(r)])) as Record<RoleId, T>

const seatsAtom = atom({ plugin: 'ai-office', key: 'seats' } as const,
  perRole((): Seat => ({ isWorking: false, since: Date.now(), idleSeed: Math.floor(Math.random() * 1e9) })))
const stats = atom({ plugin: 'ai-office', key: 'stats' } as const, perRole((): Stat => ({ tokens: 0 })))
const cups = atom({ plugin: 'ai-office', key: 'cups' } as const, perRole(() => 0))
const review = atom({ plugin: 'ai-office', key: 'review' } as const, { kind: 'none', at: 0 } as Review)
const board = atom({ plugin: 'ai-office', key: 'board' } as const, { todo: 0, doing: 0, done: 0 } as Board)
const doneAt = atom({ plugin: 'ai-office', key: 'doneAt' } as const, 0)
const bossAt = atom({ plugin: 'ai-office', key: 'bossAt' } as const, 0)
const minute = atom({ plugin: 'ai-office', key: 'minute' } as const, 0)
const asking = atom({ plugin: 'ai-office', key: 'asking' } as const, {} as Partial<Record<RoleId, boolean>>)
const agentRoles = atom({ plugin: 'ai-office', key: 'agentRoles' } as const, {} as Record<string, RoleId>)
const isPreview = atom({ plugin: 'ai-office', key: 'isPreview' } as const, false)
const view = atom({ plugin: 'ai-office', key: 'view' } as const, { isImageMode: true, showTags: true, layout: 'auto', isClassicButtons: false } as View)

/** 面板寬到這麼多欄時，辦公室與團隊動態改成左右排 */
const SIDE_BY_SIDE_COLUMNS = 110

const LAYOUT_NAMES: Record<Layout, string> = { auto: '自動', stack: '上下', side: '左右' }
const NEXT_LAYOUT: Record<Layout, Layout> = { auto: 'stack', stack: 'side', side: 'auto' }

/** 互動模式的畫框需要固定尺寸 */
const FRAME = { width: 480, height: 288 }

/**
 * 圖片模式用：把 SVG 的寬高改成一個很大的固定值，App 會把它當成「原始尺寸」，
 * 再依面板寬度等比例縮小，所以拉寬拉窄都剛好填滿、比例不變。
 */
const intrinsic = (svg: string) => svg.replace('width="100%" height="100%"', 'width="1600" height="960"')

function startWork(role: RoleId, seat: Seat, now: number): Seat {
  return { isWorking: true, since: now, idleSeed: seat.idleSeed, arrival: whereAt(role, seat.idleSeed, (now - seat.since) / 1000) }
}

function stopWork(now: number): Seat {
  return { isWorking: false, since: now, idleSeed: Math.floor(Math.random() * 1e9) }
}

const isRunning = (status: string) => status === 'running' || status === 'pending'

/** 代理人 id → 座位，turn.step 每一步都要查 */
const roleCache: Record<string, RoleId> = {}

/* ---------- 辦公室的圖 ---------- */

/**
 * 圖裡的動畫是「從產生那一刻起算」：每個人的位置用 begin 負秒數對齊到產生當下。
 * App 只要重建一次圖片，動畫時鐘就從頭算；如果沿用舊圖，大家會被拉回當初的位置，看起來像瞬移。
 * 所以圖片模式每次重畫都用「現在」重新產生，位置永遠接得上。
 *
 * 互動模式的畫框一換內容就會閃白框，只能沿用舊圖：只在看得到的東西變了才重新產生，
 * 底下墊一張同一刻的定格畫面（still）。
 */
type Scene = { key: string; live: string; still: string }
let frameCache: Scene = { key: '', live: '', still: '' }

type SceneInput = {
  seats: Seats
  board: Board
  cups: Record<RoleId, number>
  review: Review
  doneAt: number
  bossAt: number
  asking: Partial<Record<RoleId, boolean>>
  showTags: boolean
}

function liveSvg(input: SceneInput, now: number): string {
  const fx = { cups: input.cups, review: input.review, doneAt: input.doneAt, bossAt: input.bossAt, asking: input.asking }
  const live = officeSvg(input.seats, input.board, fx, now, false, input.showTags)
  // 單張圖上限 131072 字元；萬一超過，先拿掉頭上名字再試
  return live.length > SVG_LIMIT ? officeSvg(input.seats, input.board, fx, now, false, false) : live
}

/** 圖片模式：每次都依現在時間重新產生 */
function imageScene(input: SceneInput): string {
  return liveSvg(input, Date.now())
}

/** 互動模式：沿用舊圖，只在看得到的東西變了才重新產生 */
function frameScene(input: SceneInput): Scene {
  const key = JSON.stringify([input.board, input.cups, input.review, input.doneAt, input.bossAt, input.asking, input.showTags, envAt(Date.now()), ROLES.map(r => input.seats[r])])
  if (key !== frameCache.key) {
    const now = Date.now()
    const fx = { cups: input.cups, review: input.review, doneAt: input.doneAt, bossAt: input.bossAt, asking: input.asking }
    frameCache = { key, live: liveSvg(input, now), still: officeSvg(input.seats, input.board, fx, now, true, input.showTags) }
  }
  return frameCache
}

async function addTokens($: EngineInterface, role: RoleId, spent: number, cacheRead: number) {
  await update($, stats, s => ({ ...s, [role]: { ...s[role], tokens: s[role].tokens + spent, cacheRead: (s[role].cacheRead ?? 0) + cacheRead } }))
  const tokens = (await read($, stats))[role].tokens
  const count = Math.min(4, Math.floor(tokens / TOKENS_PER_CUP))
  if ((await read($, cups))[role] !== count) await update($, cups, c => ({ ...c, [role]: count }))
}

async function beginTask($: EngineInterface, role: RoleId, task: string) {
  const now = Date.now()
  await update($, seatsAtom, s => ({ ...s, [role]: startWork(role, s[role], now) }))
  await update($, stats, s => ({ ...s, [role]: { task, tokens: 0 } }))
  if ((await read($, cups))[role] !== 0) await update($, cups, c => ({ ...c, [role]: 0 }))
}

async function endTask($: EngineInterface, role: RoleId) {
  const now = Date.now()
  await update($, seatsAtom, s => ({ ...s, [role]: stopWork(now) }))
  if ((await read($, asking))[role]) await update($, asking, a => ({ ...a, [role]: false }))
}

async function togglePreview($: EngineInterface) {
  const turningOn = !(await read($, isPreview))
  await update($, isPreview, () => turningOn)
  for (const role of ROLES) {
    if (role === 'producer') continue
    if (turningOn) await beginTask($, role, '預覽')
    else await endTask($, role)
  }
}

/** 控制列上每顆按鈕的動作 */
async function runAction($: EngineInterface, action: string) {
  switch (action) {
    case 'tags':
      return update($, view, cur => ({ ...cur, showTags: !cur.showTags }))
    case 'layout':
      return update($, view, cur => ({ ...cur, layout: NEXT_LAYOUT[cur.layout ?? 'auto'] }))
    case 'mode':
      return update($, view, cur => ({ ...cur, isImageMode: !cur.isImageMode }))
    case 'preview':
      return togglePreview($)
  }
}

export const register: Register = (on, options) => {
  const cfg = boardConfig(options ?? {})
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'office', description: '打開 AI 辦公室面板' })
    await $.command.register({ name: 'office-classic', description: 'AI 辦公室：像素按鈕與原生按鈕互換（像素按鈕點不動時用）' })
    void $.ui.open({ id: PANE, title: 'AI 辦公室' })

    $.clock.every(1500, async () => {
      if (await read($, isPreview)) return
      const agents = await $.agent.list()
      const fresh: Record<string, RoleId> = {}
      for (const a of agents) {
        const role = TYPE_ROLE[a.type]
        if (role && roleCache[a.id] !== role) fresh[a.id] = role
      }
      if (Object.keys(fresh).length) {
        Object.assign(roleCache, fresh)
        await update($, agentRoles, map => ({ ...map, ...fresh }))
      }
      const seats = await read($, seatsAtom)
      const tasks = await read($, stats)
      for (const role of ROLES) {
        if (role === 'producer') continue
        const active = agents.find(a => TYPE_ROLE[a.type] === role && isRunning(a.status))
        if (active && !seats[role].isWorking) await beginTask($, role, active.description)
        else if (!active && seats[role].isWorking) await endTask($, role)
        else if (active && tasks[role].task !== active.description) {
          await update($, stats, s => ({ ...s, [role]: { ...s[role], task: active.description } }))
        }
      }
    })

    const readBoard = async () => {
      if (!cfg.dir) return
      const root = await $.session.root()
      const dir = `${root}/${cfg.dir}`
      if (!(await $.fs.exists(dir))) return
      const counts: Board = { todo: 0, doing: 0, done: 0 }
      for (const entry of await $.fs.list(dir)) {
        const match = /^T-(\d+)/.exec(entry.name)
        if (!match || entry.kind !== 'file') continue
        const num = Number(match[1])
        if ((cfg.from > 0 && num < cfg.from) || (cfg.to > 0 && num > cfg.to)) continue
        const text = await $.fs.read(`${dir}/${entry.name}`)
        const status = /狀態：(.*)/.exec(typeof text === 'string' ? text : '')?.[1] ?? ''
        if (status.startsWith('完成')) counts.done++
        else if (status.startsWith('待辦')) counts.todo++
        else counts.doing++
      }
      const old = await read($, board)
      if (old.todo === counts.todo && old.doing === counts.doing && old.done === counts.done) return
      const wasLoaded = old.todo + old.doing + old.done > 0
      await update($, board, () => counts)
      if (wasLoaded && counts.done > old.done) {
        await update($, doneAt, () => Date.now())
        void $.ui.toast(`任務卡完成 +${counts.done - old.done}，${cfg.title}已完成 ${counts.done} 張`)
        void $.audio.play({ asset: 'sounds/ding.wav' }).catch(() => undefined)
      }
    }
    void readBoard()
    $.clock.every(60000, () => void update($, minute, m => m + 1))
    $.clock.every(15000, () => void readBoard())

    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: 'AI 辦公室' })
    return { text: 'AI 辦公室面板已打開。' }
  })

  on('command.run', { command: 'office-classic' }, async $ => {
    await update($, view, cur => ({ ...cur, isClassicButtons: !cur.isClassicButtons }))
    const classic = (await read($, view)).isClassicButtons
    return { text: classic ? 'AI 辦公室改用原生按鈕。' : 'AI 辦公室改用像素按鈕。' }
  })

  // 工具要等總經理批准：那個人舉手、桌上紅燈閃；工具跑完或被拒絕就放下
  const roleOf = (agentId: string | undefined): RoleId | undefined => (agentId ? roleCache[agentId] : 'producer')
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    const role = roleOf(e.agentId)
    if (verdict.decision === 'ask' && role && !(await read($, asking))[role]) await update($, asking, a => ({ ...a, [role]: true }))
    return verdict
  }).catch(($, e, next) => next(e)) // 動畫出錯也不能影響權限判斷

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const role = roleOf(e.agentId)
    if (role && (await read($, asking))[role]) await update($, asking, a => ({ ...a, [role]: false }))
    return result
  }).catch(($, e, next) => next(e))

  // 總經理送出訊息：總經理走進辦公室，製作人電話響
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    await update($, bossAt, () => Date.now())
    return result
  }).catch(($, e, next) => next(e)) // 動畫出錯也不能擋住你的訊息

  // 主對話開始回話：製作人接起電話；每一步都把 token 記到對應的座位
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && !(await read($, seatsAtom)).producer.isWorking) await beginTask($, 'producer', '跟總經理通話中')
    const result = yield* next(e)
    const usage = result.usage
    if (usage) {
      // 新增的 token 才算工作量；快取讀取每一步都重讀整段對話，另外記
      const spent = usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens
      let role: RoleId | undefined = e.agentId ? roleCache[e.agentId] : 'producer'
      if (!role && e.agentId) {
        const found = (await $.agent.list()).find(a => a.id === e.agentId)
        role = found ? TYPE_ROLE[found.type] : undefined
        if (role) roleCache[e.agentId] = role
      }
      if (role) await addTokens($, role, spent, usage.cache_read_input_tokens)
    }
    return result
  })

  // 主對話回完話：製作人掛電話。審查員交件：看結論是退回還是通過
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      if ((await read($, seatsAtom)).producer.isWorking) await endTask($, 'producer')
    } else if (roleCache[e.agentId] === 'reviewer') {
      const text = e.answer
      const kind = /退回|需修改|不通過|未通過|要修改/.test(text) ? 'reject' : /通過/.test(text) ? 'approve' : undefined
      if (kind) await update($, review, () => ({ kind, at: Date.now() }))
    }
    return next(e)
  })

  // 像素按鈕放開時送來的動作
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const data = e.data as { action?: unknown } | undefined
    if (typeof data?.action === 'string') await runAction($, data.action)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const seats = await read($, seatsAtom)
    // 之前存的設定可能少了新欄位，先補上預設值
    const stored = await read($, view)
    const v: View = { ...stored, layout: stored.layout ?? 'auto', isClassicButtons: stored.isClassicButtons ?? false }
    const input: SceneInput = {
      seats,
      board: await read($, board),
      cups: await read($, cups),
      review: await read($, review),
      doneAt: await read($, doneAt),
      bossAt: await read($, bossAt),
      asking: await read($, asking),
      showTags: v.showTags,
    }
    const preview = await read($, isPreview)
    await read($, minute)

    if (e.surface !== 'desktop' && e.surface !== 'vscode') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {LIST_ORDER.map(role => (
            <Text>
              <Text color={LOOKS[role].shirt}>■ </Text>
              {NAMES[role]}　{seats[role].isWorking ? '工作中' : '閒置'}
            </Text>
          ))}
          <Text dimColor>辦公室動畫只在桌面 App 顯示。</Text>
        </Box>
      )
    }

    const working = LIST_ORDER.filter(r => seats[r].isWorking).length
    const desktop = $.ui.resolve(e)
    const { Box, Button, Svg } = desktop
    const Client = 'Client' in desktop ? desktop.Client : undefined
    const s = await read($, stats)
    const rows: StatusRow[] = LIST_ORDER.map(role => ({
      role,
      isWorking: seats[role].isWorking,
      since: seats[role].since,
      idleSeed: seats[role].idleSeed,
      tokens: s[role].tokens,
      isAsking: Boolean(input.asking[role]) && seats[role].isWorking,
      ...(s[role].task ? { task: s[role].task } : {}),
    }))
    const officeAlt = `AI 辦公室，${working} 人工作中`
    const statusAlt = '團隊動態：每個人在做什麼、做了多久、用了多少 token'
    // 團隊動態的計時器、閒置動作也是從產生那一刻起算，同樣每次依現在時間重新產生
    const status = statusSvg(rows, input.board, Date.now(), cfg.dir ? cfg.title : undefined)
    const isSide = v.layout === 'side' || (v.layout === 'auto' && e.props.bodyColumns >= SIDE_BY_SIDE_COLUMNS)

    // 圖片模式：兩張圖都不給固定尺寸，只給 5:3 的比例，App 會照面板寬度等比例縮放，無縫接在一起。
    // 面板夠寬時左右各佔一半。互動模式的畫框需要固定尺寸，維持 480×288，底下墊定格畫面。
    const stage = v.isImageMode
      ? isSide
        ? (
          <Box key="stage-side" flexDirection="row">
            <Box width="50%"><Svg source={intrinsic(imageScene(input))} alt={officeAlt} /></Box>
            <Box width="50%"><Svg source={intrinsic(status)} alt={statusAlt} /></Box>
          </Box>
        )
        : (
          <Box key="stage-stack" flexDirection="column">
            <Svg source={intrinsic(imageScene(input))} alt={officeAlt} />
            <Svg source={intrinsic(status)} alt={statusAlt} />
          </Box>
        )
      : (
        (() => {
          const scene = frameScene(input)
          return (
        <Box key="stage-frame" flexDirection={isSide ? 'row' : 'column'}>
          <Box>
            <Svg source={scene.still} alt={`${officeAlt}（定格）`} width={FRAME.width} height={FRAME.height} />
            <Box position="absolute" top={0} left={0}>
              <Svg source={scene.live} alt={officeAlt} width={FRAME.width} height={FRAME.height} isInteractive />
            </Box>
          </Box>
          <Svg source={status} alt={statusAlt} width={FRAME.width} height={FRAME.height} />
        </Box>
          )
        })()
      )

    const controls: { action: string; label: string; isOn: boolean }[] = [
      { action: 'tags', label: v.showTags ? '◆ 頭上名字' : '◇ 頭上名字', isOn: v.showTags },
      { action: 'layout', label: `▦ 版面：${LAYOUT_NAMES[v.layout]}`, isOn: v.layout !== 'auto' },
      { action: 'mode', label: v.isImageMode ? '▣ 圖片模式' : '▢ 互動模式', isOn: !v.isImageMode },
      { action: 'preview', label: preview ? '■ 結束預覽' : '▶ 預覽：全員上工', isOn: preview },
    ]

    // 像素按鈕：深藍底的一條控制列，接在團隊動態底下。沒有 Client 的畫面（VS Code）或選了原生按鈕時用 Button。
    const bar = Client && !v.isClassicButtons
      ? (
        <Box key="bar-pixel" flexDirection="row" flexWrap="wrap" gap={1} backgroundColor="#14152f" paddingX={1} paddingY={1}>
          {controls.map(c => (
            <Client key={`chip-${c.action}`} module="./control-chip.tsx" props={{ label: c.label, action: c.action, isOn: c.isOn }} />
          ))}
        </Box>
      )
      : (
        <Box key="bar-classic" flexDirection="row" gap={1} flexWrap="wrap" marginTop={1}>
          {controls.map(c => (
            <Button key={c.action} label={c.label} onPress={() => runAction($, c.action)} />
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        {stage}
        {bar}
      </Box>
    )
  })
}
