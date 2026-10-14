import { useMemo, useState } from 'react';
import type { FitnessItemKey, FitnessTest, Player } from '../types';
import { useTask } from '../store/DemoStore';
import { formatDate } from '../lib/date';
import { FITNESS_ITEMS, formatFitnessValue, formatRunTime, getFitnessItem } from '../lib/fitness';
import { ActionFeedback, Badge, Card, EmptyState, Field } from '../components/UI';
import { LineChart } from '../components/LineChart';
import { LineImageButton } from '../components/LineImage';
import { FitnessForm } from '../pages/FitnessPage';
import { diffText, latestTable, rankItem, shortValue, sortRecords, type LatestTable } from './stats';
import { personalReportImage } from './images';
import type { TeamFitness } from './useTeamFitness';

/** 個人紀錄：最新成績、成長折線圖、歷史紀錄（教練可修改／刪除）、個人報告圖片 */
export function PersonalTab({ players, source, coach, playerId, setPlayerId }: { players: Player[]; source: TeamFitness; coach: boolean; playerId: string; setPlayerId: (id: string) => void }) {
  const [chartItem, setChartItem] = useState<FitnessItemKey>('pushup');
  const [editing, setEditing] = useState<FitnessTest | null>(null);
  const [adding, setAdding] = useState(false);
  const del = useTask();
  const player = players.find((p) => p.id === playerId);

  const teamTable = useMemo(() => latestTable(source.records), [source.records]);
  const records = useMemo(() => sortRecords(source.records.filter((r) => r.playerId === playerId)), [source.records, playerId]);
  const table: LatestTable = useMemo(() => ({ [playerId]: teamTable[playerId] ?? {} }), [teamTable, playerId]);
  // 隊內排名只有教練看得到（球員只有自己的資料）；只和啟用中的球員比較
  const ranks = useMemo(() => {
    if (!coach) return null;
    const active = players.filter((p) => p.active || p.id === playerId);
    const out: Partial<Record<FitnessItemKey, { rank: number; total: number }>> = {};
    for (const d of FITNESS_ITEMS) {
      const list = rankItem(active, teamTable, d.key, 'latest');
      const mine = list.find((r) => r.player.id === playerId);
      if (mine) out[d.key] = { rank: mine.rank, total: list.length };
    }
    return out;
  }, [coach, players, teamTable, playerId]);

  const chartDef = getFitnessItem(chartItem);
  const chartData = records.filter((r) => r.item === chartItem).map((r) => ({ date: r.date, value: r.value }));
  const history = [...records].reverse();

  return (
    <>
      {coach && (
        <Card>
          <Field label="選擇球員">
            <select
              value={playerId}
              onChange={(e) => {
                setPlayerId(e.target.value);
                setEditing(null);
                setAdding(false);
              }}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ''}
                  {p.name}
                  {p.active ? '' : '［已停用］'}
                </option>
              ))}
            </select>
          </Field>
        </Card>
      )}

      {!player ? (
        <Card>
          <EmptyState title="沒有可顯示的球員" hint={coach ? '請先到冒險筆記本的教練後台新增球員。' : '此帳號沒有對應的球員資料，請聯絡教練。'} />
        </Card>
      ) : (
        <>
          <Card
            title={`${player.name} 的最新成績`}
            icon="🏅"
          >
            {records.length > 0 && (
              <div className="form-actions fs-report">
                <LineImageButton
                  key={playerId}
                  label="🖼️ 產生個人報告圖片（可傳給家長）"
                  make={() => personalReportImage(player, table, ranks)}
                  filename={`${player.name}體能報告.png`}
                  title={`${player.name}體能報告`}
                />
              </div>
            )}
            {records.length === 0 ? (
              <EmptyState icon="📭" title="目前沒有體能檢測紀錄" hint={coach ? '可以到「全隊輸入」或下方「新增一筆」輸入成績。' : '教練完成檢測並輸入後，紀錄會顯示在這裡。'} />
            ) : (
              <div className="fitness-grid">
                {FITNESS_ITEMS.map((d) => {
                  const c = table[playerId]?.[d.key];
                  const r = ranks?.[d.key];
                  return (
                    <button key={d.key} type="button" className={`fitness-tile ${chartItem === d.key ? 'active' : ''}`} onClick={() => setChartItem(d.key)}>
                      <span className="muted small">
                        {d.group}・{d.label}
                      </span>
                      <strong>{c ? (d.kind === 'time' ? formatRunTime(c.record.value) : formatFitnessValue(d.key, c.record.value)) : '尚無資料'}</strong>
                      {c && <span className="muted small">{formatDate(c.record.date)}</span>}
                      {c?.prev && <Badge tone={c.diff! > 0 ? 'green' : c.diff! < 0 ? 'red' : 'gray'}>{`${c.diff! > 0 ? '▲' : c.diff! < 0 ? '▼' : ''} ${diffText(d.key, c.prev.value, c.record.value)}`}</Badge>}
                      {r && (
                        <span className="small">
                          隊內第 <strong>{r.rank}</strong> / {r.total} 名
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {records.length > 0 && (
            <Card title={`歷次變化：${chartDef.label}`} icon="📈">
              {chartData.length === 0 ? (
                <EmptyState icon="📉" title="這個項目還沒有紀錄" hint="點上面其他項目的方塊可以切換。" />
              ) : (
                <LineChart data={chartData} better={chartDef.better} label={chartDef.label} format={(v) => (chartDef.kind === 'time' ? formatRunTime(v) : `${Math.round(v * 10) / 10}`)} />
              )}
            </Card>
          )}

          <Card
            title="歷史紀錄"
            icon="📚"
            actions={
              coach && !editing && !adding ? (
                <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
                  ＋ 新增一筆
                </button>
              ) : undefined
            }
          >
            {coach && (editing || adding) && (
              <div className="fs-edit">
                <h3>{editing ? `修改 ${editing.date} 的紀錄` : '新增一筆檢測紀錄'}</h3>
                <FitnessForm
                  key={editing?.id ?? `new-${playerId}`}
                  playerId={playerId}
                  editing={editing}
                  source={source}
                  onDone={() => {
                    setEditing(null);
                    setAdding(false);
                  }}
                />
                {adding && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                    收起
                  </button>
                )}
              </div>
            )}
            <ActionFeedback action={del} />
            {history.length === 0 ? (
              <p className="muted">尚無紀錄。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>項目</th>
                      <th>成績</th>
                      <th className="hide-sm">備註</th>
                      {coach && <th>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{r.date}</td>
                        <td>{getFitnessItem(r.item).label}</td>
                        <td className="nowrap">{shortValue(r.item, r.value)}</td>
                        <td className="hide-sm">{r.note || '—'}</td>
                        {coach && (
                          <td className="fs-row-actions">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                setAdding(false);
                                setEditing(r);
                              }}
                            >
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
            )}
          </Card>
        </>
      )}
    </>
  );
}
