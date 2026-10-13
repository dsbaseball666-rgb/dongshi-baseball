import { config } from '../config';

// 呼叫 Google Apps Script Web App。
// 使用 text/plain 送出 JSON，避免瀏覽器的 CORS 預檢（Apps Script 不支援 OPTIONS）。

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function callApi<T>(action: string, payload: object, token?: string): Promise<T> {
  if (!config.apiUrl) throw new ApiError('NO_CONFIG', '尚未設定雲端 API 網址。');
  let res: Response;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token, requestId: newRequestId() }),
    });
  } catch {
    throw new ApiError('NETWORK', '無法連線到雲端，請檢查網路後再試一次。');
  }
  if (!res.ok) throw new ApiError('HTTP', `雲端回應錯誤（HTTP ${res.status}），請稍後再試。`);
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError('BAD_RESPONSE', '雲端回應格式不正確，請確認 Apps Script 已部署為「網頁應用程式」。');
  }
  if (!body.ok) throw new ApiError(body.code ?? 'ERROR', body.error ?? '雲端發生錯誤。');
  return body.data as T;
}
