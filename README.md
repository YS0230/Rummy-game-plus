# 拉密 Rummikub 線上多人對戰

多人連線 Rummikub(106 磚:1–13 × 4 色 × 2 副 + 2 鬼牌,2–4 人)。

## 功能
- 大廳:公開房間列表、建房(人數上限/私人房)、6 碼房間代碼加入
- 等待室:準備狀態、房主開始、聊天
- 遊戲:拖放出牌、桌面自由重組、**所有玩家即時看到當前玩家每一步擺放**、首攤 30 點規則、鬼牌、60 秒回合計時(逾時自動還原+抽牌)、出牌不合法自動還原+罰抽
- 斷線重連:重新整理/斷網後自動回到原局,取回手牌與聊天記錄;斷線玩家輪到時自動抽牌跳過
- 結算:剩餘磚罰分、勝者得分、回房再來一局

## 快速開始
```bash
npm install
npm run dev        # 同時啟動 server(:3001)與 client(:5173)
```
瀏覽器開 http://localhost:5173 (開多個分頁模擬多人)。

## 其他指令
```bash
npm test           # 規則引擎 + 遊戲邏輯單元測試
npm run build      # 前端 production build(server 會直接供應 client/dist)
npm start          # production 模式:只跑 server,開 http://localhost:3001
node server/scripts/e2e.mjs   # 端到端 socket 模擬(需先啟動 server)
```

## 架構
```
shared/validator.js    # 牌組驗證/計分(前後端共用)
server/src/
  game/tiles.js        # 磚生成與洗牌
  game/Game.js         # 遊戲狀態機(回合、快照驗證、計時、勝負)
  rooms/RoomManager.js # 房間/大廳/聊天記錄
  socket/handlers.js   # Socket.IO 事件
client/src/            # React + Vite + Zustand + @dnd-kit
```

### 同步機制
玩家每個拖放動作將整個桌面佈局送至伺服器(`game:layout`),伺服器驗證磚的所有權與守恆後套用為「暫定狀態」並廣播(`game:state`),因此所有人即時看到擺放過程;按「結束回合」才驗證牌組合法性與首攤規則,不合法則還原快照並罰抽一張。
