import { expect, test } from 'claude-code/testing'

const pane = (surface: 'desktop' | 'terminal') => ({
  plugin: 'ai-office',
  surface,
  component: 'Pane',
  requestId: 'ai-office',
  props: {
    title: 'AI 辦公室',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const)

/** 圖片模式：辦公室＋團隊動態兩張圖；互動模式：定格、動畫、團隊動態三張 */
const svgs = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) => {
  const all = await ui.findAll({ type: 'Svg' })
  return all.length === 2 ? { live: all[0], status: all[1], count: 2 } : { still: all[0], live: all[1], status: all[2], count: all.length }
}

/** 用滑鼠點一下控制列上的像素按鈕（按下再放開） */
const click = async (ui: { pointer: (e: { type: 'down' | 'up'; x: number; y: number; button: 'left'; in: string }) => Promise<void> }, action: string) => {
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `chip-${action}` })
  await ui.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: `chip-${action}` })
}

test('預覽按鈕讓五個人上工；圖片模式跟著面板寬度縮放，互動模式底下墊定格畫面', async $ => {
  const ui = await $.ui.mount(pane('desktop'))
  expect((await svgs(ui)).live?.props.alt).toBe('AI 辦公室，0 人工作中')

  await click(ui, 'preview')
  const after = await svgs(ui)
  expect(after.count).toBe(2)
  // 圖片模式不給固定寬高，App 依 SVG 本身的比例縮放到面板寬度
  expect(after.live?.props.width).toBeUndefined()
  expect(after.live?.props.isInteractive).toBeUndefined()
  expect(after.live?.props.alt).toBe('AI 辦公室，5 人工作中')
  expect(String(after.live?.props.source)).toContain('width="1600" height="960"')
  expect(String(after.live?.props.source).length).toBeLessThan(131072)
  expect(String(after.status?.props.source)).toContain('團隊動態')

  await click(ui, 'mode')
  const frame = await svgs(ui)
  expect(frame.count).toBe(3)
  expect(frame.live?.props.isInteractive).toBe(true)
  expect(frame.live?.props.width).toBe(480)
  await click(ui, 'mode')

  await click(ui, 'preview')
  expect((await svgs(ui)).live?.props.alt).toBe('AI 辦公室，0 人工作中')
  await ui.unmount()
})

test('版面按鈕依序切換自動、上下、左右；/office-classic 換回原生按鈕', async $ => {
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ key: 'stage-stack' })).toBeDefined()
  await click(ui, 'layout')
  expect(await ui.find({ key: 'stage-stack' })).toBeDefined()
  await click(ui, 'layout')
  expect(await ui.find({ key: 'stage-side' })).toBeDefined()
  await click(ui, 'layout')
  expect(await ui.find({ key: 'stage-stack' })).toBeDefined()

  await $.command.run({ command: 'office-classic', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(await ui.find({ key: 'bar-classic' })).toBeDefined()
  await ui.press({ key: 'preview' })
  expect((await svgs(ui)).live?.props.alt).toBe('AI 辦公室，5 人工作中')
  await ui.unmount()
})

test('終端機只顯示文字清單', async $ => {
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /辦公室動畫只在桌面 App 顯示/ })).toBeDefined()
  await ui.unmount()
})
