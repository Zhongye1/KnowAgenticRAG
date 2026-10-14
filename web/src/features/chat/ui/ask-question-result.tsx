/**
 * 提问工具（`ask_user_question`）的结果主体。
 *
 * 逐题展示题干、操作说明、选项（含推荐标记）与回答；没有题目时给空态。
 */
import type { QuestionItem } from '../lib/ask-question';
import { formatAnswer, questionAnswer } from '../lib/ask-question';

type AskQuestionResultProps = {
  questions: QuestionItem[];
  answer: unknown;
};

/** 推荐项：参照按「首个且标签里带 (Recommended)」判定。 */
const isRecommended = (label: string, index: number): boolean =>
  index === 0 && label.includes('(Recommended)');

export const AskQuestionResult = ({
  questions,
  answer,
}: AskQuestionResultProps) => {
  if (questions.length === 0) {
    return (
      <p className="py-3 text-center text-xs text-[var(--gray-500)]">
        暂无提问内容
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {questions.map((question, questionIndex) => {
        const value = questionAnswer(answer, questions, question);
        const answerText =
          value === undefined ? '' : formatAnswer(value, question);

        return (
          <li key={question.questionId} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <span className="shrink-0 rounded-small bg-[var(--gray-100)] px-1.5 text-xs text-[var(--gray-500)]">
                {questionIndex + 1}
              </span>
              <span className="text-[var(--gray-1000)]">
                {question.question}
              </span>
            </div>

            {question.operation ? (
              <div className="flex gap-2 pl-6">
                <span className="shrink-0 text-[var(--gray-500)]">操作</span>
                <span className="text-[var(--gray-800)]">
                  {question.operation}
                </span>
              </div>
            ) : null}

            {question.options.length > 0 ? (
              <div className="flex gap-2 pl-6">
                <span className="shrink-0 text-[var(--gray-500)]">选项</span>
                <ul className="flex flex-col gap-1">
                  {question.options.map((option, optionIndex) => (
                    <li
                      key={`${option.value}-${optionIndex}`}
                      className={`rounded-medium border px-2 py-0.5 ${
                        isRecommended(option.label, optionIndex)
                          ? 'border-link-6'
                          : 'border-[var(--gray-150)]'
                      }`}
                    >
                      <span className="text-[var(--gray-1000)]">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="ml-2 text-[var(--gray-500)]">
                          {option.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {answerText ? (
              <div className="flex gap-2 pl-6">
                <span className="shrink-0 text-[var(--gray-500)]">回答</span>
                <span className="text-[var(--gray-1000)]">{answerText}</span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
};
