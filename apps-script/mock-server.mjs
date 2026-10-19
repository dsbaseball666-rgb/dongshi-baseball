// 本機模擬雲端 API（只供開發測試）：用模擬的 Google 服務執行 Code.gs，
// 讓前端在還沒部署 Apps Script 之前，就能測試雲端模式的完整流程。
// 資料只存在記憶體中，關閉後就消失；不會連到真正的 Google 試算表。
//
// 執行：npm run mock:api   然後用 .env.mock 啟動前端：npm run dev:mock

import http from 'node:http';
import { createGasEnv } from './mock-env.mjs';

// 預設 8787；同時開兩個模擬伺服器時可以用 PORT 指定別的連接埠
const PORT = Number(process.env.PORT) || 8787;
// 測試專用帳號（只存在這個模擬伺服器裡，不是正式帳號）
const TEST_ACCOUNTS = [
  { loginId: 'test-coach', role: 'coach', displayName: '測試教練', code: 'TESTCOACH' },
  { loginId: 'test-player', role: 'player', displayName: '測試球員甲', code: 'TESTPLAYER', player: { name: '測試球員甲', number: '7', grade: '八年級', position: '投手' } },
  { loginId: 'test-player2', role: 'player', displayName: '測試球員乙', code: 'TESTPLAYER2', player: { name: '測試球員乙', number: '12', grade: '七年級', position: '捕手' } },
  { loginId: 'test-parent', role: 'parent', displayName: '測試家長', code: 'TESTPARENT', childOf: 'test-player' },
  { loginId: 'test-teacher', role: 'teacher', displayName: '測試老師', code: 'TESTTEACHER1', childOf: ['test-player', 'test-player2'] },
  { loginId: 'test-office', role: 'office', displayName: '測試學務處', code: 'TESTOFFICE1' },
];

const { gas, addExternal } = createGasEnv();
gas.setup();
// 假的舊體能檢測檔案（虛構姓名），網址：https://docs.google.com/spreadsheets/d/MockLegacySheet0123456789abcdef/edit
addExternal('MockLegacySheet0123456789abcdef', '假的舊體能檢測檔案', {
  紀錄: [
    ['記錄ID', '人員ID', '姓名', '檢測項目', '日期', '數值', '單位', '細節', '建立時間'],
    ['m1', 'x', '測試球員甲', 'run1500', '2026/8/4', '388.1', '秒', '{"term":"115上"}', ''],
    ['m2', 'x', '測試球員甲', 'run1500', '2026-10-05', '372.4', '秒', '{"term":"115上"}', ''],
    ['m3', 'y', '王小明', 'longjump', '2026-09-04', '225', '公分', '', ''],
    ['m4', 'y', '王小明', 'pitch', '2026-09-08', '97.6', 'km/h', '', ''],
    ['m5', 'z', '李小華', 'swing', '2026-09-08', '89.9', 'km/h', '', ''],
    ['m6', 'z', '李小華', 'pushup', '2026-09-04', '999', '次', '', ''],
  ],
  名單: [['姓名', '建立時間', '人員ID'], ['測試球員甲', '', 'x'], ['王小明', '', 'y'], ['李小華', '', 'z']],
});
const now = new Date().toISOString();
const playerIds = {};
TEST_ACCOUNTS.forEach((a, i) => {
  let playerId = '';
  if (a.player) {
    playerId = 'P' + String(i).padStart(3, '0');
    playerIds[a.loginId] = playerId;
    gas.appendRow_('Players', { id: playerId, ...a.player, active: 'TRUE', createdAt: now, updatedAt: now });
    // 測試用：先給 200 點，方便測試道具商店
    gas.appendRow_('Wallets', { playerId, points: 200, balls: 3, updatedAt: now });
  }
  const salt = 'mock-salt-' + i;
  gas.appendRow_('Users', {
    id: 'U-MOCK-' + i,
    loginId: a.loginId,
    displayName: a.displayName,
    role: a.role,
    playerId,
    childPlayerIds: [].concat(a.childOf || []).map((k) => playerIds[k]).join(','),
    active: 'TRUE',
    codeSalt: salt,
    codeHash: gas.hashCode_(salt, a.code),
    createdAt: now,
    updatedAt: now,
  });
});

// 虛構的球員（只在模擬伺服器裡，沒有帳號），讓「練球安排」等功能有比較多人可以選
[
  ['陳小投', '1', '九年級', '投手'], ['林小捕', '2', '九年級', '捕手'], ['黃一壘', '3', '八年級', '內野'], ['張二壘', '4', '八年級', '內野'],
  ['李游擊', '6', '九年級', '內野，投手'], ['王左外', '8', '七年級', '外野'], ['吳中外', '9', '七年級', '外野'], ['趙右投', '11', '八年級', '投手，外野'],
].forEach(([name, number, grade, position], i) => {
  gas.appendRow_('Players', { id: 'P1' + String(i).padStart(2, '0'), name, number, grade, position, active: 'TRUE', createdAt: now, updatedAt: now });
});

// 假的「大頭照」資料夾（1 像素的色塊圖片，不是真人照片），用來測試「從雲端資料夾匯入」
{
  const px = (b64) => gas.Utilities.base64Decode(b64);
  const RED = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const folder = gas.DriveApp.createFolder('05 球員大頭照（測試）');
  ['陳小投(國三).png', '林小捕(國三).png', '王左外(國一).png', '不認識(國二).png'].forEach((name) => folder.createFile(gas.Utilities.newBlob(px(RED), 'image/png', name)));
}

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(gas.doGet().content);
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      // 模擬真實 Apps Script 約 0.5 秒的回應時間
      setTimeout(() => {
        res.setHeader('Content-Type', 'application/json');
        res.end(gas.doPost({ postData: { contents: body } }).content);
      }, 500);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`模擬雲端 API：http://127.0.0.1:${PORT}（測試帳號請見 apps-script/mock-server.mjs）`));
