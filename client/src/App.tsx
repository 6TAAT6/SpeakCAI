
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket, getWsUrl } from './hooks/useWebSocket.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { TopBar } from './components/TopBar.tsx';
import { BottomBar } from './components/BottomBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { ReportAnalysis } from './components/ReportAnalysis.tsx';
import { ChatView } from './components/ChatView.tsx';
import { ReportView } from './components/ReportView.tsx';
import type { LLMAnalysis, Scene, CorrectionMode } from '@shared/types.ts';
import type { Turn, Theme, FontSize, Session, TurnRow } from './types.ts';

const sceneEmoji: Record<string, string> = { daily: '💬', interview: '💼', ordering: '🍽️', meeting: '📊', travel: '✈️', shopping: '🛍️', hotel: '🏨' };
const modeLabel: Record<string, string> = { immersive: '沉浸', coach: '教练' };

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

/** SQLite datetime('now') 返回 UTC 格式 "YYYY-MM-DD HH:MM:SS"，转为用户本地时间 */
function formatLocalTime(utcStr: string): string {
  const iso = utcStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return utcStr;
  return d.toLocaleString();
}

export function App() {
  const { status, messages, lastMessage } = useWebSocket(getWsUrl());
  const [frameCount, setFrameCount] = useState(0);

  // ---- 对话历史 ----
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionTurns, setSessionTurns] = useState<TurnRow[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** 新建对话：清空右侧回到聊天界面 */
  const handleNewChat = useCallback(() => {
    setSelectedSession(null);
    setSessionTurns([]);
    setHistReportOpen(false);
    setHistReport(null);
    setHistReportError('');
    setReportOpen(false);
    setReport(null);
    setReportError('');
    resetConvoTimer();
    setTurns([]);
    setAiCurrent('');
    aiCurrentRef.current = '';
    setAiStreaming(false);
    setPartialText('');
    setInterrupted(false);
    audioChunksRef.current = [];
    ttsBufferRef.current = null;
    playbackOffsetRef.current = 0;
    stopAudio();
    // 通知后端重置会话上下文，避免新对话带上旧历史
    messagesRef.current.send({ type: 'config_update', payload: { scene, correctionMode } });
  }, []);

  /** 刷新侧边栏历史列表 */
  const refreshSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, []);

  /** 点击历史项 → 加载对话详情 */
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

  /** 历史详情 → 返回聊天 */
  const goBackToChat = useCallback(() => {
    setSelectedSession(null);
    setSessionTurns([]);
    setHistReportOpen(false);
    setHistReport(null);
    setHistReportError('');
  }, []);

  const deleteSelectedSession = useCallback(async () => {
    if (!selectedSession || !confirm('确定删除这条对话记录吗？')) return;
    await fetch(`/api/sessions/${selectedSession}`, { method: 'DELETE' });
    setSelectedSession(null);
    setSessionTurns([]);
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, [selectedSession]);

  const deleteSessionFromList = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm('确定删除这条对话记录吗？')) return;
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    // 如果删除的是当前选中的，回到聊天
    if (selectedSession === sessionId) {
      setSelectedSession(null);
      setSessionTurns([]);
    }
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, [selectedSession]);

  const toggleBatchMode = useCallback(() => {
    setBatchMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllIds = useCallback((allIds: string[]) => {
    setSelectedIds((prev) => prev.size === allIds.length ? new Set() : new Set(allIds));
  }, []);

  const batchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定删除选中的 ${ids.length} 条对话记录吗？`)) return;
    await fetch('/api/sessions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    setSelectedIds(new Set());
    setBatchMode(false);
    // 如果删除的包含当前选中项，回到聊天
    if (selectedSession && ids.includes(selectedSession)) {
      setSelectedSession(null);
      setSessionTurns([]);
    }
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, [selectedIds, selectedSession]);

  // ---- 侧边栏加载历史列表 ----
  useEffect(() => {
    let cancelled = false;
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => { if (!cancelled) setSessions(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ---- 深色模式 ----
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const pickTheme = (t: Theme) => {
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

  // ---- 字体大小 ----
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const stored = localStorage.getItem('fontSize');
    return stored === 'md' || stored === 'lg' ? stored : 'sm';
  });
  const [showSettings, setShowSettings] = useState(false);
  const pickFontSize = (f: FontSize) => {
    document.documentElement.setAttribute('data-font-size', f);
    localStorage.setItem('fontSize', f);
    setFontSize(f);
  };
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize);
  }, [fontSize]);
  useEffect(() => {
    if (!showSettings) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.settings-wrap')) setShowSettings(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showSettings]);

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
  const ttsBufferRef = useRef<Uint8Array | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackStartRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const pausedByUserRef = useRef(false);
  const aiWasActiveRef = useRef(false);
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
    if (histReport) return;
    if (!selectedSession) return;
    setHistReportLoading(true);
    setHistReportError('');
    try {
      const r = await fetch(`/api/sessions/${selectedSession}/report`);
      if (r.ok) {
        setHistReport(await r.json());
        return;
      }
      if (r.status !== 404) {
        const e = await r.json().catch(() => ({ error: '读取失败' }));
        setHistReportError(e.error || '读取失败');
        return;
      }
      const sess = sessions.find(s => s.session_id === selectedSession);
      if (!sess || sessionTurns.length === 0) {
        setHistReportError('暂无对话数据，无法生成报告');
        return;
      }
      const genR = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession,
          turns: sessionTurns.map(t => ({ role: t.role === 'assistant' ? 'ai' : 'user', text: t.text })),
          scene: sess.scene,
          mode: sess.mode,
        }),
      });
      if (!genR.ok) {
        const e = await genR.json().catch(() => ({ error: '报告生成失败' }));
        setHistReportError(e.error || '报告生成失败');
        return;
      }
      const analysis = await genR.json();
      setHistReport(analysis);
      setSessions(prev => prev.map(s => s.session_id === selectedSession ? { ...s, has_report: 1 } : s));
    } catch {
      setHistReportError('网络错误');
    } finally {
      setHistReportLoading(false);
    }
  }, [histReportOpen, histReport, selectedSession, sessions, sessionTurns]);

  const resetConvoTimer = useCallback(() => setConvoStartTime(Date.now()), []);

  const stopAudio = useCallback((paused = false) => {
    if (paused && activeSourceRef.current && audioCtxRef.current) {
      playbackOffsetRef.current += audioCtxRef.current.currentTime - playbackStartRef.current;
      pausedByUserRef.current = true;
    }
    try { activeSourceRef.current?.stop(); } catch { /* noop */ }
    activeSourceRef.current = null;
    if (!paused) {
      audioChunksRef.current = [];
      ttsBufferRef.current = null;
      playbackOffsetRef.current = 0;
    }
  }, []);

  // ---- 场景 + 纠错模式 ----
  const [scene, setScene] = useState<Scene>('daily');
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>('coach');

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

  const playPCM = useCallback((pcmData: Uint8Array, offsetSeconds = 0) => {
    try { activeSourceRef.current?.stop(); } catch { /* noop */ }
    activeSourceRef.current = null;
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
    playbackStartRef.current = ctx.currentTime;
    source.onended = () => {
      if (pausedByUserRef.current) {
        pausedByUserRef.current = false;
        return;
      }
      activeSourceRef.current = null;
      playbackOffsetRef.current = 0;
      ttsBufferRef.current = null;
      setTtsPlaying(false);
      messagesRef.current.send({ type: 'tts_playback_done' });
    };
    source.start(0, offsetSeconds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 自动滚动 ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, aiCurrent]);

  // ---- 消息处理 ----
  useEffect(() => {
    if (!lastMessage) return;
    switch (lastMessage.type) {
      case 'connected':
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
        const text = lastMessage.text?.trim() || aiCurrentRef.current.trim();
        if (text) {
          setTurns((prev) => [...prev, { role: 'ai', text }]);
          aiCurrentRef.current = '';
          setAiCurrent('');
        }
        setAiStreaming(false);
        setInterrupted(false);
        break;
      }
      case 'llm_translation':
        setTurns((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'ai') {
              const copy = [...prev];
              copy[i] = {
                ...copy[i],
                translation: lastMessage.translation,
                tips: lastMessage.tips,
                tryAgain: lastMessage.tryAgain,
              };
              return copy;
            }
          }
          return prev;
        });
        break;
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
          ttsBufferRef.current = merged;
          playPCM(merged);
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
      if (ttsBufferRef.current) {
        playPCM(ttsBufferRef.current, playbackOffsetRef.current);
        setTtsPlaying(true);
      } else if (aiWasActiveRef.current) {
        messages.send({ type: 'resume' });
        setAiStreaming(true);
        setAiCurrent('');
        aiCurrentRef.current = '';
      }
      setInterrupted(false);
      aiWasActiveRef.current = false;
    } else {
      const aiWasActive = aiStreaming || Boolean(aiCurrentRef.current) || ttsPlaying;
      aiWasActiveRef.current = aiWasActive;
      messages.send({ type: 'interrupt' });
      setAiStreaming(false);
      setTtsPlaying(false);
      setInterrupted(true);
      stopAudio(true);
      refreshSessions();
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
      // 停止后再开始：保留已有对话内容，仅重置临时状态
      setReportOpen(false);
      setReport(null);
      setAiStreaming(false);
      setPartialText('');
      setInterrupted(false);
      audioChunksRef.current = [];
      ttsBufferRef.current = null;
      playbackOffsetRef.current = 0;
      await start();
    }
  }, [isRecording, start, stop]);

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
        body: JSON.stringify({ sessionId: undefined, turns, scene, mode: correctionMode }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: '报告生成失败' }));
        setReportError(err.error || '报告生成失败');
        return;
      }
      setReport(await r.json());
      refreshSessions();
    } catch {
      setReportError('网络错误，请重试');
    } finally {
      setReportLoading(false);
    }
  }, [reportOpen, turns, scene, correctionMode, refreshSessions]);

  const wsReady = status === 'connected';
  const hasConv = turns.length > 0 || partialText || aiCurrent || aiStreaming;

  // 选中的历史项是否有报告
  const selectedHasReport = sessions.find(s => s.session_id === selectedSession)?.has_report;

  return (
    <div className="app">
      <div className="app-layout">
        {/* ---- 侧边栏 ---- */}
        <Sidebar
          sessions={sessions}
          selectedSession={selectedSession}
          batchMode={batchMode}
          selectedIds={selectedIds}
          scene={scene}
          correctionMode={correctionMode}
          onNewChat={handleNewChat}
          onSelectSession={viewSession}
          onDeleteSession={deleteSessionFromList}
          onToggleBatchMode={toggleBatchMode}
          onToggleSelectId={toggleSelectId}
          onSelectAllIds={selectAllIds}
          onBatchDelete={batchDelete}
        />

        {/* ---- 右侧主面板 ---- */}
        <div className="main-panel">
          <TopBar
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            fontSize={fontSize}
            pickFontSize={pickFontSize}
            theme={theme}
            pickTheme={pickTheme}
            scene={scene}
            correctionMode={correctionMode}
            updateConfig={updateConfig}
            statusEmoji={statusIndicator.emoji}
            statusText={statusIndicator.text}
            statusColor={statusIndicator.color}
          />

          <main className="chat-area">
            {/* ---- 历史对话详情 ---- */}
            {selectedSession && (
              <div className="history-detail">
                <div className="history-detail-bar">
                  <button onClick={goBackToChat} className="ctrl-btn">← 返回对话</button>
                  <button onClick={toggleHistReport} className="ctrl-btn" disabled={histReportLoading}>
                    {histReportOpen ? '💬 对话记录' : selectedHasReport ? '📊 学习报告' : '🧠 生成报告'}
                  </button>
                  <button onClick={deleteSelectedSession} className="ctrl-btn" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginLeft: 'auto' }}>
                    🗑 删除
                  </button>
                </div>

                {histReportOpen ? (
                  <div className="report-panel">
                    {histReportLoading && <p className="placeholder" style={{ marginTop: '10%' }}>📊 小T 正在整理报告...</p>}
                    {histReportError && <p className="error-message">{histReportError}</p>}
                    {histReport && <ReportAnalysis analysis={histReport} />}
                  </div>
                ) : (
                  <div className="history-detail-turns">
                    {sessionTurns.map((t) => (
                      <div key={t.id} className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`} style={{ maxWidth: '100%' }}>
                        <div className="bubble-header">
                          <span className="bubble-label">{t.role === 'user' ? 'You' : '🤖 AI'}</span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatLocalTime(t.created_at)}</span>
                        </div>
                        <p>{t.text}</p>
                      </div>
                    ))}
                    {sessionTurns.length === 0 && <p className="placeholder" style={{ marginTop: '10%' }}>该会话暂无对话记录</p>}
                  </div>
                )}
              </div>
            )}

            {/* ---- 当前对话 / 报告 ---- */}
            {!selectedSession && (<>
              {reportOpen ? (
                <ReportView
                  turns={turns}
                  report={report}
                  reportLoading={reportLoading}
                  reportError={reportError}
                  convoStartTime={convoStartTime}
                  scene={scene}
                  correctionMode={correctionMode}
                  sceneEmoji={sceneEmoji}
                  modeLabel={modeLabel}
                  onClose={() => setReportOpen(false)}
                  onRegenerate={toggleReport}
                />
              ) : (
                <ChatView
                  turns={turns}
                  partialText={partialText}
                  aiCurrent={aiCurrent}
                  aiStreaming={aiStreaming}
                  hasConv={Boolean(hasConv)}
                  isRecording={isRecording}
                  wsReady={wsReady}
                  captureError={captureError}
                  chatEndRef={chatEndRef}
                />
              )}
            </>)}
          </main>

          {/* 底栏：仅聊天模式下显示 */}
          {!selectedSession && (
            <BottomBar
              isRecording={isRecording}
              frameCount={frameCount}
              wsReady={wsReady}
              turnsLen={turns.length}
              reportOpen={reportOpen}
              showInterrupt={turns.length > 0 || Boolean(aiCurrent) || aiStreaming || ttsPlaying || interrupted}
              interrupted={interrupted}
              handleRecordToggle={handleRecordToggle}
              toggleReport={toggleReport}
              handleInterruptToggle={handleInterruptToggle}
            />
          )}
        </div>
      </div>
    </div>
  );
}
