import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { KnowledgeArticle, KnowledgeCategory, PublishStatus, Role } from '../../types';
import { useStore, useTask } from '../../store/DemoStore';
import { useArticles } from '../../sources/hooks';
import type { ArticleInput } from '../../store/actions';
import { categoryLabel, KNOWLEDGE_CATEGORIES } from '../../data/knowledge';
import { ALL_ROLES, ROLE_LABELS } from '../../lib/permissions';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';

type ArticlesApi = ReturnType<typeof useArticles>;

const STATUS: Record<PublishStatus, { label: string; tone: 'green' | 'yellow' | 'gray' }> = {
  published: { label: '已發布', tone: 'green' },
  draft: { label: '草稿', tone: 'yellow' },
  archived: { label: '已下架', tone: 'gray' },
};

function ArticleForm({ editing, source, onDone }: { editing: KnowledgeArticle | null; source: ArticlesApi; onDone: () => void }) {
  const task = useTask();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [category, setCategory] = useState<KnowledgeCategory>(editing?.category ?? 'warmup');
  const [audience, setAudience] = useState<Role[]>(editing?.audience ?? ['player', 'parent', 'coach']);
  const [summary, setSummary] = useState(editing?.summary ?? '');
  const [details, setDetails] = useState(editing?.details.join('\n') ?? '');
  const [cautions, setCautions] = useState(editing?.cautions.join('\n') ?? '');
  const [sources, setSources] = useState(editing?.sources.join('\n') ?? '');
  const [reviewed, setReviewed] = useState(editing?.reviewed ?? false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: ArticleInput = {
      id: editing?.id,
      title,
      category,
      audience,
      summary,
      details: details.split('\n'),
      cautions: cautions.split('\n'),
      sources: sources.split('\n'),
      reviewed,
      quiz: editing?.quiz ?? [],
    };
    const r = await task.run(() => source.upsert(input), editing ? '文章已更新。' : '已新增為草稿，確認後可按「發布」。');
    if (r.ok) onDone();
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="grid-2 tight">
        <Field label="標題" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
        </Field>
        <Field label="分類">
          <select value={category} onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}>
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="checks">
        <legend>適用對象</legend>
        {ALL_ROLES.map((r) => (
          <label key={r} className="check">
            <input type="checkbox" checked={audience.includes(r)} onChange={(e) => setAudience(e.target.checked ? [...audience, r] : audience.filter((x) => x !== r))} />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <Field label="內容摘要" required>
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} />
      </Field>
      <Field label="詳細說明（每行一點）" required>
        <textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      <Field label="注意事項（每行一點）">
        <textarea rows={3} value={cautions} onChange={(e) => setCautions(e.target.value)} />
      </Field>
      <Field label="參考來源（每行一筆）" required hint="健康與防護內容必須註明可靠來源。">
        <textarea rows={2} value={sources} onChange={(e) => setSources(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        已由教練或運動防護員審閱
      </label>
      {editing && editing.quiz.length > 0 && <p className="muted small">此文章有 {editing.quiz.length} 題重點測驗（會一併保留）。</p>}
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending}>
          {editing ? '儲存修改' : '新增為草稿'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

export default function KnowledgeAdmin() {
  const { mode } = useStore();
  const source = useArticles();
  const task = useTask();
  const [editing, setEditing] = useState<KnowledgeArticle | 'new' | null>(null);

  if (source.loading) return <LoadingState text="讀取文章中…" />;
  if (source.error) return <Alert kind="error">{source.error}</Alert>;

  return (
    <>
      <Alert kind="warn">健康與運動防護內容應以可靠的運動醫學、急救與公共衛生資料為基礎，不可寫成個別醫療診斷。示範文章發布前請由專業人員審閱。</Alert>
      {mode === 'cloud' && source.articles.length === 0 && (
        <Card title="匯入示範文章" icon="📥">
          <EmptyState
            icon="⛑️"
            title="雲端知識庫還沒有文章"
            hint="可以先匯入 6 篇示範文章（每個分類一篇），匯入後都是「草稿」，請審閱、修改後再按「發布」，球員與家長才看得到。"
            action={
              <button type="button" className="btn btn-primary" disabled={task.pending} onClick={() => task.run(() => source.importDefaults(), '已匯入 6 篇草稿。')}>
                匯入 6 篇示範文章（草稿）
              </button>
            }
          />
        </Card>
      )}
      {editing ? (
        <Card title={editing === 'new' ? '新增文章' : `修改：${editing.title}`} icon="✏️">
          <ArticleForm editing={editing === 'new' ? null : editing} source={source} onDone={() => setEditing(null)} />
        </Card>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          ＋ 新增文章
        </button>
      )}
      <Card title="文章列表" icon="⛑️">
        <ActionFeedback action={task} />
        {source.articles.length === 0 ? (
          <EmptyState title="還沒有文章" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>標題</th>
                  <th>分類</th>
                  <th>狀態</th>
                  <th>審閱</th>
                  <th>更新</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {source.articles.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/knowledge/${a.id}`}>{a.title}</Link>
                    </td>
                    <td className="small">{categoryLabel(a.category)}</td>
                    <td>
                      <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                    </td>
                    <td>{a.reviewed ? <Badge tone="green">已審閱</Badge> : <Badge tone="yellow">待審閱</Badge>}</td>
                    <td className="nowrap">{a.updatedAt}</td>
                    <td className="nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => setEditing(a)}>
                        編輯
                      </button>{' '}
                      {a.status !== 'published' ? (
                        <button type="button" className="btn btn-sm btn-primary" disabled={task.pending} onClick={() => task.run(() => source.setStatus(a.id, 'published'), '已發布。')}>
                          發布
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => task.run(() => source.setStatus(a.id, 'archived'), '已下架。')}>
                          下架
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
