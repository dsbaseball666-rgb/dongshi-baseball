import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/DemoStore';
import { useRules } from '../sources/hooks';
import { can } from '../lib/permissions';
import { formatDateTime } from '../lib/date';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader } from '../components/UI';

export default function RulesPage() {
  const { user } = useStore();
  const { rules: all, loading, error, reload } = useRules();
  const canEdit = can(user, 'rules.edit');
  const [cat, setCat] = useState('全部');
  const categories = ['全部', ...Array.from(new Set(all.map((r) => r.category)))];
  const rules = [...all].sort((a, b) => a.no - b.no).filter((r) => cat === '全部' || r.category === cat);
  const highlighted = all.filter((r) => r.isAnnouncement);

  return (
    <div className="page">
      <PageHeader
        icon="📜"
        title="球隊規章"
        subtitle={`共 ${all.length} 條・球員與家長皆可閱讀`}
        actions={
          canEdit ? (
            <Link to="/admin?tab=rules" className="btn btn-primary">
              ✏️ 編輯規章
            </Link>
          ) : undefined
        }
      />
      {error && (
        <Alert kind="error">
          {error}{' '}
          <button type="button" className="btn btn-sm" onClick={reload}>
            重新讀取
          </button>
        </Alert>
      )}
      {loading ? (
        <Card>
          <LoadingState text="讀取規章中…" />
        </Card>
      ) : all.length === 0 ? (
        !error && (
          <Card>
            <EmptyState icon="📜" title="雲端還沒有規章資料" hint={canEdit ? '請到「教練後台 → 球隊規章」匯入 17 條規章。' : '教練匯入規章後就會顯示在這裡。'} />
          </Card>
        )
      ) : (
        <>
          {highlighted.length > 0 && (
            <Card title="重要規章" icon="📌" className="highlight-card">
              <ul className="plain-list">
                {highlighted.map((r) => (
                  <li key={r.id}>
                    <strong>
                      第 {r.no} 條　{r.title}
                    </strong>
                    ：{r.content}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="tabs" role="tablist">
            {categories.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} className={`tab ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          {rules.length === 0 ? (
            <Card>
              <EmptyState title="這個分類沒有規章" />
            </Card>
          ) : (
            <ol className="rule-list">
              {rules.map((r) => (
                <li key={r.id} className="rule-item">
                  <div className="rule-no">{r.no}</div>
                  <div className="rule-body">
                    <div className="rule-head">
                      <strong>{r.title}</strong>
                      <Badge tone="blue">{r.category}</Badge>
                      {r.isAnnouncement && <Badge tone="red">重要</Badge>}
                      {canEdit && r.needsCoachReview && <Badge tone="yellow">待教練確認</Badge>}
                    </div>
                    <p>{r.content}</p>
                    <p className="muted small">
                      第 {r.version} 版・更新：{formatDateTime(r.updatedAt)}・{r.updatedBy}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
