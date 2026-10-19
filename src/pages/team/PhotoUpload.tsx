import { useEffect, useState } from 'react';
import type { Player } from '../../types';
import { useTask } from '../../store/DemoStore';
import { nameFromFile, resizePhoto, resizeSrc } from '../../lib/photo';
import { ActionFeedback, Alert, Card } from '../../components/UI';
import { PlayerPhoto } from '../../components/PlayerPhoto';
import type { usePhotos } from '../../sources/team';

type Photos = ReturnType<typeof usePhotos>;

/** 個人資料裡的大頭照：選照片（手機可以直接拍照）或刪除 */
export function PhotoPicker({ player, photos }: { player: Player; photos: Photos }) {
  const task = useTask();
  const url = photos.photos[player.id];
  return (
    <div className="photo-picker">
      <PlayerPhoto url={url} name={player.name} size={88} />
      <div className="form">
        <label className="btn btn-sm">
          📷 {url ? '換一張照片' : '選擇照片／拍照'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) await task.run(async () => photos.savePhoto(player.id, await resizePhoto(file)), '已更新大頭照。');
            }}
          />
        </label>
        {url && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => window.confirm(`刪除 ${player.name} 的大頭照？`) && task.run(() => photos.deletePhoto(player.id), '已刪除大頭照。')}>
            刪除照片
          </button>
        )}
        <small className="muted">照片全隊都看得到；上傳時會自動縮小。</small>
        <ActionFeedback action={task} />
      </div>
    </div>
  );
}

interface Pending {
  file: File;
  preview: string;
  playerId: string;
  status: '' | '完成' | string;
}

/** 一次上傳很多張：檔名取成球員姓名（例如「王小明.jpg」）就會自動對到人，對不到的可以用選的 */
export function BatchPhotos({ players, photos, onClose }: { players: Player[]; photos: Photos; onClose: () => void }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const byName = new Map(players.map((p) => [p.name.replace(/\s+/g, ''), p.id]));
  const pick = (files: FileList | null) => {
    if (!files) return;
    setDone(null);
    setItems((old) => {
      old.forEach((x) => URL.revokeObjectURL(x.preview));
      return Array.from(files)
        .filter((f) => /^image\//.test(f.type))
        .map((f) => ({ file: f, preview: URL.createObjectURL(f), playerId: byName.get(nameFromFile(f.name)) ?? '', status: '' }));
    });
  };
  const ready = items.filter((x) => x.playerId && x.status !== '完成');
  const dupIds = items.map((x) => x.playerId).filter((id, i, arr) => id && arr.indexOf(id) !== i);
  const upload = async () => {
    setBusy(true);
    let ok = 0;
    for (const it of ready) {
      try {
        await photos.savePhoto(it.playerId, await resizePhoto(it.file));
        ok++;
        setItems((xs) => xs.map((x) => (x === it ? { ...x, status: '完成' } : x)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setItems((xs) => xs.map((x) => (x === it ? { ...x, status: msg } : x)));
      }
    }
    setBusy(false);
    setDone(`已上傳 ${ok} 張大頭照。`);
  };

  return (
    <Card title="📷 一次上傳很多張大頭照" className="batch-photos">
      <p className="muted small">
        先把照片檔名改成球員姓名（例如「王小明.jpg」），一次選好全部照片，系統會自動對到人；對不到的可以在下拉選單選。同一位球員重新上傳會換掉舊照片。
      </p>
      <label className="btn btn-primary">
        🖼️ 選擇照片（可以一次選很多張）
        <input type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      </label>
      {items.length > 0 && (
        <>
          <p className="small">
            共 {items.length} 張，對到人的 {items.filter((x) => x.playerId).length} 張。
          </p>
          {dupIds.length > 0 && <Alert kind="warn">有兩張照片對到同一位球員，後面那張會蓋掉前面那張。</Alert>}
          <div className="batch-list">
            {items.map((it, i) => (
              <div key={i} className={`batch-item ${it.playerId ? '' : 'unmatched'}`}>
                <img src={it.preview} alt={it.file.name} />
                <div className="small muted batch-file">{it.file.name}</div>
                <select value={it.playerId} disabled={busy || it.status === '完成'} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, playerId: e.target.value } : x)))} aria-label={`${it.file.name} 是哪位球員`}>
                  <option value="">— 選擇球員（不上傳）</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {photos.photos[p.id] ? '（已有照片）' : ''}
                    </option>
                  ))}
                </select>
                {it.status && <div className={`small ${it.status === '完成' ? 'money-in' : 'danger-text'}`}>{it.status === '完成' ? '✅ 完成' : `⚠️ ${it.status}`}</div>}
              </div>
            ))}
          </div>
        </>
      )}
      {done && <Alert kind="success">{done}</Alert>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={busy || ready.length === 0} onClick={upload}>
          {busy ? '上傳中…' : `⬆️ 上傳 ${ready.length} 張`}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          關閉
        </button>
      </div>
    </Card>
  );
}

interface DriveItem {
  fileId: string;
  name: string;
  playerId: string;
  status: string;
}

/** 從雲端硬碟資料夾匯入：選資料夾 → 依檔名自動配對球員（忽略「國一、國二、國三」）→ 一次匯入 */
export function DriveImport({ players, photos, onClose }: { players: Player[]; photos: Photos; onClose: () => void }) {
  const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(null);
  const [folderId, setFolderId] = useState('');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byName = new Map(players.map((p) => [p.name.replace(/\s+/g, ''), p.id]));

  useEffect(() => {
    photos
      .listSources()
      .then((list) => {
        setFolders(list);
        setFolderId((cur) => cur || list[0]?.id || '');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [photos.listSources]);

  const load = async () => {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const files = await photos.listFolder(folderId);
      setItems(files.map((f) => ({ fileId: f.id, name: f.name, playerId: byName.get(nameFromFile(f.name)) ?? '', status: '' })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = items.filter((x) => x.playerId && x.status !== '完成');
  const run = async () => {
    setBusy(true);
    setMsg(null);
    let ok = 0;
    for (const it of ready) {
      setItems((xs) => xs.map((x) => (x.fileId === it.fileId ? { ...x, status: '處理中…' } : x)));
      try {
        const original = await photos.getFile(folderId, it.fileId);
        await photos.savePhoto(it.playerId, await resizeSrc(original));
        ok++;
        setItems((xs) => xs.map((x) => (x.fileId === it.fileId ? { ...x, status: '完成' } : x)));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setItems((xs) => xs.map((x) => (x.fileId === it.fileId ? { ...x, status: m } : x)));
      }
    }
    setBusy(false);
    setMsg(`已匯入 ${ok} 張大頭照。`);
  };
  const matched = items.filter((x) => x.playerId).length;
  const dup = items.some((x, i) => x.playerId && items.findIndex((y) => y.playerId === x.playerId) !== i);

  return (
    <Card title="☁️ 從雲端硬碟資料夾匯入大頭照" className="drive-import">
      <p className="muted small">
        把照片放進雲端硬碟裡名稱有「大頭照」的資料夾，檔名用球員姓名（「王小明(國三).jpg」這種也可以，會自動忽略國一、國二、國三和括號）。匯入時會自動縮小，原本的照片不會被改動。
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      {folders === null ? (
        <p className="muted small">讀取資料夾…</p>
      ) : folders.length === 0 ? (
        <Alert kind="warn">雲端硬碟裡找不到名稱有「大頭照」的資料夾。</Alert>
      ) : (
        <div className="check-tools">
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} aria-label="選擇資料夾" disabled={busy}>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={load} disabled={busy || !folderId}>
            🔍 讀取照片並配對
          </button>
        </div>
      )}
      {items.length > 0 && (
        <>
          <p className="small">
            資料夾裡有 {items.length} 張照片，配對到 {matched} 位球員。對不到的可以在右邊選。
          </p>
          {dup && <Alert kind="warn">有兩張照片配對到同一位球員，後面那張會蓋掉前面那張。</Alert>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>檔名</th>
                  <th>配對的球員</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.fileId} className={it.playerId ? '' : 'row-off'}>
                    <td className="small">{it.name}</td>
                    <td>
                      <select value={it.playerId} disabled={busy || it.status === '完成'} onChange={(e) => setItems((xs) => xs.map((x) => (x.fileId === it.fileId ? { ...x, playerId: e.target.value } : x)))} aria-label={`${it.name} 是哪位球員`}>
                        <option value="">— 不匯入</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {photos.photos[p.id] ? '（已有照片）' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`small ${it.status === '完成' ? 'money-in' : it.status && it.status !== '處理中…' ? 'danger-text' : ''}`}>
                      {it.status === '完成' ? '✅ 完成' : it.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {msg && <Alert kind="success">{msg}</Alert>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={busy || ready.length === 0} onClick={run}>
          {busy && items.some((x) => x.status === '處理中…') ? '匯入中…（請不要關掉頁面）' : `☁️ 匯入 ${ready.length} 張`}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          關閉
        </button>
      </div>
    </Card>
  );
}
