import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { KnowledgeCategory } from '../types';
import { useStore } from '../store/DemoStore';
import { can } from '../lib/permissions';
import { categoryLabel, KNOWLEDGE_CATEGORIES } from '../data/knowledge';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader } from '../components/UI';
import { useArticles } from '../sources/hooks';
import { EmergencyNotice } from '../components/EmergencyNotice';

export default function KnowledgePage() {
  const { db, user, mode } = useStore();
  const source = useArticles();
  const canEdit = can(user, 'knowledge.edit');
  const [cat, setCat] = useState<KnowledgeCategory | 'all'>('all');
  const passed = new Set(mode === 'cloud' ? [] : db.quizPasses.filter((q) => q.playerId === user?.playerId).map((q) => q.articleId));
  const articles = source.articles.filter((a) => a.status === 'published' && user && a.audience.includes(user.role) && (cat === 'all' || a.category === cat));
  const drafts = canEdit ? source.articles.filter((a) => a.status === 'draft').length : 0;

  return (
    <div className="page">
      <PageHeader
        icon="⛑️"
        title="防護知識庫"
        subtitle="運動安全與防護的基本知識"
        actions={
          canEdit ? (
            <Link to="/admin?tab=knowledge" className="btn btn-primary">
              ✏️ 管理文章
            </Link>
          ) : undefined
        }
      />
      <EmergencyNotice />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={cat === 'all'} className={`tab ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>
          全部
        </button>
        {KNOWLEDGE_CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={`tab ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>
      {source.error && (
        <Alert kind="error">
          {source.error}{' '}
          <button type="button" className="btn btn-sm" onClick={source.reload}>
            重新讀取
          </button>
        </Alert>
      )}
      {drafts > 0 && (
        <Alert kind="info">
          有 {drafts} 篇草稿尚未發布，請到 <Link to="/admin?tab=knowledge">教練後台 → 防護知識</Link> 審閱後發布。
        </Alert>
      )}
      {source.loading ? (
        <Card>
          <LoadingState text="讀取文章中…" />
        </Card>
      ) : articles.length === 0 ? (
        <Card>
          <EmptyState icon="📭" title="這個分類目前沒有已發布的文章" />
        </Card>
      ) : (
        <div className="article-grid">
          {articles.map((a) => (
            <Link key={a.id} to={`/knowledge/${a.id}`} className="article-card">
              <span className="article-cat">
                {KNOWLEDGE_CATEGORIES.find((c) => c.id === a.category)?.icon} {categoryLabel(a.category)}
              </span>
              <h3>{a.title}</h3>
              <p className="muted small">{a.summary}</p>
              <div className="chip-row">
                {!a.reviewed && <Badge tone="yellow">待教練／防護員審閱</Badge>}
                {a.quiz.length > 0 && <Badge tone="blue">含重點測驗</Badge>}
                {passed.has(a.id) && <Badge tone="green">✓ 已通過測驗</Badge>}
              </div>
              <span className="muted small">更新：{a.updatedAt}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
