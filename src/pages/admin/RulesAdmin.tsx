import { useState } from 'react';
import type { Rule } from '../../types';
import { useStore, useTask } from '../../store/DemoStore';
import { useRules } from '../../sources/hooks';
import type { RuleEdit } from '../../store/actions';
import { RULE_CATEGORIES } from '../../data/rules';
import { formatDateTime } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';

type RulesApi = ReturnType<typeof useRules>;

function RuleEditor({ rule, source, onDone }: { rule: Rule; source: RulesApi; onDone: () => void }) {
  const task = useTask();
  const [f, setF] = useState<RuleEdit>({
    title: rule.title,
    content: rule.content,
    category: rule.category,
    isAnnouncement: rule.isAnnouncement,
    needsCoachReview: rule.needsCoachReview,
    reviewNote: rule.reviewNote,
  });
  const categories = RULE_CATEGORIES.includes(f.category) ? RULE_CATEGORIES : [f.category, ...RULE_CATEGORIES];
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => source.update(rule.id, f), `第 ${rule.no} 條已更新為第 ${rule.version + 1} 版。`);
        if (r.ok) onDone();
      }}
    >
      <div className="grid-2 tight">
        <Field label="標題" required>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={40} />
        </Field>
        <Field label="分類">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="規章內容（請依圖片原文輸入）" required>
        <textarea rows={4} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} maxLength={1000} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.isAnnouncement} onChange={(e) => setF({ ...f, isAnnouncement: e.target.checked })} />
        標示為重要規章（顯示在規章頁最上方）
      </label>
      <label className="check">
        <input type="checkbox" checked={f.needsCoachReview} onChange={(e) => setF({ ...f, needsCoachReview: e.target.checked })} />
        待教練確認（確認原文無誤後取消勾選）
      </label>
      <Field label="確認備註（只有教練看得到）">
        <input value={f.reviewNote} onChange={(e) => setF({ ...f, reviewNote: e.target.value })} maxLength={200} />
      </Field>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending}>
          儲存（版本 +1）
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

export default function RulesAdmin() {
  const { mode } = useStore();
  const source = useRules();
  const importTask = useTask();
  const [editing, setEditing] = useState<string | null>(null);
  const rules = [...source.rules].sort((a, b) => a.no - b.no);
  const review = rules.filter((r) => r.needsCoachReview);

  if (source.loading) return <LoadingState text="讀取規章中…" />;
  if (source.error) return <Alert kind="error">{source.error}</Alert>;

  if (rules.length === 0) {
    return (
      <Card title="匯入球隊規章" icon="📥">
        <EmptyState
          icon="📜"
          title="雲端還沒有規章資料"
          hint="按下按鈕，把依「東勢國中棒球隊球隊規章」圖片逐字輸入的 17 條規章存到 Google 試算表。第 3、10、13 條會保留「待教練確認」標記。"
          action={
            <button type="button" className="btn btn-primary" disabled={importTask.pending || mode !== 'cloud'} onClick={() => importTask.run(() => source.importDefaults(), '已匯入 17 條規章。')}>
              匯入 17 條規章
            </button>
          }
        />
        <ActionFeedback action={importTask} />
      </Card>
    );
  }

  return (
    <>
      <Alert kind="warn">
        規章共 {rules.length} 條，已依「東勢國中棒球隊球隊規章」圖片逐字輸入，系統不會自行修改或刪減。
        {review.length > 0 && (
          <>
            {' '}
            第 {review.map((r) => r.no).join('、')} 條標示為<strong>「待教練確認」</strong>：圖片文字可能有辨識或原文錯誤，請教練確認正確版本。
          </>
        )}
      </Alert>
      <Card title="規章管理" icon="📜">
        <ol className="rule-list">
          {rules.map((r) => (
            <li key={r.id} className="rule-item">
              <div className="rule-no">{r.no}</div>
              <div className="rule-body">
                <div className="rule-head">
                  <strong>{r.title}</strong>
                  <Badge tone="blue">{r.category}</Badge>
                  {r.isAnnouncement && <Badge tone="red">重要</Badge>}
                  {r.needsCoachReview && <Badge tone="yellow">⚠ 待教練確認</Badge>}
                </div>
                {editing === r.id ? (
                  <RuleEditor rule={r} source={source} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <p>{r.content}</p>
                    {r.needsCoachReview && r.reviewNote && <p className="small warn-text">確認備註：{r.reviewNote}</p>}
                    <p className="muted small">
                      第 {r.version} 版・更新：{formatDateTime(r.updatedAt)}・{r.updatedBy}
                    </p>
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(r.id)}>
                      編輯
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
