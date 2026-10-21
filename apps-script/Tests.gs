/**
 * 東勢國中棒球隊｜冒險訓練筆記本 — 自動測試（和 Code.gs 放在同一個 Apps Script 專案）
 *
 * 使用方式：在 Apps Script 編輯器左邊「檔案」旁按 ＋ →「指令碼」，命名為 Tests，
 * 把這個檔案的全部內容貼進去 → 儲存。之後在函式選單選 runSelfTests →「▷ 執行」。
 * 網站平常不會用到這個檔案；沒有更新它，網站照樣可以運作。
 */

// ───────────────────────── 自動測試 ─────────────────────────

/**
 * 自動測試：建立暫時的測試帳號，逐項測試登入、權限、跨球員資料保護、輸入驗證與防重複提交，
 * 測試完成後會刪除所有測試資料。在編輯器選擇 runSelfTests 並按「執行」。
 */
function runSelfTests() {
  const results = [];
  const call = (action, payload, token, requestId) => JSON.parse(handle_({ action: action, payload: payload, token: token, requestId: requestId }));
  const expectOk = (name, res) => results.push([res.ok, name, res.ok ? '' : res.error]);
  const expectFail = (name, res, code) => results.push([!res.ok && (!code || res.code === code), name, res.ok ? '應該失敗卻成功了' : res.code + '：' + res.error]);
  const today = today_();
  const created = { players: [], users: [], articles: [], announcements: [] };
  const savedGoalSettings = PropertiesService.getScriptProperties().getProperty('goalSettings');
  migrateSchema_(); // 更新程式後第一次執行時，補上新版本的欄位
  cleanupTestData_(created); // 先清掉上次測試中途被停止所留下的資料，避免干擾這次測試

  try {
    // 準備：暫時的教練、兩位球員、一位家長（直接寫入，不經過 API）
    const mk = (loginId, role, playerId, kids) => {
      const acc = createUser_({ loginId: loginId, displayName: '測試' + loginId, role: role, playerId: playerId || '', childPlayerIds: kids || '' });
      created.users.push(acc.id);
      return acc;
    };
    const now = nowIso_();
    ['TEST-PA', 'TEST-PB'].forEach((id) => {
      appendRow_('Players', { id: id, name: '測試球員' + id, number: '0', grade: '測試', position: '測試', active: 'TRUE', createdAt: now, updatedAt: now });
      created.players.push(id);
    });
    const coachAcc = mk('test-coach-' + Date.now(), 'coach');
    const paAcc = mk('test-pa-' + Date.now(), 'player', 'TEST-PA');
    const pbAcc = mk('test-pb-' + Date.now(), 'player', 'TEST-PB');
    const parentAcc = mk('test-parent-' + Date.now(), 'parent', '', 'TEST-PA');

    // 1. 登入
    expectFail('登入碼錯誤會被拒絕', call('login', { loginId: paAcc.loginId, code: 'WRONG123' }), 'AUTH');
    const tCoach = call('login', { loginId: coachAcc.loginId, code: coachAcc.code }).data.token;
    const tA = call('login', { loginId: paAcc.loginId, code: paAcc.code }).data.token;
    const tB = call('login', { loginId: pbAcc.loginId, code: pbAcc.code }).data.token;
    const tParent = call('login', { loginId: parentAcc.loginId, code: parentAcc.code }).data.token;
    const teacherAcc = mk('test-teacher-' + Date.now(), 'teacher', '', 'TEST-PA');
    const tTeacher = call('login', { loginId: teacherAcc.loginId, code: teacherAcc.code }).data.token;
    const officeAcc = mk('test-office-' + Date.now(), 'office');
    const tOffice = call('login', { loginId: officeAcc.loginId, code: officeAcc.code }).data.token;
    results.push([!!(tCoach && tA && tB && tParent), '正確登入碼可以登入', '']);
    expectFail('沒有 token 無法讀取資料', call('listNotes', { playerId: 'TEST-PA' }), 'AUTH');
    expectFail('偽造 token 無法讀取資料', call('listNotes', { playerId: 'TEST-PA' }, 'x'.repeat(64)), 'AUTH');

    // 1-1. 每個 API 的授權（依 ROUTES 自動產生，新增 API 時也會自動被檢查）
    const tokenOf = { coach: tCoach, player: tA, parent: tParent, teacher: tTeacher, office: tOffice };
    const roleName = { coach: '教練', player: '球員', parent: '家長', teacher: '老師', office: '學務處' };
    Object.keys(ROUTES).forEach((action) => {
      const route = ROUTES[action];
      if (route.public) return;
      if (!Array.isArray(route.roles)) {
        results.push([false, 'API 授權：' + action, '沒有宣告可使用的角色']);
        return;
      }
      const noToken = call(action, {});
      let ok = !noToken.ok && noToken.code === 'AUTH';
      const denied = ALL_ROLES.filter((r) => route.roles.indexOf(r) < 0);
      const problems = [];
      if (!ok) problems.push('未登入沒有被拒絕');
      denied.forEach((r) => {
        const res = call(action, {}, tokenOf[r]);
        if (res.ok || res.code !== 'FORBIDDEN') {
          ok = false;
          problems.push(roleName[r] + '沒有被拒絕');
        }
      });
      results.push([ok, 'API 授權：' + action + '（' + (denied.length ? '拒絕' + denied.map((r) => roleName[r]).join('、') : '所有登入者可用') + '）', problems.join('；')]);
    });

    // 2. 每日筆記
    const note = { playerId: 'TEST-PA', date: today, training: '=HYPERLINK("http://example.com")', learned: '學到', selfChecks: { onTime: true, hacked: true } };
    const r1 = call('saveNote', note, tA, Utilities.getUuid());
    expectOk('球員可以新增自己的筆記', r1);
    const r2 = call('saveNote', Object.assign({}, note, { learned: '更新後' }), tA, Utilities.getUuid());
    const notesA = call('listNotes', { playerId: 'TEST-PA' }, tA).data.notes;
    results.push([notesA.length === 1 && notesA[0].learned === '更新後' && r2.data.created === false, '同一天再次儲存只會更新同一筆', '筆數 ' + notesA.length]);
    results.push([notesA[0].training === note.training, '「=」開頭的內容以文字儲存，不會變成公式', notesA[0].training]);
    results.push([notesA[0].selfChecks.hacked === undefined, '不在清單內的自我檢查項目會被忽略', '']);
    expectFail('球員不能寫別人的筆記', call('saveNote', Object.assign({}, note, { playerId: 'TEST-PB' }), tA), 'FORBIDDEN');
    expectFail('球員不能讀別人的筆記', call('listNotes', { playerId: 'TEST-PB' }, tA), 'FORBIDDEN');
    expectFail('家長不能讀筆記', call('listNotes', { playerId: 'TEST-PA' }, tParent), 'FORBIDDEN');
    expectFail('教練不能代替球員寫筆記', call('saveNote', note, tCoach), 'FORBIDDEN');
    expectFail('必填欄位空白會被拒絕', call('saveNote', Object.assign({}, note, { training: '  ' }), tA), 'INVALID');
    expectFail('未來日期會被拒絕', call('saveNote', Object.assign({}, note, { date: '2999-01-01' }), tA), 'INVALID');
    expectFail('不存在的日期會被拒絕', call('saveNote', Object.assign({}, note, { date: '2026-02-30' }), tA), 'INVALID');
    expectOk('教練可以讀任何球員的筆記', call('listNotes', { playerId: 'TEST-PA' }, tCoach));
    const rangeRes = call('listNotesRange', { from: today, to: today }, tCoach);
    results.push([rangeRes.ok && rangeRes.data.notes.some((n) => n.playerId === 'TEST-PA' && n.date === today), '教練可以一次查看全隊當天的筆記', rangeRes.ok ? '' : rangeRes.error]);
    expectFail('全隊筆記一次最多查看 31 天', call('listNotesRange', { from: '2026-01-01', to: '2026-03-01' }, tCoach), 'INVALID');
    expectFail('開始日期晚於結束日期會被拒絕', call('listNotesRange', { from: today, to: '2026-01-01' }, tCoach), 'INVALID');
    expectOk('教練可以寫評語', call('commentNote', { noteId: notesA[0].id, comment: '很好' }, tCoach, Utilities.getUuid()));
    expectFail('球員不能寫評語', call('commentNote', { noteId: notesA[0].id, comment: '自己給自己好評' }, tA), 'FORBIDDEN');

    // 3. 防重複提交
    const rid = Utilities.getUuid();
    const d1 = call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 20, note: '' }, tCoach, rid);
    const d2 = call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 20, note: '' }, tCoach, rid);
    const fit = call('listFitness', { playerId: 'TEST-PA' }, tCoach).data.records;
    results.push([d1.ok && d2.ok && fit.length === 1, '相同 requestId 重複送出只會新增一筆', '筆數 ' + fit.length]);

    // 4. 體能檢測
    expectFail('球員不能新增體能檢測', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 99, note: '' }, tA), 'FORBIDDEN');
    expectFail('家長不能新增體能檢測', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 99, note: '' }, tParent), 'FORBIDDEN');
    expectFail('超出合理範圍的數值會被拒絕', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'run150', value: 99, note: '' }, tCoach), 'INVALID');
    expectFail('已停用的檢測項目（60 公尺）會被拒絕', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'run60', value: 8.5, note: '' }, tCoach), 'INVALID');
    expectFail('未知的檢測項目會被拒絕', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'flying', value: 1, note: '' }, tCoach), 'INVALID');
    expectFail('次數不能是小數', call('addFitness', { playerId: 'TEST-PA', date: today, item: 'pushup', value: 20.5, note: '' }, tCoach), 'INVALID');
    expectOk('球員可以讀自己的體能紀錄', call('listFitness', { playerId: 'TEST-PA' }, tA));
    expectFail('球員不能讀別人的體能紀錄', call('listFitness', { playerId: 'TEST-PA' }, tB), 'FORBIDDEN');
    expectFail('家長不能讀體能紀錄', call('listFitness', { playerId: 'TEST-PA' }, tParent), 'FORBIDDEN');
    expectOk('教練可以修改體能檢測', call('updateFitness', { id: fit[0].id, playerId: 'TEST-PA', date: today, item: 'pushup', value: 22, note: '修正' }, tCoach, Utilities.getUuid()));
    expectFail('球員不能刪除體能檢測', call('deleteFitness', { id: fit[0].id }, tA), 'FORBIDDEN');
    expectOk('教練可以刪除體能檢測', call('deleteFitness', { id: fit[0].id }, tCoach, Utilities.getUuid()));

    // 4-1. 體能檢測系統：整隊一次輸入、讀取全隊紀錄
    const fb1 = call('saveFitnessBatch', { date: today, item: 'grip', note: '整隊', entries: [{ playerId: 'TEST-PA', value: 30.5 }, { playerId: 'TEST-PB', value: 28 }] }, tCoach, Utilities.getUuid());
    const teamFit = call('listTeamFitness', {}, tCoach);
    const gripA = teamFit.ok ? teamFit.data.records.find((f) => f.playerId === 'TEST-PA' && f.item === 'grip') : null;
    results.push([fb1.ok && fb1.data.added === 2 && !!gripA && gripA.value === 30.5 && gripA.note === '整隊', '教練可以整隊一次輸入成績，並讀取全隊紀錄', fb1.ok ? '' : fb1.error]);
    const fb2 = call('saveFitnessBatch', { date: today, item: 'grip', entries: [{ playerId: 'TEST-PA', value: 31, id: gripA ? gripA.id : 'x' }] }, tCoach, Utilities.getUuid());
    const gripA2 = call('listTeamFitness', {}, tCoach).data.records.filter((f) => f.playerId === 'TEST-PA' && f.item === 'grip');
    results.push([fb2.ok && fb2.data.updated === 1 && gripA2.length === 1 && gripA2[0].value === 31, '整隊輸入時帶 id 會修改原本那一筆，不會多一筆', fb2.ok ? '' : fb2.error]);
    const before = readAll_('FitnessTests').length;
    expectFail('整隊輸入：其中一位數值不合理，整批都不寫入', call('saveFitnessBatch', { date: today, item: 'grip', entries: [{ playerId: 'TEST-PA', value: 30 }, { playerId: 'TEST-PB', value: 999 }] }, tCoach, Utilities.getUuid()), 'INVALID');
    results.push([readAll_('FitnessTests').length === before, '整隊輸入失敗時沒有寫入任何一筆', '']);
    expectFail('整隊輸入：同一位球員不能出現兩次', call('saveFitnessBatch', { date: today, item: 'grip', entries: [{ playerId: 'TEST-PA', value: 30 }, { playerId: 'TEST-PA', value: 31 }] }, tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('整隊輸入：未來日期會被拒絕', call('saveFitnessBatch', { date: '2999-01-01', item: 'grip', entries: [{ playerId: 'TEST-PA', value: 30 }] }, tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('整隊輸入：不能修改別的球員的紀錄', call('saveFitnessBatch', { date: today, item: 'grip', entries: [{ playerId: 'TEST-PB', value: 30, id: gripA ? gripA.id : 'x' }] }, tCoach, Utilities.getUuid()), 'NOT_FOUND');
    expectFail('球員不能整隊輸入體能檢測', call('saveFitnessBatch', { date: today, item: 'grip', entries: [{ playerId: 'TEST-PA', value: 99 }] }, tA, Utilities.getUuid()), 'FORBIDDEN');
    expectFail('球員不能讀全隊體能紀錄', call('listTeamFitness', {}, tA), 'FORBIDDEN');
    // 揮棒速度：存平均值，每個人有自己的備註（10 次明細）
    const fb3 = call('saveFitnessBatch', { date: today, item: 'swing', note: '共用', entries: [{ playerId: 'TEST-PA', value: 96.2, note: '3 次平均（最高 97）：95、96.5、97' }, { playerId: 'TEST-PB', value: 90 }] }, tCoach, Utilities.getUuid());
    const swings = fb3.ok ? fb3.data.records : [];
    const swA = swings.find((f) => f.playerId === 'TEST-PA');
    const swB = swings.find((f) => f.playerId === 'TEST-PB');
    results.push([fb3.ok && !!swA && swA.value === 96.2 && swA.note.indexOf('3 次平均') === 0 && !!swB && swB.note === '共用', '整隊輸入：每位球員可以有自己的備註（揮棒速度多次明細），沒有就用共用備註', fb3.ok ? '' : fb3.error]);
    expectFail('整隊輸入：個人備註超過 200 字會被拒絕', call('saveFitnessBatch', { date: today, item: 'swing', entries: [{ playerId: 'TEST-PA', value: 90, note: 'x'.repeat(201) }] }, tCoach, Utilities.getUuid()), 'INVALID');

    // 5. 名單與管理權限
    const plA = call('listPlayers', {}, tA).data.players;
    results.push([plA.length === 1 && plA[0].id === 'TEST-PA', '球員只看得到自己的球員資料', '筆數 ' + plA.length]);
    const plP = call('listPlayers', {}, tParent).data.players;
    results.push([plP.length === 1 && plP[0].id === 'TEST-PA', '家長只看得到自己的子女', '筆數 ' + plP.length]);
    expectFail('球員不能使用帳號管理', call('adminListUsers', {}, tA), 'FORBIDDEN');
    expectFail('球員不能查看操作紀錄', call('listAudit', {}, tA), 'FORBIDDEN');
    results.push([JSON.stringify(call('adminListUsers', {}, tCoach)).indexOf('codeHash') < 0, '帳號清單不會回傳登入碼雜湊值', '']);

    // 7. 目標：球員只能申請，教練核准後才計入
    const goalInput = { playerId: 'TEST-PA', term: 'short', content: '測試目標', criteria: '測試條件', startDate: today, dueDate: today, checkpoints: ['檢核一'] };
    const gRes = call('createGoal', goalInput, tA, Utilities.getUuid());
    expectOk('球員可以建立自己的目標', gRes);
    expectFail('球員不能幫別人建立目標', call('createGoal', Object.assign({}, goalInput, { playerId: 'TEST-PB' }), tA), 'FORBIDDEN');
    expectFail('期限早於開始日會被拒絕', call('createGoal', Object.assign({}, goalInput, { dueDate: '2000-01-01' }), tA), 'INVALID');
    const goalId = gRes.ok ? gRes.data.goal.id : '';
    expectFail('球員不能讀別人的目標', call('listGoals', { playerId: 'TEST-PA' }, tB), 'FORBIDDEN');
    expectFail('球員不能讀全隊目標', call('listGoals', {}, tA), 'FORBIDDEN');
    expectFail('別的球員不能替你申請檢核', call('submitCheckpoint', { goalId: goalId, checkpointId: 'C1' }, tB), 'FORBIDDEN');
    expectOk('球員可以申請完成檢核點', call('submitCheckpoint', { goalId: goalId, checkpointId: 'C1' }, tA, Utilities.getUuid()));
    const beforeReview = call('listGoals', { playerId: 'TEST-PA' }, tA).data.goals.find((g) => g.id === goalId);
    results.push([beforeReview && beforeReview.status === 'active' && beforeReview.checkpoints[0].state === 'submitted', '申請後尚未核准，目標不會變成完成', '']);
    const reviewed = call('reviewCheckpoint', { goalId: goalId, checkpointId: 'C1', approve: true }, tCoach, Utilities.getUuid());
    results.push([reviewed.ok && reviewed.data.goal.status === 'completed', '教練核准全部檢核點後，目標變成已達成', reviewed.ok ? '' : reviewed.error]);
    expectOk('教練可以讀全隊目標', call('listGoals', {}, tCoach));
    expectFail('預設天數超出範圍會被拒絕', call('updateGoalSettings', { settings: [{ term: 'short', label: '短期', periodHint: '一週', defaultDays: 999 }] }, tCoach, Utilities.getUuid()), 'INVALID');
    const setRes = call('updateGoalSettings', { settings: [{ term: 'short', label: '短期測試', periodHint: '測試', defaultDays: 5 }] }, tCoach, Utilities.getUuid());
    results.push([setRes.ok && call('getGoalSettings', {}, tA).data.settings[0].defaultDays === 5, '教練調整的期限設定，球員端會讀到新的設定', '']);

    // 8. 規章：只有教練能修改；待確認備註只給教練看
    appendRow_('Rules', { id: 'TEST-R', no: 999, title: '測試規章', content: '測試內容', category: '其他', version: 1, updatedAt: now, updatedBy: '測試', needsCoachReview: 'TRUE', reviewNote: '內部備註', isAnnouncement: 'FALSE' });
    const rulesForPlayer = call('listRules', {}, tA).data.rules.find((r) => r.id === 'TEST-R');
    results.push([rulesForPlayer && rulesForPlayer.reviewNote === '' && rulesForPlayer.needsCoachReview === false, '球員看不到「待教練確認」的內部備註', '']);
    const rulesForParent = call('listRules', {}, tParent);
    results.push([rulesForParent.ok && rulesForParent.data.rules.some((r) => r.id === 'TEST-R'), '家長可以閱讀規章', '']);
    const ruleEdit = { id: 'TEST-R', title: '測試規章', content: '修改後內容', category: '其他', isAnnouncement: true, needsCoachReview: false, reviewNote: '' };
    const ru = call('updateRule', ruleEdit, tCoach, Utilities.getUuid());
    results.push([ru.ok && ru.data.rule.version === 2 && ru.data.rule.isAnnouncement === true, '教練修改規章後版本 +1', ru.ok ? '' : ru.error]);
    expectFail('雲端已有規章時不會重複匯入', call('importRules', { rules: [{ no: 1, title: 'x', content: 'x', category: 'x' }] }, tCoach, Utilities.getUuid()), 'INVALID');

    // 9. 防護知識：草稿不公開；只開放給指定對象
    const art = { title: '測試文章', category: 'heat', audience: ['coach', 'player'], summary: '摘要', details: ['說明'], cautions: [], sources: ['來源'], reviewed: false, quiz: [{ question: '題目', options: ['甲', '乙'], answerIndex: 1, explanation: '' }] };
    expectFail('沒有參考來源的文章會被拒絕', call('upsertArticle', Object.assign({}, art, { sources: [] }), tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('答案超出選項範圍會被拒絕', call('upsertArticle', Object.assign({}, art, { quiz: [{ question: 'q', options: ['甲', '乙'], answerIndex: 5 }] }), tCoach, Utilities.getUuid()), 'INVALID');
    const artRes = call('upsertArticle', art, tCoach, Utilities.getUuid());
    const artId = artRes.ok ? artRes.data.article.id : '';
    if (artId) created.articles.push(artId);
    const seesArt = (t) => call('listArticles', {}, t).data.articles.some((x) => x.id === artId);
    results.push([artRes.ok && !seesArt(tA), '草稿文章球員看不到', '']);
    call('setArticleStatus', { id: artId, status: 'published' }, tCoach, Utilities.getUuid());
    results.push([seesArt(tA) && !seesArt(tParent), '發布後只有指定對象看得到（家長看不到只給球員的文章）', '']);
    const parentQuiz = call('submitQuiz', { articleId: artId, answers: [1] }, tParent, Utilities.getUuid());
    results.push([!parentQuiz.ok && parentQuiz.code === 'NOT_FOUND', '家長不能作答沒有開放給家長的文章', parentQuiz.code || '']);
    results.push([call('listArticles', {}, tCoach).data.articles.find((x) => x.id === artId).quiz[0].answerIndex === 1, '文章的測驗資料完整保存（教練看得到答案）', '']);

    // 10. 公告：草稿不公開；家長只看得到開放給家長的公告
    const annRes = call('upsertAnnouncement', { title: '測試公告', body: '內容', audience: ['player', 'coach'], pinned: false }, tCoach, Utilities.getUuid());
    const annId = annRes.ok ? annRes.data.announcement.id : '';
    if (annId) created.announcements.push(annId);
    const seesAnn = (t) => call('listAnnouncements', {}, t).data.announcements.some((x) => x.id === annId);
    results.push([annRes.ok && !seesAnn(tA), '草稿公告球員看不到', '']);
    call('setAnnouncementStatus', { id: annId, status: 'published' }, tCoach, Utilities.getUuid());
    results.push([seesAnn(tA) && !seesAnn(tParent), '只開放給球員的公告，家長看不到', '']);
    call('upsertAnnouncement', { id: annId, title: '測試公告', body: '內容', audience: ['player', 'parent', 'coach'], pinned: true }, tCoach, Utilities.getUuid());
    results.push([seesAnn(tParent), '開放給家長後，家長看得到', '']);

    // 11. 修改自己的登入碼：舊的登入狀態立即失效
    expectFail('目前的登入碼錯誤時不能修改', call('changeMyCode', { oldCode: 'WRONG', newCode: 'Abcd1234' }, tA), 'INVALID');
    expectFail('太簡單的新登入碼會被拒絕', call('changeMyCode', { oldCode: paAcc.code, newCode: '1234' }, tA), 'INVALID');
    const ch = call('changeMyCode', { oldCode: paAcc.code, newCode: 'NewCode2026' }, tA, Utilities.getUuid());
    results.push([ch.ok && call('me', {}, ch.data.token).ok, '修改登入碼後取得新的登入狀態', ch.ok ? '' : ch.error]);
    expectFail('修改登入碼後，舊的登入狀態失效', call('me', {}, tA), 'AUTH');
    results.push([call('login', { loginId: paAcc.loginId, code: 'NewCode2026' }).ok, '可以用新的登入碼登入', '']);

    // 12. 教練重設登入碼：被重設者的登入狀態立即失效
    const parentReset = call('adminResetCode', { userId: parentAcc.id }, tCoach, Utilities.getUuid());
    expectOk('教練可以重設家長的登入碼', parentReset);
    expectFail('重設後，舊的登入狀態失效', call('listAnnouncements', {}, tParent), 'AUTH');
    expectFail('教練不能修改球員帳號的對應資料（需從球員名單修改）', call('adminUpdateUser', { userId: paAcc.id, displayName: 'x' }, tCoach), 'INVALID');

    // 13. 遊戲：任務、獎勵、怪獸（使用暫時的測試怪獸與測試任務）
    // 球員 A 在第 11 段改過登入碼，舊的登入狀態已失效，這裡重新登入
    const tPA = call('login', { loginId: paAcc.loginId, code: 'NewCode2026' }).data.token;
    const mon = (id, dexNo, extra) => appendRow_('Monsters', Object.assign({ id: id, dexNo: dexNo, name: '測試獸' + dexNo, element: '熱血', rarity: 1, stage: 1, evolvesTo: '', evolveLevel: '', description: '測試', habitat: 'field', catchRate: 1, isStarter: false, inWild: false }, extra));
    mon('TEST-M1', 901, { evolvesTo: 'TEST-M2', evolveLevel: 2, isStarter: true });
    mon('TEST-M2', 902, { stage: 2 });
    mon('TEST-M3', 903, { inWild: true });
    const task = (id, extra) => appendRow_('Tasks', Object.assign({ id: id, title: '測試任務' + id, description: '', category: '紀律', repeat: 'daily', verify: 'coach', expReward: 0, pointReward: 5, ballReward: 0, active: true }, extra));
    task('TEST-T1', { expReward: 100, pointReward: 40, ballReward: 1 });
    task('TEST-T2', { category: '每日筆記', verify: 'note_today' });
    task('TEST-T3', { category: '防護知識', repeat: 'weekly', verify: 'quiz_week' });
    const state = (t) => call('getGameState', {}, t).data.state;
    const setEncounter = (monsterId) => {
      const w = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
      updateRow_('Wallets', w._row, Object.assign({}, w, { encounterMonsterId: monsterId, encounterAreaId: 'field', encounterAt: now }));
    };

    expectFail('球員不能查看別人的遊戲資料', call('getGameState', { playerId: 'TEST-PA' }, tB), 'FORBIDDEN');
    expectOk('教練可以查看指定球員的遊戲資料', call('getGameState', { playerId: 'TEST-PA' }, tCoach));
    expectFail('不是初始夥伴的怪獸不能選', call('chooseStarter', { monsterId: 'TEST-M3' }, tPA, Utilities.getUuid()), 'INVALID');
    expectOk('球員可以選擇初始夥伴', call('chooseStarter', { monsterId: 'TEST-M1' }, tPA, Utilities.getUuid()));
    expectFail('初始夥伴只能選一次', call('chooseStarter', { monsterId: 'TEST-M1' }, tPA, Utilities.getUuid()), 'INVALID');

    const sub = call('submitTask', { taskId: 'TEST-T1' }, tPA, Utilities.getUuid());
    results.push([sub.ok && sub.data.status === 'submitted', '教練確認型任務回報後，狀態是「等待確認」', sub.ok ? '' : sub.error]);
    expectFail('同一期間不能重複回報任務', call('submitTask', { taskId: 'TEST-T1' }, tPA, Utilities.getUuid()), 'INVALID');
    const comp = state(tPA).completions.find((c) => c.taskId === 'TEST-T1');
    expectFail('教練尚未確認前不能領獎', call('claimReward', { completionId: comp.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不能領別人的獎勵', call('claimReward', { completionId: comp.id }, tB, Utilities.getUuid()), 'FORBIDDEN');
    expectOk('教練可以核准任務', call('reviewCompletion', { completionId: comp.id, approve: true }, tCoach, Utilities.getUuid()));
    const claimRid = Utilities.getUuid();
    const c1 = call('claimReward', { completionId: comp.id }, tPA, claimRid);
    const c2 = call('claimReward', { completionId: comp.id }, tPA, claimRid);
    const afterClaim = state(tPA);
    const partner = afterClaim.playerMonsters.find((p) => p.partner);
    results.push([c1.ok && c2.ok && afterClaim.wallet.points === 40 && afterClaim.wallet.balls === 1, '同一個領獎請求重送兩次，獎勵只會發一次', '點數 ' + afterClaim.wallet.points]);
    results.push([partner && partner.level === 2 && partner.exp === 40, '經驗值發給夥伴並正確升級（100 經驗 → Lv.2）', partner ? 'Lv.' + partner.level + ' exp ' + partner.exp : '沒有夥伴']);
    expectFail('已領過的獎勵不能再領', call('claimReward', { completionId: comp.id }, tPA, Utilities.getUuid()), 'INVALID');

    expectFail('沒寫今日筆記，系統不讓筆記任務過關', call('submitTask', { taskId: 'TEST-T2' }, tB, Utilities.getUuid()), 'INVALID');
    const noteTask = call('submitTask', { taskId: 'TEST-T2' }, tPA, Utilities.getUuid());
    results.push([noteTask.ok && noteTask.data.status === 'approved', '有今日筆記時，系統自動確認筆記任務', noteTask.ok ? '' : noteTask.error]);

    expectFail('沒通過測驗，系統不讓測驗任務過關', call('submitTask', { taskId: 'TEST-T3' }, tPA, Utilities.getUuid()), 'INVALID');
    const playerArt = call('listArticles', {}, tPA).data.articles.find((x) => x.id === artId);
    results.push([playerArt && playerArt.quiz[0].answerIndex === undefined, '球員讀取文章時看不到測驗答案', '']);
    const wrong = call('submitQuiz', { articleId: artId, answers: [0] }, tPA, Utilities.getUuid());
    results.push([wrong.ok && wrong.data.passed === false, '答錯時不會記錄通過', '']);
    const right = call('submitQuiz', { articleId: artId, answers: [1] }, tPA, Utilities.getUuid());
    results.push([right.ok && right.data.passed === true, '伺服器批改，全部答對才記錄通過', '']);
    const quizTask = call('submitTask', { taskId: 'TEST-T3' }, tPA, Utilities.getUuid());
    results.push([quizTask.ok && quizTask.data.status === 'approved', '通過測驗後，系統自動確認測驗任務', quizTask.ok ? '' : quizTask.error]);

    expectOk('每日補給可以領取', call('claimDailySupply', {}, tPA, Utilities.getUuid()));
    expectFail('每日補給一天只能領一次', call('claimDailySupply', {}, tPA, Utilities.getUuid()), 'INVALID');
    let explored = 0;
    for (let i = 0; i < 3; i++) if (call('explore', { areaId: 'field' }, tPA, Utilities.getUuid()).ok) explored++;
    results.push([explored === 3, '每天可以探索 3 次', '成功 ' + explored + ' 次']);
    expectFail('探索次數用完後不能再探索', call('explore', { areaId: 'field' }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不存在的探索地點會被拒絕', call('explore', { areaId: 'moon' }, tPA, Utilities.getUuid()), 'INVALID');

    setEncounter('TEST-M3');
    const cap = call('capture', {}, tPA, Utilities.getUuid());
    results.push([cap.ok && cap.data.success && !cap.data.duplicate && cap.data.state.playerMonsters.length === 2, '捕捉成功後怪獸加入收藏', cap.ok ? '' : cap.error]);
    expectFail('沒有遭遇怪獸時不能捕捉', call('capture', {}, tPA, Utilities.getUuid()), 'INVALID');
    setEncounter('TEST-M1');
    const pointsBeforeDup = state(tPA).wallet.points;
    const dupCap = call('capture', {}, tPA, Utilities.getUuid());
    results.push([dupCap.ok && dupCap.data.duplicate && dupCap.data.state.wallet.points === pointsBeforeDup + 15, '捕捉到已擁有的怪獸會轉換為 15 點', '']);

    const tr = call('trainMonster', { playerMonsterId: partner.id, plan: 'light' }, tPA, Utilities.getUuid());
    results.push([tr.ok && tr.data.state.wallet.points === pointsBeforeDup + 15 - 10, '訓練會扣點數並增加經驗', tr.ok ? '' : tr.error]);
    expectFail('不能訓練別人的怪獸', call('trainMonster', { playerMonsterId: partner.id, plan: 'light' }, tB, Utilities.getUuid()), 'FORBIDDEN');
    const evo = call('evolveMonster', { playerMonsterId: partner.id }, tPA, Utilities.getUuid());
    results.push([evo.ok && evo.data.toId === 'TEST-M2' && evo.data.state.playerMonsters.find((p) => p.id === partner.id).level >= 2, '達到等級後可以進化，等級保留', evo.ok ? '' : evo.error]);
    expectFail('最終型態不能再進化', call('evolveMonster', { playerMonsterId: partner.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectOk('教練可以發放經驗值', call('grantExp', { playerMonsterId: partner.id, amount: 20, reason: '測試' }, tCoach, Utilities.getUuid()));
    expectFail('任務獎勵超出範圍會被拒絕', call('upsertTask', { title: 'x', category: '紀律', repeat: 'daily', verify: 'coach', expReward: 9999, pointReward: 0, ballReward: 0 }, tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('雲端已有任務時不會重複匯入', call('importTasks', { tasks: [] }, tCoach, Utilities.getUuid()), 'INVALID');
    expectFail('雲端已有怪獸時不會重複匯入', call('importMonsters', { monsters: [] }, tCoach, Utilities.getUuid()), 'INVALID');
    const final = state(tPA);
    results.push([final.playerMonsters.length === 2 && final.rewardLogs.length >= 4 && final.progress.length >= 3, '遊戲資料（收藏、獎勵紀錄、成長紀錄）都有保存下來', '']);

    // 14. 匯入舊體能資料的整理規則（不讀取外部檔案）
    const legacy = [
      { legacyId: 'X1', name: '測試球員TEST-PA', item: 'run1500', date: '2026/8/4', value: '388.1', detail: '{"term":"115上"}' },
      { legacyId: 'X2', name: '測試新同學', item: 'longjump', date: '2026-09-04', value: '225' },
      { legacyId: 'X3', name: '測試新同學', item: 'swing', date: '2026-09-08', value: '89.9' },
      { legacyId: 'X4', name: '測試新同學', item: 'pushup', date: '2026-09-04', value: '20.5' },
      { legacyId: 'X5', name: '測試新同學', item: 'flying', date: '2026-09-04', value: '1' },
      { legacyId: 'X6', name: '測試新同學', item: 'situp', date: '2999-01-01', value: '30' },
      { legacyId: 'DUP', name: '測試新同學', item: 'situp', date: '2026-09-04', value: '30' },
    ];
    const lp = planLegacyImport_(legacy, ['測試新同學', '只在名單上的同學'], [{ id: 'TEST-PA', name: '測試球員TEST-PA' }], { 'L-DUP': true });
    results.push([lp.rows.length === 3 && lp.rows[0].item === 'run1500' && lp.rows[0].note.indexOf('115上') >= 0, '舊資料：可匯入的紀錄正確轉換（含學期備註）', '可匯入 ' + lp.rows.length + ' 筆']);
    results.push([lp.rows[1].item === 'jump' && lp.rows[1].date === '2026-09-04' && lp.rows[2].item === 'swing', '舊資料：立定跳遠、揮棒速度與兩種日期格式都能對應', '']);
    results.push([lp.skipped.length === 3 && lp.duplicates === 1, '舊資料：不合理數值、不支援項目、未來日期會被略過；已匯入過的不重複', '略過 ' + lp.skipped.length + '、重複 ' + lp.duplicates]);
    results.push([lp.newNames.length === 2 && lp.newNames.indexOf('測試球員TEST-PA') < 0, '舊資料：已在名單上的球員沿用，不重複建立', '新球員 ' + lp.newNames.join('、')]);

    // 15. 為沒有帳號的球員建立帳號
    appendRow_('Players', { id: 'TEST-PC', name: '測試球員TEST-PC', number: '', grade: '', position: '', active: 'TRUE', createdAt: now, updatedAt: now });
    const acct = call('adminCreatePlayerAccount', { playerId: 'TEST-PC' }, tCoach, Utilities.getUuid());
    results.push([acct.ok && acct.data.code.length === 8 && call('login', { loginId: acct.data.loginId, code: acct.data.code }).ok, '教練可以為沒有帳號的球員建立帳號，球員可用新帳號登入', acct.ok ? '' : acct.error]);
    expectFail('已經有帳號的球員不能再建立一次', call('adminCreatePlayerAccount', { playerId: 'TEST-PC' }, tCoach, Utilities.getUuid()), 'INVALID');

    // 16. 段考成績：教練輸入；球員只看自己、家長只看子女
    const tPar = call('login', { loginId: parentAcc.loginId, code: parentReset.data.code }).data.token;
    const exam = { schoolYear: 115, semester: '上', examNo: 1, grade: 8 };
    const ex1 = call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 88, 數學: 92.5, 建教: '' } }, { playerId: 'TEST-PB', scores: { 英文: 70 } }] }), tCoach, Utilities.getUuid());
    results.push([ex1.ok && ex1.data.created === 2, '教練可以一次輸入多位球員的段考成績', ex1.ok ? '' : ex1.error]);
    const ex2 = call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 90 } }] }), tCoach, Utilities.getUuid());
    const examsA = call('listExamScores', { playerId: 'TEST-PA' }, tPA);
    results.push([ex2.ok && ex2.data.updated === 1 && examsA.ok && examsA.data.records.length === 1 && examsA.data.records[0].scores.國文 === 90, '同一次段考再次儲存只會更新，不會重複', examsA.ok ? '筆數 ' + examsA.data.records.length : examsA.error]);
    results.push([examsA.ok && examsA.data.records[0].scores.建教 === undefined, '空白的科目不會存成 0 分', '']);
    expectFail('不屬於該年級的科目會被拒絕（二年級沒有「社會」）', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 社會: 80 } }] }), tCoach), 'INVALID');
    expectFail('超過 100 分會被拒絕', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 101 } }] }), tCoach), 'INVALID');
    expectFail('超過一位小數會被拒絕', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: { 國文: 85.55 } }] }), tCoach), 'INVALID');
    expectFail('沒有輸入任何科目會被拒絕', call('saveExamScores', Object.assign({}, exam, { entries: [{ playerId: 'TEST-PA', scores: {} }] }), tCoach), 'INVALID');
    expectFail('不存在的年級會被拒絕', call('saveExamScores', Object.assign({}, exam, { grade: 6, entries: [{ playerId: 'TEST-PA', scores: { 國文: 80 } }] }), tCoach), 'INVALID');
    expectFail('球員不能看別人的段考成績', call('listExamScores', { playerId: 'TEST-PB' }, tPA), 'FORBIDDEN');
    expectFail('球員不能讀全隊段考成績', call('listExamScores', {}, tPA), 'FORBIDDEN');
    expectOk('家長可以看自己子女的段考成績', call('listExamScores', { playerId: 'TEST-PA' }, tPar));
    expectFail('家長不能看別人的段考成績', call('listExamScores', { playerId: 'TEST-PB' }, tPar), 'FORBIDDEN');
    const allExams = call('listExamScores', {}, tCoach);
    results.push([allExams.ok && allExams.data.records.filter((r) => r.playerId.indexOf('TEST-') === 0).length === 2, '教練可以讀全隊段考成績', '']);
    expectOk('教練可以刪除段考成績', call('deleteExamScore', { id: examsA.data.records[0].id }, tCoach, Utilities.getUuid()));

    // 17. 道具、血量與對戰（結果由伺服器計算）
    const rng = (v) => () => v;
    const att = { name: 'A', element: '熱血', atk: 30, def: 20, crit: 0.08, atkUp: false, defUp: false, defending: false };
    const plant = { name: 'B', element: '成長', atk: 30, def: 20, crit: 0.08, atkUp: false, defUp: false, defending: false };
    const wind = Object.assign({}, plant, { element: '疾風' });
    const dAdv = battleDamage_(att, plant, 1, rng(0.5)).dmg;
    const dNormal = battleDamage_(att, wind, 1, rng(0.5)).dmg;
    const dGuard = battleDamage_(att, Object.assign({}, wind, { defending: true }), 1, rng(0.5)).dmg;
    results.push([dAdv > dNormal && dGuard < dNormal, '對戰：屬性相剋傷害較高、防守時傷害減半', dAdv + ' / ' + dNormal + ' / ' + dGuard]);
    const hpTest = currentHp_({ hp: '10', hpAt: new Date(Date.now() - 2 * 3600000).toISOString() }, 100, Date.now());
    results.push([hpTest === 60 && currentHp_({ hp: '' }, 100, Date.now()) === 100, '血量：空白代表滿血，受傷後每小時自然回復 25%', 'HP ' + hpTest]);

    const pmA = state(tPA).playerMonsters.find((p) => p.partner);
    results.push([pmA && pmA.hp === pmA.maxHp && pmA.maxHp > 0 && pmA.atk > 0, '遊戲資料包含怪獸的 HP 與能力值', pmA ? pmA.hp + '/' + pmA.maxHp : '']);
    expectFail('商店不販售捕捉球', call('buyItem', { itemId: 'ball', qty: 1 }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('購買數量不正確會被拒絕', call('buyItem', { itemId: 'potion', qty: 0 }, tPA, Utilities.getUuid()), 'INVALID');
    const pointsBeforeBuy = state(tPA).wallet.points;
    const buy = call('buyItem', { itemId: 'potion', qty: 2 }, tPA, Utilities.getUuid());
    results.push([buy.ok && buy.data.state.wallet.points === pointsBeforeBuy - 30 && buy.data.state.wallet.items.potion === 2, '用點數購買道具：扣點數、增加道具', buy.ok ? '' : buy.error]);
    expectFail('點數不足時不能購買', call('buyItem', { itemId: 'superPotion', qty: 10 }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('HP 是滿的時不能使用回復道具', call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不能對別人的怪獸使用道具', call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tB, Utilities.getUuid()), 'FORBIDDEN');

    // 讓球員 B 有夥伴，才能被挑戰
    appendRow_('PlayerMonsters', { id: 'TEST-PMB', playerId: 'TEST-PB', monsterId: 'TEST-M3', nickname: '測試獸B', level: 3, exp: 0, partner: true, obtainedAt: now, obtainedBy: 'starter' });
    const bt = call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid());
    const battle = bt.ok && bt.data.state.battle;
    results.push([!!battle && battle.status === 'active' && battle.me.hp === pmA.hp, '可以開始野外對戰', bt.ok ? '' : bt.error]);
    expectFail('同時只能有一場對戰', call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不能操作別人的對戰', call('battleAction', { battleId: battle.id, action: 'attack' }, tB, Utilities.getUuid()), 'FORBIDDEN');
    expectFail('對戰中不能在外面使用回復道具', call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    expectFail('不正確的行動會被拒絕', call('battleAction', { battleId: battle.id, action: 'win' }, tPA, Utilities.getUuid()), 'INVALID');
    const progressBefore = state(tPA).progress.length;
    let last = null;
    for (let i = 0; i < 40; i++) {
      last = call('battleAction', { battleId: battle.id, action: 'attack' }, tPA, Utilities.getUuid());
      if (!last.ok || last.data.ended) break;
    }
    const afterBattle = state(tPA);
    const pmAfter = afterBattle.playerMonsters.find((p) => p.id === pmA.id);
    const endedOk = last && last.ok && ['won', 'lost', 'draw'].indexOf(last.data.ended) >= 0;
    results.push([endedOk && afterBattle.battle === null, '對戰會在一方倒下（或回合用完）時結束', last && last.ok ? String(last.data.ended) : last && last.error]);
    results.push([endedOk && afterBattle.progress.length > progressBefore && (last.data.ended !== 'lost' || pmAfter.hp === 0), '對戰結束後發放經驗值，並把剩餘 HP 寫回怪獸', 'HP ' + (pmAfter && pmAfter.hp)]);
    expectFail('已結束的對戰不能再行動', call('battleAction', { battleId: battle.id, action: 'attack' }, tPA, Utilities.getUuid()), 'INVALID');

    const pmRow = () => readAll_('PlayerMonsters').find((x) => x.id === pmA.id);
    updateRow_('PlayerMonsters', pmRow()._row, Object.assign({}, pmRow(), { hp: 0, hpAt: nowIso_() }));
    expectFail('HP 為 0 的怪獸不能出戰', call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    const potionsBefore = state(tPA).wallet.items.potion; // 野外對戰獲勝可能掉落藥水，所以用前後比較
    const heal = call('useItem', { itemId: 'potion', playerMonsterId: pmA.id }, tPA, Utilities.getUuid());
    const healed = heal.ok && heal.data.state.playerMonsters.find((p) => p.id === pmA.id);
    results.push([healed && healed.hp > 0 && heal.data.state.wallet.items.potion === potionsBefore - 1, '回復藥水可以回復 HP，並扣掉一個道具', heal.ok ? 'HP ' + healed.hp : heal.error]);

    const opp = call('listOpponents', {}, tPA);
    results.push([opp.ok && opp.data.opponents.some((o) => o.playerId === 'TEST-PB') && !opp.data.opponents.some((o) => o.playerId === 'TEST-PA'), '隊友挑戰名單不包含自己', '']);
    expectFail('不能挑戰自己', call('startBattle', { mode: 'pvp', opponentPlayerId: 'TEST-PA', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    const pvp = call('startBattle', { mode: 'pvp', opponentPlayerId: 'TEST-PB', playerMonsterId: pmA.id }, tPA, Utilities.getUuid());
    const pvpB = pvp.ok && pvp.data.state.battle;
    results.push([!!pvpB && pvpB.foe.hp === pvpB.foe.maxHp && pvpB.foe.owner === '測試球員TEST-PB', '隊友挑戰：對手的夥伴以滿血出戰', pvp.ok ? '' : pvp.error]);
    const wTop = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
    updateRow_('Wallets', wTop._row, Object.assign({}, wTop, { points: 100 }));
    const glove = call('buyItem', { itemId: 'powerGlove', qty: 1 }, tPA, Utilities.getUuid()).ok && call('battleAction', { battleId: pvpB.id, action: 'item', itemId: 'powerGlove' }, tPA, Utilities.getUuid());
    results.push([glove && glove.ok && (glove.data.ended || glove.data.state.battle.me.atkUp === true), '對戰中可以使用力量手套', glove && !glove.ok ? glove.error : '']);
    if (glove && glove.ok && !glove.data.ended) expectFail('同一場對戰不能重複使用力量手套', call('battleAction', { battleId: pvpB.id, action: 'item', itemId: 'powerGlove' }, tPA, Utilities.getUuid()), 'INVALID');
    const giveUp = glove && glove.ok && !glove.data.ended ? call('battleAction', { battleId: pvpB.id, action: 'flee' }, tPA, Utilities.getUuid()) : { ok: true, data: { ended: 'lost' } };
    results.push([giveUp.ok && giveUp.data.ended === 'lost', '隊友挑戰中逃跑視為投降（落敗）', giveUp.ok ? String(giveUp.data.ended) : giveUp.error]);
    expectFail('同一位隊友一天只能挑戰一次', call('startBattle', { mode: 'pvp', opponentPlayerId: 'TEST-PB', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');
    const histB = call('getGameState', {}, tB).data.state.battleHistory;
    results.push([histB.some((h) => h.defense && h.status === 'won'), '被挑戰的隊友會看到防守紀錄（對方投降＝防守成功）', '']);
    const wA = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
    updateRow_('Wallets', wA._row, Object.assign({}, wA, { pveCount: BATTLE.pveDaily }));
    // 18. 永久刪除球員：連同帳號與所有資料一起刪除
    appendRow_('Players', { id: 'TEST-PD', name: '測試刪除球員', number: '', grade: '', position: '', active: 'TRUE', createdAt: now, updatedAt: now });
    const pdAcc = mk('test-pd-' + Date.now(), 'player', 'TEST-PD');
    appendRow_('FitnessTests', { id: 'TEST-FD', playerId: 'TEST-PD', date: today, item: 'pushup', value: 10, unit: '次', note: '', createdBy: '測試', createdAt: now, updatedAt: now });
    call('saveExamScores', { schoolYear: 115, semester: '上', examNo: 3, grade: 7, entries: [{ playerId: 'TEST-PD', scores: { 國文: 70 } }] }, tCoach, Utilities.getUuid());
    const parRow = readAll_('Users').find((u) => u.id === parentAcc.id);
    updateRow_('Users', parRow._row, Object.assign({}, parRow, { childPlayerIds: 'TEST-PA,TEST-PD' }));
    const tPD = call('login', { loginId: pdAcc.loginId, code: pdAcc.code }).data.token;
    expectFail('姓名輸入錯誤時不會刪除球員', call('adminDeletePlayer', { playerId: 'TEST-PD', confirmName: '別人' }, tCoach, Utilities.getUuid()), 'INVALID');
    const delP = call('adminDeletePlayer', { playerId: 'TEST-PD', confirmName: '測試刪除球員' }, tCoach, Utilities.getUuid());
    const leftAny = ['Players', 'FitnessTests', 'ExamScores'].some((n) => readAll_(n).some((r) => r.id === 'TEST-PD' || r.playerId === 'TEST-PD'));
    results.push([delP.ok && !leftAny && !readAll_('Users').some((u) => u.id === pdAcc.id), '教練可以永久刪除球員，帳號、體能、段考資料一起刪除', delP.ok ? '' : delP.error]);
    results.push([readAll_('Users').find((u) => u.id === parentAcc.id).childPlayerIds === 'TEST-PA', '刪除球員後，家長的子女清單也會移除這位球員', '']);
    expectFail('被刪除球員的登入狀態立即失效', call('me', {}, tPD), 'AUTH');
    expectFail('找不到的球員不能刪除', call('adminDeletePlayer', { playerId: 'TEST-PD', confirmName: '測試刪除球員' }, tCoach, Utilities.getUuid()), 'NOT_FOUND');

    // 19. 邀請碼：家長／老師自己設定帳號與密碼
    const inv = call('adminCreateInvite', { role: 'parent', playerIds: ['TEST-PA'], label: '測試邀請' }, tCoach, Utilities.getUuid());
    results.push([inv.ok && inv.data.code.length === 8, '教練可以產生家長邀請碼', inv.ok ? '' : inv.error]);
    expectFail('邀請碼只能給家長或老師', call('adminCreateInvite', { role: 'coach', playerIds: ['TEST-PA'] }, tCoach, Utilities.getUuid()), 'INVALID');
    const regLogin = 'test-reg-' + Date.now();
    const regBase = { inviteCode: inv.data.code, loginId: regLogin, displayName: '測試家長自訂', password: 'MyPass2026' };
    expectFail('錯誤的邀請碼不能註冊', call('register', Object.assign({}, regBase, { inviteCode: 'WRONG999' })), 'INVALID');
    expectFail('太簡單的密碼不能註冊', call('register', Object.assign({}, regBase, { password: '1234' })), 'INVALID');
    const reg = call('register', Object.assign({}, regBase, { inviteCode: inv.data.code.toLowerCase() }), undefined, Utilities.getUuid());
    results.push([reg.ok && reg.data.user.role === 'parent' && reg.data.user.childPlayerIds[0] === 'TEST-PA' && call('me', {}, reg.data.token).ok, '家長用邀請碼自己設定帳號密碼，註冊後直接登入', reg.ok ? '' : reg.error]);
    results.push([call('login', { loginId: regLogin, code: 'MyPass2026' }).ok, '可以用自己設定的帳號密碼登入', '']);
    expectFail('同一組邀請碼不能用第二次', call('register', Object.assign({}, regBase, { loginId: regLogin + 'x' })), 'INVALID');
    const inv2 = call('adminCreateInvite', { role: 'teacher', playerIds: ['TEST-PA'] }, tCoach, Utilities.getUuid());
    expectOk('教練可以作廢邀請碼', call('adminRevokeInvite', { id: inv2.data.invite.id }, tCoach, Utilities.getUuid()));
    expectFail('作廢的邀請碼不能註冊', call('register', Object.assign({}, regBase, { inviteCode: inv2.data.code, loginId: regLogin + 'y' })), 'INVALID');
    results.push([JSON.stringify(call('adminListInvites', {}, tCoach)).indexOf('codeHash') < 0, '邀請碼清單不會回傳邀請碼的雜湊值', '']);

    // 20. 三方平台：溝通區、在校表現、行程
    const msg = call('postMessage', { playerId: 'TEST-PA', body: '老師您好，這週有比賽' }, tPar, Utilities.getUuid());
    expectOk('家長可以在自己孩子的溝通區留言', msg);
    expectOk('老師可以在負責學生的溝通區留言', call('postMessage', { playerId: 'TEST-PA', body: '收到，會注意功課' }, tTeacher, Utilities.getUuid()));
    expectFail('家長不能在別人孩子的溝通區留言', call('postMessage', { playerId: 'TEST-PB', body: 'x' }, tPar), 'FORBIDDEN');
    expectFail('老師不能看不是自己負責的學生', call('hubSummary', { playerId: 'TEST-PB' }, tTeacher), 'FORBIDDEN');
    expectFail('學生本人看不到溝通區', call('hubSummary', { playerId: 'TEST-PA' }, tPA), 'FORBIDDEN');
    expectFail('不能刪除別人的留言', call('deleteMessage', { id: msg.data.message.id }, tTeacher, Utilities.getUuid()), 'FORBIDDEN');
    const sr = call('saveSchoolRecord', { playerId: 'TEST-PA', date: today, category: '上課表現', rating: '良好', content: '上課專心' }, tTeacher, Utilities.getUuid());
    expectOk('老師可以新增在校表現紀錄', sr);
    expectFail('家長不能新增在校表現紀錄', call('saveSchoolRecord', { playerId: 'TEST-PA', date: today, category: '上課表現', content: 'x' }, tPar), 'FORBIDDEN');
    expectFail('在校表現的類別不正確會被拒絕', call('saveSchoolRecord', { playerId: 'TEST-PA', date: today, category: '亂寫', content: 'x' }, tTeacher), 'INVALID');
    expectFail('老師不能幫不是自己負責的學生寫紀錄', call('saveSchoolRecord', { playerId: 'TEST-PB', date: today, category: '上課表現', content: 'x' }, tTeacher), 'FORBIDDEN');
    const evT = call('saveEvent', { title: '測試段考', date: addDaysStr_(today, 3), category: '考試', playerIds: [] }, tTeacher, Utilities.getUuid());
    results.push([evT.ok && evT.data.event.playerIds.join() === 'TEST-PA', '老師新增行程時，沒選學生＝自己負責的全部學生（不會變成全隊）', evT.ok ? evT.data.event.playerIds.join() : evT.error]);
    expectFail('老師不能為不是自己負責的學生新增行程', call('saveEvent', { title: 'x', date: today, category: '考試', playerIds: ['TEST-PB'] }, tTeacher), 'FORBIDDEN');
    expectFail('時間格式不正確會被拒絕', call('saveEvent', { title: 'x', date: today, startTime: '25:00', category: '練習' }, tCoach), 'INVALID');
    const evTeam = call('saveEvent', { title: '測試全隊練習', date: addDaysStr_(today, 1), startTime: '16:00', endTime: '18:00', category: '練習', playerIds: [] }, tCoach, Utilities.getUuid());
    expectOk('教練可以新增全隊行程', evTeam);
    expectFail('老師不能修改教練的行程', call('saveEvent', { id: evTeam.data.event.id, title: 'x', date: today, category: '練習' }, tTeacher), 'FORBIDDEN');
    const evB = call('saveEvent', { title: '測試B個人行程', date: addDaysStr_(today, 2), category: '其他', playerIds: ['TEST-PB'] }, tCoach, Utilities.getUuid());
    const evA = call('listEvents', {}, tPA).data.events.map((e) => e.id);
    results.push([evA.indexOf(evTeam.data.event.id) >= 0 && evA.indexOf(evT.data.event.id) >= 0 && evA.indexOf(evB.data.event.id) < 0, '學生看得到全隊與自己的行程，看不到別人的個人行程', '']);
    const hub = call('hubSummary', { playerId: 'TEST-PA' }, tPar);
    results.push([hub.ok && hub.data.messages.length === 2 && hub.data.schoolRecords.length === 1 && hub.data.notes.length >= 1 && hub.data.events.length >= 2, '家長的總覽看得到溝通、在校表現、棒球筆記與行程', hub.ok ? '' : hub.error]);
    expectOk('老師可以看負責學生的段考成績', call('listExamScores', { playerId: 'TEST-PA' }, tTeacher));
    expectFail('老師不能輸入段考成績', call('saveExamScores', { schoolYear: 115, semester: '上', examNo: 1, grade: 8, entries: [] }, tTeacher), 'FORBIDDEN');
    expectOk('教練可以刪除任何留言', call('deleteMessage', { id: msg.data.message.id }, tCoach, Utilities.getUuid()));

    // 21. 群發訊息與學務處
    const tParPB = (() => {
      const acc = mk('test-parent-' + (Date.now() + 1), 'parent', '', 'TEST-PB');
      return call('login', { loginId: acc.loginId, code: acc.code }).data.token;
    })();
    const tch2 = readAll_('Users').find((u) => u.id === teacherAcc.id);
    updateRow_('Users', tch2._row, Object.assign({}, tch2, { childPlayerIds: 'TEST-PA,TEST-PB' }));
    const bc = call('postMessage', { playerIds: ['TEST-PA', 'TEST-PB'], body: '全班明天戶外教學' }, tTeacher, Utilities.getUuid());
    results.push([bc.ok && bc.data.sent === 2, '老師可以一次群發訊息給全班學生', bc.ok ? '' : bc.error]);
    const seenA = call('hubSummary', { playerId: 'TEST-PA' }, tPar).data.messages.some((m) => m.batchId && m.body === '全班明天戶外教學');
    const seenB = call('hubSummary', { playerId: 'TEST-PB' }, tParPB).data.messages.some((m) => m.batchId && m.batchSize === 2);
    results.push([seenA && seenB, '群發的訊息兩位學生的家長都看得到', '']);
    expectFail('家長不能群發給別人的孩子', call('postMessage', { playerIds: ['TEST-PA', 'TEST-PB'], body: 'x' }, tPar), 'FORBIDDEN');
    expectFail('沒有選學生不能群發', call('postMessage', { playerIds: [], body: 'x' }, tTeacher), 'INVALID');
    const delB = call('deleteMessage', { id: bc.data.message.id, wholeBatch: true }, tTeacher, Utilities.getUuid());
    results.push([delB.ok && delB.data.count === 2 && !readAll_('Messages').some((m) => m.batchId && m.batchId === bc.data.messages[0].batchId), '群發的訊息可以一次從全部學生刪除', delB.ok ? '' : delB.error]);
    const offHub = call('hubSummary', { playerId: 'TEST-PB' }, tOffice);
    expectOk('學務處不用勾選，就看得到每位學生的平台資料', offHub);
    const offAll = call('postMessage', { playerIds: ['TEST-PA', 'TEST-PB'], body: '學務處統一公告' }, tOffice, Utilities.getUuid());
    expectOk('學務處可以統一發布訊息', offAll);
    expectOk('學務處也可以單獨留言給一位學生', call('postMessage', { playerId: 'TEST-PA', body: '個別提醒' }, tOffice, Utilities.getUuid()));
    const offEv = call('saveEvent', { title: '測試全校活動', date: today, category: '學校活動', playerIds: [] }, tOffice, Utilities.getUuid());
    results.push([offEv.ok && offEv.data.event.playerIds.length === 0, '學務處可以新增全體行程', offEv.ok ? '' : offEv.error]);
    expectOk('學務處可以寫在校表現', call('saveSchoolRecord', { playerId: 'TEST-PB', date: today, category: '品德行為', content: '熱心服務' }, tOffice, Utilities.getUuid()));
    expectOk('學務處可以看段考成績', call('listExamScores', { playerId: 'TEST-PB' }, tOffice));
    expectFail('學務處不能使用教練後台', call('adminListUsers', {}, tOffice), 'FORBIDDEN');
    const rosterT = call('hubRoster', {}, tTeacher);
    const rosterP = call('hubRoster', {}, tPar);
    const rosterO = call('hubRoster', {}, tOffice);
    results.push([rosterT.ok && rosterT.data.students.length === 2 && rosterP.ok && rosterP.data.students.length === 1 && rosterO.ok && rosterO.data.students.length >= 2, '全部學生一覽：老師看負責的、家長看自己孩子、學務處看全部', '']);
    const rA = rosterO.data.students.find((s) => s.playerId === 'TEST-PA');
    results.push([rA && rA.lastMessageBy === officeAcc.loginId.replace(/^/, '測試') && rA.notes14 >= 1, '全部學生一覽有最新留言與筆記次數', rA ? rA.lastMessageBy : '']);
    const swap = call('adminUpdateUser', { userId: teacherAcc.id, displayName: '測試轉學務處', role: 'office' }, tCoach, Utilities.getUuid());
    results.push([swap.ok && readAll_('Users').find((u) => u.id === teacherAcc.id).role === 'office', '教練可以把老師帳號改成學務處', swap.ok ? '' : swap.error]);
    expectFail('教練帳號不能被改成其他角色', call('adminUpdateUser', { userId: coachAcc.id, displayName: 'x', role: 'office' }, tCoach), 'INVALID');

    // 21-1. 一次刪除多個帳號
    const del1 = mk('test-parent-' + (Date.now() + 11), 'parent', '', 'TEST-PA');
    const del2 = mk('test-teacher-' + (Date.now() + 12), 'teacher', '', 'TEST-PA');
    const tDel1 = call('login', { loginId: del1.loginId, code: del1.code }).data.token;
    expectFail('勾到自己的帳號時整批不刪', call('adminDeleteUsers', { userIds: [del1.id, coachAcc.id] }, tCoach), 'INVALID');
    expectFail('勾到球員帳號時整批不刪（球員要從球員名單刪除）', call('adminDeleteUsers', { userIds: [del1.id, paAcc.id] }, tCoach), 'INVALID');
    results.push([readAll_('Users').some((u) => u.id === del1.id), '整批不刪時，其他帳號也保留', '']);
    expectFail('沒有勾選帳號時不能刪除', call('adminDeleteUsers', { userIds: [] }, tCoach), 'INVALID');
    const delRes = call('adminDeleteUsers', { userIds: [del1.id, del2.id] }, tCoach, Utilities.getUuid());
    results.push([delRes.ok && delRes.data.deleted === 2 && !readAll_('Users').some((u) => u.id === del1.id || u.id === del2.id), '教練可以一次刪除多個帳號', delRes.ok ? '' : delRes.error]);
    expectFail('被刪除的帳號立即無法使用', call('me', {}, tDel1), 'AUTH');
    results.push([readAll_('AuditLogs').filter((l) => l.action === '刪除帳號' && (l.target === del1.id || l.target === del2.id)).length === 2, '刪除帳號會記錄在操作紀錄', '']);

    // 22. 與怪獸互動、親密度進化
    mon('TEST-M4', 904, { evolvesTo: 'TEST-M5', evolveLevel: 30, evolveAffection: 10 });
    mon('TEST-M5', 905, { stage: 2 });
    appendRow_('PlayerMonsters', { id: 'TEST-PM-CARE', playerId: 'TEST-PA', monsterId: 'TEST-M4', nickname: '測試獸904', level: 1, exp: 0, partner: false, obtainedAt: now, obtainedBy: 'capture', hp: 10, hpAt: now });
    const wCare = readAll_('Wallets').find((x) => x.playerId === 'TEST-PA');
    updateRow_('Wallets', wCare._row, Object.assign({}, wCare, { points: 7 }));
    const care = (kind, t) => call('careMonster', { playerMonsterId: 'TEST-PM-CARE', action: kind }, t || tPA, Utilities.getUuid());
    const careRow = () => readAll_('PlayerMonsters').find((x) => x.id === 'TEST-PM-CARE');
    expectFail('親密度還不夠時不能進化', call('evolveMonster', { playerMonsterId: 'TEST-PM-CARE' }, tPA, Utilities.getUuid()), 'INVALID');
    const pet1 = care('pet');
    results.push([pet1.ok && pet1.data.gained === 2 && pet1.data.affection === 2, '摸摸牠會增加親密度', pet1.ok ? '' : pet1.error]);
    care('pet');
    care('pet');
    expectFail('摸摸牠每天有次數上限', care('pet'), 'INVALID');
    const feed1 = care('feed');
    results.push([feed1.ok && feed1.data.healed > 0 && feed1.data.state.wallet.points === 2, '餵點心會扣點數並回復 HP', feed1.ok ? 'HP +' + feed1.data.healed + '、點數 ' + feed1.data.state.wallet.points : feed1.error]);
    expectFail('點數不足時不能餵點心', care('feed'), 'INVALID');
    const play1 = care('play');
    results.push([play1.ok && play1.data.exp === 5 && Number(careRow().exp) === 5, '一起玩球會增加經驗值', play1.ok ? '' : play1.error]);
    expectFail('不能和別人的怪獸互動', care('pet', tB), 'FORBIDDEN');
    expectFail('不存在的互動方式會被拒絕', care('dance'), 'INVALID');
    expectFail('特殊名稱的互動方式會被拒絕', care('__proto__'), 'INVALID');
    const affNow = Number(careRow().affection);
    results.push([affNow === 14, '親密度正確累積（摸 3 次＋餵 1 次＋玩 1 次＝14）', '親密度 ' + affNow]);
    const evoAff = call('evolveMonster', { playerMonsterId: 'TEST-PM-CARE' }, tPA, Utilities.getUuid());
    results.push([evoAff.ok && evoAff.data.toId === 'TEST-M5' && Number(careRow().affection) === 14 && Number(careRow().level) === 1, '親密度達到後，不看等級也能進化（親密度保留）', evoAff.ok ? '' : evoAff.error]);
    const cr1 = careRow();
    updateRow_('PlayerMonsters', cr1._row, Object.assign({}, cr1, { careDate: '2000-01-01' }));
    expectOk('隔天互動次數重新計算', care('pet'));
    const cr2 = careRow();
    updateRow_('PlayerMonsters', cr2._row, Object.assign({}, cr2, { affection: 99, careDate: '2000-01-01' }));
    const top = care('pet');
    results.push([top.ok && top.data.affection === 100 && top.data.gained === 1, '親密度最高 100', top.ok ? String(top.data.affection) : top.error]);
    const monList = call('listMonsters', {}, tPA).data.monsters;
    const mAff = (id) => (monList.find((x) => x.id === id) || {}).evolveAffection;
    results.push([mAff('TEST-M4') === 10 && mAff('TEST-M1') === 0, '圖鑑資料包含進化方式（親密度或等級）', mAff('TEST-M4') + ' / ' + mAff('TEST-M1')]);
    const editM = { id: 'TEST-M1', name: '測試獸901', description: '測試', catchRate: 0.5, inWild: false, evolveLevel: 2 };
    const updAff = call('updateMonster', Object.assign({ evolveAffection: 30 }, editM), tCoach, Utilities.getUuid());
    results.push([updAff.ok && updAff.data.monster.evolveAffection === 30, '教練可以把怪獸改成親密度進化', updAff.ok ? '' : updAff.error]);
    expectFail('親密度進化的數值超出範圍會被拒絕', call('updateMonster', Object.assign({ evolveAffection: 500 }, editM), tCoach), 'INVALID');

    expectFail('每天的野外對戰次數有上限', call('startBattle', { mode: 'pve', areaId: 'field', playerMonsterId: pmA.id }, tPA, Utilities.getUuid()), 'INVALID');

    // 23. 球隊管理：練球通知、出缺席、通訊錄、預算、賽事（練球用 2099 年的日期，不會動到真正的練球安排）
    {
      const pd = (d) => '2099-01-0' + d;
      const pw = call('savePracticeWeek', { days: [{ date: pd(5), type: '練球', startTime: '16:00', endTime: '18:00', location: '校內球場', content: '打擊練習' }, { date: pd(6), type: '休息' }] }, tCoach, Utilities.getUuid());
      results.push([pw.ok && pw.data.saved === 2, '教練可以一次儲存一週練球（含休息日）', pw.ok ? '' : pw.error]);
      const lp = call('listPractice', { from: pd(1), to: pd(9) }, tPA);
      results.push([lp.ok && lp.data.days.length === 2 && lp.data.days[1].type === '休息', '球員看得到練球通知與休息日', lp.ok ? String(lp.data.days.length) : lp.error]);
      expectFail('球員不能修改練球通知', call('savePracticeWeek', { days: [{ date: pd(5), type: '休息' }] }, tPA), 'FORBIDDEN');
      expectFail('練球結束時間早於開始時間會被拒絕', call('savePracticeWeek', { days: [{ date: pd(7), type: '練球', startTime: '18:00', endTime: '16:00' }] }, tCoach), 'INVALID');
      expectFail('練球類別不正確會被拒絕', call('savePracticeWeek', { days: [{ date: pd(7), type: '放假囉' }] }, tCoach), 'INVALID');
      const pw2 = call('savePracticeWeek', { days: [{ date: pd(5), type: '練球', startTime: '15:30', endTime: '18:00' }, { date: pd(6), type: '' }] }, tCoach, Utilities.getUuid());
      const lp2 = call('listPractice', { from: pd(1), to: pd(9) }, tCoach);
      results.push([pw2.ok && lp2.data.days.length === 1 && lp2.data.days[0].startTime === '15:30', '可以修改練球時間、清空某一天的安排（不會重複）', pw2.ok ? '' : pw2.error]);

      const att = call('saveAttendance', { date: today, records: [{ playerId: 'TEST-PA', status: '出席' }, { playerId: 'TEST-PB', status: '事假', reason: '家裡有事' }] }, tCoach, Utilities.getUuid());
      results.push([att.ok && att.data.records.filter((r) => r.playerId.indexOf('TEST-') === 0).length === 2, '教練可以點名（出席、請假與原因）', att.ok ? '' : att.error]);
      const att2 = call('saveAttendance', { date: today, records: [{ playerId: 'TEST-PA', status: '遲到' }, { playerId: 'TEST-PB', status: '' }] }, tCoach, Utilities.getUuid());
      const la = call('listAttendance', { from: today, to: today }, tCoach).data.records.filter((r) => r.playerId.indexOf('TEST-') === 0);
      results.push([att2.ok && la.length === 1 && la[0].status === '遲到', '同一天再點名會更新、不會重複；空白＝取消紀錄', JSON.stringify(la)]);
      expectFail('出缺席狀態不正確會被拒絕', call('saveAttendance', { date: today, records: [{ playerId: 'TEST-PA', status: '翹課' }] }, tCoach), 'INVALID');
      expectFail('不存在的球員不能點名', call('saveAttendance', { date: today, records: [{ playerId: 'NOPE-1', status: '出席' }] }, tCoach), 'NOT_FOUND');
      expectFail('出缺席一次最多查詢一年多', call('listAttendance', { from: '2020-01-01', to: '2026-01-01' }, tCoach), 'INVALID');

      const prof = call('saveProfile', { playerId: 'TEST-PA', guardianName: '測試家長', guardianRelation: '母', guardianPhone: '0912-345-678', height: '165.5', birthday: '2012-05-01' }, tCoach, Utilities.getUuid());
      const lpf = call('listProfiles', {}, tCoach);
      results.push([prof.ok && lpf.ok && lpf.data.profiles.some((x) => x.playerId === 'TEST-PA' && x.guardianPhone === '0912-345-678' && x.height === '165.5'), '教練可以填寫球員個人資料與通訊錄', prof.ok ? '' : prof.error]);
      call('saveProfile', { playerId: 'TEST-PA', guardianName: '測試家長二', height: '166' }, tCoach, Utilities.getUuid());
      results.push([readAll_('PlayerProfiles').filter((x) => x.playerId === 'TEST-PA').length === 1, '再次儲存個人資料會更新同一列，不會重複', '']);
      expectFail('身高格式錯誤會被拒絕', call('saveProfile', { playerId: 'TEST-PA', height: 'abc' }, tCoach), 'INVALID');
      // 大頭照
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const ph = call('savePhoto', { playerId: 'TEST-PA', image: png }, tCoach, Utilities.getUuid());
      const seePh = call('listPhotos', {}, tB);
      results.push([ph.ok && seePh.ok && seePh.data.photos['TEST-PA'] === png, '教練可以上傳大頭照，其他球員也看得到', ph.ok ? (seePh.ok ? '' : seePh.error) : ph.error]);
      expectFail('不是圖片的檔案不能當大頭照', call('savePhoto', { playerId: 'TEST-PA', image: 'data:text/html;base64,PGI+' }, tCoach), 'INVALID');
      call('saveProfile', { playerId: 'TEST-PA', guardianName: '測試家長三' }, tCoach, Utilities.getUuid());
      results.push([call('listPhotos', {}, tCoach).data.photos['TEST-PA'] === png, '修改個人資料後，大頭照還在', '']);
      // 從雲端硬碟資料夾匯入（測試資料夾用完就移到垃圾桶）
      const srcFolder = DriveApp.createFolder('自動測試大頭照_TEST-');
      const srcFile = srcFolder.createFile(Utilities.newBlob(Utilities.base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), 'image/png', '測試球員(國三)_TEST-.png'));
      try {
        const srcList = call('listPhotoSources', {}, tCoach);
        results.push([srcList.ok && srcList.data.folders.some((f) => f.id === srcFolder.getId()), '可以列出名稱有「大頭照」的資料夾', srcList.ok ? '' : srcList.error]);
        const inFolder = call('listPhotoFolder', { folderId: srcFolder.getId() }, tCoach);
        results.push([inFolder.ok && inFolder.data.files.length === 1 && inFolder.data.files[0].name.indexOf('測試球員') === 0, '可以列出資料夾裡的照片', inFolder.ok ? '' : inFolder.error]);
        const got = call('getPhotoFile', { folderId: srcFolder.getId(), fileId: srcFile.getId() }, tCoach);
        results.push([got.ok && got.data.image === png, '可以讀取資料夾裡的照片原圖', got.ok ? '' : got.error]);
        expectFail('不在選定資料夾裡的檔案不能讀', call('getPhotoFile', { folderId: srcFolder.getId(), fileId: readAll_('PlayerProfiles').find((x) => x.playerId === 'TEST-PA').photoId }, tCoach), 'FORBIDDEN');
      } finally {
        srcFile.setTrashed(true);
        srcFolder.setTrashed(true);
      }
      const delPh = call('deletePhoto', { playerId: 'TEST-PA' }, tCoach, Utilities.getUuid());
      results.push([delPh.ok && !call('listPhotos', {}, tCoach).data.photos['TEST-PA'], '教練可以刪除大頭照', delPh.ok ? '' : delPh.error]);
      expectFail('生日格式錯誤會被拒絕', call('saveProfile', { playerId: 'TEST-PA', birthday: '2012/13/40' }, tCoach), 'INVALID');
      expectFail('家長關係只能選母、父、隔代、其他', call('saveProfile', { playerId: 'TEST-PA', guardianRelation: '舅舅' }, tCoach), 'INVALID');
      expectFail('生日填成民國年（0101 年）會被拒絕', call('saveProfile', { playerId: 'TEST-PA', birthday: '0101-01-25' }, tCoach), 'INVALID');

      const yr = 'TEST-年度';
      const bi = call('saveBudgetItem', { year: yr, type: '支出', name: '球具', amount: '10,000' }, tCoach, Utilities.getUuid());
      results.push([bi.ok && bi.data.item.amount === 10000, '教練可以新增預算項目（金額可以有逗號）', bi.ok ? '' : bi.error]);
      expectFail('同一年度不能有同名的預算項目', call('saveBudgetItem', { year: yr, type: '支出', name: '球具', amount: '1' }, tCoach), 'INVALID');
      const biIn = call('saveBudgetItem', { year: yr, type: '收入', name: '家長會補助', amount: '20000' }, tCoach, Utilities.getUuid());
      const biId = bi.ok ? bi.data.item.id : '';
      const tx1 = call('saveTransaction', { year: yr, date: today, type: '支出', itemId: biId, title: '購買球棒', amount: 3500, handler: '教練' }, tCoach, Utilities.getUuid());
      expectOk('教練可以記一筆支出', tx1);
      expectOk('教練可以記一筆收入', call('saveTransaction', { year: yr, date: today, type: '收入', itemId: biIn.ok ? biIn.data.item.id : '', title: '家長會補助款', amount: 20000 }, tCoach, Utilities.getUuid()));
      expectFail('收入不能記到支出的預算項目', call('saveTransaction', { year: yr, date: today, type: '收入', itemId: biId, title: 'x', amount: 1 }, tCoach), 'INVALID');
      expectFail('金額必須大於 0', call('saveTransaction', { year: yr, date: today, type: '支出', itemId: biId, title: 'x', amount: 0 }, tCoach), 'INVALID');
      expectFail('金額不能有小數', call('saveTransaction', { year: yr, date: today, type: '支出', itemId: biId, title: 'x', amount: '10.5' }, tCoach), 'INVALID');
      const lb = call('listBudget', { year: yr }, tCoach);
      results.push([lb.ok && lb.data.years.indexOf(yr) >= 0 && lb.data.items.length === 2 && lb.data.transactions.length === 2, '可以依年度讀取預算項目與收支', lb.ok ? lb.data.items.length + ' / ' + lb.data.transactions.length : lb.error]);
      expectFail('還有收支紀錄的預算項目不能刪除', call('deleteBudgetItem', { id: biId }, tCoach), 'INVALID');
      const txId = tx1.ok ? tx1.data.transaction.id : '';
      expectOk('可以刪除一筆收支', call('deleteTransaction', { id: txId }, tCoach, Utilities.getUuid()));
      expectOk('沒有收支紀錄之後就能刪除預算項目', call('deleteBudgetItem', { id: biId }, tCoach, Utilities.getUuid()));
      const logs23 = readAll_('AuditLogs');
      results.push([logs23.some((l) => l.action === '新增收支' && l.target === txId) && logs23.some((l) => l.action === '刪除收支' && l.target === txId), '收支的新增與刪除都會寫入操作紀錄', '']);

      const tnIn = { name: '測試盃', kind: '盃賽', startDate: today, endDate: addDaysStr_(today, 2), location: '測試球場', fee: '1500', playerIds: ['TEST-PA', 'TEST-PB'] };
      const tn = call('saveTournament', tnIn, tCoach, Utilities.getUuid());
      expectOk('教練可以新增盃賽與參賽名單', tn);
      expectFail('賽事結束日期早於開始日期會被拒絕', call('saveTournament', Object.assign({}, tnIn, { endDate: addDaysStr_(today, -1) }), tCoach), 'INVALID');
      expectFail('不存在的球員不能加入參賽名單', call('saveTournament', Object.assign({}, tnIn, { playerIds: ['NOPE-1'] }), tCoach), 'INVALID');
      expectFail('球員不能新增賽事', call('saveTournament', tnIn, tPA), 'FORBIDDEN');
      const tnId = tn.ok ? tn.data.tournament.id : '';
      const gm = call('saveGame', { tournamentId: tnId, date: today, time: '09:00', opponent: '測試國中', side: '先攻', ourScore: '5', oppScore: '3' }, tCoach, Utilities.getUuid());
      expectOk('教練可以新增比賽與比分', gm);
      const gmMeet = call('saveGame', { id: gm.data.game.id, tournamentId: tnId, date: today, time: '09:00', opponent: '測試國中', side: '先攻', ourScore: '5', oppScore: '3', meetTime: '06:30', meetPlace: '東勢國中校門口', departTime: '06:45' }, tCoach, Utilities.getUuid());
      results.push([gmMeet.ok && gmMeet.data.game.meetTime === '06:30' && gmMeet.data.game.meetPlace === '東勢國中校門口' && gmMeet.data.game.departTime === '06:45', '比賽可以設定集合時間、集合地點、出發時間', gmMeet.ok ? '' : gmMeet.error]);
      expectFail('出發時間不能早於集合時間', call('saveGame', { tournamentId: tnId, date: today, opponent: 'x', meetTime: '07:00', departTime: '06:30' }, tCoach), 'INVALID');
      expectFail('比分只填一邊會被拒絕', call('saveGame', { tournamentId: tnId, date: today, opponent: 'x', ourScore: '5', oppScore: '' }, tCoach), 'INVALID');
      const lt = call('listTournaments', {}, tPA);
      const myT = lt.ok ? lt.data.tournaments.find((t) => t.id === tnId) : null;
      results.push([!!myT && myT.playerIds.length === 2 && !!lt.data.names['TEST-PA'] && lt.data.games.some((g) => gm.ok && g.id === gm.data.game.id && g.ourScore === 5), '球員看得到賽事、參賽名單與比分', lt.ok ? '' : lt.error]);
      const jz = (j, t) => call('saveJerseys', { tournamentId: tnId, jerseys: j }, t || tCoach, Utilities.getUuid());
      const j1 = jz({ 'TEST-PA': '7', 'TEST-PB': '00' });
      const tnJ = call('listTournaments', {}, tPA).data.tournaments.find((t) => t.id === tnId);
      results.push([j1.ok && tnJ && tnJ.jerseys['TEST-PA'] === '7' && tnJ.jerseys['TEST-PB'] === '00', '教練可以安排這場賽事的球衣號碼（含 00），球員看得到', j1.ok ? '' : j1.error]);
      expectFail('同一場賽事的球衣號碼不能重複', jz({ 'TEST-PA': '7', 'TEST-PB': '7' }), 'INVALID');
      expectFail('球衣號碼不能超過 99', jz({ 'TEST-PA': '100' }), 'INVALID');
      expectFail('不在參賽名單的球員不能給號碼', jz({ 'NOPE-1': '5' }), 'INVALID');
      expectFail('球員不能安排球衣號碼', jz({ 'TEST-PA': '1' }, tPA), 'FORBIDDEN');
      call('saveTournament', Object.assign({}, tnIn, { id: tnId, playerIds: ['TEST-PA'] }), tCoach, Utilities.getUuid());
      const tnJ2 = call('listTournaments', {}, tCoach).data.tournaments.find((t) => t.id === tnId);
      results.push([tnJ2 && tnJ2.jerseys['TEST-PA'] === '7' && !('TEST-PB' in tnJ2.jerseys), '修改賽事資料時保留號碼；移出參賽名單的球員不再顯示號碼', JSON.stringify(tnJ2 && tnJ2.jerseys)]);
      const dt = call('deleteTournament', { id: tnId }, tCoach, Utilities.getUuid());
      results.push([dt.ok && dt.data.games === 1 && !readAll_('Games').some((g) => g.tournamentId === tnId), '刪除賽事會連同它的比賽一起刪除', dt.ok ? '' : dt.error]);

      // 練球安排（用 2099 年的一週，不會動到真正的安排）
      const wk = '2099-01-05';
      const plan = (sessions, t) => call('savePlanWeek', { weekStart: wk, sessions: sessions }, t || tCoach, Utilities.getUuid());
      const sTeam = { date: '2099-01-05', startTime: '16:00', endTime: '18:00', slot: '下午', items: ['守備', '打擊'], playerIds: [], location: '校內球場' };
      const sB = { date: '2099-01-06', startTime: '06:30', endTime: '07:30', slot: '晨練', items: ['投球'], playerIds: ['TEST-PB'] };
      const pl1 = plan([sTeam, sB]);
      results.push([pl1.ok && pl1.data.saved === 2, '教練可以一次安排一週的練球時段與參加人員', pl1.ok ? '' : pl1.error]);
      const seeA = call('listPlan', { from: wk, to: '2099-01-11' }, tPA);
      results.push([seeA.ok && seeA.data.sessions.length === 1 && seeA.data.sessions[0].playerIds.length === 0, '球員只看得到全隊與有自己的時段', seeA.ok ? String(seeA.data.sessions.length) : seeA.error]);
      const seeC = call('listPlan', { from: wk, to: '2099-01-11' }, tCoach);
      results.push([seeC.ok && seeC.data.sessions.length === 2 && seeC.data.names['TEST-PB'], '教練看得到全部時段與參加人員姓名', seeC.ok ? '' : seeC.error]);
      expectFail('球員不能安排練球', plan([sTeam], tPA), 'FORBIDDEN');
      expectFail('結束時間要晚於開始時間', plan([Object.assign({}, sTeam, { endTime: '15:00' })]), 'INVALID');
      expectFail('不在這一週的日期會被拒絕', plan([Object.assign({}, sTeam, { date: '2099-01-12' })]), 'INVALID');
      expectFail('訓練內容不正確會被拒絕', plan([Object.assign({}, sTeam, { items: ['打電動'] })]), 'INVALID');
      expectFail('不存在的球員不能排進時段', plan([Object.assign({}, sTeam, { playerIds: ['NOPE-1'] })]), 'INVALID');
      const sB2 = Object.assign({}, sB, { startTime: '16:00', endTime: '18:00', slot: '下午' });
      expectFail('同一天同一位球員不能排進兩個時段', plan([sB, sB2]), 'INVALID');
      expectFail('同一天排了全隊就不能再排其他時段', plan([sTeam, Object.assign({}, sB, { date: sTeam.date })]), 'INVALID');
      expectOk('同一天不同球員可以分組排在不同時段', plan([sB, Object.assign({}, sB2, { playerIds: ['TEST-PA'] })]));
      const pl2 = plan([sB]);
      const after = readAll_('TrainingPlans').filter((x) => x.date >= wk && x.date <= '2099-01-11');
      results.push([pl2.ok && pl2.data.removed === 2 && after.length === 1, '重新儲存同一週會整週換掉，不會重複', pl2.ok ? JSON.stringify(pl2.data) : pl2.error]);
    }

    // 6. 停用帳號立即失效
    const ub = readAll_('Users').find((u) => u.id === pbAcc.id);
    updateRow_('Users', ub._row, Object.assign({}, ub, { active: 'FALSE' }));
    expectFail('停用的帳號無法再使用', call('listNotes', { playerId: 'TEST-PB' }, tB), 'AUTH');
  } catch (err) {
    results.push([false, '測試過程發生錯誤', String(err && err.stack ? err.stack : err)]);
  } finally {
    cleanupTestData_(created);
    // 還原測試前的目標期限設定
    const props = PropertiesService.getScriptProperties();
    if (savedGoalSettings === null) props.deleteProperty('goalSettings');
    else props.setProperty('goalSettings', savedGoalSettings);
  }

  const passed = results.filter((r) => r[0]).length;
  writeTestLog_(results, passed);
  results.forEach((r) => console.log((r[0] ? '✅ PASS ' : '❌ FAIL ') + r[1] + (r[0] || !r[2] ? '' : '（' + r[2] + '）')));
  console.log('──────── 結果：' + passed + ' / ' + results.length + ' 通過 ────────');
  if (passed !== results.length) throw new Error('有 ' + (results.length - passed) + ' 項測試失敗，請把執行記錄提供給開發者。');
}

/** 把測試結果寫到「自動測試結果」工作表（失敗的排在最前面），方便檢查；每次執行會覆蓋上一次 */
function writeTestLog_(results, passed) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(TEST_LOG_SHEET) || ss.insertSheet(TEST_LOG_SHEET);
    sh.clearContents();
    const at = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    const rows = [['結果', '測試項目', '說明', '版本 ' + API_VERSION + '・' + at + '・' + passed + ' / ' + results.length + ' 通過']];
    results.filter((r) => !r[0]).concat(results.filter((r) => r[0])).forEach((r) => rows.push([r[0] ? 'PASS' : 'FAIL', cell_(r[1]), cell_(String(r[2] || '').slice(0, 1000)), '']));
    sh.getRange(1, 1, rows.length, 4).setValues(rows);
  } catch (e) {
    console.log('（無法寫入測試結果工作表：' + e + '）');
  }
}

const TEST_LOG_SHEET = '自動測試結果';

/**
 * 刪除測試資料。除了這次建立的，也會清掉「上次測試中途被停止」而留下的資料：
 * TEST- 開頭的資料、自動測試帳號（test-coach-數字 這類帳號）、自動測試的文章與公告。
 */
const TEST_LOGIN_PATTERN = /^test-(coach|pa|pb|pc|pd|parent|teacher|office|reg)-\d{10,}$/;

function cleanupTestData_(created) {
  // 測試上傳的大頭照（檔名有 _TEST-）移到垃圾桶
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  while (folders.hasNext()) {
    const files = folders.next().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.getName().indexOf('_TEST-') >= 0 && !f.isTrashed()) f.setTrashed(true);
    }
  }
  const testUsers = created.users.concat(readAll_('Users').filter((u) => TEST_LOGIN_PATTERN.test(u.loginId)).map((u) => u.id));
  const ids = testUsers.concat(created.players, created.articles, created.announcements);
  const isTestTitle = (r) => (r.title === '測試文章' && r.summary === '摘要') || (r.title === '測試公告' && r.body === '內容');
  const isTest = (r) =>
    ids.indexOf(r.id) >= 0 ||
    String(r.id || '').indexOf('TEST-') === 0 ||
    String(r.playerId || '').indexOf('TEST-') === 0 ||
    String(r.target || '').indexOf('TEST-') === 0 ||
    ids.indexOf(r.target) >= 0 ||
    testUsers.indexOf(r.actorId) >= 0 ||
    testUsers.indexOf(r.createdById) >= 0 ||
    testUsers.indexOf(r.authorId) >= 0 ||
    isTestTitle(r);
  [
    'DailyNotes', 'FitnessTests', 'Goals', 'Rules', 'KnowledgeArticles', 'Announcements',
    'TaskCompletions', 'Tasks', 'PlayerMonsters', 'MonsterProgress', 'Monsters', 'Wallets', 'RewardLogs', 'QuizPasses',
    'ExamScores', 'Battles', 'Invites', 'Messages', 'SchoolRecords', 'Events',
    'PracticeDays', 'Attendance', 'PlayerProfiles', 'Transactions', 'BudgetItems', 'Games', 'Tournaments', 'TrainingPlans', 'AuditLogs', 'Users', 'Players',
  ].forEach((name) => {
    const rows = readAll_(name).filter(isTest).map((r) => r._row).sort((a, b) => b - a);
    rows.forEach((row) => deleteRow_(name, row));
  });
}
