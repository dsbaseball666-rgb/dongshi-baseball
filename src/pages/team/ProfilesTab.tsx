import { useMemo, useState } from 'react';
import type { Player, PlayerProfile } from '../../types';
import { useTask } from '../../store/DemoStore';
import { useProfiles, type ProfileInput } from '../../sources/team';
import { downloadCsv } from '../../lib/csv';
import { formatDateTime } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';

const EMPTY: Omit<ProfileInput, 'playerId'> = {
  birthday: '', className: '', batsThrows: '', height: '', weight: '', phone: '', address: '',
  guardianName: '', guardianRelation: '', guardianPhone: '', guardian2Name: '', guardian2Relation: '', guardian2Phone: '', medicalNote: '', note: '',
};
const BATS_THROWS = ['右投右打', '右投左打', '右投兩打', '左投左打', '左投右打', '左投兩打'];

const byNumber = (a: Player, b: Player) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.name.localeCompare(b.name, 'zh-TW');

function Phone({ value }: { value: string }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <a href={`tel:${value.replace(/[^\d+]/g, '')}`} className="nowrap">
      📞 {value}
    </a>
  );
}

function ProfileForm({ player, profile, save, onDone }: { player: Player; profile?: PlayerProfile; save: (p: ProfileInput) => Promise<void>; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState<ProfileInput>(() => {
    const base: ProfileInput = { playerId: player.id, ...EMPTY };
    if (profile) (Object.keys(EMPTY) as (keyof typeof EMPTY)[]).forEach((k) => (base[k] = profile[k] ?? ''));
    return base;
  });
  const input = (k: keyof typeof EMPTY, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <Card title={`編輯：${player.name}`} icon="✏️">
      <p className="muted small">姓名、背號、年級、守備位置請到「教練後台 → 球員與帳號」修改。這裡的資料只有教練看得到。</p>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task.run(() => save(f), `已儲存 ${player.name} 的資料。`);
          if (r.ok) onDone();
        }}
      >
        <h3 className="section-title">基本資料</h3>
        <div className="grid-3 tight">
          {input('birthday', '生日', { type: 'date' })}
          {input('className', '班級', { maxLength: 20, placeholder: '例如：801' })}
          <Field label="投打">
            <select value={f.batsThrows} onChange={(e) => setF({ ...f, batsThrows: e.target.value })}>
              <option value="">—</option>
              {BATS_THROWS.map((b) => (
                <option key={b}>{b}</option>
              ))}
              {f.batsThrows && !BATS_THROWS.includes(f.batsThrows) && <option>{f.batsThrows}</option>}
            </select>
          </Field>
          {input('height', '身高（公分）', { inputMode: 'decimal', maxLength: 5 })}
          {input('weight', '體重（公斤）', { inputMode: 'decimal', maxLength: 5 })}
          {input('phone', '球員手機', { type: 'tel', maxLength: 20 })}
        </div>
        {input('address', '地址', { maxLength: 100 })}
        <h3 className="section-title">聯絡人</h3>
        <div className="grid-3 tight">
          {input('guardianName', '監護人姓名', { maxLength: 30 })}
          {input('guardianRelation', '關係', { maxLength: 10, placeholder: '例如：父、母、祖母' })}
          {input('guardianPhone', '監護人電話', { type: 'tel', maxLength: 20 })}
          {input('guardian2Name', '第二聯絡人姓名', { maxLength: 30 })}
          {input('guardian2Relation', '關係', { maxLength: 10 })}
          {input('guardian2Phone', '第二聯絡人電話', { type: 'tel', maxLength: 20 })}
        </div>
        <Field label="健康／過敏注意事項" hint="例如：氣喘、蠶豆症、過敏藥物。緊急時教練會優先看這裡。">
          <textarea value={f.medicalNote} rows={2} maxLength={300} onChange={(e) => setF({ ...f, medicalNote: e.target.value })} />
        </Field>
        <Field label="備註">
          <textarea value={f.note} rows={2} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <ActionFeedback action={task} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={task.pending}>
            💾 儲存
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone} disabled={task.pending}>
            取消
          </button>
        </div>
      </form>
      {profile?.updatedAt && (
        <p className="muted small">
          最後修改：{profile.updatedBy}，{formatDateTime(profile.updatedAt)}
        </p>
      )}
    </Card>
  );
}

export function ProfilesTab() {
  const data = useProfiles();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const profileOf = useMemo(() => Object.fromEntries(data.profiles.map((p) => [p.playerId, p])), [data.profiles]);
  const list = data.players
    .filter((p) => (showInactive || p.active) && (!filter || [p.name, p.number, p.grade, profileOf[p.id]?.className, profileOf[p.id]?.guardianName].some((v) => v && v.includes(filter))))
    .sort(byNumber);
  const editingPlayer = data.players.find((p) => p.id === editing);
  const filled = data.players.filter((p) => p.active && profileOf[p.id]?.guardianPhone).length;
  const activeCount = data.players.filter((p) => p.active).length;

  const exportCsv = () =>
    downloadCsv(
      '球員通訊錄.csv',
      data.players
        .filter((p) => showInactive || p.active)
        .sort(byNumber)
        .map((p) => {
          const x = profileOf[p.id];
          return {
            背號: p.number, 姓名: p.name, 年級: p.grade, 班級: x?.className, 守備位置: p.position, 投打: x?.batsThrows, 生日: x?.birthday,
            身高: x?.height, 體重: x?.weight, 球員手機: x?.phone, 監護人: x?.guardianName, 關係: x?.guardianRelation, 監護人電話: x?.guardianPhone,
            第二聯絡人: x?.guardian2Name, 第二聯絡人關係: x?.guardian2Relation, 第二聯絡人電話: x?.guardian2Phone, 地址: x?.address,
            健康注意事項: x?.medicalNote, 備註: x?.note, 在隊: p.active ? '是' : '否',
          };
        }),
    );

  if (data.loading)
    return (
      <Card>
        <LoadingState text="讀取通訊錄…" />
      </Card>
    );
  return (
    <>
      <Alert kind="info">🔒 通訊錄與個人資料<strong>只有教練看得到</strong>，球員、家長、老師都看不到。下載的檔案也請妥善保管。</Alert>
      {data.error && <Alert kind="error">{data.error}</Alert>}
      {editingPlayer && <ProfileForm key={editingPlayer.id} player={editingPlayer} profile={profileOf[editingPlayer.id]} save={data.save} onDone={() => setEditing(null)} />}
      <Card
        title={`球員名單（${list.length} 位）`}
        icon="👥"
        actions={
          <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={data.players.length === 0}>
            ⬇️ 下載通訊錄（Excel 可開）
          </button>
        }
      >
        <p className="muted small">
          已填監護人電話：{filled} / {activeCount} 位。點「編輯」填寫個人資料；手機上點電話號碼可以直接撥打。
        </p>
        <div className="check-tools">
          <input className="check-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜尋姓名、背號、班級、監護人" aria-label="搜尋球員" />
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            顯示已離隊球員
          </label>
        </div>
        {list.length === 0 ? (
          <EmptyState icon="👥" title={data.players.length ? '沒有符合的球員' : '還沒有球員'} hint={data.players.length ? undefined : '請先到「教練後台 → 球員與帳號」新增球員。'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>背號</th>
                  <th>姓名</th>
                  <th>年級／班級</th>
                  <th>位置／投打</th>
                  <th>監護人</th>
                  <th>電話</th>
                  <th>注意</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const x = profileOf[p.id];
                  return (
                    <tr key={p.id} className={p.active ? '' : 'row-off'}>
                      <td>{p.number || '—'}</td>
                      <td className="nowrap">
                        <strong>{p.name}</strong>
                        {!p.active && <Badge tone="gray">離隊</Badge>}
                      </td>
                      <td className="nowrap">
                        {p.grade || '—'}
                        {x?.className && ` ${x.className}`}
                      </td>
                      <td>
                        {p.position || '—'}
                        {x?.batsThrows && <div className="muted small">{x.batsThrows}</div>}
                      </td>
                      <td className="nowrap">
                        {x?.guardianName ? `${x.guardianName}${x.guardianRelation ? `（${x.guardianRelation}）` : ''}` : <span className="muted">未填</span>}
                        {x?.guardian2Name && <div className="muted small">{x.guardian2Name}{x.guardian2Relation && `（${x.guardian2Relation}）`}</div>}
                      </td>
                      <td>
                        <Phone value={x?.guardianPhone ?? ''} />
                        {x?.guardian2Phone && (
                          <div className="small">
                            <Phone value={x.guardian2Phone} />
                          </div>
                        )}
                      </td>
                      <td>{x?.medicalNote ? <span title={x.medicalNote}>⚠️ {x.medicalNote.slice(0, 12)}{x.medicalNote.length > 12 ? '…' : ''}</span> : ''}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setEditing(p.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          編輯
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
