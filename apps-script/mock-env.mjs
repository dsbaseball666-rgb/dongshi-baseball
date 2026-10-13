// 模擬 Apps Script 的 Google 服務（試算表、快取、鎖、工具），讓 Code.gs 可以在本機 Node.js 執行。
// 只用於開發測試，正式環境一律使用 Google 的真實服務。

import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';

function makeSheet(name) {
  const rows = [];
  const display = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v === undefined ? '' : String(v));
  const sheet = {
    name,
    getName: () => name,
    getLastRow: () => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].some((c) => c !== '' && c !== undefined)) return i + 1;
      return 0;
    },
    getMaxRows: () => Math.max(1000, rows.length),
    appendRow: (vals) => {
      rows[sheet.getLastRow()] = [...vals];
    },
    deleteRow: (r) => {
      rows.splice(r - 1, 1);
    },
    setFrozenRows: () => sheet,
    getRange: (row, col, numRows = 1, numCols = 1) => {
      const range = {
        getDisplayValues: () =>
          Array.from({ length: numRows }, (_, i) => Array.from({ length: numCols }, (_, j) => display((rows[row - 1 + i] || [])[col - 1 + j]))),
        setValues: (vals) => {
          vals.forEach((r, i) => {
            const target = (rows[row - 1 + i] = rows[row - 1 + i] || []);
            r.forEach((v, j) => (target[col - 1 + j] = v));
          });
          return range;
        },
        setFontWeight: () => range,
        setBackground: () => range,
        setNumberFormat: () => range,
      };
      return range;
    },
  };
  return sheet;
}

/** 建立一個全新的模擬環境並載入 Code.gs；回傳 Code.gs 的全域函式與記錄 */
export function createGasEnv() {
  const sheets = [makeSheet('工作表1')];
  let ssName = '未命名的試算表';
  const spreadsheet = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => {
      const s = makeSheet(n);
      sheets.push(s);
      return s;
    },
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
    getSheets: () => sheets,
    getName: () => ssName,
    rename: (n) => (ssName = n),
    setSpreadsheetTimeZone: () => {},
    getId: () => 'local',
  };
  const cacheStore = new Map();
  const propStore = new Map();
  const logs = [];
  const context = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERROR ' + a.join(' ')) },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush: () => {} },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => {
          if (k.length > 250) throw new Error('cache key too long: ' + k.length);
          if (v.length > 100000) throw new Error('cache value too large');
          cacheStore.set(k, v);
        },
        remove: (k) => cacheStore.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propStore.has(k) ? propStore.get(k) : null),
        setProperty: (k, v) => propStore.set(k, String(v)),
        deleteProperty: (k) => propStore.delete(k),
      }),
    },
    ContentService: { createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Utilities: {
      getUuid: () => randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg, s) => [...createHash('sha256').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(
          new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
            .formatToParts(d)
            .map((x) => [x.type, x.value]),
        );
        return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
      },
    },
    DriveApp: {},
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), context, { filename: 'Code.gs' });
  return { gas: context, sheets, spreadsheet, logs };
}
