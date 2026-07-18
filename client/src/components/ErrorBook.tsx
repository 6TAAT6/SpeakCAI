import { useState, useEffect, useCallback } from 'react';

interface ErrorBookEntry {
  phoneme: string;
  count: number;
  avgScore: number;
  lowestScore: number;
  exampleTexts: string[];
  lastSeen: string;
}

interface Props {
  onClose: () => void;
}

/** SQLite datetime('now') UTC 转本地时间 */
function formatLocal(utcStr: string): string {
  const iso = utcStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return utcStr;
  return d.toLocaleDateString();
}

function scoreBar(fraction: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(fraction)));
  return `${pct}%`;
}

export function ErrorBook({ onClose }: Props) {
  const [entries, setEntries] = useState<ErrorBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'count' | 'avgScore' | 'recent'>('count');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/error-book');
      if (!r.ok) { setError('加载失败'); return; }
      setEntries(await r.json());
    } catch { setError('网络错误'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'count': return b.count - a.count;
      case 'avgScore': return a.avgScore - b.avgScore;
      case 'recent': return b.lastSeen.localeCompare(a.lastSeen);
    }
  });

  const toggleExpand = (phoneme: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(phoneme)) next.delete(phoneme);
      else next.add(phoneme);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="report-loading-hero">
        <div className="report-loading-avatar">(¯▿¯)</div>
        <p className="report-loading-text">加载错题本...</p>
      </div>
    );
  }

  return (
    <div className="errorbook-panel">
      <div className="errorbook-header">
        <h3>📖 弱音素错题本</h3>
        <button onClick={onClose} className="ctrl-btn">← 返回</button>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="errorbook-toolbar">
        <span className="errorbook-count">{entries.length} 个弱音素</span>
        <div className="errorbook-sort">
          <button className={`sort-btn${sortBy === 'count' ? ' active' : ''}`} onClick={() => setSortBy('count')}>频率</button>
          <button className={`sort-btn${sortBy === 'avgScore' ? ' active' : ''}`} onClick={() => setSortBy('avgScore')}>低分</button>
          <button className={`sort-btn${sortBy === 'recent' ? ' active' : ''}`} onClick={() => setSortBy('recent')}>最近</button>
        </div>
      </div>

      {sorted.length === 0 && !loading && (
        <div className="errorbook-empty">
          <div className="errorbook-empty-icon">🎉</div>
          <p className="errorbook-empty-text">暂无弱音素数据</p>
          <p className="errorbook-empty-hint">开始对话并完成发音评测后，薄弱音素会自动记录在这里</p>
        </div>
      )}

      <div className="errorbook-list">
        {sorted.map(entry => {
          const isOpen = expanded.has(entry.phoneme);
          const severityClass = entry.avgScore < 50 ? 'severity-high' : entry.avgScore < 70 ? 'severity-mid' : 'severity-low';
          return (
            <div key={entry.phoneme} className={`errorbook-card ${severityClass}`} onClick={() => toggleExpand(entry.phoneme)}>
              <div className="errorbook-card-main">
                <div className="errorbook-phoneme">/{entry.phoneme}/</div>
                <div className="errorbook-card-stats">
                  <div className="errorbook-stat">
                    <span className="stat-label">出现次数</span>
                    <span className="stat-value">{entry.count}</span>
                  </div>
                  <div className="errorbook-stat">
                    <span className="stat-label">平均分</span>
                    <span className={`stat-value ${entry.avgScore < 60 ? 'accent-red' : ''}`}>{entry.avgScore}</span>
                  </div>
                  <div className="errorbook-stat">
                    <span className="stat-label">最低分</span>
                    <span className="stat-value accent-red">{entry.lowestScore}</span>
                  </div>
                  <div className="errorbook-stat">
                    <span className="stat-label">最近出现</span>
                    <span className="stat-value small">{formatLocal(entry.lastSeen)}</span>
                  </div>
                </div>
                <div className="errorbook-progress-wrap">
                  <div className="errorbook-progress-bar">
                    <div className="errorbook-progress-fill" style={{ width: scoreBar(entry.avgScore) }} />
                  </div>
                </div>
                <span className="errorbook-expand-icon">{isOpen ? '▾' : '▸'}</span>
              </div>
              {isOpen && (
                <div className="errorbook-card-detail">
                  <div className="errorbook-examples">
                    <span className="examples-label">例句：</span>
                    {entry.exampleTexts.map((t, i) => (
                      <span key={i} className="example-text">"{t}"</span>
                    ))}
                  </div>
                  <div className="errorbook-practice-tip">
                    💡 建议：多练习包含 /{entry.phoneme}/ 音的单词，注意对比标准发音
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
