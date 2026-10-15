/**
 * 知识库文档预览（`open_kb_document` / `find_kb_document`）的结果主体。
 *
 * 顶部是摘要与 `file_id`，下面是若干上下文窗口；查找模式下命中行会高亮。
 */
import {
  isMatchedLine,
  windowKey,
  windowTitle,
  type DocumentPreview,
} from '../lib/kb-document-preview';

type KbDocumentPreviewProps = {
  preview: DocumentPreview;
};

export const KbDocumentPreview = ({ preview }: KbDocumentPreviewProps) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-0.5">
      <p className="text-[var(--gray-800)]">{preview.summary}</p>
      {preview.fileId ? (
        <p className="text-xs text-[var(--gray-500)]">
          file_id: {preview.fileId}
        </p>
      ) : null}
    </div>

    {preview.windows.length > 0 ? (
      <ul className="flex flex-col gap-2">
        {preview.windows.map((window, index) => (
          <li
            key={windowKey(window, index)}
            className="flex flex-col rounded-medium border border-[var(--gray-150)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--gray-150)] px-2 py-1">
              <span className="text-[var(--gray-1000)]">
                {windowTitle(window, index)}
              </span>
              {window.matchedLines.length > 0 ? (
                <span className="text-xs text-[var(--gray-500)]">
                  命中 {window.matchedLines.length} 行
                </span>
              ) : null}
            </div>

            <pre className="overflow-x-auto px-2 py-1 text-[var(--gray-800)]">
              {window.content.split('\n').map((line, lineIndex) => (
                <span
                  key={`${windowKey(window, index)}-${lineIndex}`}
                  className={
                    isMatchedLine(line, window.matchedLines)
                      ? 'block bg-[var(--gray-100)]'
                      : 'block'
                  }
                >
                  {line}
                </span>
              ))}
            </pre>
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-3 text-center text-xs text-[var(--gray-500)]">
        暂无可预览内容
      </p>
    )}
  </div>
);
