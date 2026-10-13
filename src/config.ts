// 集中管理設定。API 網址放在專案根目錄的 .env.local（不會上傳到 GitHub），不寫死在程式中。
// 注意：前端不放任何秘密金鑰或管理者憑證。Apps Script 網址本身不是秘密，權限由後端驗證。

export const config = {
  /** Google Apps Script Web App 網址；空白表示只能使用示範模式 */
  apiUrl: (import.meta.env.VITE_GAS_API_URL ?? '').trim(),
  /** 示範模式下模擬網路延遲（毫秒），用來呈現「處理中」狀態 */
  demoLatencyMs: 350,
  /** 每位球員每天的免費探索次數（不因體能成績而改變） */
  dailyExplores: 3,
  /** 每日補給可領取的捕捉球數量（所有球員相同） */
  dailySupplyBalls: 2,
};

export const isCloudConfigured = config.apiUrl !== '';

/** 已經串接雲端的頁面；其他頁面在雲端模式中會顯示「後續階段串接」 */
export const CLOUD_READY_PATHS = ['/', '/hub', '/notes', '/goals', '/fitness', '/exams', '/training', '/explore', '/battle', '/shop', '/dex', '/rules', '/knowledge', '/announcements', '/account', '/admin'];

/** 只有雲端模式提供的頁面（示範模式不顯示）：親師平台、段考成績、對戰、道具商店 */
export const CLOUD_ONLY_PATHS = ['/hub', '/exams', '/battle', '/shop'];
