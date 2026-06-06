import { ReportAnalysis } from './ReportAnalysis.tsx';
import type { LLMAnalysis } from '@shared/types.ts';
import type { Turn } from '../types.ts';

interface Props {
  turns: Turn[];
  report: LLMAnalysis | null;
  reportLoading: boolean;
  reportError: string;
  convoStartTime: number;
  scene: string;
  correctionMode: string;
  sceneEmoji: Record<string, string>;
  modeLabel: Record<string, string>;
  onClose: () => void;
  onRegenerate: () => void;
}

export function ReportView(props: Props) {
  const userTurns = props.turns.filter(t => t.role === 'user' && t.score !== undefined);
  const avg = (k: 'accuracy' | 'fluency' | 'integrity') => {
    const vals = userTurns.map(t => t[k] ?? 0).filter(v => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  return (
    <div className="report-panel">
      <div className="report-header-bar">
        <button onClick={props.onClose} className="ctrl-btn">← 返回对话</button>
        <button onClick={props.onRegenerate} className="ctrl-btn" disabled={props.reportLoading}>🔄 重新生成</button>
      </div>

      {props.reportLoading && <p className="placeholder" style={{ marginTop: '20%' }}>🧠 AI 正在分析对话...</p>}
      {props.reportError && <p className="error-message">{props.reportError}</p>}

      {props.report && (
        <div className="report-content">
          {/* 量化摘要 */}
          <div className="report-quant-section">
            <div className="report-stat-grid">
              <div className="report-stat-card">
                <div className="report-stat-label">练习轮次</div>
                <div className="report-stat-value">{props.turns.filter(t => t.role === 'user').length}</div>
              </div>
              <div className="report-stat-card">
                <div className="report-stat-label">平均发音</div>
                <div className="report-stat-value accent">
                  {(() => {
                    const scores = props.turns.filter(t => t.score !== undefined).map(t => t.score!);
                    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '-';
                  })()}分
                </div>
              </div>
              <div className="report-stat-card">
                <div className="report-stat-label">练习时长</div>
                <div className="report-stat-value">{Math.round((Date.now() - props.convoStartTime) / 60000)}分</div>
              </div>
              <div className="report-stat-card">
                <div className="report-stat-label">场景 / 模式</div>
                <div className="report-stat-value small">{props.sceneEmoji[props.scene] || '❓'} {props.modeLabel[props.correctionMode] || props.correctionMode}</div>
              </div>
            </div>
          </div>

          {/* 发音分数曲线 */}
          <section className="report-section">
            <h4>📈 发音分数趋势</h4>
            {userTurns.length === 0 ? <p className="report-empty">暂无发音数据</p> : (
              <div className="report-bar-chart">
                {userTurns.map((t, i) => (
                  <div key={i} className="report-bar-col" title={`第${i + 1}轮: ${t.score}分`}>
                    <div className="report-bar-fill" style={{ height: `${Math.min((t.score || 0), 100)}%` }} />
                    <span className="report-bar-label">#{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 能力雷达图 */}
          <section className="report-section">
            <h4>🎯 能力雷达图</h4>
            {userTurns.length === 0 ? <p className="report-empty">暂无发音数据</p> : (() => {
              const acc = { val: Math.min(avg('accuracy') / 100, 1), label: '准确度', color: 'var(--accent)' };
              const flu = { val: Math.min(avg('fluency') / 100, 1), label: '流利度', color: 'var(--success)' };
              const itg = { val: Math.min(avg('integrity') / 100, 1), label: '完整度', color: 'var(--warning)' };
              const tot = { val: Math.min((userTurns.reduce((s, t) => s + (t.score ?? 0), 0) / userTurns.length) / 100, 1), label: '总分', color: 'var(--text)' };
              const dims = [acc, flu, itg, tot];
              const angles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
              const r = 50, cx = 60, cy = 60;
              const px = (v: number, a: number) => `${cx + Math.cos(a) * r * v},${cy - Math.sin(a) * r * v}`;
              const pts = dims.map((d, i) => px(d.val, angles[i])).join(' ');
              return (
                <div className="report-radar">
                  <svg viewBox="0 0 120 120" className="radar-svg">
                    {[0.25, 0.5, 0.75, 1].map(s => (
                      <polygon key={s} points={angles.map(a => px(s, a)).join(' ')} fill="none" stroke="var(--border)" strokeWidth="0.5" />
                    ))}
                    {angles.map(a => (
                      <line key={a} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy - Math.sin(a) * r} stroke="var(--border)" strokeWidth="0.5" />
                    ))}
                    <polygon points={pts} fill="var(--accent)" fillOpacity="0.25" stroke="var(--accent)" strokeWidth="1.5" />
                  </svg>
                  <div className="radar-labels">
                    {dims.map((d, i) => (
                      <span key={i} style={{ color: d.color }}>{d.label} {Math.round(d.val * 100)}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* 薄弱音素 */}
          <section className="report-section">
            <h4>🔊 薄弱音素</h4>
            {(() => {
              const counts = new Map<string, number>();
              props.turns.forEach(t => {
                (t.weakPhones || []).forEach(p => { if (p) counts.set(p, (counts.get(p) || 0) + 1); });
              });
              const list = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
              if (list.length === 0) return <p className="report-empty">暂无弱音素数据</p>;
              return (
                <div className="report-phones-list">
                  {list.map(([p, c]) => (
                    <span key={p} className="report-phone-tag">/{p}/ ×{c}</span>
                  ))}
                </div>
              );
            })()}
          </section>

          <ReportAnalysis analysis={props.report} />
        </div>
      )}
    </div>
  );
}
