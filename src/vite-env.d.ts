/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 第二階段才會設定：Google Apps Script Web App 網址 */
  readonly VITE_GAS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
