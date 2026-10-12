# AI 辦公室（ai-office）

Claude Code 的像素風辦公室面板 mod。AI 團隊的六個角色（製作人、企劃、工程師、美術、審查員、測試員）各有座位，
工作時播放角色專屬動畫，閒置時在辦公室裡隨機走動；面板下方列出每個人在做什麼、做了多久、用了多少 token。

- 完整動畫只在 Claude 桌面 App（Code 分頁）顯示；終端機與其他畫面顯示文字清單
- 指令：`/office` 打開面板，`/office-classic` 切換像素按鈕／原生按鈕

## 安裝

在終端機的 `claude` 裡輸入：

```
/plugin install ai-office --marketplace subcer/ai_office
```

詢問是否加入 marketplace 時按 `y`，範圍選 user。安裝後桌面 App 的 Code 分頁也會載入。

## 更新

```
/plugin marketplace update ai-office
```
