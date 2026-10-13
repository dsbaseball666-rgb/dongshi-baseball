import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ExamScore, Player } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import { usePlayers } from '../sources/hooks';
import { useExamScores } from '../sources/exams';
import { currentTerm, EXAM_SUBJECTS, examAverage, examLabel, examOrder, examTotal, GRADE_LABELS, gradeFromText, parseScore } from '../lib/exam';
import { formatDateTime } from '../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState, PageHeader } from '../components/UI';
import { LineChart } from '../components/LineChart';

type Grade = 7 | 8 | 9;

/** 教練：一次輸入一整次段考、多位球員的成績 */
function BatchEntry({ players }: { players: Player[] }) {
  const term = currentTerm();
  const [schoolYear, setSchoolYear] = useState(String(term.schoolYear));
  const [semester, setSemester] = useState<'上' | '下'>(term.semester);
  const [examNo, setExamNo] = useState(1);
  const [grade, setGrade] = useState<Grade>(8);
  const [showAll, setShowAll] = useState(false);
  const [cells, setCells] = useState<Record<string, Record<string, string>>>({});
  const [inputError, setInputError] = useState<string | null>(null);
  const source = useExamScores(null);
  const action = useTask();
  const subjects = EXAM_SUBJECTS[grade];
  const year = Number(schoolYear);

  const existing = useMemo(
    () => source.records.filter((r) => r.schoolYear === year && r.semester === semester && r.examNo === examNo),
    [source.records, year, semester, examNo],
  );
  const rows = players.filter((p) => p.active && (showAll || gradeFromText(p.grade) === grade || !gradeFromText(p.grade)));

  // 換段考或讀到資料時，把已存的成績填進表格
  useEffect(() => {
    const next: Record<string, Record<string, string>> = {};
    existing.forEach((r) => {
      next[r.playerId] = { 備註: r.note };
      Object.entries(r.scores).forEach(([k, v]) => (next[r.playerId][k] = String(v)));
    });
    setCells(next);
    setInputError(null);
  }, [existing]);

  const setCell = (playerId: string, key: string, value: string) => setCells((c) => ({ ...c, [playerId]: { ...c[playerId], [key]: value } }));

  const save = async () => {
    setInputError(null);
    if (!(Number.isInteger(year) && year >= 100 && year <= 200)) return setInputError('「學年度」請輸入 100～200 的整數（例如 115）。');
    const entries: { playerId: string; scores: Record<string, number>; note: string }[] = [];
    try {
      rows.forEach((p) => {
        const row = cells[p.id] ?? {};
        const scores: Record<string, number> = {};
        subjects.forEach((s) => {
          const v = parseScore(row[s] ?? '', `${p.name}的${s}`);
          if (v !== null) scores[s] = v;
        });
        if (Object.keys(scores).length > 0) entries.push({ playerId: p.id, scores, note: (row['備註'] ?? '').trim() });
      });
    } catch (e) {
      return setInputError(e instanceof Error ? e.message : String(e));
    }
    if (entries.length === 0) return setInputError('表格中還沒有輸入任何成績。');
    await action.run(async () => {
      const r = await source.save({ schoolYear: year, semester, examNo, grade, entries });
      return r;
    }, `已儲存 ${entries.length} 位球員的成績。`);
  };

  return (
    <Card title="輸入段考成績" icon="✏️">
      <div className="exam-key">
        <Field label="學年度">
          <input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} inputMode="numeric" maxLength={3} />
        </Field>
        <Field label="學期">
          <select value={semester} onChange={(e) => setSemester(e.target.value as '上' | '下')}>
            <option value="上">上學期</option>
            <option value="下">下學期</option>
          </select>
        </Field>
        <Field label="段考">
          <select value={examNo} onChange={(e) => setExamNo(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                第 {n} 次
              </option>
            ))}
          </select>
        </Field>
        <Field label="年級（決定科目）">
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value) as Grade)}>
            {([7, 8, 9] as Grade[]).map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted small">
        {GRADE_LABELS[grade]}科目：{subjects.join('、')}。空白代表沒有這科成績（不會當成 0 分）。分數 0～100，可以有一位小數。
      </p>
      <label className="check">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        顯示所有球員（預設只顯示這個年級和還沒設定年級的球員）
      </label>
      {source.error && <Alert kind="error">{source.error}</Alert>}
      {source.loading ? (
        <LoadingState text="讀取已輸入的成績…" />
      ) : rows.length === 0 ? (
        <EmptyState title="沒有符合的球員" hint="可以勾選「顯示所有球員」，或到教練後台設定球員的年級。" />
      ) : (
        <div className="table-wrap">
          <table className="exam-table">
            <thead>
              <tr>
                <th>球員</th>
                {subjects.map((s) => (
                  <th key={s}>{s}</th>
                ))}
                <th>平均</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const row = cells[p.id] ?? {};
                const nums = subjects.map((s) => Number(row[s])).filter((v, i) => (row[subjects[i]] ?? '').trim() !== '' && Number.isFinite(v));
                const avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
                const saved = existing.some((r) => r.playerId === p.id);
                return (
                  <tr key={p.id}>
                    <th scope="row" className="nowrap">
                      {p.name}
                      {saved && <span className="saved-dot" title="已儲存過">●</span>}
                      {p.grade && <div className="muted small">{p.grade}</div>}
                    </th>
                    {subjects.map((s) => (
                      <td key={s}>
                        <input className="score-input" aria-label={`${p.name} ${s}`} value={row[s] ?? ''} onChange={(e) => setCell(p.id, s, e.target.value)} inputMode="decimal" maxLength={5} />
                      </td>
                    ))}
                    <td className="nowrap">{avg ?? '—'}</td>
                    <td>
                      <input className="note-input" aria-label={`${p.name} 備註`} value={row['備註'] ?? ''} onChange={(e) => setCell(p.id, '備註', e.target.value)} maxLength={100} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {inputError && <Alert kind="error">{inputError}</Alert>}
      <ActionFeedback action={action} />
      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={action.pending || source.loading || rows.length === 0} onClick={save}>
          💾 儲存這次段考的成績
        </button>
      </div>
      <p className="muted small">● 代表這位球員這次段考已經有成績；再次儲存會更新成表格中的分數。要刪除整筆成績，請到「個人成績」按「刪除」。</p>
    </Card>
  );
}

/** 個人成績：最新一次、變化圖與歷次紀錄 */
function PersonalView({ playerId, canDelete }: { playerId: string; canDelete: boolean }) {
  const source = useExamScores(playerId);
  const del = useTask();
  const [chartKey, setChartKey] = useState('平均');
  const records = useMemo(() => [...source.records].sort((a, b) => examOrder(a) - examOrder(b)), [source.records]);
  const latest = records[records.length - 1];
  const subjectsSeen = Array.from(new Set(records.flatMap((r) => EXAM_SUBJECTS[r.grade] ?? Object.keys(r.scores))));
  const chartData = records
    .map((r) => ({ date: examLabel(r), short: `${r.schoolYear}${r.semester}-${r.examNo}`, value: chartKey === '平均' ? examAverage(r.scores) : r.scores[chartKey] }))
    .filter((d): d is { date: string; short: string; value: number } => typeof d.value === 'number');

  if (source.loading)
    return (
      <Card>
        <LoadingState text="讀取段考成績…" />
      </Card>
    );
  if (source.error)
    return (
      <Alert kind="error">
        {source.error}{' '}
        <button type="button" className="btn btn-sm" onClick={source.reload}>
          重新讀取
        </button>
      </Alert>
    );
  if (records.length === 0)
    return (
      <Card>
        <EmptyState icon="📭" title="目前沒有段考成績" hint={canDelete ? '可以在「輸入成績」分頁輸入。' : '教練輸入後，成績會顯示在這裡。'} />
      </Card>
    );

  return (
    <>
      {latest && (
        <Card title={`最新一次：${examLabel(latest)}`} icon="🏅" actions={<Badge tone="blue">{GRADE_LABELS[latest.grade]}</Badge>}>
          <div className="stat-row">
            <div className="stat">
              <span>平均</span>
              <strong>{examAverage(latest.scores) ?? '—'}</strong>
            </div>
            <div className="stat">
              <span>總分</span>
              <strong>{examTotal(latest.scores)}</strong>
            </div>
            <div className="stat">
              <span>科目數</span>
              <strong>{Object.keys(latest.scores).length}</strong>
            </div>
          </div>
          <div className="exam-subjects">
            {(EXAM_SUBJECTS[latest.grade] ?? []).map((s) => (
              <div key={s} className="exam-subject">
                <span className="muted small">{s}</span>
                <strong>{latest.scores[s] ?? '—'}</strong>
              </div>
            ))}
          </div>
          <p className="muted small">最後更新：{formatDateTime(latest.updatedAt)}</p>
        </Card>
      )}
      <Card
        title={`歷次變化：${chartKey}`}
        icon="📈"
        actions={
          <select aria-label="選擇科目" value={chartKey} onChange={(e) => setChartKey(e.target.value)}>
            <option value="平均">平均</option>
            {subjectsSeen.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        }
      >
        {chartData.length === 0 ? (
          <EmptyState icon="📉" title="這個科目還沒有成績" />
        ) : (
          <LineChart data={chartData} better="higher" label={chartKey} format={(v) => `${Math.round(v * 10) / 10}`} minSpan={10} xLabel={(d) => (d as (typeof chartData)[number]).short} />
        )}
      </Card>
      <Card title="歷次段考" icon="📚">
        <ActionFeedback action={del} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>段考</th>
                <th>年級</th>
                <th>各科成績</th>
                <th>平均</th>
                <th>總分</th>
                <th>備註</th>
                {canDelete && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {records
                .slice()
                .reverse()
                .map((r: ExamScore) => (
                  <tr key={r.id}>
                    <td className="nowrap">{examLabel(r)}</td>
                    <td className="nowrap">{GRADE_LABELS[r.grade]}</td>
                    <td>
                      <div className="chip-row">
                        {Object.entries(r.scores).map(([k, v]) => (
                          <span key={k} className="score-chip">
                            {k} <strong>{v}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{examAverage(r.scores) ?? '—'}</td>
                    <td>{examTotal(r.scores)}</td>
                    <td>{r.note || '—'}</td>
                    {canDelete && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={del.pending}
                          onClick={() => {
                            if (window.confirm(`確定刪除「${examLabel(r)}」的成績？`)) del.run(() => source.remove(r.id), '已刪除。');
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
  );
}

export default function ExamsPage() {
  const { user } = useStore();
  const [params, setParams] = useSearchParams();
  const isCoach = user?.role === 'coach';
  const { players, loading, error } = usePlayers();
  const [tab, setTab] = useState<'entry' | 'personal'>(isCoach ? 'entry' : 'personal');
  const picker = user?.role !== 'player';
  const playerId = picker ? params.get('player') ?? players.find((p) => p.active)?.id ?? players[0]?.id ?? '' : user?.playerId ?? '';

  return (
    <div className="page">
      <PageHeader icon="📝" title="段考成績" subtitle={isCoach ? '輸入與查看全隊的段考成績' : user?.role === 'parent' ? '查看孩子的段考成績' : '查看自己的段考成績'} />
      <Alert kind="info">🔒 段考成績屬於個人資料：只有教練、球員本人和該球員的家長看得到，由雲端伺服器檢查權限。成績只用來關心課業，不會影響遊戲。</Alert>
      {isCoach && (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'entry'} className={`tab ${tab === 'entry' ? 'active' : ''}`} onClick={() => setTab('entry')}>
            ✏️ 輸入成績
          </button>
          <button type="button" role="tab" aria-selected={tab === 'personal'} className={`tab ${tab === 'personal' ? 'active' : ''}`} onClick={() => setTab('personal')}>
            👤 個人成績
          </button>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {loading ? (
        <Card>
          <LoadingState text="讀取球員名單…" />
        </Card>
      ) : isCoach && tab === 'entry' ? (
        <BatchEntry players={players} />
      ) : (
        <>
          {picker && players.length > 0 && (
            <Card>
              <Field label={isCoach ? '選擇球員' : '選擇孩子'}>
                <select value={playerId} onChange={(e) => setParams({ player: e.target.value }, { replace: true })}>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.number ? `（#${p.number}）` : ''}
                      {p.active ? '' : '［已停用］'}
                    </option>
                  ))}
                </select>
              </Field>
            </Card>
          )}
          {playerId ? (
            <PersonalView key={playerId} playerId={playerId} canDelete={isCoach} />
          ) : (
            <Card>
              <EmptyState title="沒有可顯示的球員" hint={user?.role === 'parent' ? '帳號還沒有對應的孩子，請聯絡教練。' : '此帳號沒有對應的球員資料，請聯絡教練。'} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
