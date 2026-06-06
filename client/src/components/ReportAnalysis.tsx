import type { LLMAnalysis } from '@shared/types.ts';

/** LLM 定性分析渲染组件，聊天报告和历史详情复用 */
export function ReportAnalysis({ analysis }: { analysis: LLMAnalysis }) {
  return (
    <>
      <section className="report-section">
        <h4>🏆 综合评级</h4>
        <div className="report-level-badge">{analysis.overallLevel}</div>
      </section>
      {analysis.grammarErrors.length > 0 && (
        <section className="report-section">
          <h4>✏️ 语法/表达错误 ({analysis.grammarErrors.length})</h4>
          {analysis.grammarErrors.map((err, i) => (
            <div key={i} className="report-error-item">
              <div className="report-error-top">
                <span className="report-error-original">{err.original}</span>
                <span className="report-error-arrow">→</span>
                <span className="report-error-corrected">{err.corrected}</span>
                <span className="report-error-type">{err.errorType}</span>
              </div>
              <div className="report-error-explain">{err.explanationShort}</div>
            </div>
          ))}
        </section>
      )}
      {analysis.expressionUpgrades.length > 0 && (
        <section className="report-section">
          <h4>💡 表达升级 ({analysis.expressionUpgrades.length})</h4>
          {analysis.expressionUpgrades.map((up, i) => (
            <div key={i} className="report-upgrade-item">
              <div className="report-upgrade-top">
                <span className="report-upgrade-original">{up.original}</span>
                <span className="report-error-arrow">→</span>
                <span className="report-upgrade-suggestion">{up.suggestion}</span>
              </div>
              <div className="report-upgrade-reason">{up.reason}</div>
            </div>
          ))}
        </section>
      )}
      <section className="report-section">
        <h4>🎯 改进建议</h4>
        <ul className="report-tips-list">
          {analysis.improvementTips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ul>
      </section>
    </>
  );
}
