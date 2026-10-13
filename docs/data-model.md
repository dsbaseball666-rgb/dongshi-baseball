# 資料模型設計（第二階段）

資料庫：Google 試算表「東勢國中棒球隊冒險訓練筆記本」。每個工作表 = 一張資料表，第 1 列為欄位名稱。
所有儲存格一律以**文字**儲存（避免日期被自動轉換、避免使用者輸入被當成公式執行），由 Apps Script 讀取時再轉換型別。

工作表由 Apps Script 的 `setup()` 自動建立，欄位定義以 [apps-script/Code.gs](../apps-script/Code.gs) 的 `SCHEMA` 為準。

## 一、資料表與欄位

| 工作表 | 用途 | 主鍵 | 主要欄位 | 第二階段串接 |
| --- | --- | --- | --- | --- |
| Players | 球員名單 | id（P001…） | name, number, grade, position, active | ✅ |
| Users | 帳號與角色 | id | loginId（唯一）, role, playerId, childPlayerIds, active, codeSalt, codeHash | ✅ |
| DailyNotes | 每日筆記 | id | playerId + date（**唯一**）、訓練內容、心得、目標、selfChecks(JSON)、coachComment | ✅ |
| FitnessTests | 體能檢測 | id | playerId, date, item, value, unit, note, createdBy | ✅ |
| AuditLogs | 重要管理操作 | id | at, actorId, actorName, action, target, detail | ✅ |
| Goals | 目標與進度 | id | playerId, term, content, criteria, startDate, dueDate, status, checkpoints(JSON) | ✅ 第三階段 |
| Tasks | 任務設定 | id | title, category, repeat, verify, 各項獎勵, active | ✅ 第四階段 |
| TaskCompletions | 任務完成／領獎 | id | taskId + playerId + periodKey（**唯一**）, status | ✅ 第四階段 |
| Monsters | 怪獸資料（遊戲數值；像素外觀在網頁內建） | id | dexNo, stage, evolvesTo, evolveLevel, habitat, catchRate | ✅ 第四階段 |
| PlayerMonsters | 球員的怪獸 | id | playerId, monsterId, level, exp, partner | ✅ 第四階段 |
| MonsterProgress | 成長紀錄 | id | playerId, playerMonsterId, expGain, levelAfter, reason | ✅ 第四階段 |
| Wallets | 點數、捕捉球、每日探索、遭遇中的怪獸 | playerId | points, balls, exploreDate, exploreCount, supplyDate, seenMonsterIds | ✅ 第四階段（自動建立） |
| RewardLogs | 獎勵獲得紀錄 | id | playerId, source, detail, exp, points, balls | ✅ 第四階段（自動建立） |
| QuizPasses | 防護知識測驗通過紀錄 | id | playerId, articleId, date | ✅ 第四階段（自動建立） |
| Rules | 球隊規章 | id | no, content, category, version, needsCoachReview | ✅ 第三階段 |
| KnowledgeArticles | 防護知識 | id | category, audience, summary, details, sources, status | ✅ 第三階段 |
| Announcements | 公告 | id | title, body, audience, pinned, status | ✅ 第三階段 |

> Wallets、RewardLogs、QuizPasses 三張表在第一次用到時由 Apps Script 自動建立，不需要重新執行 setup()。

### 遊戲的防作弊設計
- 探索遇到哪隻怪獸、捕捉是否成功，都由伺服器抽選；網頁只顯示結果。
- 測驗答案只存在伺服器，球員讀取文章時拿不到答案，由伺服器批改。
- 領獎在 LockService 鎖內檢查「已核准且未領取」，同一筆任務只能領一次；同時送出多次也只會成功一次。
- 系統檢查型任務（今日筆記、本週測驗）由伺服器查詢實際紀錄後才算完成。

## 二、關聯

```
Users.playerId ───────────► Players.id      （球員帳號對應一位球員）
Users.childPlayerIds ─────► Players.id      （家長帳號對應子女，可多位，以逗號分隔）
DailyNotes.playerId ──────► Players.id      （同一球員同一天只有一筆）
FitnessTests.playerId ────► Players.id
Goals.playerId ───────────► Players.id
TaskCompletions.taskId ───► Tasks.id
TaskCompletions.playerId ─► Players.id
PlayerMonsters.monsterId ─► Monsters.id
Monsters.evolvesTo ───────► Monsters.id     （進化路線）
AuditLogs.actorId ────────► Users.id
```

## 三、權限（由後端判斷，前端傳來的角色一律不採信）

每個 API 都在 `Code.gs` 的 `ROUTES` 宣告可使用的角色，伺服器在執行前統一檢查；`runSelfTests()` 會依 `ROUTES` 自動逐一驗證，新增 API 時也會自動被檢查。

| 操作 | 教練 | 球員 | 家長 |
| --- | --- | --- | --- |
| 讀取球員名單 | 全部 | 只有自己 | 只有子女 |
| 讀取每日筆記 | 全部 | 只有自己 | ✗ |
| 新增／更新每日筆記 | ✗ | 只有自己 | ✗ |
| 撰寫教練評語 | ✅ | ✗ | ✗ |
| 讀取體能檢測 | 全部 | 只有自己 | ✗ |
| 新增／修改／刪除體能檢測 | ✅ | ✗ | ✗ |
| 讀取目標 | 全部 | 只有自己 | ✗ |
| 建立目標 | 任何球員 | 只有自己 | ✗ |
| 申請完成檢核點 | ✗ | 只有自己 | ✗ |
| 核准檢核點、變更目標狀態、期限設定 | ✅ | ✗ | ✗ |
| 閱讀規章 | ✅（含待確認備註） | ✅ | ✅ |
| 編輯規章 | ✅ | ✗ | ✗ |
| 閱讀防護知識、公告 | 全部（含草稿） | 已發布且開放給球員 | 已發布且開放給家長 |
| 管理防護知識、公告 | ✅ | ✗ | ✗ |
| 修改自己的登入碼 | ✅ | ✅ | ✅ |
| 帳號管理、操作紀錄 | ✅ | ✗ | ✗ |

目標期限設定儲存在 Apps Script 的「指令碼屬性」（`goalSettings`），不佔用工作表。

## 四、安全設計

- **登入**：帳號（loginId）＋登入碼。登入碼只存「加鹽雜湊值」（SHA-256），試算表中看不到原始登入碼。
- **登入保護**：同一帳號連續失敗 5 次，鎖定 10 分鐘。
- **工作階段**：登入成功後取得隨機 token，有效 6 小時；每次呼叫都重新讀取 Users 確認帳號仍為啟用狀態及其角色。
- **防重複提交**：每次寫入都附帶 requestId，10 分鐘內同一個 requestId 只會執行一次。
- **同時寫入**：所有寫入都使用 LockService 排隊，避免同一天產生兩筆筆記。
- **輸入驗證**：日期格式、不可為未來日期、文字長度、體能項目與數值範圍。
- **公式注入防護**：所有寫入的值都以文字儲存（前置單引號），使用者輸入 `=…` 不會被執行。
- **操作紀錄**：評語、體能檢測的新增／修改／刪除、帳號管理都寫入 AuditLogs。
- 試算表本身**不要公開分享**；網頁只透過 Apps Script 存取資料。

## 五、Google 試算表的限制評估

| 項目 | 限制 | 本專案預估 |
| --- | --- | --- |
| 儲存格總數 | 每份試算表 1,000 萬格 | 30 位球員 × 每天 1 筆筆記 × 15 欄 × 365 天 ≈ 16 萬格／年，綽綽有餘 |
| Apps Script 同時執行數 | 約 30 個 | 全隊同時操作也足夠；寫入時會排隊（LockService） |
| 單次執行時間 | 6 分鐘 | 每次 API 呼叫約 1～3 秒 |
| 回應速度 | 每次呼叫約 1～3 秒 | 比本機示範版慢，介面會顯示「處理中」 |

當資料量成長到數萬筆、讀取明顯變慢時，可以把舊年度資料移到「封存」試算表，或在之後改用正式資料庫。

## 六、備份方式

1. **版本記錄**：Google 試算表內建「檔案 → 版本記錄」，可還原到過去任一時間點。
2. **手動備份**：在 Apps Script 編輯器執行 `backupNow()`，會在雲端硬碟複製一份帶日期的備份。
3. **自動備份**（第五階段設定）：為 `backupNow()` 建立每週觸發條件。
4. 教練後台的「匯出紀錄」可下載 CSV。
