// 在本機用「模擬的 Google 服務」執行 Code.gs 的 setup() 與 runSelfTests()，
// 讓我們在貼到 Apps Script 之前先找出錯誤。執行：npm run test:gas
// 注意：這只是模擬環境，正式結果仍以 Apps Script 編輯器中的 runSelfTests() 為準。

import { createGasEnv } from './mock-env.mjs';

const { gas, sheets, spreadsheet, logs } = createGasEnv();
let failed = false;
try {
  gas.setup();
  gas.setup(); // 重複執行不應出錯，也不應再建立教練
  const coaches = gas.readAll_('Users').filter((u) => u.role === 'coach');
  if (coaches.length !== 1) throw new Error('setup() 重複執行後教練帳號數量應為 1，實際為 ' + coaches.length);
  if (spreadsheet.getSheetByName('工作表1')) throw new Error('預設空白工作表應被刪除');
  if (sheets.length !== 17) throw new Error('應該有 17 張工作表，實際為 ' + sheets.length);
  const ping = JSON.parse(gas.doGet().content);
  if (!ping.ok) throw new Error('doGet 失敗');
  const bad = JSON.parse(gas.doPost({ postData: { contents: 'not json' } }).content);
  if (bad.ok || bad.code !== 'BAD_REQUEST') throw new Error('錯誤格式的請求應被拒絕');
  const unknown = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action: 'dropAll' }) } }).content);
  if (unknown.ok || unknown.code !== 'NOT_FOUND') throw new Error('未知的操作應被拒絕');
  gas.runSelfTests();
  const leftovers = ['Players', 'DailyNotes', 'FitnessTests', 'Goals', 'Rules', 'KnowledgeArticles', 'Announcements', 'AuditLogs',
    'Tasks', 'TaskCompletions', 'Monsters', 'PlayerMonsters', 'MonsterProgress', 'Wallets', 'RewardLogs', 'QuizPasses']
    .map((n) => [n, gas.readAll_(n).length])
    .filter(([, c]) => c > 0);
  if (leftovers.length) throw new Error('測試資料沒有清乾淨：' + JSON.stringify(leftovers));
  if (gas.readAll_('Users').length !== 1) throw new Error('測試帳號沒有清乾淨');
} catch (e) {
  failed = true;
  logs.push('❌ ' + (e && e.stack ? e.stack : e));
}
// 不印出登入碼
console.log(logs.map((l) => l.replace(/登入碼：[A-Z0-9]+/g, '登入碼：********')).join('\n'));
process.exit(failed ? 1 : 0);
