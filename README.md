# 東勢國中棒球隊｜冒險訓練筆記本

給國中棒球隊的**學生、家長與教練**使用的互動式網頁：每日筆記、目標進度、體能檢測、原創怪獸養成、球隊規章、防護知識與公告。

> **目前進度：第五階段（上線前檢查）**
> - **雲端模式**：所有功能（筆記、目標、體能、規章、防護知識、公告、任務、怪獸遊戲、帳號管理）都儲存在 Google 試算表，權限由 Apps Script 後端驗證。
> - **示範模式**：使用虛構的示範資料，只存在這台電腦的瀏覽器，可用來體驗功能。
>
> - 教練操作說明：[docs/coach-guide.md](docs/coach-guide.md)
> - 資料表與權限設計：[docs/data-model.md](docs/data-model.md)
> - Apps Script 設定步驟：[docs/phase2-setup-guide.md](docs/phase2-setup-guide.md)

## 怎麼在自己的電腦上打開

需要先安裝 [Node.js](https://nodejs.org/)（建議 20 版以上）。在這個資料夾開啟終端機，依序執行：

```bash
npm install
```

```bash
npm run dev
```

看到 `Local: http://localhost:5173/` 之後，用瀏覽器打開這個網址即可。體能檢測系統在 `http://localhost:5173/fitness.html`。要停止時，在終端機按 `Ctrl + C`。

## 其他指令

| 指令 | 用途 |
| --- | --- |
| `npm test` | 執行自動化測試（權限、防重複領獎、一天一筆筆記等規則） |
| `npm run test:gas` | 在本機模擬環境執行 Apps Script 的 `setup()` 與 `runSelfTests()` |
| `npm run mock:api` + `npm run dev:mock` | 本機模擬雲端 API，測試雲端模式（測試帳號見 `apps-script/mock-server.mjs`） |
| `npm run build` | 型別檢查並建置正式版到 `dist/` 資料夾 |
| `npm run preview` | 預覽建置後的正式版 |

## 示範帳號

登入頁直接選擇身分即可，不需要密碼（正式登入在第三階段建立）：

- **球員**：示範球員 小安／小勇／小晴／小哲（小晴、小哲還沒有怪獸，可以測試「選擇初始夥伴」與空資料畫面）
- **教練**：示範教練
- **家長**：示範家長（小安家長）

想把資料恢復成初始狀態：教練後台 → 🔌 同步錯誤 → 「重設示範資料」。

## 資料夾結構

```
src/
  types.ts          資料欄位設計（對應第二階段的 Google 試算表工作表）
  config.ts         設定檔（API 網址等，第二階段用 .env 設定）
  data/             示範資料、原創怪獸、規章空位、防護知識示範文章
  lib/              權限、日期、體能格式、怪獸等級、像素繪圖等工具
  store/actions.ts  所有資料修改的規則（之後會搬到 Apps Script 後端驗證）
  store/DemoStore   第一階段的本機資料儲存
  components/       共用介面元件
  pages/            12 個主要頁面；pages/admin/ 為教練後台
  fitness-app/      體能檢測系統（獨立網頁 fitness.html：全隊總覽／排行、團體檢測碼表、全隊輸入、個人報告、匯出）
```

## 重要說明

- 球隊規章 17 條目前是**待輸入的空位**，必須由教練依「東勢國中棒球隊球隊規章」圖片原文在後台輸入；第 3、10、13 條已標示「待教練確認」。
- 防護知識庫的 6 篇文章是整理自公開資料的**示範內容**，正式發布前需由教練或運動防護員審閱。
- 前端的權限檢查只用來決定畫面顯示；正式上線前，所有資料修改都會在 Apps Script 後端再驗證一次。
