import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { KnowledgeArticle } from '../types';
import { useStore, useTask } from '../store/DemoStore';
import { useQuizSubmit, type QuizResult } from '../sources/game';
import { can, ROLE_LABELS } from '../lib/permissions';
import { categoryLabel } from '../data/knowledge';
import { ActionFeedback, Alert, Badge, Card, EmptyState, LoadingState, PageHeader } from '../components/UI';
import { useArticles } from '../sources/hooks';
import { EmergencyNotice } from '../components/EmergencyNotice';

function Quiz({ article }: { article: KnowledgeArticle }) {
  const { user } = useStore();
  const submitQuiz = useQuizSubmit();
  const action = useTask();
  const [answers, setAnswers] = useState<(number | null)[]>(() => article.quiz.map(() => null));
  // 批改結果（雲端由伺服器批改，答案不會事先傳到瀏覽器）
  const [graded, setGraded] = useState<QuizResult | null>(null);
  const allAnswered = answers.every((a) => a !== null);
  const correct = graded ? graded.results.filter((r) => r.correct).length : 0;

  const submit = async () => {
    setGraded(null);
    const r = await action.run(() => submitQuiz(article, answers as number[]));
    if (r.ok && r.result) setGraded(r.result);
  };

  return (
    <Card title="重點測驗" icon="📝">
      {article.quiz.map((q, qi) => (
        <fieldset key={qi} className="quiz-q">
          <legend>
            {qi + 1}. {q.question}
          </legend>
          {q.options.map((opt, oi) => {
            const res = graded?.results[qi];
            const isRight = !!res && oi === res.answerIndex;
            const isWrong = !!res && answers[qi] === oi && oi !== res.answerIndex;
            return (
              <label key={oi} className={`quiz-opt ${isRight ? 'right' : ''} ${isWrong ? 'wrong' : ''}`}>
                <input
                  type="radio"
                  name={`q-${qi}`}
                  checked={answers[qi] === oi}
                  onChange={() => {
                    setGraded(null);
                    setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)));
                  }}
                />
                {opt}
              </label>
            );
          })}
          {graded?.results[qi]?.explanation && <p className="muted small">💡 {graded.results[qi].explanation}</p>}
        </fieldset>
      ))}
      {graded &&
        (graded.passed ? (
          <Alert kind="success">全部答對！{user?.role === 'player' && '已記錄，可以到任務板完成「防護知識測驗」任務。'}</Alert>
        ) : (
          <Alert kind="warn">
            答對 {correct} / {article.quiz.length} 題，看看解說後再試一次。
          </Alert>
        ))}
      <ActionFeedback action={action} />
      <button type="button" className="btn btn-primary" disabled={!allAnswered || action.pending} onClick={submit}>
        送出答案
      </button>
    </Card>
  );
}

export default function KnowledgeArticlePage() {
  const { id } = useParams();
  const { user } = useStore();
  const source = useArticles();
  const article = source.articles.find((a) => a.id === id);
  const canEdit = can(user, 'knowledge.edit');
  const visible = article && user && (canEdit || (article.status === 'published' && article.audience.includes(user.role)));

  if (source.loading || source.error) {
    return (
      <div className="page">
        <PageHeader icon="⛑️" title="防護知識" />
        <Card>{source.error ? <Alert kind="error">{source.error}</Alert> : <LoadingState text="讀取文章中…" />}</Card>
      </div>
    );
  }

  if (!article || !visible) {
    return (
      <div className="page">
        <PageHeader icon="⛑️" title="防護知識" />
        <Card>
          <EmptyState icon="📭" title="找不到這篇文章，或文章尚未發布。" />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader icon="⛑️" title={article.title} subtitle={categoryLabel(article.category)} />
      <EmergencyNotice />
      {!article.reviewed && <Alert kind="warn">本文整理自公開的運動醫學與公共衛生資料，尚待教練或運動防護員審閱。如有疑問，請以教練與防護員的指示為準。</Alert>}
      {article.status !== 'published' && <Alert kind="info">此文章目前不是發布狀態，只有教練看得到。</Alert>}
      <Card>
        <p className="muted small">
          適用對象：{article.audience.map((r) => ROLE_LABELS[r]).join('、')}・更新日期：{article.updatedAt}
        </p>
        <h2 className="section-title">內容摘要</h2>
        <p className="lead">{article.summary}</p>
        <h2 className="section-title">詳細說明</h2>
        <ul className="bullet-list">
          {article.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
        {article.cautions.length > 0 && (
          <>
            <h2 className="section-title">⚠️ 注意事項</h2>
            <ul className="bullet-list caution">
              {article.cautions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </>
        )}
        <h2 className="section-title">參考來源</h2>
        <ul className="bullet-list small">
          {article.sources.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <div className="chip-row">{!article.reviewed && <Badge tone="yellow">待專業審閱</Badge>}</div>
      </Card>
      {article.quiz.length > 0 && <Quiz article={article} />}
    </div>
  );
}
