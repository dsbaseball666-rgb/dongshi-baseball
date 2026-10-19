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
    clearContents: () => {
      rows.length = 0;
      return sheet;
    },
    getDataRange: () => {
      const width = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
      return sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), Math.max(1, width));
    },
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

/** 建立一個全新的模擬環境並載入 Code.gs 與 Tests.gs（和 Apps Script 一樣共用全域）；回傳全域函式與記錄 */
function makeSpreadsheet(id, name) {
  const sheets = [makeSheet('工作表1')];
  let ssName = name;
  const spreadsheet = {
    sheets,
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
    getId: () => id,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
  };
  return spreadsheet;
}

export function createGasEnv() {
  const spreadsheet = makeSpreadsheet('local', '未命名的試算表');
  const sheets = spreadsheet.sheets;
  // SpreadsheetApp.create 建立的試算表（例如球隊管理資料庫）
  const created = new Map();
  const cacheStore = new Map();
  const propStore = new Map();
  // 其他試算表（例如舊體能檢測檔案），可用 addExternal 加入
  const externals = new Map();
  const addExternal = (id, title, tabs) => {
    const list = Object.entries(tabs).map(([name, data]) => {
      const s = makeSheet(name);
      data.forEach((row) => s.appendRow(row));
      return s;
    });
    externals.set(id, { getName: () => title, getSheetByName: (n) => list.find((s) => s.name === n) || null });
  };
  const logs = [];
  // 模擬雲端硬碟：資料夾與檔案只存在記憶體
  const driveFiles = new Map();
  const driveFolders = [];
  const iterator = (list) => {
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  };
  const fileApi = (id) => {
    const f = driveFiles.get(id);
    return {
      getId: () => id, getName: () => f.blob.getName(), getBlob: () => f.blob, getMimeType: () => f.blob.getContentType(), getSize: () => f.blob.getBytes().length,
      isTrashed: () => f.trashed, setTrashed: (v) => (f.trashed = v), getParents: () => iterator(driveFolders.filter((x) => x.getId() === f.folderId)),
    };
  };
  const drive = {
    getFoldersByName: (n) => iterator(driveFolders.filter((f) => f.getName() === n && !f.isTrashed())),
    // 只支援這個專案用到的查詢：title contains '…'
    searchFolders: (q) => {
      const word = (q.match(/title contains '([^']+)'/) || [])[1] || '';
      return iterator(driveFolders.filter((f) => f.getName().includes(word) && !f.isTrashed()));
    },
    getFolderById: (id) => {
      const f = driveFolders.find((x) => x.getId() === id);
      if (!f) throw new Error('not found');
      return f;
    },
    createFolder: (name) => {
      const folderId = 'folder-' + (driveFolders.length + 1);
      let trashed = false;
      const folder = {
        getId: () => folderId,
        getName: () => name,
        isTrashed: () => trashed,
        setTrashed: (v) => (trashed = v),
        createFile: (blob) => {
          const id = 'file-' + (driveFiles.size + 1);
          driveFiles.set(id, { blob, trashed: false, folder: name, folderId });
          return fileApi(id);
        },
        getFiles: () => iterator([...driveFiles.keys()].filter((id) => driveFiles.get(id).folderId === folderId).map(fileApi)),
      };
      driveFolders.push(folder);
      return folder;
    },
    getFileById: (id) => {
      if (!driveFiles.has(id)) throw new Error('not found');
      return fileApi(id);
    },
  };
  const context = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERROR ' + a.join(' ')) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush: () => {},
      openById: (id) => {
        if (created.has(id)) return created.get(id);
        if (!externals.has(id)) throw new Error('not found');
        return externals.get(id);
      },
      create: (name) => {
        const ss = makeSpreadsheet('created-' + (created.size + 1), name);
        created.set(ss.getId(), ss);
        return ss;
      },
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => {
          if (k.length > 250) throw new Error('cache key too long: ' + k.length);
          if (Buffer.byteLength(v, 'utf8') > 100000) throw new Error('cache value too large: ' + Buffer.byteLength(v, 'utf8') + ' bytes');
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
      base64Decode: (s) => [...Buffer.from(s, 'base64')].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64'),
      newBlob: (bytes, type, name) => ({ getBytes: () => bytes, getContentType: () => type, getName: () => name }),
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
    DriveApp: drive,
  };
  vm.createContext(context);
  for (const file of ['Code.gs', 'Tests.gs']) vm.runInContext(readFileSync(new URL('./' + file, import.meta.url), 'utf8'), context, { filename: file });
  return { gas: context, sheets, spreadsheet, logs, addExternal, created };
}
