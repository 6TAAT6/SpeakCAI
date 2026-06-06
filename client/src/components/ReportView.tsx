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
              const acc = avg('accuracy');
              const flu = avg('fluency');
              const itg = avg('integrity');
              const tot = userTurns.length > 0
                ? userTurns.reduce((s, t) => s + (t.score ?? 0), 0) / userTurns.length
                : 0;
              const dims = [
                { label: '准确度', val: acc, color: '#3b82f6', angle: -Math.PI / 2 },
                { label: '流利度', val: flu, color: '#22c55e', angle: 0 },
                { label: '完整度', val: itg, color: '#f59e0b', angle: Math.PI / 2 },
                { label: '总分',    val: tot, color: '#ec4899', angle: Math.PI },
              ];
              const r = 78, cx = 115, cy = 115;
              const p = (v: number, a: number) =>
                `${cx + Math.cos(a) * r * (v / 100)},${cy + Math.sin(a) * r * (v / 100)}`;
              const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
              return (
                <div className="report-radar-wrap">
                  <svg viewBox="0 0 230 230" className="radar-svg">
                    <defs>
                      <radialGradient id="radarGrad" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
                      </radialGradient>
                    </defs>
                    {levels.map(lv => (
                      <polygon key={lv} points={dims.map(d => p(lv * 100, d.angle)).join(' ')}
                        fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray={lv === 1 ? '0' : '3 2'} />
                    ))}
                    {dims.map(d => (
                      <line key={d.label} x1={cx} y1={cy}
                        x2={cx + Math.cos(d.angle) * r} y2={cy + Math.sin(d.angle) * r}
                        stroke="var(--border)" strokeWidth="1" />
                    ))}
                    <polygon points={dims.map(d => p(d.val, d.angle)).join(' ')}
                      fill="url(#radarGrad)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
                    {dims.map(d => {
                      const [dotX, dotY] = p(d.val, d.angle).split(',');
                      return (
                        <circle key={d.label} cx={dotX} cy={dotY} r="4" fill={d.color} stroke="#fff" strokeWidth="1.5" />
                      );
                    })}
                    {dims.map(d => {
                      const lr = r + 22;
                      const lx = cx + Math.cos(d.angle) * lr;
                      const ly = cy + Math.sin(d.angle) * lr;
                      return (
                        <text key={d.label} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                          fill={d.color} fontSize="12" fontWeight="600">{d.label}</text>
                      );
                    })}
                    {dims.map(d => {
                      const mr = r * 0.55;
                      const mx = cx + Math.cos(d.angle) * mr;
                      const my = cy + Math.sin(d.angle) * mr;
                      return (
                        <text key={d.label + '-val'} x={mx} y={my} textAnchor="middle" dominantBaseline="central"
                          fill={d.color} fontSize="10" fontWeight="700" opacity="0.85">{Math.round(d.val)}</text>
                      );
                    })}
                  </svg>
                  <div className="radar-legend">
                    {dims.map(d => (
                      <div key={d.label} className="radar-legend-item">
                        <span className="radar-legend-dot" style={{ background: d.color }} />
                        <span className="radar-legend-label">{d.label}</span>
                        <span className="radar-legend-val">{Math.round(d.val)}</span>
                      </div>
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
