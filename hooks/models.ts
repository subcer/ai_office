// 各角色可選的模型。清單是 2026-10 的；新模型出來要手動加在這裡。
// id 是派工時交給 Agent 的正式模型代號，name 是畫面上顯示的名字，price 是每百萬 token 的輸入／輸出價格（美元）。

export type ModelOption = { id: string; name: string; price: string; isLatest: boolean }

export const MODELS: readonly ModelOption[] = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', price: '$4 / $20', isLatest: true },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', price: '$2 / $10', isLatest: true },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', price: '$0.1 / $0.5', isLatest: true },
  { id: 'claude-fable-5-1', name: 'Fable 5.1', price: '$10 / $50（需使用點數）', isLatest: true },
  { id: 'claude-opus-5', name: 'Opus 5', price: '$5 / $25', isLatest: false },
  { id: 'claude-sonnet-5', name: 'Sonnet 5', price: '$2 / $10', isLatest: false },
  { id: 'claude-fable-5', name: 'Fable 5', price: '$10 / $50（需使用點數）', isLatest: false },
  { id: 'claude-haiku-4-5', name: 'Haiku 4.5', price: '$1 / $5', isLatest: false },
  { id: 'claude-opus-4-8', name: 'Opus 4.8', price: '$5 / $25', isLatest: false },
  { id: 'claude-opus-4-7', name: 'Opus 4.7', price: '$5 / $25', isLatest: false },
  { id: 'claude-opus-4-6', name: 'Opus 4.6', price: '$5 / $25', isLatest: false },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', price: '$3 / $15', isLatest: false },
]

/** 模型代號 → 畫面上的短名字；別名（sonnet、opus）或不在清單裡的代號，去掉 claude- 前綴直接顯示 */
export function modelName(id: string | undefined): string | undefined {
  if (!id) return undefined
  const known = MODELS.find(m => id === m.id || id.startsWith(`${m.id}-`) || id.startsWith(`${m.id}[`))
  if (known) return known.name
  const bare = id.replace(/^claude-/, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}
