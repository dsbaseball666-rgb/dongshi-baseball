import { useEffect, useState } from 'react';
import { canShareFiles, canvasToBlob, downloadBlob, shareOrDownload } from '../lib/noticeImage';
import { Alert } from './UI';

/** 「產生 LINE 圖片」按鈕：按下去先預覽，再分享（手機）或下載（電腦） */
export function LineImageButton({ make, filename, title, label = '🖼️ 產生 LINE 圖片', disabled }: { make: () => HTMLCanvasElement | Promise<HTMLCanvasElement>; filename: string; title: string; label?: string; disabled?: boolean }) {
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 換新圖片或關閉時，釋放舊圖片佔用的記憶體
  useEffect(
    () => () => {
      if (img) URL.revokeObjectURL(img.url);
    },
    [img],
  );
  const share = canShareFiles();

  const create = async () => {
    setError(null);
    setMsg(null);
    try {
      const blob = await canvasToBlob(await make());
      setImg({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={create} disabled={disabled}>
        {label}
      </button>
      {error && <Alert kind="error">{error}</Alert>}
      {img && (
        <div className="line-image">
          <img src={img.url} alt={title} />
          <p className="muted small">
            {share ? '按「分享到 LINE」後選 LINE 和群組；也可以長按圖片儲存。' : '下載後，把圖片拖進 LINE 聊天室（或在 LINE 按「傳送圖片」）。'}
          </p>
          <div className="form-actions">
            {share && (
              <button type="button" className="btn btn-primary" onClick={async () => setMsg((await shareOrDownload(img.blob, filename, title)) === 'downloaded' ? '已下載圖片。' : null)}>
                📤 分享到 LINE
              </button>
            )}
            <button
              type="button"
              className={share ? 'btn' : 'btn btn-primary'}
              onClick={() => {
                downloadBlob(img.blob, filename);
                setMsg('已下載圖片。');
              }}
            >
              ⬇️ 下載圖片
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setImg(null)}>
              關閉
            </button>
          </div>
          {msg && <Alert kind="success">{msg}</Alert>}
        </div>
      )}
    </>
  );
}
