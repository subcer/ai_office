export type RoleId = 'producer' | 'planner' | 'engineer' | 'art' | 'reviewer' | 'qa'

/** 座位上「看得到」的狀態：這些一變，辦公室的圖就要重新產生 */
export type Seat = {
  isWorking: boolean
  /** 進入目前狀態（工作或閒置）的時間，毫秒 */
  since: number
  /** 閒置行程的亂數種子 */
  idleSeed: number
  /** 上工那一刻人在哪：在座位上就醒來開工，不在就從那裡走回來 */
  arrival?: { x: number; y: number; isAtDesk: boolean }
}

export type Seats = Record<RoleId, Seat>

/** 只給文字列看的數字：常常變，但不影響圖 */
export type Stat = {
  task?: string
  /** 這件工作「新增」的 token：新輸入＋寫入快取＋模型輸出 */
  tokens: number
  /** 重讀快取的 token：每一步都會把整段對話再讀一次，量很大但計費只有一成，另外記 */
  cacheRead?: number
}

export type Board = { todo: number; doing: number; done: number }

/** 最近一次審查結果：退件時文件飛回工程師桌上，通過時飛到製作人桌上 */
export type Review = { kind: 'none' | 'reject' | 'approve'; at: number }

export type View = {
  /** true：圖片模式，寬度跟著面板縮放、換圖不會出現白框；false：互動畫框（固定 480 寬，有滑鼠停留提示） */
  isImageMode: boolean
  /** 頭上名字標籤 */
  showTags: boolean
  /** 辦公室與團隊動態的排法：auto 依面板寬度，寬的時候左右排 */
  layout: Layout
  /** 改用 App 原生的按鈕（萬一像素按鈕點不動時的備案） */
  isClassicButtons: boolean
}

export type Layout = 'auto' | 'stack' | 'side'

/** 模型設定頁：isOpen 時面板改顯示設定頁；role 有值時列出那個角色可選的模型 */
export type ModelPage = { isOpen: boolean; role?: RoleId }

declare module 'claude-code' {
  interface PluginState {
    'ai-office': {
      seats: Seats
      stats: Record<RoleId, Stat>
      /** 桌上疊的咖啡杯數，跟著這件工作用掉的 token 增加 */
      cups: Record<RoleId, number>
      review: Review
      board: Board
      /** 最近一次有任務卡變成「完成」的時間：窗外放煙火 */
      doneAt: number
      agentRoles: Record<string, RoleId>
      /** 預覽模式：全員上工，不看實際有沒有代理人在跑 */
      isPreview: boolean
      /** 總經理最近一次送出訊息的時間：總經理走進辦公室 */
      bossAt: number
      /** 正在等總經理批准工具的座位：那個人會舉手、桌上紅燈閃 */
      asking: Partial<Record<RoleId, boolean>>
      /** 每分鐘加一，讓面板重畫：天色、天氣、時鐘跟著現實時間換 */
      minute: number
      /** 面板顯示設定 */
      view: View
      /** 總經理替每個角色選的模型（沒有＝照角色設定檔）；同時存在 $.store，重開也記得 */
      models: Partial<Record<RoleId, string>>
      /** 每個角色最近一次派工實際用的模型 */
      runModels: Partial<Record<RoleId, string>>
      modelPage: ModelPage
    }
  }
}
