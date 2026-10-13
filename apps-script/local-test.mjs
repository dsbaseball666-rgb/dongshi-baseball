// 在本機用「模擬的 Google 服務」執行 Code.gs 的 setup() 與 runSelfTests()，
// 讓我們在貼到 Apps Script 之前先找出錯誤。執行：npm run test:gas
// 注意：這只是模擬環境，正式結果仍以 Apps Script 編輯器中的 runSelfTests() 為準。

import { createGasEnv } from './mock-env.mjs';

const { gas, sheets, spreadsheet, logs, addExternal } = createGasEnv();
let failed = false;
try {
  gas.setup();
  gas.setup(); // 重複執行不應出錯，也不應再建立教練
  const coaches = gas.readAll_('Users').filter((u) => u.role === 'coach');
  if (coaches.length !== 1) throw new Error('setup() 重複執行後教練帳號數量應為 1，實際為 ' + coaches.length);
  if (spreadsheet.getSheetByName('工作表1')) throw new Error('預設空白工作表應被刪除');
  if (sheets.length !== 19) throw new Error('應該有 19 張工作表，實際為 ' + sheets.length);
  const ping = JSON.parse(gas.doGet().content);
  if (!ping.ok) throw new Error('doGet 失敗');
  const bad = JSON.parse(gas.doPost({ postData: { contents: 'not json' } }).content);
  if (bad.ok || bad.code !== 'BAD_REQUEST') throw new Error('錯誤格式的請求應被拒絕');
  const unknown = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action: 'dropAll' }) } }).content);
  if (unknown.ok || unknown.code !== 'NOT_FOUND') throw new Error('未知的操作應被拒絕');
  gas.runSelfTests();
  const leftovers = ['Players', 'DailyNotes', 'FitnessTests', 'Goals', 'Rules', 'KnowledgeArticles', 'Announcements', 'AuditLogs',
    'Tasks', 'TaskCompletions', 'Monsters', 'PlayerMonsters', 'MonsterProgress', 'Wallets', 'RewardLogs', 'QuizPasses', 'ExamScores', 'Battles']
    .map((n) => [n, gas.readAll_(n).length])
    .filter(([, c]) => c > 0);
  if (leftovers.length) throw new Error('測試資料沒有清乾淨：' + JSON.stringify(leftovers));
  if (gas.readAll_('Users').length !== 1) throw new Error('測試帳號沒有清乾淨');

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
