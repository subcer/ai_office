// 控制列上的一顆按鈕：跟團隊動態同一套深藍底、暖黃字。
// 滑鼠移上去變亮、按下變色，放開時通知 hooks 執行動作（ui.message）。

import type { ClientModule } from 'claude-code'

export type ChipProps = {
  /** 按鈕上的字 */
  label: string
  /** 放開時送給 hooks 的動作名稱 */
  action: string
  /** 開關型按鈕目前是否開著：開著時字是亮黃色 */
  isOn: boolean
}

type State = { isHover: boolean; isDown: boolean }

const COLORS = {
  idle: { bg: '#23264f', fg: '#cfd6ff' },
  on: { bg: '#2e2a5c', fg: '#ffd27a' },
  hover: { bg: '#3a3c70', fg: '#ffe9a8' },
  down: { bg: '#ffd27a', fg: '#14152f' },
}

const ControlChip: ClientModule<ChipProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'enter') surface.setState({ isHover: true, isDown: false })
      else if (event.type === 'leave') surface.setState({ isHover: false, isDown: false })
      else if (event.type === 'down') surface.setState({ isHover: true, isDown: true })
      else if (event.type === 'up') {
        surface.setState({ isHover: true, isDown: false })
        surface.post({ action: props.action })
      }
    })
    surface.onKey(event => {
      if (event.key === 'return' || event.key === ' ') surface.post({ action: props.action })
    })
  }
  const state = surface.state ?? { isHover: false, isDown: false }
  const look = state.isDown ? COLORS.down : state.isHover ? COLORS.hover : props.isOn ? COLORS.on : COLORS.idle
  return (
    <Box backgroundColor={look.bg} paddingX={1}>
      <Text color={look.fg} bold>{props.label}</Text>
    </Box>
  )
}

export default ControlChip
