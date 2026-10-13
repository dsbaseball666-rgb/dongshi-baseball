import { useState } from 'react';
import type { Monster, PlayerMonster } from '../../types';
import { useStore, useTask } from '../../store/DemoStore';
import { useMonsterAdmin } from '../../sources/game';
import { usePlayers } from '../../sources/hooks';
import { EXPLORE_AREAS, MAX_LEVEL, rarityStars, STAGE_LABELS } from '../../lib/monster';
import { ActionFeedback, Alert, Badge, Card, EmptyState, Field, LoadingState } from '../../components/UI';
import { MonsterSprite } from '../../components/MonsterSprite';

type MonsterAdminApi = ReturnType<typeof useMonsterAdmin>;

function MonsterEditor({ monster, source, onDone }: { monster: Monster; source: MonsterAdminApi; onDone: () => void }) {
  const action = useTask();
  const [name, setName] = useState(monster.name);
  const [description, setDescription] = useState(monster.description);
  const [rate, setRate] = useState(Math.round(monster.catchRate * 100));
  const [inWild, setInWild] = useState(monster.inWild);
  const [evolveLevel, setEvolveLevel] = useState(monster.evolveLevel ?? 0);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(() => source.update(monster.id, { name, description, catchRate: rate / 100, inWild, evolveLevel: monster.evolvesTo ? evolveLevel : undefined }), '怪獸資料已更新。');
        if (r.ok) onDone();
      }}
    >
      <div className="grid-3 tight">
        <Field label="名稱" required>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} />
        </Field>
        <Field label="捕捉率（5～95%）">
          <input type="number" min={5} max={95} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
        {monster.evolvesTo ? (
          <Field label={`進化等級（2～${MAX_LEVEL}）`}>
            <input type="number" min={2} max={MAX_LEVEL} value={evolveLevel} onChange={(e) => setEvolveLevel(Number(e.target.value))} />
          </Field>
        ) : (
          <Field label="進化等級">
            <input value="最終型態" disabled />
          </Field>
        )}
      </div>
      <Field label="圖鑑說明" required>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={inWild} onChange={(e) => setInWild(e.target.checked)} />
        在野外出沒
      </label>
      <ActionFeedback action={action} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          儲存
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

function GrantExpForm({ playerMonsters, source }: { playerMonsters: PlayerMonster[]; source: MonsterAdminApi }) {
  const { players } = usePlayers();
  const action = useTask();
  const [pmId, setPmId] = useState(playerMonsters[0]?.id ?? '');
  const [amount, setAmount] = useState(20);
  const [reason, setReason] = useState('');
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;
  if (playerMonsters.length === 0) return <EmptyState title="球員們還沒有任何怪獸" />;
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(() => source.grantExp(pmId || playerMonsters[0].id, amount, reason), '經驗值已發放，並記錄於操作紀錄。');
        if (r.ok) setReason('');
      }}
    >
      <div className="grid-3 tight">
        <Field label="球員的怪獸">
          <select value={pmId || playerMonsters[0].id} onChange={(e) => setPmId(e.target.value)}>
            {playerMonsters.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {name(pm.playerId)}：{pm.nickname}（Lv.{pm.level}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="經驗值（1～500）">
          <input type="number" min={1} max={500} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="發放原因" required>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={60} placeholder="例如：比賽日擔任啦啦隊長" />
        </Field>
      </div>
      <ActionFeedback action={action} />
      <button type="submit" className="btn btn-primary" disabled={action.pending}>
        發放
      </button>
    </form>
  );
}

export default function MonstersAdmin() {
  const { mode } = useStore();
  const source = useMonsterAdmin();
  const importTask = useTask();
  const [editing, setEditing] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [stage, setStage] = useState<'all' | '1' | '2' | '3'>('all');
  const { monsters, playerMonsters } = source;
  const ownerCount = (mid: string) => new Set(playerMonsters.filter((p) => p.monsterId === mid).map((p) => p.playerId)).size;
  const area = (id: string) => EXPLORE_AREAS.find((a) => a.id === id)?.name ?? id;
  const nameOf = (id?: string) => monsters.find((m) => m.id === id)?.name ?? '';
  const list = [...monsters]
    .sort((a, b) => a.dexNo - b.dexNo)
    .filter((m) => (stage === 'all' || String(m.stage) === stage) && (!keyword.trim() || m.name.includes(keyword.trim()) || String(m.dexNo) === keyword.trim()));

  if (source.loading) return <LoadingState text="讀取怪獸資料中…" />;
  if (source.error) return <Alert kind="error">{source.error}</Alert>;

  if (mode === 'cloud' && monsters.length === 0) {
    return (
      <Card title="匯入怪獸圖鑑" icon="📥">
        <EmptyState
          icon="🥚"
          title="雲端還沒有怪獸資料"
          hint="按下按鈕，把 75 隻原創怪獸（25 條進化路線）的遊戲數值存到 Google 試算表。匯入後球員才能選擇初始夥伴、探索與捕捉。"
          action={
            <button type="button" className="btn btn-primary" disabled={importTask.pending} onClick={() => importTask.run(() => source.importDefaults(), '已匯入 75 隻怪獸。')}>
              匯入 75 隻怪獸
            </button>
          }
        />
        <ActionFeedback action={importTask} />
      </Card>
    );
  }

  return (
    <>
      <Alert kind="info">所有怪獸皆為本專案原創角色（共 {monsters.length} 隻）。怪獸能力屬於遊戲機制，不代表球員真實體能。</Alert>
      <Card title="手動發放經驗值" icon="⭐">
        <GrantExpForm playerMonsters={playerMonsters} source={source} />
      </Card>
      <Card
        title="怪獸與圖鑑管理"
        icon="🐾"
        actions={
          <>
            <input aria-label="搜尋怪獸" placeholder="名稱或編號" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <select aria-label="階段篩選" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
              <option value="all">全部階段</option>
              <option value="1">{STAGE_LABELS[1]}</option>
              <option value="2">{STAGE_LABELS[2]}</option>
              <option value="3">{STAGE_LABELS[3]}</option>
            </select>
          </>
        }
      >
        {list.length === 0 && <EmptyState icon="🔍" title="沒有符合的怪獸" />}
        <div className="admin-monster-list">
          {list.map((m) => (
            <div key={m.id} className="admin-monster">
              <MonsterSprite monster={m} size={64} />
              <div className="grow">
                <strong>
                  No.{String(m.dexNo).padStart(3, '0')} {m.name}
                </strong>{' '}
                <Badge tone="purple">{m.element}</Badge> <span className="stars">{rarityStars(m.rarity)}</span> {m.isStarter && <Badge tone="yellow">初始夥伴</Badge>}{' '}
                {!m.inWild && m.stage !== 3 && <Badge tone="gray">暫停出沒</Badge>}
                <div className="muted small">
                  {STAGE_LABELS[m.stage]}・{m.inWild ? `${area(m.habitat)}・捕捉率 ${Math.round(m.catchRate * 100)}%` : m.stage === 3 ? '僅能進化取得' : '目前不在野外出沒'}・{ownerCount(m.id)} 位球員擁有
                  {m.evolvesTo && `・Lv.${m.evolveLevel} 進化為 ${nameOf(m.evolvesTo)}`}
                </div>
                {editing === m.id ? <MonsterEditor monster={m} source={source} onDone={() => setEditing(null)} /> : <p className="small">{m.description}</p>}
              </div>
              {editing !== m.id && (
                <button type="button" className="btn btn-sm" onClick={() => setEditing(m.id)}>
                  修改
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
