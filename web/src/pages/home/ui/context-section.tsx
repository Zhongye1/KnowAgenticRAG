/**
 * 上下文段落（照搬参照实现的 `context-section.tsx`）。
 *
 * 与参照的差异：参照在标题与说明之后放的是内测申请表（姓名、邮箱、手机、接入方式勾选，
 * 提交到它自己的 waitlist）。本仓不做这个表单——没有接收它的后端——表单位置先留占位块，
 * 待定换成什么入口；`context-placeholder` 是显式标记，不是已实现的界面。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
export const ContextSection = () => {
  return (
    <div className="site-shell">
      <div id="context-section">
        <section className="context-section" aria-labelledby="context-title">
          <h2 id="context-title">
            A practical platform
            <br />
            <em>for open data.</em>
          </h2>
          <p>
            Ausvector makes open data structured, verifiable, and ready for AI
            workflows.
          </p>

          <div className="feedback-callout">
            <div className="feedback-main">
              <span className="feedback-dot" aria-hidden="true" />
              <div className="feedback-text">
                <strong>Connect to the platform.</strong>
                {
                  'Request access for testing. Tell us what you are building and which integration fits your AI workflow: API, MCP, CLI, or Agent Runtime.'
                }
              </div>
            </div>

            <div className="context-placeholder" data-context-placeholder>
              <span className="context-placeholder-eyebrow">ACCESS REQUEST</span>
              <p className="context-placeholder-text">
                参照实现这里是内测申请表（姓名 / 邮箱 / 手机与接入方式勾选）。
                本仓没有接收该表单的后端，这一块先占位。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
