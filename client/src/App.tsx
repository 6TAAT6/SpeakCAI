import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket, getWsUrl } from './hooks/useWebSocket.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { TIPS_STRIP_RE } from '@shared/types.ts';
import type { LLMAnalysis } from '@shared/types.ts';

interface Turn { role: 'user' | 'ai'; text: string; score?: number; accuracy?: number; fluency?: number; integrity?: number; weakPhones?: string[]; tips?: string; tryAgain?: string }

type Theme = 'auto' | 'dark' | 'light';

const sceneEmoji: Record<string, string> = { interview: '💼', ordering: '🍽️', meeting: '📊' };
const modeEmoji: Record<string, string> = { immersive: '🌊', coach: '教练', strict: '📏' };
const modeLabel: Record<string, string> = { immersive: '沉浸', coach: '教练', strict: '严师' };

/** LLM 定性分析渲染组件，聊天报告和历史详情复用 */
function ReportAnalysis({ analysis }: { analysis: LLMAnalysis }) {
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

function loadTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  return 'auto';
}

function applyTheme(theme: Theme): Theme {
  const effective = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', effective);
  return theme;
}

export function App() {
  const { status, messages, lastMessage } = useWebSocket(getWsUrl());
  const [frameCount, setFrameCount] = useState(0);

  // ---- 页面视图 ----
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ---- 对话历史 ----
  interface Session { session_id: string; scene: string; mode: string; created_at: string; ended_at: string | null; report_json?: string; has_report?: number }
  interface TurnRow { id: number; session_id: string; role: string; text: string; created_at: string }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionTurns, setSessionTurns] = useState<TurnRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = useCallback(async () => {
    setView('history');
    setHistoryLoading(true);
    try {
      const r = await fetch('/api/sessions');
      const data = await r.json();
      setSessions(data); // 后端已过滤空会话
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  const viewSession = useCallback(async (sessionId: string) => {
    setSelectedSession(sessionId);
    setHistReportOpen(false);
    setHistReport(null);
    setHistReportError('');
    try {
      const r = await fetch(`/api/sessions/${sessionId}/turns`);
      const data = await r.json();
      setSessionTurns(data);
    } catch { /* ignore */ }
  }, []);

  const deleteSelectedSession = useCallback(async () => {
    if (!selectedSession || !confirm('确定删除这条对话记录吗？')) return;
    await fetch(`/api/sessions/${selectedSession}`, { method: 'DELETE' });
    setSelectedSession(null);
    setSessionTurns([]);
    // 刷新列表
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, [selectedSession]);

  const deleteSessionFromList = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm('确定删除这条对话记录吗？')) return;
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, []);

  // ---- 深色模式 ----
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const cycleTheme = () => {
    const next: Record<Theme, Theme> = { auto: 'dark', dark: 'light', light: 'auto' };
    const t = next[theme];
    localStorage.setItem('theme', t);
    setTheme(applyTheme(t));
  };
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme === 'auto') setTheme(applyTheme('auto')); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ---- 对话时间线 ----
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partialText, setPartialText] = useState('');
  const [aiCurrent, setAiCurrent] = useState('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [interrupted, setInterrupted] = useState(false);

  // ---- TTS 音频状态 ----
  const audioChunksRef = useRef<Uint8Array[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const aiCurrentRef = useRef('');
  const [ttsPlaying, setTtsPlaying] = useState(false);

  // ---- 学习报告 ----
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<LLMAnalysis | null>(null);
  const [reportError, setReportError] = useState('');
  const [convoStartTime, setConvoStartTime] = useState(() => Date.now());

  // ---- 历史报告查看 ----
  const [histReportOpen, setHistReportOpen] = useState(false);
  const [histReportLoading, setHistReportLoading] = useState(false);
  const [histReport, setHistReport] = useState<LLMAnalysis | null>(null);
  const [histReportError, setHistReportError] = useState('');

  const toggleHistReport = useCallback(async () => {
    if (histReportOpen) { setHistReportOpen(false); return; }
    setHistReportOpen(true);
    if (histReport) return; // already loaded
    if (!selectedSession) return;
    setHistReportLoading(true);
    setHistReportError('');
    try {
      const r = await fetch(`/api/sessions/${selectedSession}/report`);
      if (!r.ok) {
        if (r.status === 404) { setHistReportError('该会话尚未生成报告，请在对话中点击 📊 按钮生成'); return; }
        const e = await r.json().catch(() => ({ error: '读取失败' }));
        setHistReportError(e.error || '读取失败');
        return;
      }
      setHistReport(await r.json());
    } catch {
      setHistReportError('网络错误');
    } finally {
      setHistReportLoading(false);
    }
  }, [histReportOpen, histReport, selectedSession]);

  const resetConvoTimer = useCallback(() => setConvoStartTime(Date.now()), []);

  const stopAudio = useCallback(() => {
    try { activeSourceRef.current?.stop(); } catch { /* noop */ }
    activeSourceRef.current = null;
    audioChunksRef.current = [];
  }, []);

  // ---- 场景 + 纠错模式 ----
  const [scene, setScene] = useState<'interview' | 'ordering' | 'meeting'>('interview');
  const [correctionMode, setCorrectionMode] = useState<'immersive' | 'coach' | 'strict'>('coach');

  const updateConfig = useCallback((s: typeof scene, m: typeof correctionMode) => {
    setScene(s);
    setCorrectionMode(m);
    messagesRef.current.send({ type: 'config_update', payload: { scene: s, correctionMode: m } });
    setTurns([]);
    setAiCurrent('');
    aiCurrentRef.current = '';
    setAiStreaming(false);
    setPartialText('');
    setInterrupted(false);
    setTtsPlaying(false);
    stopAudio();
  }, [stopAudio]);

  const playPCM = useCallback((pcmData: Uint8Array) => {
    stopAudio();
    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;
    const samples = new Int16Array(pcmData.buffer);
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) float32[i] = samples[i] / 32768;
    const buffer = ctx.createBuffer(1, samples.length, 16000);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    activeSourceRef.current = source;
    source.onended = () => { activeSourceRef.current = null; };
    source.start();
  }, [stopAudio]);

  // ---- 自动滚动 ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, aiCurrent]);

  // ---- 消息处理 ----
  useEffect(() => {
    if (!lastMessage) return;
    switch (lastMessage.type) {
      case 'connected':
        setSessionId(lastMessage.sessionId);
        break;
      case 'asr_partial':
        setPartialText(lastMessage.text);
        break;
      case 'asr_final': {
        const text = lastMessage.text;
        if (text) {
          setPartialText('');
          setTurns((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].role === 'user' && prev[prev.length - 1].text === text) return prev;
            return [...prev, { role: 'user', text }];
          });
        }
        break;
      }
      case 'llm_stream':
        setAiStreaming(true);
        aiCurrentRef.current += lastMessage.text;
        setAiCurrent(aiCurrentRef.current);
        break;
      case 'llm_done': {
        const text = aiCurrentRef.current;
        if (text) {
          const display = text.replace(TIPS_STRIP_RE, '').trim();
          setTurns((prev) => [...prev, {
            role: 'ai', text: display,
            tips: lastMessage.tips,
            tryAgain: lastMessage.tryAgain,
          }]);
          aiCurrentRef.current = '';
          setAiCurrent('');
        }
        setAiStreaming(false);
        setInterrupted(false);
        break;
      }
      case 'pronounce_result':
        setTurns((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'user') {
              const copy = [...prev];
              copy[i] = {
                ...copy[i],
                score: lastMessage.totalScore,
                accuracy: lastMessage.accuracyScore,
                fluency: lastMessage.fluencyScore,
                integrity: lastMessage.integrityScore,
                weakPhones: lastMessage.weakPhones,
              };
              return copy;
            }
          }
          return prev;
        });
        break;
      case 'tts_audio':
        setTtsPlaying(true);
        if (lastMessage.chunkIndex === 0) {
          audioChunksRef.current = [];
          stopAudio();
        }
        audioChunksRef.current.push(
          new Uint8Array(atob(lastMessage.data).split('').map((c) => c.charCodeAt(0))),
        );
        break;
      case 'tts_done': {
        const chunks = audioChunksRef.current;
        if (chunks.length > 0) {
          const totalLen = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunks) { merged.set(c, offset); offset += c.length; }
          audioChunksRef.current = [];
          playPCM(merged);
          setTimeout(() => setTtsPlaying(false), (merged.byteLength / 2) / 16000 * 1000);
        }
        break;
      }
    }
  }, [lastMessage, playPCM, stopAudio]);

  // ---- 状态指示器 ----
  const statusIndicator = useMemo(() => {
    switch (status) {
      case 'connecting': return { emoji: '🟡', text: '连接中...', color: '#c6901a' };
      case 'connected':  return { emoji: '🟢', text: '已就绪',   color: '#1a8c4a' };
      case 'disconnected': return { emoji: '🔴', text: '已断连', color: '#b02828' };
      case 'error':      return { emoji: '⚠️', text: '连接错误', color: '#b02828' };
    }
  }, [status]);

  // ---- 打断/继续 ----
  const handleInterruptToggle = () => {
    if (interrupted) {
      messages.send({ type: 'resume' });
      setInterrupted(false);
      setAiStreaming(true);
      setAiCurrent('');
      aiCurrentRef.current = '';
    } else {
      messages.send({ type: 'interrupt' });
      setAiStreaming(false);
      setTtsPlaying(false);
      setInterrupted(true);
      stopAudio();
    }
  };

  // ---- 音频采集 ----
  const { start, stop, isRecording, error: captureError } = useAudioCapture({
    onAudioFrame: (frame) => {
      messagesRef.current.send({ type: 'audio_frame', data: Array.from(frame.data), seq: frame.seq });
      setFrameCount((c) => c + 1);
    },
  });

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      messagesRef.current.send({ type: 'interrupt' });
      stop();
      setFrameCount(0);
      setPartialText('');
    } else {
      setReportOpen(false);
      setReport(null);
      resetConvoTimer();
      setTurns([]);
      setAiCurrent('');
      aiCurrentRef.current = '';
      setAiStreaming(false);
      setPartialText('');
      setInterrupted(false);
      audioChunksRef.current = [];
      await start();
    }
  }, [isRecording, start, stop, resetConvoTimer]);

  const toggleReport = useCallback(async () => {
    if (reportOpen) { setReportOpen(false); return; }
    setReportOpen(true);
    setReportLoading(true);
    setReportError('');
    setReport(null);
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, turns, scene, mode: correctionMode }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: '报告生成失败' }));
        setReportError(err.error || '报告生成失败');
        return;
      }
      setReport(await r.json());
    } catch {
      setReportError('网络错误，请重试');
    } finally {
      setReportLoading(false);
    }
  }, [reportOpen, sessionId, turns, scene, correctionMode]);

  const wsReady = status === 'connected';
  const hasConv = turns.length > 0 || partialText || aiCurrent || aiStreaming;

  return (
    <div className="app">
      <header className="top-bar">
        <span className="brand">SpeakCAI</span>
        <div className="config-selectors">
          <button onClick={openHistory} className="theme-btn" title="历史记录">
            📋
          </button>
          <button onClick={cycleTheme} className="theme-btn" title={`主题: ${theme}`}>
            {theme === 'auto' ? '🌓' : theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <select value={scene} onChange={(e) => updateConfig(e.target.value as typeof scene, correctionMode)} className="mini-select">
            <option value="interview">💼 面试</option>
            <option value="ordering">🍽️ 点餐</option>
            <option value="meeting">📊 会议</option>
          </select>
          <select value={correctionMode} onChange={(e) => updateConfig(scene, e.target.value as typeof correctionMode)} className="mini-select">
            <option value="immersive">🌊 沉浸</option>
            <option value="coach">🎯 教练</option>
            <option value="strict">📏 严师</option>
          </select>
        </div>
        <span className="status-badge" style={{ color: statusIndicator.color }}>
          {statusIndicator.emoji} {statusIndicator.text}
        </span>
      </header>

      <main className="chat-area">
        {view === 'history' ? (
          <div className="history-panel">
            {historyLoading ? (
              <p className="placeholder" style={{ marginTop: '20%' }}>加载中...</p>
            ) : selectedSession ? (
              <div className="history-turns">
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => { setSelectedSession(null); setSessionTurns([]); setHistReportOpen(false); setHistReport(null); }} className="ctrl-btn">← 返回</button>
                  <button onClick={toggleHistReport} className="ctrl-btn" disabled={histReportLoading}>
                    {histReportOpen ? '💬 对话' : '📊 学习报告'}
                  </button>
                  <button onClick={deleteSelectedSession} className="ctrl-btn" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginLeft: 'auto' }}>🗑 删除</button>
                </div>
                {histReportOpen ? (
                  <div className="report-panel">
                    {histReportLoading && <p className="placeholder" style={{ marginTop: '20%' }}>加载报告中...</p>}
                    {histReportError && <p className="error-message">{histReportError}</p>}
                    {histReport && <ReportAnalysis analysis={histReport} />}
                  </div>
                ) : (<>
                {sessionTurns.map((t) => (
                  <div key={t.id} className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`} style={{ maxWidth: '100%' }}>
                    <div className="bubble-header">
                      <span className="bubble-label">{t.role === 'user' ? 'You' : '🤖 AI'}</span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{t.created_at}</span>
                    </div>
                    <p>{t.text}</p>
                  </div>
                ))}
                {sessionTurns.length === 0 && <p className="placeholder" style={{ marginTop: '20%' }}>该会话暂无对话记录</p>}
                </>)}
              </div>
            ) : (
              <div className="history-list">
                <div className="history-header">
                  <button onClick={() => { setView('chat'); setSelectedSession(null); }} className="ctrl-btn">← 返回</button>
                  <h3>对话历史</h3>
                </div>
                {sessions.length === 0 ? (
                  <p className="placeholder" style={{ marginTop: '20%' }}>暂无对话历史，开始一次对话吧</p>
                ) : (
                  sessions.map((s) => (
                    <div key={s.session_id} className="history-item" onClick={() => viewSession(s.session_id)}>
                      <div className="history-item-top">
                        <span className="history-scene">{sceneEmoji[s.scene] || '❓'} {s.scene}</span>
                        <span className="history-mode">{modeEmoji[s.mode] || '❓'} {s.mode}</span>
                        {s.has_report ? <span style={{ fontSize: '0.7rem' }} title="已有学习报告">📊</span> : null}
                        <span className="history-date" style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.created_at.slice(0, 16).replace('T', ' ')}</span>
                        <button onClick={(e) => deleteSessionFromList(e, s.session_id)} className="theme-btn" style={{ fontSize: '0.75rem', width: 24, height: 24 }} title="删除">🗑</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (<>
          {reportOpen ? (
            /* ---- 学习报告面板 ---- */
            <div className="report-panel">
              <div className="report-header-bar">
                <button onClick={() => setReportOpen(false)} className="ctrl-btn">← 返回对话</button>
                <button onClick={toggleReport} className="ctrl-btn" disabled={reportLoading}>🔄 重新生成</button>
              </div>

              {reportLoading && <p className="placeholder" style={{ marginTop: '20%' }}>🧠 AI 正在分析对话...</p>}
              {reportError && <p className="error-message">{reportError}</p>}

              {report && (
                <div className="report-content">
                  {/* 量化摘要 */}
                  <div className="report-quant-section">
                    <div className="report-stat-grid">
                      <div className="report-stat-card">
                        <div className="report-stat-label">练习轮次</div>
                        <div className="report-stat-value">{turns.filter(t => t.role === 'user').length}</div>
                      </div>
                      <div className="report-stat-card">
                        <div className="report-stat-label">平均发音</div>
                        <div className="report-stat-value accent">
                          {(() => {
                            const scores = turns.filter(t => t.score !== undefined).map(t => t.score!);
                            return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '-';
                          })()}分
                        </div>
                      </div>
                      <div className="report-stat-card">
                        <div className="report-stat-label">练习时长</div>
                        <div className="report-stat-value">{Math.round((Date.now() - convoStartTime) / 60000)}分</div>
                      </div>
                      <div className="report-stat-card">
                        <div className="report-stat-label">场景 / 模式</div>
                        <div className="report-stat-value small">{sceneEmoji[scene] || '❓'} {modeLabel[correctionMode] || correctionMode}</div>
                      </div>
                    </div>
                  </div>

                  {/* 发音分数曲线 */}
                  <section className="report-section">
                    <h4>📈 发音分数趋势</h4>
                    {(() => {
                      const userTurns = turns.filter(t => t.role === 'user' && t.score !== undefined);
                      if (userTurns.length === 0) return <p className="report-empty">暂无发音数据</p>;
                      return (
                        <div className="report-bar-chart">
                          {userTurns.map((t, i) => (
                            <div key={i} className="report-bar-col" title={`第${i + 1}轮: ${t.score}分`}>
                              <div className="report-bar-fill" style={{ height: `${Math.min((t.score || 0), 100)}%` }} />
                              <span className="report-bar-label">#{i + 1}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </section>

                  {/* 能力雷达图 */}
                  <section className="report-section">
                    <h4>🎯 能力雷达图</h4>
                    {(() => {
                      const userTurns = turns.filter(t => t.role === 'user' && t.score !== undefined);
                      if (userTurns.length === 0) return <p className="report-empty">暂无发音数据</p>;
                      const avg = (k: 'accuracy' | 'fluency' | 'integrity') => {
                        const vals = userTurns.map(t => t[k] ?? 0).filter(v => v > 0);
                        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                      };
                      const a = Math.min(avg('accuracy') / 100, 1);
                      const f = Math.min(avg('fluency') / 100, 1);
                      const i = Math.min(avg('integrity') / 100, 1);
                      const total = Math.min((userTurns.reduce((s, t) => s + (t.score ?? 0), 0) / userTurns.length) / 100, 1);
                      const r = 50, cx = 60, cy = 60;
                      const px = (val: number, angle: number) => `${cx + Math.cos(angle) * r * val},${cy - Math.sin(angle) * r * val}`;
                      const pts = [
                        px(a, Math.PI / 2),         // 准确度  ↑
                        px(f, -Math.PI / 6),        // 流利度  ↗
                        px(i, -5 * Math.PI / 6),    // 完整度  ↙
                        px(total, 7 * Math.PI / 6),  // 总分    ↖
                      ].join(' ');
                      return (
                        <div className="report-radar">
                          <svg viewBox="0 0 120 120" className="radar-svg">
                            {/* 网格 */}
                            {[0.25, 0.5, 0.75, 1].map(s => (
                              <polygon key={s} points={
                                [Math.PI / 2, -Math.PI / 6, -5 * Math.PI / 6, 7 * Math.PI / 6]
                                  .map(a => `${cx + Math.cos(a) * r * s},${cy - Math.sin(a) * r * s}`).join(' ')
                              } fill="none" stroke="var(--border)" strokeWidth="0.5" />
                            ))}
                            {/* 轴线 */}
                            {[Math.PI / 2, -Math.PI / 6, -5 * Math.PI / 6, 7 * Math.PI / 6].map(a => (
                              <line key={a} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy - Math.sin(a) * r} stroke="var(--border)" strokeWidth="0.5" />
                            ))}
                            {/* 数据 */}
                            <polygon points={pts} fill="var(--accent)" fillOpacity="0.25" stroke="var(--accent)" strokeWidth="1.5" />
                          </svg>
                          <div className="radar-labels">
                            <span style={{ color: 'var(--accent)' }}>准确度 {Math.round(avg('accuracy'))}</span>
                            <span style={{ color: 'var(--success)' }}>流利度 {Math.round(avg('fluency'))}</span>
                            <span style={{ color: 'var(--warning)' }}>完整度 {Math.round(avg('integrity'))}</span>
                            <span>总分 {Math.round(userTurns.reduce((s, t) => s + (t.score ?? 0), 0) / userTurns.length)}</span>
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
                      turns.forEach(t => {
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

                  <ReportAnalysis analysis={report} />
                </div>
              )}
            </div>
          ) : (<>
          {!hasConv && !isRecording && !captureError && (
            <p className="placeholder">{wsReady ? '点击底部按钮开始录音对话' : '正在建立连接...'}</p>
          )}
          {captureError && <p className="error-message">{captureError}</p>}

          {/* 已完成对话 — 按时间线交替显示 */}
          {turns.map((t, i) => (
            <div key={i}>
              <div className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
                <div className="bubble-header">
                  <span className="bubble-label">{t.role === 'user' ? 'You' : '🤖 AI'}</span>
                  {t.score !== undefined && (
                    <span className="pronounce-score" title={`准确:${t.accuracy} 流利:${t.fluency}`}>
                      {t.score}分
                    </span>
                  )}
                </div>
                <p>{t.text}</p>
              </div>
              {/* 纠错提示卡片 */}
              {t.tips && (
                <div className="correction-card">
                  <div className="correction-header">💡 Tips</div>
                  <p>{t.tips}</p>
                  {t.tryAgain && (
                    <div className="try-again">
                      🔁 {t.tryAgain}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 当前正在说的 partial */}
          {partialText && (
            <div className="bubble user-bubble partial">
              <span className="bubble-label">You</span>
              <p>{partialText}</p>
            </div>
          )}

          {/* AI 流式输出中 */}
          {(aiCurrent || aiStreaming) && (
            <div className="bubble ai-bubble">
              <div className="bubble-header">
                <span className="bubble-label">🤖 AI</span>
                {aiStreaming && <span className="streaming-dot" />}
              </div>
              <p>{aiCurrent || '...'}</p>
            </div>
          )}

          <div ref={chatEndRef} />
          </>)}
        </>)}
      </main>

      {view === 'chat' && (
        <footer className="bottom-bar">
          {isRecording && (
            <span className="record-timer">● {frameCount > 0 ? Math.round((frameCount * 256) / 1000) : 0}s</span>
          )}
          <button onClick={handleRecordToggle} disabled={!wsReady} className={`record-btn ${isRecording ? 'recording' : ''}`}>
            {isRecording ? '⏹ 停止' : '🎤 开始对话'}
          </button>
          {turns.length > 0 && (
          <button onClick={toggleReport} className={`ctrl-btn ${reportOpen ? 'active' : ''}`}>
            {reportOpen ? '💬 对话' : '📊 报告'}
          </button>
          )}
          {(turns.length > 0 || aiCurrent || aiStreaming || ttsPlaying || interrupted) && (
          <button onClick={handleInterruptToggle} className="ctrl-btn">
            {interrupted ? '▶ 继续' : '⏹ 打断'}
          </button>
          )}
        </footer>
      )}
    </div>
  );
}
