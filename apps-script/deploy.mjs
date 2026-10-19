// 一鍵更新 Apps Script（不用再手動貼程式）：npm run deploy:gas
//   1. 先在本機跑 setup() 與 runSelfTests()（npm run test:gas 已在 package.json 先執行）
//   2. clasp push：把 Code.gs、Tests.gs、appsscript.json 送到 Apps Script 專案
//   3. clasp deploy：更新網站正在用的那個部署作業（網址不變）
//   4. 打開網址確認版本號已經是新的
// 需要先 clasp login（只要一次），並在 apps-script/.clasp.json 設定指令碼 ID。

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const fail = (msg) => {
  console.error('❌ ' + msg);
  process.exit(1);
};

if (!existsSync(path.join(here, '.clasp.json'))) fail('找不到 apps-script/.clasp.json（指令碼 ID），請先完成 clasp 設定。');
const env = existsSync(path.join(root, '.env.local')) ? readFileSync(path.join(root, '.env.local'), 'utf8') : '';
const url = (env.match(/^VITE_GAS_API_URL=(.+)$/m) || [])[1]?.trim();
const deploymentId = url && (url.match(/\/macros\/s\/([^/]+)\/exec/) || [])[1];
if (!deploymentId) fail('.env.local 裡找不到 VITE_GAS_API_URL（網站用的 Apps Script 網址）。');
const version = (readFileSync(path.join(here, 'Code.gs'), 'utf8').match(/API_VERSION = '([^']+)'/) || [])[1];

const clasp = (args) => {
  // Windows 的 .cmd 需要透過 shell 執行；參數都是固定的文字，不含使用者輸入
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'clasp.cmd' : 'clasp');
  const r = spawnSync([`"${bin}"`, ...args].join(' '), { cwd: here, encoding: 'utf8', shell: true });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) fail('clasp ' + args[0] + ' 失敗：\n' + out);
  return out;
};

console.log('⬆️  上傳 Code.gs、Tests.gs 到 Apps Script…');
clasp(['push', '--force']);
console.log('🚀 更新網站的部署作業（網址不變）…');
const note = `"v${version} ${new Date().toISOString().slice(0, 10)}"`;
clasp(['deploy', '--deploymentId', deploymentId, '--description', note]);

console.log('🔎 確認網站已經在用新版本…');
const res = await fetch(url, { redirect: 'follow' });
const body = await res.json().catch(() => null);
const live = body && body.data && body.data.version;
if (live !== version) fail(`網站回報的版本是 ${live}，預期是 ${version}。請稍等一分鐘再試，或到 Apps Script 檢查。`);
console.log(`✅ 完成！網站的 Apps Script 已更新到 ${version}。`);
