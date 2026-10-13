import { Link } from 'react-router-dom';
import { useStore } from '../store/DemoStore';
import { useAnnouncements } from '../sources/hooks';
import { can, ROLE_LABELS } from '../lib/permissions';
import { formatDateTime } from '../lib/date';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader } from '../components/UI';

export default function AnnouncementsPage() {
  const { user } = useStore();
  const { announcements, loading, error, reload } = useAnnouncements();
  const canEdit = can(user, 'announcement.edit');
  const list = announcements
    .filter((a) => a.status === 'published' && user && a.audience.includes(user.role))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));

  return (
    <div className="page">
      <PageHeader
        icon="📣"
        title="球隊公告"
        subtitle={user?.role === 'parent' ? '教練開放給家長閱讀的公告' : '最新的球隊消息'}
        actions={
          canEdit ? (
            <Link to="/admin?tab=announcements" className="btn btn-primary">
              ✏️ 發布公告
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
          <LoadingState text="讀取公告中…" />
        </Card>
      ) : list.length === 0 ? (
        !error && (
          <Card>
            <EmptyState icon="📭" title="目前沒有公告" />
          </Card>
        )
      ) : (
        list.map((a) => (
          <Card key={a.id} className={a.pinned ? 'pinned' : ''}>
            <div className="ann-head">
              {a.pinned && <Badge tone="red">📌 置頂</Badge>}
              <h2>{a.title}</h2>
            </div>
            <p className="pre-line">{a.body}</p>
            <p className="muted small">
              {formatDateTime(a.publishedAt)}・{a.createdBy}
              {canEdit && `・對象：${a.audience.map((r) => ROLE_LABELS[r]).join('、')}`}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
