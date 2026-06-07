import type { ProgressData } from '@shared/types.ts';

const sceneEmoji: Record<string, string> = { daily: '💬', interview: '💼', ordering: '🍽️', meeting: '📊', travel: '✈️', shopping: '🛍️', hotel: '🏨' };

interface Props {
  data: ProgressData;
  loading: boolean;
  error: string;
  onClose: () => void;
}

/** 简洁日期标签：MM/DD */
function shortDate(utcStr: string): string {
  const iso = utcStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return utcStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function ProgressView(props: Props) {
  const sessions = props.data?.sessions || [];
  const hasData = sessions.length >= 2;

  // SVG 尺寸
  const pad = { top: 20, right: 20, bottom: 40, left: 40 };
  const w = 600, h = 280;
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  /** 将 DB 值映射到像素坐标 */
  function xs(i: number): string {
    return (pad.left + (sessions.length > 1 ? (i / (sessions.length - 1)) * pw : pw / 2)).toFixed(1);
  }

  function ys(v: number): string {
    return (pad.top + ph * (1 - Math.max(0, Math.min(100, v)) / 100)).toFixed(1);
  }

  /** Y 轴刻度 */
  function yTicks(): number[] {
    return [0, 25, 50, 75, 100];
  }

  /** 画折线 */
  function polylineD(key: keyof typeof sessions[0]): string {
    if (sessions.length === 0) return '';
    return sessions.map((s, i) => {
      const val = (s as any)[key] as number;
      return `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(val)}`;
    }).join(' ');
  }

  return (
    <div className="progress-panel">
      <div className="report-header-bar">
        <button onClick={props.onClose} className="ctrl-btn">← 返回对话</button>
      </div>

      {props.loading && (
        <div className="report-loading-hero">
          <div className="report-loading-avatar">(¯▿¯)</div>
          <p className="report-loading-text">小T 正在整理数据...</p>
        </div>
      )}
      {props.error && <p className="error-message">{props.error}</p>}

      {!props.loading && !props.error && (
        <div className="progress-content">
          {/* 练习量概览 */}
          <div className="report-stat-grid">
            <div className="report-stat-card">
              <div className="report-stat-label">累计场次</div>
              <div className="report-stat-value">{sessions.length}</div>
            </div>
            <div className="report-stat-card">
              <div className="report-stat-label">累计轮次</div>
              <div className="report-stat-value">{sessions.reduce((s, x) => s + x.turn_count, 0)}</div>
            </div>
            <div className="report-stat-card">
              <div className="report-stat-label">近期均分</div>
              <div className="report-stat-value accent">
                {sessions.length > 0
                  ? Math.round(sessions.slice(-3).reduce((s, x) => s + x.avg_score, 0) / Math.min(3, sessions.length))
                  : '-'}分
              </div>
            </div>
            <div className="report-stat-card">
              <div className="report-stat-label">最好成绩</div>
              <div className="report-stat-value accent">
                {sessions.length > 0 ? Math.round(Math.max(...sessions.map(s => s.avg_score))) : '-'}分
              </div>
            </div>
          </div>

          {!hasData && (
            <p className="progress-empty-hint">
              📈 需要至少 2 场带发音评测的对话才能绘制曲线。<br />
              多说几场，小T 会在这里等你回顾进步！
            </p>
          )}

          {hasData && (
            <>
              {/* 总分趋势 */}
              <section className="report-section">
                <h4>📈 发音总分趋势</h4>
                <svg viewBox={`0 0 ${w} ${h}`} className="progress-svg">
                  {/* 网格 */}
                  {yTicks().map(v => (
                    <g key={`g-${v}`}>
                      <line x1={pad.left} y1={ys(v)} x2={pad.left + pw} y2={ys(v)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 2" />
                      <text x={pad.left - 8} y={ys(v)} textAnchor="end" dominantBaseline="central" fill="var(--text-muted)" fontSize="10">{v}</text>
                    </g>
                  ))}
                  {/* X 轴标签 */}
                  {sessions.map((s, i) => (
                    <text key={`xl-${i}`} x={xs(i)} y={h - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{shortDate(s.date)}</text>
                  ))}
                  {/* 折线 */}
                  <path d={polylineD('avg_score')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {/* 数据点 */}
                  {sessions.map((s, i) => (
                    <circle key={`dp-${i}`} cx={xs(i)} cy={ys(s.avg_score)} r="4" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />
                  ))}
                </svg>
              </section>

              {/* 三维拆线 */}
              <section className="report-section">
                <h4>📊 发音维度拆解</h4>
                <svg viewBox={`0 0 ${w} ${h}`} className="progress-svg">
                  {yTicks().map(v => (
                    <g key={`gd-${v}`}>
                      <line x1={pad.left} y1={ys(v)} x2={pad.left + pw} y2={ys(v)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 2" />
                      <text x={pad.left - 8} y={ys(v)} textAnchor="end" dominantBaseline="central" fill="var(--text-muted)" fontSize="10">{v}</text>
                    </g>
                  ))}
                  {sessions.map((s, i) => (
                    <text key={`xl2-${i}`} x={xs(i)} y={h - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{shortDate(s.date)}</text>
                  ))}
                  <path d={polylineD('avg_accuracy')} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 2" strokeLinejoin="round" />
                  <path d={polylineD('avg_fluency')} fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="5 2" strokeLinejoin="round" />
                  <path d={polylineD('avg_integrity')} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 2" strokeLinejoin="round" />
                  {sessions.map((s, i) => (
                    <g key={`dp2-${i}`}>
                      <circle cx={xs(i)} cy={ys(s.avg_accuracy)} r="2.5" fill="#3b82f6" />
                      <circle cx={xs(i)} cy={ys(s.avg_fluency)} r="2.5" fill="#22c55e" />
                      <circle cx={xs(i)} cy={ys(s.avg_integrity)} r="2.5" fill="#f59e0b" />
                    </g>
                  ))}
                </svg>
                <div className="radar-legend" style={{ marginTop: 12, justifyContent: 'center' }}>
                  <div className="radar-legend-item"><span className="radar-legend-dot" style={{ background: '#3b82f6' }} /><span className="radar-legend-label">准确度</span></div>
                  <div className="radar-legend-item"><span className="radar-legend-dot" style={{ background: '#22c55e' }} /><span className="radar-legend-label">流利度</span></div>
                  <div className="radar-legend-item"><span className="radar-legend-dot" style={{ background: '#f59e0b' }} /><span className="radar-legend-label">完整度</span></div>
                </div>
              </section>

              {/* 练习量柱状图 */}
              <section className="report-section">
                <h4>🏋️ 每场练习量</h4>
                <svg viewBox={`0 0 ${w} 160`} className="progress-svg">
                  {sessions.map((s, i) => {
                    const barW = Math.max(8, Math.min(40, pw / sessions.length - 10));
                    const barH = Math.max(2, (s.turn_count / Math.max(1, Math.max(...sessions.map(x => x.turn_count)))) * 100);
                    const barX = Number(xs(i)) - barW / 2;
                    return (
                      <g key={`bar-${i}`}>
                        <rect x={barX} y={120 - barH} width={barW} height={barH} rx="2"
                          fill="var(--accent)" fillOpacity={s.turn_count > 0 ? 0.7 : 0.2} />
                        <text x={Number(xs(i))} y={134} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{s.turn_count}</text>
                      </g>
                    );
                  })}
                  {sessions.map((s, i) => (
                    <text key={`bl-${i}`} x={xs(i)} y={152} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{shortDate(s.date)}</text>
                  ))}
                </svg>
              </section>

              {/* 会话列表 */}
              <section className="report-section">
                <h4>📋 历史练习记录</h4>
                <div className="progress-table-wrap">
                  <table className="progress-table">
                    <thead><tr>
                      <th>日期</th><th>场景</th><th>轮次</th><th>均分</th><th>准确度</th><th>流利度</th><th>完整度</th>
                    </tr></thead>
                    <tbody>
                      {[...sessions].reverse().map(s => (
                        <tr key={s.session_id}>
                          <td>{shortDate(s.date)}</td>
                          <td>{sceneEmoji[s.scene] || '❓'} {s.scene}</td>
                          <td>{s.turn_count}</td>
                          <td className="accent">{s.avg_score}</td>
                          <td>{s.avg_accuracy}</td>
                          <td>{s.avg_fluency}</td>
                          <td>{s.avg_integrity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
