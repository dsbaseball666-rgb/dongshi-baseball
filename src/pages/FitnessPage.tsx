import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FitnessItemKey, FitnessTest } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import { useFitness, usePlayers } from '../sources/hooks';
import { can } from '../lib/permissions';
import { formatDate, formatDateTime, todayStr } from '../lib/date';
import { FITNESS_ITEMS, formatFitnessValue, formatRunTime, getFitnessItem, improvement, parseFitnessInput, valueToInput } from '../lib/fitness';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState, PageHeader } from '../components/UI';
import { LineChart } from '../components/LineChart';

type FitnessApi = Pick<ReturnType<typeof useFitness>, 'add' | 'update'>;

/** 新增／修改一筆檢測紀錄（體能檢測系統 fitness.html 也共用） */
export function FitnessForm({ playerId, editing, onDone, source }: { playerId: string; editing: FitnessTest | null; onDone: () => void; source: FitnessApi }) {
  const action = useTask();
  const [item, setItem] = useState<FitnessItemKey>(editing?.item ?? 'pushup');
  const [date, setDate] = useState(editing?.date ?? todayStr());
  const [raw, setRaw] = useState(editing ? valueToInput(editing.item, editing.value) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const def = getFitnessItem(item);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let value: number;
    try {
      value = parseFitnessInput(item, raw);
      setInputError(null);
    } catch (err) {
      setInputError(err instanceof Error ? err.message : String(err));
      return;
    }
    const input = { playerId, date, item, value, note };
    const res = editing ? await action.run(() => source.update(editing.id, input), '已修改檢測紀錄。') : await action.run(() => source.add(input), '已新增檢測紀錄。');
    if (res.ok) {
      setRaw('');
      setNote('');
      if (editing) onDone();
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="grid-2 tight">
        <Field label="檢測項目">
          <select value={item} onChange={(e) => setItem(e.target.value as FitnessItemKey)}>
            {FITNESS_ITEMS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}（{i.kind === 'time' ? '分:秒' : i.unit}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="檢測日期">
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label={`數值（單位：${def.kind === 'time' ? '時間，儲存為秒' : def.unit}）`} hint={def.inputHint} required>
        <input value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label="備註">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="例如：雨天室內測驗" />
      </Field>
      {inputError && <Alert kind="error">{inputError}</Alert>}
      <ActionFeedback action={action} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          {editing ? '儲存修改' : '新增紀錄'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            取消修改
          </button>
        )}
      </div>
    </form>
  );
}

export default function FitnessPage() {
  const { user, mode } = useStore();
  const [params, setParams] = useSearchParams();
  const isCoach = can(user, 'fitness.view.all');
  const canWrite = can(user, 'fitness.write');
  const { players, loading: playersLoading, error: playersError } = usePlayers();
  const playerId = isCoach ? params.get('player') ?? players.find((p) => p.active)?.id ?? '' : user?.playerId ?? '';
  const [chartItem, setChartItem] = useState<FitnessItemKey>('pushup');
  const [historyFilter, setHistoryFilter] = useState<FitnessItemKey | 'all'>('all');
  const [editing, setEditing] = useState<FitnessTest | null>(null);
  const del = useTask();
  const source = useFitness(playerId);

  const records = useMemo(() => [...source.records].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)), [source.records]);
  const lastUpdated = records.reduce<string | undefined>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), undefined);
  const chartData = records.filter((r) => r.item === chartItem).map((r) => ({ date: r.date, value: r.value }));
  const chartDef = getFitnessItem(chartItem);
  const history = records.filter((r) => historyFilter === 'all' || r.item === historyFilter).slice().reverse();

  return (
    <div className="page">
      <PageHeader
        icon="💪"
        title="體能檢測中心"
        subtitle={canWrite ? '輸入與檢視全隊體能檢測' : '查看自己的體能紀錄與成長'}
        actions={
          <a className="btn btn-sm btn-gold" href="./fitness.html">
            🏋️ 打開體能檢測系統
          </a>
        }
      />
      {mode === 'cloud' ? (
        <Alert kind="info">☁️ 資料儲存在 Google 試算表。正式檢測資料只能由授權的教練新增、修改或刪除。</Alert>
      ) : (
        <Alert kind="warn">目前顯示的是<strong>示範資料</strong>（虛構數值），沒有連線 Google 試算表。正式資料只能由授權的教練新增、修改或刪除。</Alert>
      )}
      {source.error && (
        <Alert kind="error">
          {source.error}{' '}
          <button type="button" className="btn btn-sm" onClick={source.reload}>
            重新讀取
          </button>
        </Alert>
      )}
      {playersError && <Alert kind="error">{playersError}</Alert>}
      {isCoach && playersLoading && (
        <Card>
          <LoadingState text="讀取球員名單…" />
        </Card>
      )}
      {isCoach && !playersLoading && (
        <Card>
          <Field label="選擇球員">
            <select
              value={playerId}
              onChange={(e) => {
                setParams({ player: e.target.value }, { replace: true });
                setEditing(null);
              }}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（#{p.number}）{p.active ? '' : '［已停用］'}
                </option>
              ))}
            </select>
          </Field>
        </Card>
      )}
      <p className="muted small">最後更新：{lastUpdated ? formatDateTime(lastUpdated) : '尚無資料'}</p>

      {canWrite && playerId && (
        <Card title={editing ? '修改檢測紀錄' : '新增檢測紀錄'} icon="📝">
          <FitnessForm key={editing?.id ?? `new-${playerId}`} playerId={playerId} editing={editing} onDone={() => setEditing(null)} source={source} />
        </Card>
      )}

      {source.loading ? (
        <Card>
          <LoadingState text="讀取體能紀錄中…" />
        </Card>
      ) : !playerId ? (
        !playersLoading && (
          <Card>
            <EmptyState title="沒有可顯示的球員" hint={isCoach ? '請先到教練後台新增球員。' : '此帳號沒有對應的球員資料，請聯絡教練。'} />
          </Card>
        )
      ) : source.error ? null : records.length === 0 ? (
        <Card>
          <EmptyState icon="📭" title="目前沒有體能檢測紀錄" hint={canWrite ? '可以使用上方表單新增第一筆紀錄。' : '教練完成檢測並輸入後，紀錄會顯示在這裡。'} />
        </Card>
      ) : (
        <>
          <Card title="最新成績" icon="🏅">
            <div className="fitness-grid">
              {FITNESS_ITEMS.map((i) => {
                const list = records.filter((r) => r.item === i.key);
                const last = list[list.length - 1];
                const prev = list[list.length - 2];
                const diff = last && prev ? improvement(i.key, prev.value, last.value) : null;
                return (
                  <button key={i.key} type="button" className={`fitness-tile ${chartItem === i.key ? 'active' : ''}`} onClick={() => setChartItem(i.key)}>
                    <span className="muted small">
                      {i.group}・{i.label}
                    </span>
                    {last && i.kind === 'time' ? (
                      <>
                        <strong>{formatRunTime(last.value)}</strong>
                        <span className="muted small">（分:秒）</span>
                      </>
                    ) : (
                      <strong>{last ? formatFitnessValue(i.key, last.value) : '尚無資料'}</strong>
                    )}
                    {last && <span className="muted small">{formatDate(last.date)}</span>}
                    {diff !== null && <Badge tone={diff > 0 ? 'green' : diff < 0 ? 'red' : 'gray'}>{diff > 0 ? '▲ 進步' : diff < 0 ? '▼ 退步' : '持平'}</Badge>}
                  </button>
                );
              })}
            </div>
          </Card>
          <Card title={`歷次變化：${chartDef.label}`} icon="📈">
            {chartData.length === 0 ? (
              <EmptyState icon="📉" title="這個項目還沒有紀錄" />
            ) : (
              <LineChart data={chartData} better={chartDef.better} label={chartDef.label} format={(v) => (chartDef.kind === 'time' ? formatRunTime(v) : `${Math.round(v * 10) / 10}`)} />
            )}
          </Card>
          <Card
            title="歷史紀錄"
            icon="📚"
            actions={
              <select aria-label="篩選項目" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as FitnessItemKey | 'all')}>
                <option value="all">全部項目</option>
                {FITNESS_ITEMS.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </select>
            }
          >
            <ActionFeedback action={del} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>項目</th>
                    <th>成績</th>
                    <th>備註</th>
                    <th>建立者</th>
                    {canWrite && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{getFitnessItem(r.item).label}</td>
                      <td>{formatFitnessValue(r.item, r.value)}</td>
                      <td>{r.note || '—'}</td>
                      <td>{r.createdBy}</td>
                      {canWrite && (
                        <td className="nowrap">
                          <button type="button" className="btn btn-sm" onClick={() => setEditing(r)}>
                            修改
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            disabled={del.pending}
                            onClick={() => {
                              if (window.confirm(`確定刪除 ${r.date} 的「${getFitnessItem(r.item).label}」紀錄？`)) del.run(() => source.remove(r.id), '已刪除。');
                            }}
                          >
                            刪除
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
