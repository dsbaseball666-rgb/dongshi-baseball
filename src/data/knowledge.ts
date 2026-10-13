import type { KnowledgeArticle, KnowledgeCategory } from '../types';

export const KNOWLEDGE_CATEGORIES: { id: KnowledgeCategory; label: string; icon: string }[] = [
  { id: 'warmup', label: '訓練前暖身與活動度', icon: '🤸' },
  { id: 'arm', label: '投球與手臂保護', icon: '💪' },
  { id: 'batting', label: '打擊與場地安全', icon: '⛑️' },
  { id: 'heat', label: '補水與高溫防護', icon: '💧' },
  { id: 'injury', label: '受傷處理與通報', icon: '🩹' },
  { id: 'recovery', label: '睡眠、營養與恢復', icon: '😴' },
];

export function categoryLabel(id: KnowledgeCategory): string {
  return KNOWLEDGE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

const TEAM_SOURCE = '東勢國中棒球隊 運動防護課程簡報（教練提供）';
const ALL = ['player', 'parent', 'coach'] as KnowledgeArticle['audience'];

// 內容依教練提供的「運動防護課程簡報」整理，文字與數值以簡報為準，未自行增刪。
// 屬於一般衛教資訊，不是個別醫療診斷。
export function createSeedArticles(updatedAt: string): KnowledgeArticle[] {
  return [
    {
      id: 'K01',
      title: '暖身小總結：靜態伸展、動態伸展與筋膜放鬆',
      category: 'warmup',
      audience: ALL,
      summary: '暖身不要「只有做靜態伸展」。靜態伸展後加上動態伸展有助於運動表現，筋膜放鬆（滾筒按摩）可以增加關節活動範圍。',
      details: [
        '靜態伸展：研究指出若「只有做靜態伸展」，伸展超過 45 秒，對運動的表現會下降。',
        '導致運動表現降低的因素：① 降低神經激活的頻率與神經單位招募；② 肌腱部位黏彈性降低。',
        '動態伸展：單獨的靜態伸展可能對運動表現有負面的影響，但若在靜態伸展後加上動態伸展，是有助於運動表現的。',
        '筋膜放鬆（滾筒按摩）：可以增加關節活動範圍。',
        '動態伸展的功用：肌肉活化、促進血液流動、激活中樞神經系統、增加運動範圍、肌力與爆發力。',
        '靜態伸展的功用：加速恢復肌肉彈性、改善關節活動度、減輕肌肉與關節壓力、減少運動傷害機會、增加血液循環與新陳代謝。',
      ],
      cautions: ['暖身時不要只做靜態伸展，每次伸展超過 45 秒會讓運動表現下降。'],
      sources: [TEAM_SOURCE],
      updatedAt,
      status: 'published',
      reviewed: true,
      quiz: [
        {
          question: '暖身時如果「只有做靜態伸展」，而且伸展超過 45 秒，對運動表現會有什麼影響？',
          options: ['表現提升', '表現下降', '完全沒有影響'],
          answerIndex: 1,
          explanation: '只做靜態伸展且超過 45 秒，會降低神經激活與肌腱黏彈性，使運動表現下降。',
        },
        {
          question: '筋膜放鬆（滾筒按摩）主要可以幫助什麼？',
          options: ['增加關節活動範圍', '增加體重', '取代所有暖身'],
          answerIndex: 0,
          explanation: '筋膜放鬆可以增加關節活動範圍。',
        },
      ],
    },
    {
      id: 'K02',
      title: '冰敷：原理、溫度與時間、適應症',
      category: 'injury',
      audience: ALL,
      summary: '冰敷可以降低溫度、使血管收縮、抑制疼痛。傷害發生後一小時內應盡快冰敷，直接冰敷 15～20 分鐘。',
      details: [
        '冰敷的原理：降低身體溫度、使血管收縮、減少血流量、代謝降低、抑制疼痛、降低神經傳導速率。',
        '溫度與效益：降低 5～7°C → 明顯疼痛緩解；皮膚溫度降至 14.4°C → 最佳止痛效果；降至 13.9°C → 減少局部血流。',
        '肌肉內（或受傷組織）溫度需降至 5～15°C 之間，是降低組織與細胞代謝較佳的溫度範圍。',
        '適應症：傷害發生一小時內盡快冰敷（急性期）。',
        '適應症：扭拉傷肌肉、肌腱或韌帶，且無開放性傷口。',
        '冷療形式不同，時間也不同：直接冰敷 15～20 分鐘、冰按摩 5～10 分鐘。',
      ],
      cautions: [
        '以下情況是冰敷的禁忌：血栓性靜脈炎、患處有傷口、循環系統病變者（無法分辨冷熱）、糖尿病患者、免疫系統病變者、冰過敏、雷諾氏症。',
      ],
      sources: [TEAM_SOURCE],
      updatedAt,
      status: 'published',
      reviewed: true,
      quiz: [
        {
          question: '直接冰敷建議的時間是多久？',
          options: ['5 分鐘以內', '15～20 分鐘', '1 小時以上'],
          answerIndex: 1,
          explanation: '直接冰敷 15～20 分鐘；冰按摩則是 5～10 分鐘。',
        },
        {
          question: '下列哪一種情況「不適合」冰敷？',
          options: ['腳踝扭傷、沒有傷口', '患處有傷口', '肌肉拉傷'],
          answerIndex: 1,
          explanation: '患處有傷口是冰敷的禁忌之一。',
        },
      ],
    },
    {
      id: 'K03',
      title: '熱敷：適應症與注意事項',
      category: 'recovery',
      audience: ALL,
      summary: '熱敷適用於亞急性期與恢復期，一次不超過 20 分鐘；急性期不宜熱敷。',
      details: [
        '溫度：38～40°C。',
        '適用時期：亞急性期、恢復期。',
        '一次不超過 20 分鐘。',
        '適用情況：慢性發炎疼痛、拉扭傷、肌肉疲勞與痙攣等。',
      ],
      cautions: ['急性期不宜熱敷。', '勿直接接觸皮膚。', '糖尿病、中風、類風溼關節炎、腦血管疾病患者不宜熱敷。'],
      sources: [TEAM_SOURCE],
      updatedAt,
      status: 'published',
      reviewed: true,
      quiz: [
        {
          question: '熱敷一次不要超過多久？',
          options: ['20 分鐘', '1 小時', '整個晚上'],
          answerIndex: 0,
          explanation: '熱敷一次不超過 20 分鐘。',
        },
        {
          question: '剛受傷的急性期可以熱敷嗎？',
          options: ['可以，越早越好', '不宜熱敷'],
          answerIndex: 1,
          explanation: '急性期不宜熱敷，熱敷適用於亞急性期與恢復期。',
        },
      ],
    },
    {
      id: 'K04',
      title: '冰療還是熱療？依情況判斷',
      category: 'injury',
      audience: ALL,
      summary: '冰療、熱療需視情況改變。判斷錯誤可能使病情加重！',
      details: [
        '受傷時間：急性期 12 或 72 小時內 → 冰療；超過 12 或 72 小時 → 熱療。',
        '紅腫發熱：冰療較適合，熱療會加重腫脹。',
        '熱敷後痛：表示尚在發炎，冰療較適合。',
        '慢性酸痛：熱療較適合。',
        '冰療的治療機制：抑制發炎、降低神經傳遞。',
        '熱療的治療機制：放鬆肌肉、放鬆心情、增加血液循環。',
        '再次受傷：回到「受傷時間」重新評估。',
      ],
      cautions: ['冰療、熱療需視情況改變，判斷錯誤可能使病情加重！'],
      sources: [TEAM_SOURCE],
      updatedAt,
      status: 'published',
      reviewed: true,
      quiz: [
        {
          question: '受傷部位紅腫發熱時，比較適合哪一種？',
          options: ['冰療', '熱療'],
          answerIndex: 0,
          explanation: '紅腫發熱時冰療較適合，熱療會加重腫脹。',
        },
        {
          question: '慢性酸痛比較適合哪一種？',
          options: ['冰療', '熱療'],
          answerIndex: 1,
          explanation: '慢性酸痛熱療較適合。',
        },
      ],
    },
    {
      id: 'K05',
      title: '冷熱交替法（亞急性期）',
      category: 'recovery',
      audience: ALL,
      summary: '亞急性期可以使用冷熱交替法：熱開始、冷結束，並在 30 分鐘內結束。',
      details: [
        '作用：刺激微血管收縮，幫助排出代謝物質，增進淋巴循環。',
        '溫度：熱敷 39～41°C，冷敷 10～17°C（0°C 以上為原則）。',
        '順序與時間比例：熱開始、冷結束（時間 3:1 或 4:1）。',
        '應於 30 分鐘內結束。',
        '適用時期：亞急性期。',
      ],
      cautions: [],
      sources: [TEAM_SOURCE],
      updatedAt,
      status: 'published',
      reviewed: true,
      quiz: [
        {
          question: '冷熱交替法的順序是？',
          options: ['冷開始、熱結束', '熱開始、冷結束'],
          answerIndex: 1,
          explanation: '冷熱交替法是熱開始、冷結束，時間比例 3:1 或 4:1。',
        },
      ],
    },
    {
      id: 'K06',
      title: '受傷三階段與 PEACE & LOVE 原則',
      category: 'injury',
      audience: ALL,
      summary: '運動傷害分為急性期、亞急性期與恢復期，每個階段的處置與目標不同。急性期可依 PEACE、亞急性期可依 LOVE 原則處理。',
      details: [
        '急性期（傷後 12～48 小時）：處置 PRICE、PEACE & LOVE。症狀：紅腫熱痛，日常生活受影響。目標：抑制疼痛、腫脹，預防痙攣，維持 ROM（關節活動範圍）。',
        '亞急性期（傷後 3～7 日）：處置：伸展運動（增加組織強度）。症狀：日常生活不受影響，但運動表現受影響。目標：促進組織癒合、軟組織與機能重建、關節功能與 ROM 恢復。',
        '恢復期（亞急性期過後）：處置：運動機能重建。目標：重返賽場。',
        'PEACE（急性期：24～72 小時內；判斷標準：受傷部位發紅、水腫、溫熱、疼痛）',
        'P 保護患處（Protection）：受傷後 1～3 天內限制活動及負重（無痛為原則）。',
        'E 抬高患肢（Elevation）：患肢盡量高於心臟，減少組織腫脹。',
        'A 適當藥物（Avoid anti-inflammatories）：非必要，避免使用抗發炎藥物。',
        'C 加壓固定（Compression）：貼紮或彈性繃帶加壓可以降低關節腫脹以及出血。',
        'E 認知教育（Education）：認識傷後恢復的進程，避免過度的期待或壓力。',
        'LOVE（亞急性期：72 小時後；判斷標準：受傷部位發紅、水腫、溫熱、疼痛）',
        'L 適當負重（Load）：在無痛的情況下適當的承重，增加組織再生與重塑。',
        'O 積極面對（Optimism）：正面樂觀的態度可以減少不適，以及避免壓力影響癒合。',
        'V 有氧循環（Vascularisation）：心肺有氧訓練可以促進血液循環，增加代謝。',
        'E 開始運動（Exercise）：有計劃的無痛訓練，去增加活動穩定度、肌力以及本體感覺，避免再次受傷。',
      ],
      cautions: [],
      sources: [TEAM_SOURCE, 'Dubois B, Esculier JF. Soft-tissue injuries simply need PEACE and LOVE. British Journal of Sports Medicine, 2020.'],
      updatedAt,
      status: 'published',
      reviewed: true,
      quiz: [
        {
          question: 'PEACE 原則適用於哪一個階段？',
          options: ['急性期', '恢復期'],
          answerIndex: 0,
          explanation: 'PEACE 用於急性期，LOVE 用於亞急性期。',
        },
        {
          question: 'LOVE 的 L（Load）是指？',
          options: ['在無痛的情況下適當負重', '完全不動、躺著休息'],
          answerIndex: 0,
          explanation: 'L 適當負重：在無痛的情況下適當的承重，增加組織再生與重塑。',
        },
      ],
    },
    // 以下兩篇沒有球隊簡報，整理自公開的權威指引，需由教練或防護員審閱後再標示為「已審閱」
    {
      id: 'K07',
      title: '投球數與休息日：保護成長中的手臂',
      category: 'arm',
      audience: ALL,
      summary: '國中階段骨骼仍在成長，控制投球數並安排足夠的休息，是預防手肘與肩膀傷害最重要的方法。',
      details: [
        'MLB 與美國棒球協會的 Pitch Smart 指引中，13～14 歲每日投球上限為 95 球。',
        '依投球數安排休息日（13～14 歲）：1～20 球休 0 天；21～35 球休 1 天；36～50 球休 2 天；51～65 球休 3 天；66 球以上休 4 天。',
        '每年至少 4 個月不參加競技投球，其中至少 2～3 個月要連續休息。',
        '同一場比賽中，不建議同時擔任投手與捕手。',
        '正式比賽另有賽會的用球數規定，以賽事規定與教練安排為準。',
      ],
      cautions: [
        '投球時手肘或肩膀疼痛，應立即停止投球並告訴教練，不要忍痛繼續。',
        '投球後的疲勞或痠痛持續好幾天，也要主動回報。',
        '不要隱瞞投球數，例如私下在校外加練或參加其他球隊比賽。',
      ],
      sources: ['MLB 與 USA Baseball「Pitch Smart」青少年投球指引（Pitch Smart Guidelines, ages 13–14）'],
      updatedAt,
      status: 'published',
      reviewed: false,
      quiz: [
        {
          question: '投球時手肘突然疼痛，應該怎麼做？',
          options: ['忍一下把這局投完', '立即停止並告訴教練', '回家再說就好'],
          answerIndex: 1,
          explanation: '疼痛是身體的警訊，立即停止並回報，才能避免小傷變大傷。',
        },
        {
          question: '依 Pitch Smart 指引，13～14 歲一天投了 70 球後，建議休息幾天？',
          options: ['0 天', '2 天', '4 天'],
          answerIndex: 2,
          explanation: '66 球以上建議休息 4 天，實際安排仍以教練指示為準。',
        },
      ],
    },
    {
      id: 'K08',
      title: '補水與高溫防護：預防熱傷害',
      category: 'heat',
      audience: ALL,
      summary: '台灣夏季高溫潮濕，訓練前、中、後都要補水，並學會辨認熱衰竭與中暑的警訊。',
      details: [
        '訓練前先喝水，訓練中每 15～20 分鐘少量多次補充，不要等口渴才喝。',
        '大量流汗或長時間訓練時，可依教練安排補充含電解質的飲品。',
        '高溫時段（約上午 10 點至下午 2 點）盡量避免長時間戶外訓練，並安排遮蔭休息。',
        '熱衰竭可能出現：大量流汗、頭暈、噁心、肌肉抽筋、虛弱無力。',
        '中暑可能出現：體溫明顯升高、皮膚乾熱發紅、意識混亂或昏迷，屬於緊急狀況。',
      ],
      cautions: [
        '出現熱傷害症狀時，立即停止活動，移到陰涼處並通知教練。',
        '疑似中暑（意識改變、體溫很高）時，立即撥打 119，並在等待時協助降溫。',
        '身體不舒服、睡眠不足或生病時，要主動告訴教練。',
      ],
      sources: ['衛生福利部國民健康署 熱傷害防治宣導', '交通部中央氣象署 高溫資訊'],
      updatedAt,
      status: 'published',
      reviewed: false,
      quiz: [
        {
          question: '訓練時最好的補水方式是？',
          options: ['口渴時一次喝很多', '少量多次、定時補充', '訓練結束後再喝'],
          answerIndex: 1,
          explanation: '每 15～20 分鐘少量多次補充，可以維持體內水分。',
        },
        {
          question: '隊友練習時意識混亂、皮膚又乾又燙，應該？',
          options: ['先休息一下再繼續練習', '立即撥打 119 並協助降溫', '多喝水就好'],
          answerIndex: 1,
          explanation: '這可能是中暑，屬於緊急狀況，要立即撥打 119 並協助降溫。',
        },
      ],
    },
  ];
}
