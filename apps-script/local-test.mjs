// 在本機用「模擬的 Google 服務」執行 Code.gs 的 setup() 與 runSelfTests()，
// 讓我們在貼到 Apps Script 之前先找出錯誤。執行：npm run test:gas
// 注意：這只是模擬環境，正式結果仍以 Apps Script 編輯器中的 runSelfTests() 為準。

import { createGasEnv } from './mock-env.mjs';

const { gas, sheets, spreadsheet, logs, addExternal, created } = createGasEnv();
let failed = false;
try {
  gas.setup();
  gas.setup(); // 重複執行不應出錯，也不應再建立教練
  const coaches = gas.readAll_('Users').filter((u) => u.role === 'coach');
  if (coaches.length !== 1) throw new Error('setup() 重複執行後教練帳號數量應為 1，實際為 ' + coaches.length);
  if (spreadsheet.getSheetByName('工作表1')) throw new Error('預設空白工作表應被刪除');
  if (sheets.length !== 23) throw new Error('原本的試算表應該有 23 張工作表，實際為 ' + sheets.length);
  if (created.size !== 1) throw new Error('應該另外建立 1 份球隊管理試算表，實際為 ' + created.size);
  const teamSs = [...created.values()][0];
  const teamNames = teamSs.getSheets().map((s) => s.getName()).sort().join(',');
  if (teamNames !== 'Attendance,BudgetItems,Games,PlayerProfiles,PracticeDays,Tournaments,Transactions') throw new Error('球隊管理試算表的工作表不正確：' + teamNames);
  logs.push('✅ PASS（本機）球隊管理資料放在另一份新的試算表（7 張工作表），原本的試算表沒有增加工作表');
  const ping = JSON.parse(gas.doGet().content);
  if (!ping.ok) throw new Error('doGet 失敗');
  const bad = JSON.parse(gas.doPost({ postData: { contents: 'not json' } }).content);
  if (bad.ok || bad.code !== 'BAD_REQUEST') throw new Error('錯誤格式的請求應被拒絕');
  const unknown = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action: 'dropAll' }) } }).content);
  if (unknown.ok || unknown.code !== 'NOT_FOUND') throw new Error('未知的操作應被拒絕');
  // 模擬「上次測試中途被停止」留下的資料：這次測試應該照樣全部通過，並且清乾淨
  const t0 = new Date().toISOString();
  gas.appendRow_('Players', { id: 'TEST-PA', name: '測試球員TEST-PA', active: 'TRUE', createdAt: t0, updatedAt: t0 });
  gas.appendRow_('Users', { id: 'U-left1', loginId: 'test-coach-1791860931954', displayName: '殘留', role: 'coach', active: 'TRUE', codeSalt: 'x', codeHash: 'y', createdAt: t0, updatedAt: t0 });
  gas.appendRow_('Users', { id: 'U-left2', loginId: 'test-parent-1791860935139', displayName: '殘留', role: 'parent', childPlayerIds: 'TEST-PA', active: 'TRUE', codeSalt: 'x', codeHash: 'y', createdAt: t0, updatedAt: t0 });
  gas.appendRow_('KnowledgeArticles', { id: 'K-left', title: '測試文章', category: 'heat', audience: 'coach,player', summary: '摘要', status: 'published', updatedAt: t0 });
  gas.appendRow_('Announcements', { id: 'A-left', title: '測試公告', body: '內容', audience: 'player', status: 'published', updatedAt: t0 });
  gas.appendRow_('Monsters', { id: 'TEST-M1', dexNo: 901, name: '殘留獸', element: '熱血', rarity: 1, stage: 1, habitat: 'field', catchRate: 1 });
  gas.runSelfTests();
  if (logs.some((l) => l.startsWith('❌'))) throw new Error('有殘留資料時測試失敗');
  logs.push('✅ PASS（本機）上次測試中途停止留下的資料，這次測試會先清掉，測試照樣全部通過');
  const leftovers = ['Players', 'DailyNotes', 'FitnessTests', 'Goals', 'Rules', 'KnowledgeArticles', 'Announcements', 'AuditLogs',
    'Tasks', 'TaskCompletions', 'Monsters', 'PlayerMonsters', 'MonsterProgress', 'Wallets', 'RewardLogs', 'QuizPasses', 'ExamScores', 'Battles', 'Invites', 'Messages', 'SchoolRecords', 'Events',
    'PracticeDays', 'Attendance', 'PlayerProfiles', 'BudgetItems', 'Transactions', 'Tournaments', 'Games']
    .map((n) => [n, gas.readAll_(n).length])
    .filter(([, c]) => c > 0);
  if (leftovers.length) throw new Error('測試資料沒有清乾淨：' + JSON.stringify(leftovers));
  if (gas.readAll_('Users').length !== 1) throw new Error('測試帳號沒有清乾淨');
  const logSheet = spreadsheet.getSheetByName('自動測試結果');
  const logRows = logSheet ? logSheet.getDataRange().getDisplayValues() : [];
  if (logRows.length < 200 || logRows[0][0] !== '結果' || !logRows[0][3].includes('通過')) throw new Error('測試結果沒有寫入「自動測試結果」工作表');
  logs.push('✅ PASS（本機）測試結果已寫入「自動測試結果」工作表（' + (logRows.length - 1) + ' 列）');

  // 完整流程：用假的舊檔案（虛構姓名）測試「預覽 → 匯入 → 再匯入一次不重複」
  const coachCode = logs.join('\n').match(/登入碼：([A-Z0-9]+)/)[1];
  const call = (action, payload, token) => JSON.parse(gas.handle_({ action, payload, token, requestId: String(Math.random()) }));
  const token = call('login', { loginId: 'coach', code: coachCode }).data.token;
  const LEGACY_ID = 'LegacyFakeSheet0123456789abcdef';
  addExternal(LEGACY_ID, '假的舊檔案', {
    紀錄: [
      ['記錄ID', '人員ID', '姓名', '檢測項目', '日期', '數值', '單位', '細節', '建立時間'],
      ['a1', 'x', '王小明', 'run1500', '2026/8/4', '388.1', '秒', '{"term":"115上"}', ''],
      ['a2', 'x', '王小明', 'longjump', '2026-09-04', '225', '公分', '', ''],
      ['a3', 'y', '李小華', 'pitch', '2026-09-08', '97.6', 'km/h', '', ''],
      ['a4', 'y', '李小華', 'grip', '2026-09-04', '31.3', '公斤', '', ''],
      ['a5', 'y', '李小華', 'pushup', '2026-09-04', '999', '次', '', ''],
    ],
    名單: [['姓名', '建立時間', '人員ID'], ['王小明', '', 'x'], ['李小華', '', 'y'], ['陳小美', '', 'z']],
  });
  const url = `https://docs.google.com/spreadsheets/d/${LEGACY_ID}/edit`;
  const pv = call('adminPreviewLegacyImport', { sheetUrl: url }, token);
  if (!pv.ok || pv.data.preview.importable !== 4 || pv.data.preview.newPlayers !== 3 || pv.data.preview.skippedCount !== 1) throw new Error('匯入預覽結果不正確：' + JSON.stringify(pv));
  if (gas.readAll_('FitnessTests').length !== 0) throw new Error('預覽不應寫入資料');
  const run1 = call('adminRunLegacyImport', { sheetUrl: url }, token);
  if (!run1.ok || run1.data.imported !== 4 || run1.data.newPlayers !== 3) throw new Error('第一次匯入結果不正確：' + JSON.stringify(run1));
  const run2 = call('adminRunLegacyImport', { sheetUrl: url }, token);
  if (!run2.ok || run2.data.imported !== 0 || run2.data.duplicates !== 4 || run2.data.newPlayers !== 0) throw new Error('重複匯入應該全部略過：' + JSON.stringify(run2));
  const ming = gas.readAll_('Players').find((p) => p.name === '王小明');
  const mingTests = gas.readAll_('FitnessTests').filter((f) => f.playerId === ming.id);
  if (mingTests.length !== 2 || !mingTests.some((f) => f.item === 'jump' && f.date === '2026-09-04')) throw new Error('匯入的紀錄沒有對到正確的球員');
  const acct = call('adminCreatePlayerAccount', { playerId: ming.id }, token);
  if (!acct.ok || !call('login', { loginId: acct.data.loginId, code: acct.data.code }).ok) throw new Error('匯入的球員無法建立帳號');
  if (call('adminPreviewLegacyImport', { sheetUrl: 'https://docs.google.com/spreadsheets/d/NotExisting0123456789xyz/edit' }, token).code !== 'INVALID') throw new Error('打不開的檔案應回報錯誤');
  logs.push('✅ PASS（本機）舊資料匯入完整流程：預覽不寫入、匯入 4 筆、新增 3 位球員、重複匯入不重複、可建立帳號');

  // 舊版試算表升級：PlayerMonsters 只有舊欄位時，setup() 補上新欄位，原有資料不變
  const old = createGasEnv();
  const pmSheet = old.spreadsheet.insertSheet('PlayerMonsters');
  pmSheet.appendRow(['id', 'playerId', 'monsterId', 'nickname', 'level', 'exp', 'partner', 'obtainedAt', 'obtainedBy']);
  pmSheet.appendRow(["'PM-1", "'P001", "'M001", "'小火", "'5", "'10", "'TRUE", "'2026-10-01", "'starter"]);
  old.gas.setup();
  const header = pmSheet.getRange(1, 1, 1, 11).getDisplayValues()[0];
  const pm = old.gas.readAll_('PlayerMonsters');
  if (header[9] !== 'hp' || header[10] !== 'hpAt' || pm.length !== 1 || pm[0].nickname !== '小火' || pm[0].hp !== '') throw new Error('舊版工作表升級不正確：' + header.join(','));
  logs.push('✅ PASS（本機）舊版工作表升級：自動補上新欄位，原有資料不變');
} catch (e) {
  failed = true;
  logs.push('❌ ' + (e && e.stack ? e.stack : e));
}
// 不印出登入碼
console.log(logs.map((l) => l.replace(/登入碼：[A-Z0-9]+/g, '登入碼：********')).join('\n'));
process.exit(failed ? 1 : 0);
