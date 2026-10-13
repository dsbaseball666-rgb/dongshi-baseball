import { useMemo } from 'react';
import type { Monster } from '../types';
import { buildSprite, SPRITE_SIZE } from '../lib/sprite';

interface Props {
  monster: Monster;
  size?: number;
  /** 尚未解鎖時顯示剪影 */
  silhouette?: boolean;
  className?: string;
}

export function MonsterSprite({ monster, size = 96, silhouette = false, className = '' }: Props) {
  const accKey = monster.accessories.join(',');
  const grid = useMemo(() => buildSprite(monster.shape, accKey.split(',') as Monster['accessories']), [monster.shape, accKey]);
  const p = monster.palette;
  const colorOf = (ch: string): string => {
    if (silhouette) return ch === 'o' ? '#1f2430' : '#3d4456';
    switch (ch) {
      case 'o':
        return p.outline;
      case 'b':
        return p.body;
      case 'l':
        return p.belly;
      case 'a':
        return p.accent;
      case 'e':
        return '#1d1d1d';
      case 'c':
        return '#ff8fa3';
      default:
        return 'transparent';
    }
  };
  return (
    <svg
      className={`monster-sprite ${className}`}
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={silhouette ? '尚未解鎖的怪獸' : monster.name}
    >
      {grid.flatMap((row, r) =>
        row.map((ch, c) =>
          ch === '.' ? null : <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={colorOf(ch)} />,
        ),
      )}
    </svg>
  );
}
