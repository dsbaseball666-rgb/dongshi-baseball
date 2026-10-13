import type { SpriteAccessory, SpriteShape } from '../types';

// 原創像素怪獸：用 12×12 格子組合「身體形狀 + 多個配件 + 配色」，再自動加上外框。
// 進化後的型態使用較大的身體形狀與更多配件，看起來更強壯。
// b=身體 l=肚子 e=眼睛 c=腮紅 a=配件色 o=外框 .=透明

export const SPRITE_SIZE = 12;

export const SHAPES: Record<SpriteShape, { top: number; rows: string[] }> = {
  // 幼年型：小小一隻
  small: {
    top: 5,
    rows: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '....bbbb....',
      '...bbbbbb...',
      '...bebbeb...',
      '...bcbbcb...',
      '...bllllb...',
      '....bbbb....',
      '............',
    ],
  },
  round: {
    top: 3,
    rows: [
      '............',
      '............',
      '............',
      '....bbbb....',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbebbbbebb.',
      '.bcbbbbbbcb.',
      '.bbbllllbbb.',
      '..bllllllb..',
      '...bbbbbb...',
      '............',
    ],
  },
  bird: {
    top: 3,
    rows: [
      '............',
      '............',
      '............',
      '....bbbb....',
      '...bbbbbb...',
      '...bebbeb...',
      '...bbaabb...',
      '..bbllllbb..',
      '..bbllllbb..',
      '...bllllb...',
      '....a..a....',
      '............',
    ],
  },
  shell: {
    top: 4,
    rows: [
      '............',
      '............',
      '............',
      '............',
      '...aaaaaa...',
      '..aaaaaaaa..',
      '.bbbbbbbbbb.',
      '.bebbbbbbeb.',
      '.bcbbbbbbcb.',
      '.bllllllllb.',
      '..bb....bb..',
      '............',
    ],
  },
  // 站立型：有手有腳
  tall: {
    top: 2,
    rows: [
      '............',
      '............',
      '....bbbb....',
      '...bbbbbb...',
      '...bebbeb...',
      '...bcbbcb...',
      '..bbbllbbb..',
      '.bbbbllbbbb.',
      '....bllb....',
      '....bbbb....',
      '....b..b....',
      '............',
    ],
  },
  // 最終型：佔滿整個畫面的大身體
  big: {
    top: 1,
    rows: [
      '............',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbebbbbebb.',
      '.bbebbbbebb.',
      '.bcbbbbbbcb.',
      '.bbbllllbbb.',
      '.bbllllllbb.',
      '.bbllllllbb.',
      '..bbb..bbb..',
      '............',
    ],
  },
};

// 配件以「頂端在第 3 列」為基準；形狀頂端不同時會自動平移，超出畫面的部分省略
export const ACCESSORIES: Record<SpriteAccessory, Record<number, string>> = {
  none: {},
  ears: { 1: '..a......a..', 2: '..aa....aa..', 3: '...aa..aa...' },
  horn: { 0: '......a.....', 1: '.....aa.....', 2: '.....aa.....' },
  leaf: { 0: '.......aa...', 1: '......aa....', 2: '......a.....' },
  flame: { 0: '......a.....', 1: '.....aaa....', 2: '....aaaaa...' },
  cap: { 2: '....aaaa....', 3: '...aaaaaaaa.' },
  stitch: { 4: '...a....a...', 5: '..a......a..', 8: '..a......a..', 9: '...a....a...' },
  wings: { 5: '.a........a.', 6: 'aaa......aaa', 7: '.a........a.' },
  crown: { 1: '...a.aa.a...', 2: '...aaaaaa...' },
  tail: { 6: '...........a', 7: '..........aa', 8: '...........a' },
  spikes: { 1: '....a...a...', 2: '....a.a.a...' },
  antenna: { 0: '...a....a...', 1: '....a..a....', 2: '....a..a....' },
  fins: { 7: 'a..........a', 8: 'aa........aa' },
};

export function buildSprite(shape: SpriteShape, accessories: SpriteAccessory[]): string[][] {
  const base = SHAPES[shape];
  const grid = base.rows.map((r) => r.split(''));
  const shift = base.top - 3;
  for (const acc of accessories) {
    for (const [rowKey, line] of Object.entries(ACCESSORIES[acc] ?? {})) {
      const row = Number(rowKey) + shift;
      if (row < 0 || row >= SPRITE_SIZE) continue;
      line.split('').forEach((ch, col) => {
        if (ch !== '.') grid[row][col] = ch;
      });
    }
  }
  // 自動外框：透明格只要上下左右有顏色就變成外框
  const out = grid.map((r) => [...r]);
  for (let r = 0; r < SPRITE_SIZE; r++) {
    for (let c = 0; c < SPRITE_SIZE; c++) {
      if (grid[r][c] !== '.') continue;
      const neighbors = [grid[r - 1]?.[c], grid[r + 1]?.[c], grid[r][c - 1], grid[r][c + 1]];
      if (neighbors.some((n) => n !== undefined && n !== '.')) out[r][c] = 'o';
    }
  }
  return out;
}
