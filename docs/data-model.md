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
| Monsters | 怪獸資料（遊戲數值；像素外觀在網頁內建） | id | dexNo, stage, evolvesTo, evolveLevel, habitat, catchRate, evolveAffection | ✅ 第四階段（5.6 新增 evolveAffection：空白＝預設、0＝等級進化、大於 0＝親密度進化） |
| PlayerMonsters | 球員的怪獸 | id | playerId, monsterId, level, exp, partner, hp, hpAt, affection, careDate, careCounts | ✅ 第四階段（5.2 新增 hp、hpAt；5.6 新增親密度與每日互動次數） |
| MonsterProgress | 成長紀錄 | id | playerId, playerMonsterId, expGain, levelAfter, reason | ✅ 第四階段 |
| Wallets | 點數、捕捉球、每日探索、遭遇中的怪獸、道具、每日對戰次數 | playerId | points, balls, exploreDate, exploreCount, supplyDate, seenMonsterIds, items, battleDate, pveCount, pvpCount | ✅ 第四階段（自動建立；5.2 新增道具與對戰欄位） |
| ExamScores | 段考成績 | id | playerId + schoolYear + semester + examNo（**唯一**）, grade, scores（JSON：科目→分數） | ✅ 5.2（自動建立） |
| Invites | 家長／老師邀請碼（只存加鹽雜湊） | id | role, playerIds, status（active/used/revoked）, expiresAt | ✅ 5.4（自動建立） |
| Messages | 親師平台溝通區 | id | playerId, authorId, authorRole, body | ✅ 5.4（自動建立） |
| SchoolRecords | 在校表現紀錄 | id | playerId, date, category, rating, content, authorId | ✅ 5.4（自動建立） |
| Events | 行程 | id | title, date, startTime, endTime, category, playerIds（空白＝全隊） | ✅ 5.4（自動建立） |
| Battles | 對戰紀錄 | id | playerId, mode（pve/pvp）, opponentPlayerId, date, status, state（JSON）, log, result | ✅ 5.2（自動建立） |
| RewardLogs | 獎勵獲得紀錄 | id | playerId, source, detail, exp, points, balls | ✅ 第四階段（自動建立） |
| QuizPasses | 防護知識測驗通過紀錄 | id | playerId, articleId, date | ✅ 第四階段（自動建立） |
| Rules | 球隊規章 | id | no, content, category, version, needsCoachReview | ✅ 第三階段 |
| KnowledgeArticles | 防護知識 | id | category, audience, summary, details, sources, status | ✅ 第三階段 |
| Announcements | 公告 | id | title, body, audience, pinned, status | ✅ 第三階段 |
| PracticeDays ※ | 一週練球通知 | id | date（**唯一**）, type（練球/休息/比賽/其他）, startTime, endTime, location, content, note | ✅ 5.7 |
| Attendance ※ | 出缺席 | id | date + playerId（**唯一**）, status（出席/遲到/早退/事假/病假/公假/缺席）, reason | ✅ 5.7 |
| PlayerProfiles ※ | 球員個人資料與通訊錄（只有教練） | playerId | birthday, className, batsThrows, height, weight, 監護人與電話, medicalNote | ✅ 5.7 |
| BudgetItems ※ | 預算項目 | id | year + type + name（**唯一**）, amount | ✅ 5.7 |
| Transactions ※ | 收支明細 | id | year, date, type（收入/支出）, itemId, title, amount（整數元）, handler | ✅ 5.7 |
| Tournaments ※ | 盃賽、聯賽 | id | name, kind, startDate, endDate, signupDeadline, fee, result, playerIds | ✅ 5.7 |
| Games ※ | 每一場比賽 | id | tournamentId, date, time, opponent, side, ourScore, oppScore | ✅ 5.7 |

> ※ 標記的 7 張表放在**另一份獨立的試算表「東勢國中棒球隊｜球隊管理 資料庫」**，避免原本的資料庫越來越大。第一次執行 `setup()`（或 `setupTeamDb()`）時自動建立，試算表 ID 存在指令碼屬性 `teamSpreadsheetId`；帳號與球員名單仍在原本的試算表。

> Wallets、RewardLogs、QuizPasses、ExamScores、Battles 在第一次用到時由 Apps Script 自動建立，不需要重新執行 setup()。
> 新版本在既有工作表**最後面**新增的欄位（例如 PlayerMonsters 的 hp、hpAt），執行 `runSelfTests()` 或 `setup()` 時會自動補上欄位名稱，原有資料不會被修改。

### 段考成績
- 科目依年級固定（與教練提供的清單相同）：一年級 國文、數學、英文、社會、自然、建教；二年級 國文、數學、英文、地理、歷史、公民、理化、建教；三年級 國文、數學、英文、地理、歷史、公民、理化、地科生物。
- 分數 0～100、最多一位小數；空白代表沒有這科成績（不存成 0 分）。
- 段考成績和遊戲**完全無關**，不會影響經驗值、點數或對戰。

### 血量、道具與對戰
- 怪獸能力值（最大 HP、攻擊、防禦、速度）由等級、進化階段、稀有度與屬性計算，不另外存檔。
- HP：空白代表滿血；受傷後每小時自然回復最大 HP 的 25%。
- 道具只能用遊戲點數購買（回復藥水、高級回復藥、力量手套、防護護具），每種最多持有 20 個；**捕捉球不在商店販售**。
- 每天：野外對戰（PVE）5 次、隊友挑戰（PVP）3 次，同一位隊友一天只能挑戰一次。
- PVP 不是即時連線：被挑戰的隊友的夥伴由電腦操控、以滿血出戰，**不會扣對方的 HP**；對方會在對戰紀錄看到「防守紀錄」。
- 每一回合的傷害、先後順序、會心一擊、逃跑是否成功、掉落道具，全部在伺服器計算；同時只能有一場進行中的對戰。

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
ExamScores.playerId ──────► Players.id      （同一球員同一次段考只有一筆）
Battles.playerId ─────────► Players.id      （挑戰者）
Battles.opponentPlayerId ─► Players.id      （PVP 被挑戰的隊友）
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
| 體能檢測系統：讀取全隊紀錄（listTeamFitness）、整隊一次輸入（saveFitnessBatch） | ✅ | ✗ | ✗ |
| 讀取目標 | 全部 | 只有自己 | ✗ |
| 建立目標 | 任何球員 | 只有自己 | ✗ |
| 申請完成檢核點 | ✗ | 只有自己 | ✗ |
| 核准檢核點、變更目標狀態、期限設定 | ✅ | ✗ | ✗ |
| 閱讀規章 | ✅（含待確認備註） | ✅ | ✅ |
| 編輯規章 | ✅ | ✗ | ✗ |
| 閱讀防護知識、公告 | 全部（含草稿） | 已發布且開放給球員 | 已發布且開放給家長 |
| 管理防護知識、公告 | ✅ | ✗ | ✗ |
| 讀取段考成績 | 全部 | 只有自己 | 只有子女（老師：負責的學生） |
| 親師平台總覽、溝通區留言 | 全部 | ✗ | 只有子女（老師：負責的學生） |
| 在校表現紀錄（新增／修改） | ✅ | ✗ | ✗（老師：負責的學生，只能改自己寫的） |
| 行程（新增／修改） | 全隊或指定學生 | ✗ | ✗（老師：只能給負責的學生） |
| 讀取行程 | 全部 | 全隊＋自己 | 全隊＋子女（老師：全隊＋負責的學生） |
| 產生／作廢邀請碼 | ✅ | ✗ | ✗ |
| 讀取練球通知、賽事與比分 | ✅ | ✅ | ✅（老師、學務處也可以） |
| 修改練球通知、賽事 | ✅ | ✗ | ✗ |
| 出缺席、球員通訊錄、預算 | ✅ | ✗ | ✗ |
| 新增／修改／刪除段考成績 | ✅ | ✗ | ✗ |
| 購買／使用道具、對戰 | ✗ | 只有自己的怪獸 | ✗ |
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
