import { useState } from 'react';
import type { Announcement, PublishStatus, Role } from '../../types';
import { useTask } from '../../store/DemoStore';
import { useAnnouncements } from '../../sources/hooks';
import { ALL_ROLES, ROLE_LABELS } from '../../lib/permissions';
import { formatDateTime } from '../../lib/date';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';

type AnnouncementsApi = ReturnType<typeof useAnnouncements>;

const STATUS: Record<PublishStatus, { label: string; tone: 'green' | 'yellow' | 'gray' }> = {
  published: { label: '已發布', tone: 'green' },
  draft: { label: '草稿', tone: 'yellow' },
  archived: { label: '已下架', tone: 'gray' },
};

function AnnouncementForm({ editing, source, onDone }: { editing: Announcement | null; source: AnnouncementsApi; onDone: () => void }) {
  const task = useTask();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [audience, setAudience] = useState<Role[]>(editing?.audience ?? ['player', 'coach']);
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await task.run(() => source.upsert({ id: editing?.id, title, body, audience, pinned }), editing ? '公告已更新。' : '已存成草稿，按「發布」後才會公開。');
        if (r.ok) {
          if (editing) onDone();
          else {
            setTitle('');
            setBody('');
          }
        }
      }}
    >
      <Field label="標題" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </Field>
      <Field label="內容" required>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      </Field>
      <fieldset className="checks">
        <legend>可閱讀的對象（勾選「家長」才會開放給家長）</legend>
        {ALL_ROLES.map((r) => (
          <label key={r} className="check">
            <input type="checkbox" checked={audience.includes(r)} onChange={(e) => setAudience(e.target.checked ? [...audience, r] : audience.filter((x) => x !== r))} />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        置頂
      </label>
      <ActionFeedback action={task} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={task.pending}>
          {editing ? '儲存修改' : '存成草稿'}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

export default function AnnouncementsAdmin() {
  const source = useAnnouncements();
  const task = useTask();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const list = [...source.announcements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (source.loading) return <LoadingState text="讀取公告中…" />;
  if (source.error) return <Alert kind="error">{source.error}</Alert>;
  return (
    <>
      <Card title={editing ? `修改公告：${editing.title}` : '新增公告'} icon="✏️">
        <AnnouncementForm key={editing?.id ?? 'new'} editing={editing} source={source} onDone={() => setEditing(null)} />
      </Card>
      <Card title="公告列表" icon="📣">
        <ActionFeedback action={task} />
        {list.length === 0 ? (
          <EmptyState icon="📭" title="還沒有公告" hint="使用上方表單建立第一則公告。" />
        ) : (
          <ul className="plain-list">
            {list.map((a) => (
              <li key={a.id} className="row-between">
                <span>
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge> {a.pinned && <Badge tone="red">置頂</Badge>} <strong>{a.title}</strong>
                  <div className="muted small">
                    對象：{a.audience.map((r) => ROLE_LABELS[r]).join('、')}・更新 {formatDateTime(a.updatedAt)}
                  </div>
                </span>
                <span className="nowrap">
                  <button type="button" className="btn btn-sm" onClick={() => setEditing(a)}>
                    編輯
                  </button>{' '}
                  {a.status !== 'published' ? (
                    <button type="button" className="btn btn-sm btn-primary" disabled={task.pending} onClick={() => task.run(() => source.setStatus(a.id, 'published'), '公告已發布。')}>
                      發布
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm btn-ghost" disabled={task.pending} onClick={() => task.run(() => source.setStatus(a.id, 'archived'), '公告已下架。')}>
                      下架
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
