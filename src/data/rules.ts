import type { Rule } from '../types';

// 規章內容依教練提供的「東勢國中棒球隊球隊規章」圖片逐字輸入，未刪減或改寫。
// 分類只用於網頁上的篩選顯示，不改變規章內容；教練可在後台調整分類。

export const RULE_CATEGORIES = ['禮儀與態度', '出席與請假', '團隊合作', '器材與場地', '練球紀律', '安全', '品行', '其他'];

/** 圖片文字可能有辨識或原文錯誤的條目，需教練確認 */
export const RULES_NEEDING_REVIEW = [3, 10, 13];

const RULES: { content: string; category: string; reviewNote?: string }[] = [
  { content: '進出任何球場，需要向球場敬禮', category: '禮儀與態度' },
  { content: '規定集合時間，最晚須 20 分鐘前到達，完成球場整理的前置作業', category: '出席與請假' },
  {
    content: '練球請假，需事先請假，如是病假請出是正面，並提前與教練告知',
    category: '出席與請假',
    reviewNote: '原文「請出是正面」可能是「請出示證明」的誤字，待教練確認正確版本。',
  },
  { content: '教練及師長講話，需立正站好不三七步，並把帽子拿下並與手套放於胸前', category: '禮儀與態度' },
  { content: '教練及師長在講話或講解時請勿插話，有任何意見或想法可以舉手提問', category: '禮儀與態度' },
  { content: '嚴禁辱罵髒話，禁止侮辱及各種不禮貌之行為', category: '禮儀與態度' },
  { content: '教練交代給隊長及副隊長之事務，請務必配合完成', category: '團隊合作' },
  { content: '進入練習場地更換鞋子時，需把鞋子及個人裝備擺放整齊', category: '器材與場地' },
  { content: '練球期間，如沒使用手套時，需把手套放置休息室前方擺放整齊', category: '器材與場地' },
  {
    content: '練球期間，嚴禁在練習 or 比賽場地蹲下、坐下或者被對球場以免發生危險',
    category: '安全',
    reviewNote: '原文「被對球場」可能是「背對球場」的誤字；「or」是否改為「或」，待教練確認正確版本。',
  },
  { content: '練球期間，絕不散漫，不嬉戲，不打鬧', category: '練球紀律' },
  { content: '練球期間，隊友之間互相提醒、互相勉勵，以達到良好團隊之氣氛', category: '團隊合作' },
  {
    content: '比賽、練球、集合時，用七分立跑步至該守備位子或集合地點集合',
    category: '練球紀律',
    reviewNote: '原文「七分立」可能是「七分力」、「位子」可能是「位置」的誤字，待教練確認正確版本。',
  },
  { content: '穿著練球服裝，必須戴帽子，褲管一律拉高至膝蓋，避免受傷，也有紀律', category: '練球紀律' },
  { content: '請愛惜愛護裝備、球場以及經過的每個地方', category: '器材與場地' },
  { content: '請主動整理場地，並落實垃圾不落地，隨手把垃圾丟進垃圾桶', category: '器材與場地' },
  { content: '不抽菸不喝酒不打架不鬧事，在校代表棒球隊，校外代表學校', category: '品行' },
];

export function createSeedRules(now: string): Rule[] {
  return RULES.map((r, i) => {
    const no = i + 1;
    return {
      id: `R${String(no).padStart(2, '0')}`,
      no,
      title: `第 ${no} 條`,
      content: r.content,
      category: r.category,
      version: 1,
      updatedAt: now,
      updatedBy: '依規章圖片輸入',
      needsCoachReview: RULES_NEEDING_REVIEW.includes(no),
      reviewNote: r.reviewNote ?? '',
      isAnnouncement: false,
    };
  });
}
