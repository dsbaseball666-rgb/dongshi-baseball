import type { ReactNode } from 'react';
import type { useGame } from '../sources/game';
import { Alert, Card, EmptyState, LoadingState } from './UI';

/** 遊戲頁共用：讀取中、錯誤、教練尚未匯入怪獸資料時的畫面 */
export function GameGate({ game, children }: { game: ReturnType<typeof useGame>; children: ReactNode }) {
  if (game.error || game.monstersError)
    return (
      <Alert kind="error">
        {game.error ?? game.monstersError}{' '}
        <button type="button" className="btn btn-sm" onClick={game.reload}>
          重新讀取
        </button>
      </Alert>
    );
  if (game.loading || game.monstersLoading || !game.state)
    return (
      <Card>
        <LoadingState text="讀取遊戲資料中…" />
      </Card>
    );
  if (game.monsters.length === 0)
    return (
      <Card>
        <EmptyState icon="🥚" title="怪獸還沒有來到球場" hint="教練匯入怪獸圖鑑後就可以開始冒險了（教練後台 → 怪獸與圖鑑）。" />
      </Card>
    );
  return <>{children}</>;
}
