import type { ExploreAreaId, Monster, MonsterElement, SpriteAccessory, SpritePalette, SpriteShape } from '../types';
import { AFFECTION_EVOLVE_DEFAULTS } from '../lib/monster';

// 全部為本專案原創怪獸，未使用任何寶可夢或其他遊戲的角色、名稱與素材。
// 共 25 條進化路線 × 3 階段 = 75 隻。
// 第 1、2 階段會在野外出沒；第 3 階段（最終型態）只能透過進化取得。

/** 預設進化等級：第 1 階段 → 第 2 階段、第 2 階段 → 第 3 階段（教練可在後台逐隻調整） */
export const DEFAULT_EVOLVE_LEVELS = { 1: 6, 2: 14 } as const;

interface Form {
  name: string;
  shape: SpriteShape;
  acc: SpriteAccessory[];
  desc: string;
}

interface Line {
  element: MonsterElement;
  habitat: ExploreAreaId;
  rarity: 1 | 2 | 3;
  starter?: boolean;
  palette: SpritePalette;
  forms: [Form, Form, Form];
}

const P = (body: string, belly: string, accent: string, outline: string): SpritePalette => ({ body, belly, accent, outline });
const F = (name: string, shape: SpriteShape, acc: SpriteAccessory[], desc: string): Form => ({ name, shape, acc, desc });

const LINES: Line[] = [
  {
    element: '熱血', habitat: 'field', rarity: 1, starter: true, palette: P('#ff8a3d', '#ffe0b2', '#d84315', '#5d2a12'),
    forms: [
      F('焰尾狐', 'small', ['ears'], '尾巴像火焰一樣搖動的小狐狸，投球前總會深呼吸三次。'),
      F('烈焰狐', 'round', ['ears', 'tail'], '經過反覆練習，尾巴的火焰更穩定，投球節奏也更好了。'),
      F('炎陣狐王', 'big', ['ears', 'tail', 'crown'], '能帶動全隊士氣的狐王，越是關鍵時刻越冷靜。'),
    ],
  },
  {
    element: '成長', habitat: 'orchard', rarity: 1, starter: true, palette: P('#7ccf6b', '#e8f5c8', '#2e7d32', '#1f4d1a'),
    forms: [
      F('芽芽獸', 'small', ['leaf'], '頭上長著嫩芽，每天進步一點點，嫩芽就會長高一點點。'),
      F('綠葉獸', 'round', ['leaf', 'tail'], '葉子越長越茂密，喜歡在訓練後好好伸展。'),
      F('大樹守護獸', 'big', ['leaf', 'spikes'], '像大樹一樣穩重，默默守護著每一位隊友。'),
    ],
  },
  {
    element: '疾風', habitat: 'riverside', rarity: 1, starter: true, palette: P('#4fc3f7', '#e1f5fe', '#0277bd', '#0d3c61'),
    forms: [
      F('疾風雀', 'bird', ['wings'], '在河堤跑道上練習衝刺的小鳥，起跑反應特別快。'),
      F('疾風隼', 'bird', ['wings', 'horn'], '學會正確的跑壘路線，轉彎時幾乎不減速。'),
      F('迅雷鷹', 'big', ['wings', 'crown'], '速度快如閃電，卻從不忘記安全第一。'),
    ],
  },
  {
    element: '團結', habitat: 'field', rarity: 1, palette: P('#fafafa', '#eeeeee', '#e53935', '#3b3b3b'),
    forms: [
      F('球球丸', 'small', ['stitch'], '身上有紅色縫線的圓滾滾怪獸，最喜歡大家一起練傳接球。'),
      F('縫線球球', 'round', ['stitch'], '縫線變得更清楚了，傳球時總是先看準隊友的手套。'),
      F('全壘打球王', 'big', ['stitch', 'crown'], '傳說中被擊出全壘打的那顆球，記得每一位隊友的努力。'),
    ],
  },
  {
    element: '堅守', habitat: 'riverside', rarity: 1, palette: P('#9ccc65', '#f1f8e9', '#8d6e63', '#33401f'),
    forms: [
      F('壘包龜', 'shell', ['none'], '背著壘包形狀的龜殼，守備時一步也不退讓。'),
      F('本壘盾龜', 'shell', ['spikes'], '龜殼變得像本壘板一樣堅固，觸殺時又穩又準。'),
      F('鋼鐵壘包龜', 'big', ['spikes', 'crown'], '甲殼閃閃發亮，是球隊最可靠的防守核心。'),
    ],
  },
  {
    element: '堅守', habitat: 'field', rarity: 2, palette: P('#a0703f', '#f3d9b1', '#6d4c2f', '#3b2614'),
    forms: [
      F('手套熊', 'round', ['ears'], '雙手像大大的手套，接球時總是用雙手確實包住。'),
      F('大手套熊', 'tall', ['ears'], '站起來守備的大熊，滾地球再刁鑽也能穩穩接住。'),
      F('金手套熊王', 'big', ['ears', 'crown'], '守備範圍超廣的熊王，最重視每一次的基本動作。'),
    ],
  },
  {
    element: '智慧', habitat: 'field', rarity: 2, palette: P('#ffd54f', '#fff8e1', '#1e3a8a', '#5c4300'),
    forms: [
      F('帽帽雀', 'bird', ['cap'], '戴著球帽觀察比賽的小鳥，會把看到的戰術記在筆記裡。'),
      F('戰術雀', 'bird', ['cap', 'wings'], '能看懂教練的暗號，總是第一個做好準備。'),
      F('總教練鴞', 'big', ['cap', 'wings'], '博學的大貓頭鷹，擅長把複雜的戰術說得簡單易懂。'),
    ],
  },
  {
    element: '智慧', habitat: 'orchard', rarity: 2, palette: P('#9575cd', '#ede7f6', '#ffca28', '#311b92'),
    forms: [
      F('山城角獸', 'round', ['horn'], '住在山城果園的怪獸，頭上的角在思考時會微微發光。'),
      F('雙角山獸', 'tall', ['horn', 'tail'], '角變得更加明亮，遇到問題時會先冷靜分析。'),
      F('神木角王', 'big', ['horn', 'spikes'], '住在山林深處的角王，象徵持續學習的智慧。'),
    ],
  },
  {
    element: '疾風', habitat: 'riverside', rarity: 2, palette: P('#26a69a', '#e0f2f1', '#ff7043', '#004d40'),
    forms: [
      F('溪流鴨', 'bird', ['none'], '在溪邊悠閒散步，但跑壘時突然變得非常敏捷。'),
      F('激流鴨', 'bird', ['fins'], '在湍急的水流中練就平衡感，滑壘動作乾淨俐落。'),
      F('大甲溪鴨王', 'big', ['fins', 'crown'], '守護大甲溪畔的鴨王，跑得快也懂得適時休息。'),
    ],
  },
  {
    element: '成長', habitat: 'orchard', rarity: 1, palette: P('#dce775', '#f9fbe7', '#558b2f', '#5f6b14'),
    forms: [
      F('梨梨寶', 'small', ['leaf'], '像一顆甜甜的梨子，睡飽吃好之後最有精神。'),
      F('甜梨獸', 'round', ['leaf'], '營養均衡讓牠長得圓潤結實，耐力也越來越好。'),
      F('高接梨王', 'big', ['leaf', 'crown'], '以東勢高接梨為靈感的梨王，象徵一點一滴累積的成果。'),
    ],
  },
  {
    element: '熱血', habitat: 'orchard', rarity: 3, palette: P('#ef5350', '#ffebee', '#5d4037', '#4a1010'),
    forms: [
      F('熔岩龜寶', 'shell', ['flame'], '小小的身體裡藏著熱情，只有持續努力的訓練家才遇得到。'),
      F('火山壘包龜', 'shell', ['flame', 'fins'], '背上的火山冒著熱氣，代表永不放棄的鬥志。'),
      F('熔岩要塞龜', 'big', ['flame', 'spikes'], '傳說中的守護者，熱血卻從不衝動。'),
    ],
  },
  {
    element: '團結', habitat: 'riverside', rarity: 3, palette: P('#fff176', '#ffffff', '#ff6f00', '#6d4c00'),
    forms: [
      F('星光雀', 'bird', ['horn'], '夜間訓練時偶爾出現的小鳥，翅膀帶著點點星光。'),
      F('星光雀王', 'bird', ['horn', 'wings'], '會為整支隊伍帶來好運氣的雀王。'),
      F('銀河守護雀', 'big', ['horn', 'wings'], '傳說中守護夜空的神鳥，只會出現在團結的隊伍身邊。'),
    ],
  },
  {
    element: '熱血', habitat: 'field', rarity: 1, palette: P('#c58b4f', '#f5deb3', '#5d3a1a', '#3e2410'),
    forms: [
      F('球棒蜥', 'small', ['spikes'], '尾巴像一支小球棒，每天都認真練習揮棒。'),
      F('長棒蜥', 'tall', ['spikes', 'tail'], '揮棒動作越來越標準，懂得揮棒前先確認周圍安全。'),
      F('重砲龍', 'big', ['spikes', 'tail'], '一棒就能把球打得又高又遠的重砲手。'),
    ],
  },
  {
    element: '疾風', habitat: 'field', rarity: 1, palette: P('#fce4ec', '#ffffff', '#ec407a', '#6d2140'),
    forms: [
      F('盜壘兔', 'small', ['ears'], '耳朵豎得高高的，總在觀察投手的動作。'),
      F('飛奔兔', 'tall', ['ears'], '起跑第一步特別快，常常一溜煙就跑上二壘。'),
      F('閃電盜壘兔', 'big', ['ears', 'tail'], '判斷力和速度兼具，最懂得把握每一次機會。'),
    ],
  },
  {
    element: '堅守', habitat: 'orchard', rarity: 1, palette: P('#90a4ae', '#eceff1', '#455a64', '#263238'),
    forms: [
      F('護具犰', 'shell', ['ears'], '全身包著護具的小犰狳，最重視安全裝備。'),
      F('鐵壁犰', 'shell', ['ears', 'spikes'], '護具更加堅固，是投手最信任的好搭檔。'),
      F('本壘鋼盾犰', 'big', ['spikes', 'crown'], '守住本壘的鋼鐵捕手，從不讓跑者輕易得分。'),
    ],
  },
  {
    element: '智慧', habitat: 'riverside', rarity: 1, palette: P('#81c784', '#fffde7', '#33691e', '#1b3d12'),
    forms: [
      F('筆記蛙', 'small', ['antenna'], '隨身帶著小筆記本，每天都會記下新學到的事。'),
      F('墨水蛙', 'round', ['antenna'], '筆記越寫越多，懂得從錯誤中找到進步的方法。'),
      F('智慧蛙博士', 'big', ['cap'], '學識淵博的蛙博士，最喜歡和大家分享知識。'),
    ],
  },
  {
    element: '成長', habitat: 'field', rarity: 1, palette: P('#aed581', '#f1f8e9', '#f06292', '#33521a'),
    forms: [
      F('草皮蟲', 'small', ['antenna'], '住在外野草皮裡的小蟲，慢慢地一步步前進。'),
      F('草皮蛹', 'shell', ['antenna'], '在蛹裡安靜休息，養精蓄銳準備蛻變。'),
      F('綠茵蝶', 'bird', ['antenna', 'wings'], '破蛹而出的蝴蝶，證明休息與耐心也是成長的一部分。'),
    ],
  },
  {
    element: '團結', habitat: 'field', rarity: 2, palette: P('#66bb6a', '#fff59d', '#e53935', '#1b5e20'),
    forms: [
      F('加油鸚', 'bird', ['horn'], '只要隊友上場，就會大聲喊加油的小鸚鵡。'),
      F('應援鸚', 'bird', ['horn', 'wings'], '會帶領大家喊口號，讓休息區充滿活力。'),
      F('啦啦隊鸚王', 'big', ['horn', 'wings'], '無論輸贏都為隊友鼓掌，是最好的精神支柱。'),
    ],
  },
  {
    element: '熱血', habitat: 'riverside', rarity: 2, palette: P('#ff7043', '#fff3e0', '#ffca28', '#7a2410'),
    forms: [
      F('熱血鯉', 'small', ['fins'], '在溪流中奮力逆游的小鯉魚，越挫越勇。'),
      F('躍門鯉', 'round', ['fins', 'tail'], '一次次挑戰水門，跳躍力越來越驚人。'),
      F('金鯉龍', 'big', ['fins', 'horn'], '堅持到最後終於蛻變的金色神龍。'),
    ],
  },
  {
    element: '疾風', habitat: 'orchard', rarity: 2, palette: P('#ffb74d', '#fff3e0', '#4e342e', '#5d3200'),
    forms: [
      F('柿柿蜂', 'small', ['antenna'], '在東勢甜柿園裡忙碌飛舞的小蜜蜂。'),
      F('柿蜜蜂', 'bird', ['antenna', 'wings'], '飛行路線又快又準，像是完美的跑壘。'),
      F('柿園蜂后', 'big', ['antenna', 'wings'], '統領整片柿園的蜂后，懂得分工合作的重要。'),
    ],
  },
  {
    element: '堅守', habitat: 'field', rarity: 2, palette: P('#e0e0e0', '#ffffff', '#8d6e63', '#424242'),
    forms: [
      F('壘線蝸', 'shell', ['antenna'], '沿著白色壘線慢慢爬行，從不走偏。'),
      F('白線蝸', 'shell', ['antenna', 'spikes'], '殼上的白線越來越清晰，象徵守規矩的好習慣。'),
      F('界外線蝸王', 'big', ['antenna', 'spikes'], '守護比賽公平的蝸牛王，最重視運動家精神。'),
    ],
  },
  {
    element: '智慧', habitat: 'orchard', rarity: 2, palette: P('#b0bec5', '#fafafa', '#3949ab', '#263238'),
    forms: [
      F('書包貓', 'small', ['ears'], '背著書包上學的小貓，課業和練球一樣認真。'),
      F('學霸貓', 'round', ['ears', 'tail'], '懂得安排時間，讀書和訓練都不馬虎。'),
      F('智將貓', 'big', ['ears', 'tail'], '冷靜的智將，總能在關鍵時刻想出好對策。'),
    ],
  },
  {
    element: '成長', habitat: 'riverside', rarity: 2, palette: P('#a1887f', '#d7ccc8', '#607d8b', '#3e2723'),
    forms: [
      F('溪石精', 'small', ['none'], '大甲溪畔的小石頭精靈，被水流慢慢磨得圓潤。'),
      F('卵石巨人', 'tall', ['spikes'], '一顆顆石頭堆疊而成，代表一點一滴的累積。'),
      F('大甲岩神', 'big', ['spikes', 'crown'], '穩如磐石的岩神，經得起任何風雨考驗。'),
    ],
  },
  {
    element: '團結', habitat: 'orchard', rarity: 3, palette: P('#ffffff', '#fce4ec', '#f48fb1', '#6d4c41'),
    forms: [
      F('桐花芽', 'small', ['leaf'], '客家山城的油桐花精靈，四月時悄悄冒出頭。'),
      F('桐花精', 'bird', ['leaf', 'wings'], '隨著五月的風飛舞，把好心情分享給大家。'),
      F('五月雪桐靈', 'big', ['leaf', 'wings'], '油桐花如雪般盛開時現身的精靈，象徵團隊的凝聚力。'),
    ],
  },
  {
    element: '智慧', habitat: 'riverside', rarity: 3, palette: P('#dce775', '#ffffe0', '#64dd17', '#33402a'),
    forms: [
      F('夜燈螢', 'small', ['antenna'], '夜間練習時在燈光下飛舞的小螢火蟲。'),
      F('球場燈螢', 'bird', ['antenna', 'wings'], '身上的光芒像球場燈一樣，照亮回家的路。'),
      F('夜賽螢光王', 'big', ['antenna', 'wings'], '只在夜間比賽出現的螢光王，提醒大家注意夜間安全。'),
    ],
  },
];

const BASE_CATCH: Record<1 | 2 | 3, number> = { 1: 0.6, 2: 0.4, 3: 0.2 };
const idOf = (dexNo: number) => `M${String(dexNo).padStart(3, '0')}`;

export const SEED_MONSTERS: Monster[] = LINES.flatMap((line, i) =>
  line.forms.map((f, s): Monster => {
    const stage = (s + 1) as 1 | 2 | 3;
    const dexNo = i * 3 + stage;
    const rarity = stage === 1 ? line.rarity : stage === 2 ? (Math.min(3, line.rarity + 1) as 2 | 3) : 3;
    return {
      id: idOf(dexNo),
      dexNo,
      name: f.name,
      element: line.element,
      rarity,
      stage,
      evolvesTo: stage < 3 ? idOf(dexNo + 1) : undefined,
      evolveLevel: stage === 1 ? DEFAULT_EVOLVE_LEVELS[1] : stage === 2 ? DEFAULT_EVOLVE_LEVELS[2] : undefined,
      evolveAffection: stage < 3 ? (AFFECTION_EVOLVE_DEFAULTS[idOf(dexNo)] ?? 0) : undefined,
      description: f.desc,
      habitat: line.habitat,
      catchRate: stage === 1 ? BASE_CATCH[line.rarity] : stage === 2 ? 0.3 : 0.1,
      isStarter: !!line.starter && stage === 1,
      inWild: stage < 3,
      shape: f.shape,
      accessories: f.acc,
      palette: line.palette,
    };
  }),
);
