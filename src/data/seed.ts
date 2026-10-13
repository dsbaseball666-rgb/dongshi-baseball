import type { DemoDB, FitnessItemKey, FitnessTest, Wallet } from '../types';
import { addDays, isoWeekKey, todayStr } from '../lib/date';
import { getFitnessItem } from '../lib/fitness';
import { SEED_MONSTERS } from './monsters';
import { createSeedRules } from './rules';
import { createSeedArticles } from './knowledge';
import { SELF_CHECK_ITEMS } from './selfChecks';

// 第一階段示範資料：所有姓名、成績都是虛構的「示範資料」，不是真實球員。
export const SEED_VERSION = 4;

function emptyWallet(playerId: string, points: number, balls: number, seen: string[]): Wallet {
  return { playerId, points, balls, exploreDate: '', exploreCount: 0, supplyDate: '', seenMonsterIds: seen, encounter: null };
}

export function createSeed(now: Date = new Date()): DemoDB {
  const nowIso = now.toISOString();
  const today = todayStr(now);
  const d = (n: number) => addDays(today, n);
  const at = (n: number) => `${d(n)}T10:00:00.000Z`;

  const fitnessRows: [string, number, Partial<Record<FitnessItemKey, number>>][] = [
    ['P001', -60, { pushup: 22, situp: 30, jump: 195, run1500: 432, run150: 24.8, grip: 27 }],
    ['P001', -30, { pushup: 25, situp: 33, jump: 199, run1500: 418, run150: 24.1, grip: 28 }],
    ['P001', -5, { pushup: 28, situp: 35, jump: 206, run1500: 405, run150: 23.4, grip: 29.5 }],
    ['P002', -45, { pushup: 18, situp: 27, jump: 182, run1500: 455, run150: 26.2, grip: 24 }],
    ['P002', -10, { pushup: 20, situp: 29, jump: 188, run1500: 447, run150: 25.6, grip: 24.5 }],
  ];
  const fitness: FitnessTest[] = [];
  for (const [playerId, offset, values] of fitnessRows) {
    for (const [item, value] of Object.entries(values) as [FitnessItemKey, number][]) {
      fitness.push({
        id: `F-${playerId}-${item}-${offset}`,
        playerId,
        date: d(offset),
        item,
        value,
        unit: getFitnessItem(item).unit,
        note: '示範資料',
        createdBy: '示範教練',
        createdAt: at(offset),
        updatedAt: at(offset),
      });
    }
  }

  return {
    version: SEED_VERSION,
    players: [
      { id: 'P001', name: '示範球員 小安', number: '7', grade: '八年級', position: '投手', active: true, createdAt: nowIso },
      { id: 'P002', name: '示範球員 小勇', number: '12', grade: '八年級', position: '捕手', active: true, createdAt: nowIso },
      { id: 'P003', name: '示範球員 小晴', number: '3', grade: '七年級', position: '游擊手', active: true, createdAt: nowIso },
      { id: 'P004', name: '示範球員 小哲', number: '21', grade: '九年級', position: '外野手', active: true, createdAt: nowIso },
      { id: 'P005', name: '示範球員 小樂', number: '5', grade: '七年級', position: '一壘手', active: false, createdAt: nowIso },
    ],
    users: [
      { id: 'U-C01', displayName: '示範教練', role: 'coach', childPlayerIds: [], active: true, createdAt: nowIso },
      { id: 'U-P001', displayName: '示範球員 小安', role: 'player', playerId: 'P001', childPlayerIds: [], active: true, createdAt: nowIso },
      { id: 'U-P002', displayName: '示範球員 小勇', role: 'player', playerId: 'P002', childPlayerIds: [], active: true, createdAt: nowIso },
      { id: 'U-P003', displayName: '示範球員 小晴', role: 'player', playerId: 'P003', childPlayerIds: [], active: true, createdAt: nowIso },
      { id: 'U-P004', displayName: '示範球員 小哲', role: 'player', playerId: 'P004', childPlayerIds: [], active: true, createdAt: nowIso },
      { id: 'U-F001', displayName: '示範家長（小安家長）', role: 'parent', childPlayerIds: ['P001'], active: true, createdAt: nowIso },
    ],
    selfCheckItems: SELF_CHECK_ITEMS,
    notes: [
      {
        id: 'N-demo-1', playerId: 'P001', date: d(-1),
        training: '動態暖身、傳接球 40 公尺、牛棚 30 球、守備跑位。',
        learned: '投球時前腳落地要穩，球才會比較低。',
        improve: '傳接球後段有點急，手臂沒有完全放鬆。',
        tomorrowPrep: '提早 10 分鐘到，先做肩膀活動度。',
        shortGoal: '本週好球率提升到六成。', midGoal: '學會穩定的變速球。', longGoal: '本季成為穩定的先發投手。',
        selfChecks: { onTime: true, warmup: true, gear: true, water: true, report: false, teamwork: true },
        coachComment: '前腳落地的觀察很好，明天記得投完做緩和伸展。（示範評語）', coachCommentBy: '示範教練',
        createdAt: at(-1), updatedAt: at(-1),
      },
      {
        id: 'N-demo-2', playerId: 'P001', date: d(-2),
        training: '跑壘、打擊練習、重量訓練（核心）。',
        learned: '跑壘轉彎要提早降低重心。',
        improve: '打擊時頭部太早抬起。',
        tomorrowPrep: '帶毛巾與水壺，睡滿 8 小時。',
        shortGoal: '', midGoal: '', longGoal: '',
        selfChecks: { onTime: true, warmup: true, gear: false, water: true, report: false, teamwork: false },
        coachComment: '', createdAt: at(-2), updatedAt: at(-2),
      },
    ],
    goals: [
      {
        id: 'G-demo-1', playerId: 'P001', term: 'short', content: '本週牛棚好球率達到六成',
        criteria: '三次牛棚練習，每次 30 球中至少 18 顆好球，由教練記錄確認。',
        startDate: d(-3), dueDate: d(4), status: 'active', createdBy: '示範球員 小安', createdAt: at(-3), updatedAt: at(-1),
        checkpoints: [
          { id: 'C1', label: '第 1 次牛棚達標', state: 'approved', submittedAt: at(-2), reviewedBy: '示範教練', reviewedAt: at(-2) },
          { id: 'C2', label: '第 2 次牛棚達標', state: 'submitted', submittedAt: at(-1) },
          { id: 'C3', label: '第 3 次牛棚達標', state: 'todo' },
        ],
      },
      {
        id: 'G-demo-2', playerId: 'P001', term: 'mid', content: '學會穩定的變速球',
        criteria: '在比賽或模擬打席中，變速球進入好球帶達五成，經教練評核。',
        startDate: d(-14), dueDate: d(60), status: 'active', createdBy: '示範教練', createdAt: at(-14), updatedAt: at(-14),
        checkpoints: [
          { id: 'C1', label: '握法與手臂動作經教練確認', state: 'approved', reviewedBy: '示範教練', reviewedAt: at(-7) },
          { id: 'C2', label: '牛棚中變速球好球率達四成', state: 'todo' },
          { id: 'C3', label: '模擬打席中使用變速球', state: 'todo' },
          { id: 'C4', label: '比賽中好球率達五成', state: 'todo' },
        ],
      },
      {
        id: 'G-demo-3', playerId: 'P002', term: 'long', content: '本季成為穩定的先發捕手',
        criteria: '整季盜壘阻殺與接捕穩定度經教練評核達標。',
        startDate: d(-30), dueDate: d(150), status: 'active', createdBy: '示範教練', createdAt: at(-30), updatedAt: at(-30),
        checkpoints: [
          { id: 'C1', label: '二壘傳球時間達到教練設定標準', state: 'todo' },
          { id: 'C2', label: '完成投捕溝通暗號學習', state: 'todo' },
        ],
      },
    ],
    goalSettings: [
      { term: 'short', label: '短期目標', periodHint: '每週或指定日期範圍', defaultDays: 7 },
      { term: 'mid', label: '中期目標', periodHint: '數週至數月', defaultDays: 60 },
      { term: 'long', label: '長期目標', periodHint: '整季或指定長期期限', defaultDays: 180 },
    ],
    fitness,
    tasks: [
      { id: 'T01', title: '完成今日棒球筆記', description: '寫下今天的訓練內容、學到的事與明日準備。系統會檢查今天是否已有筆記。', category: '每日筆記', repeat: 'daily', verify: 'note_today', expReward: 20, pointReward: 10, ballReward: 0, active: true },
      { id: 'T02', title: '準時到場並整理器材', description: '準時集合，練習後協助整理球具。由教練確認。', category: '紀律', repeat: 'daily', verify: 'coach', expReward: 15, pointReward: 10, ballReward: 0, active: true },
      { id: 'T03', title: '完成一篇防護知識測驗', description: '到防護知識庫閱讀文章，並答對重點測驗。系統會檢查本週是否有通過紀錄。', category: '防護知識', repeat: 'weekly', verify: 'quiz_week', expReward: 30, pointReward: 15, ballReward: 1, active: true },
      { id: 'T04', title: '幫助隊友或主動鼓勵', description: '協助隊友練習、教學或主動鼓勵。由教練確認。', category: '團隊合作', repeat: 'weekly', verify: 'coach', expReward: 30, pointReward: 20, ballReward: 1, active: true },
      { id: 'T05', title: '休養中的觀察筆記', description: '受傷休養或無法參加訓練時，觀摩練習並寫下 3 個觀察重點交給教練。', category: '休養參與', repeat: 'daily', verify: 'coach', expReward: 20, pointReward: 10, ballReward: 0, active: true },
      { id: 'T06', title: '完成一個目標檢核點', description: '本週讓任一目標的檢核點通過教練核准。', category: '持續進步', repeat: 'weekly', verify: 'coach', expReward: 40, pointReward: 20, ballReward: 1, active: true },
    ],
    completions: [
      { id: 'TC-demo-1', taskId: 'T01', playerId: 'P001', periodKey: d(-1), status: 'claimed', submittedAt: at(-1), claimedAt: at(-1) },
      { id: 'TC-demo-2', taskId: 'T02', playerId: 'P001', periodKey: today, status: 'submitted', submittedAt: nowIso },
      { id: 'TC-demo-3', taskId: 'T04', playerId: 'P002', periodKey: isoWeekKey(today), status: 'submitted', submittedAt: nowIso },
    ],
    monsters: SEED_MONSTERS,
    playerMonsters: [
      // 小安的小焰已達 Lv.6，示範時可以直接體驗「進化」
      { id: 'PM-demo-1', playerId: 'P001', monsterId: 'M001', nickname: '小焰', level: 6, exp: 20, partner: true, obtainedAt: at(-20), obtainedBy: 'starter' },
      { id: 'PM-demo-2', playerId: 'P001', monsterId: 'M016', nickname: '手套熊', level: 1, exp: 10, partner: false, obtainedAt: at(-6), obtainedBy: 'capture' },
      { id: 'PM-demo-3', playerId: 'P002', monsterId: 'M004', nickname: '芽芽', level: 2, exp: 5, partner: true, obtainedAt: at(-15), obtainedBy: 'starter' },
    ],
    monsterProgress: [
      { id: 'MP-demo-1', playerId: 'P001', playerMonsterId: 'PM-demo-1', expGain: 20, levelAfter: 6, reason: '任務獎勵：完成今日棒球筆記', at: at(-1) },
    ],
    wallets: [
      emptyWallet('P001', 60, 3, ['M001', 'M010', 'M016']),
      emptyWallet('P002', 20, 1, ['M004']),
      emptyWallet('P003', 0, 0, []),
      emptyWallet('P004', 0, 0, []),
      emptyWallet('P005', 0, 0, []),
    ],
    rewardLogs: [
      { id: 'RL-demo-1', playerId: 'P001', source: '任務', detail: '完成今日棒球筆記', exp: 20, points: 10, balls: 0, at: at(-1) },
    ],
    quizPasses: [],
    rules: createSeedRules(nowIso),
    articles: createSeedArticles(today),
    announcements: [
      { id: 'A01', title: '【示範】本週六移地訓練', body: '本週六早上 7:30 於校門口集合，請攜帶水壺、毛巾、帽子與防曬用品。家長如需接送請與教練聯繫。', audience: ['player', 'parent', 'coach'], pinned: true, status: 'published', publishedAt: at(-1), createdBy: '示範教練', updatedAt: at(-1) },
      { id: 'A02', title: '【示範】高溫期間訓練時間調整', body: '近期氣溫偏高，下午訓練改為 16:00 開始，並增加補水休息次數。', audience: ['player', 'parent', 'coach'], pinned: false, status: 'published', publishedAt: at(-3), createdBy: '示範教練', updatedAt: at(-3) },
      { id: 'A03', title: '【示範】球員內部：牛棚排程', body: '本週牛棚排程已更新，請投手組留意各自的投球日與休息日。', audience: ['player', 'coach'], pinned: false, status: 'published', publishedAt: at(-2), createdBy: '示範教練', updatedAt: at(-2) },
      { id: 'A04', title: '【示範】期中考週練習安排（草稿）', body: '草稿：期中考週練習時間縮短，詳細時間待確認。', audience: ['player', 'parent', 'coach'], pinned: false, status: 'draft', createdBy: '示範教練', updatedAt: at(0) },
    ],
    auditLogs: [
      { id: 'AL-demo-1', at: at(-1), actorId: 'U-C01', actorName: '示範教練', action: '發布公告', target: 'A01', detail: '【示範】本週六移地訓練' },
    ],
    syncErrors: [],
  };
}
