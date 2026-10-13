// 本機模擬雲端 API（只供開發測試）：用模擬的 Google 服務執行 Code.gs，
// 讓前端在還沒部署 Apps Script 之前，就能測試雲端模式的完整流程。
// 資料只存在記憶體中，關閉後就消失；不會連到真正的 Google 試算表。
//
// 執行：npm run mock:api   然後用 .env.mock 啟動前端：npm run dev:mock

import http from 'node:http';
import { createGasEnv } from './mock-env.mjs';

const PORT = 8787;
// 測試專用帳號（只存在這個模擬伺服器裡，不是正式帳號）
const TEST_ACCOUNTS = [
  { loginId: 'test-coach', role: 'coach', displayName: '測試教練', code: 'TESTCOACH' },
  { loginId: 'test-player', role: 'player', displayName: '測試球員甲', code: 'TESTPLAYER', player: { name: '測試球員甲', number: '7', grade: '八年級', position: '投手' } },
  { loginId: 'test-player2', role: 'player', displayName: '測試球員乙', code: 'TESTPLAYER2', player: { name: '測試球員乙', number: '12', grade: '七年級', position: '捕手' } },
  { loginId: 'test-parent', role: 'parent', displayName: '測試家長', code: 'TESTPARENT', childOf: 'test-player' },
];

const { gas } = createGasEnv();
gas.setup();
const now = new Date().toISOString();
const playerIds = {};
TEST_ACCOUNTS.forEach((a, i) => {
  let playerId = '';
  if (a.player) {
    playerId = 'P' + String(i).padStart(3, '0');
    playerIds[a.loginId] = playerId;
    gas.appendRow_('Players', { id: playerId, ...a.player, active: 'TRUE', createdAt: now, updatedAt: now });
  }
  const salt = 'mock-salt-' + i;
  gas.appendRow_('Users', {
    id: 'U-MOCK-' + i,
    loginId: a.loginId,
    displayName: a.displayName,
    role: a.role,
    playerId,
    childPlayerIds: a.childOf ? playerIds[a.childOf] : '',
    active: 'TRUE',
    codeSalt: salt,
    codeHash: gas.hashCode_(salt, a.code),
    createdAt: now,
    updatedAt: now,
  });
});

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
