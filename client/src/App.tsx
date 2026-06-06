import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket, getWsUrl } from './hooks/useWebSocket.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { TopBar } from './components/TopBar.tsx';
import { BottomBar } from './components/BottomBar.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { ReportView } from './components/ReportView.tsx';
import { ChatView } from './components/ChatView.tsx';
import type { LLMAnalysis, Scene, CorrectionMode } from '@shared/types.ts';
import type { Turn, Theme, FontSize, Session, TurnRow } from './types.ts';

const sceneEmoji: Record<string, string> = { daily: '💬', interview: '💼', ordering: '🍽️', meeting: '📊', travel: '✈️', shopping: '🛍️', hotel: '🏨' };
const modeEmoji: Record<string, string> = { immersive: '🌊', coach: '🎯' };
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

export function App() {
  const { status, messages, lastMessage } = useWebSocket(getWsUrl());
  const [frameCount, setFrameCount] = useState(0);

  // ---- 页面视图 ----
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ---- 对话历史 ----
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionTurns, setSessionTurns] = useState<TurnRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    try {
      const r = await fetch('/api/sessions');
      setSessions(await r.json());
    } catch { /* ignore */ }
  }, [selectedIds]);

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

  // ---- 字体大小 ----
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const stored = localStorage.getItem('fontSize');
    return stored === 'md' || stored === 'lg' ? stored : 'sm';
  });
  const [showFontMenu, setShowFontMenu] = useState(false);
  const pickFontSize = (f: FontSize) => {
    document.documentElement.setAttribute('data-font-size', f);
    localStorage.setItem('fontSize', f);
    setFontSize(f);
    setShowFontMenu(false);
  };
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize);
  }, [fontSize]);
  useEffect(() => {
    if (!showFontMenu) return;
    const close = () => setShowFontMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showFontMenu]);

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
  const playbackStartRef = useRef(0);   // audioCtx.currentTime when playback started
  const playbackOffsetRef = useRef(0);  // seconds into the audio when paused
  const pausedByUserRef = useRef(false); // 用户主动暂停（打断），防止 onended 异步清空 buffer
  const aiWasActiveRef = useRef(false);   // 打断时 AI 是否正在流式输出或播报
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
      // 先尝试读取已有报告
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
      // 404: 尚无报告，从历史数据即时生成
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
      // 刷新 has_report 标记，下次直接查看
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
      // 记录已播放到的位置，用于后续续播
      playbackOffsetRef.current += audioCtxRef.current.currentTime - playbackStartRef.current;
      pausedByUserRef.current = true; // 阻止 onended 异步清空 buffer
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
        // 用户主动暂停（打断），保留 buffer + offset 用于后续续播
        pausedByUserRef.current = false;
        return;
      }
      activeSourceRef.current = null;
      playbackOffsetRef.current = 0;
      ttsBufferRef.current = null;
      setTtsPlaying(false);
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
        // 优先用 llm_done.text（完整英语），兼容旧流式 aiCurrent
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
          // 找到最后一条 AI 消息，附加翻译和纠错
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
      // 续播：有 TTS 缓存就从暂停位置续播
      if (ttsBufferRef.current) {
        playPCM(ttsBufferRef.current, playbackOffsetRef.current);
        setTtsPlaying(true);
      } else if (aiWasActiveRef.current) {
        // 打断时 AI 正在流式输出（尚无 TTS 缓存），调服务端重新生成
        messages.send({ type: 'resume' });
        setAiStreaming(true);
        setAiCurrent('');
        aiCurrentRef.current = '';
      }
      // 如果打断时 AI 既不播报也不流式，点继续什么都不做
      setInterrupted(false);
      aiWasActiveRef.current = false;
    } else {
      // 记录打断瞬间 AI 是否正在活跃输出
      const aiWasActive = aiStreaming || Boolean(aiCurrentRef.current) || ttsPlaying;
      aiWasActiveRef.current = aiWasActive;
      messages.send({ type: 'interrupt' });
      setAiStreaming(false);
      setTtsPlaying(false);
      setInterrupted(true);
      stopAudio(true); // paused=true: 保留缓存 + 记录中断位置
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
      ttsBufferRef.current = null;
      playbackOffsetRef.current = 0;
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
      <TopBar
        openHistory={openHistory}
        showFontMenu={showFontMenu}
        setShowFontMenu={setShowFontMenu}
        fontSize={fontSize}
        pickFontSize={pickFontSize}
        cycleTheme={cycleTheme}
        theme={theme}
        scene={scene}
        correctionMode={correctionMode}
        updateConfig={updateConfig}
        statusEmoji={statusIndicator.emoji}
        statusText={statusIndicator.text}
        statusColor={statusIndicator.color}
      />

      <main className="chat-area">
        {view === 'history' && (
          <HistoryView
            sessions={sessions}
            selectedSession={selectedSession}
            sessionTurns={sessionTurns}
            historyLoading={historyLoading}
            histReportOpen={histReportOpen}
            histReportLoading={histReportLoading}
            histReport={histReport}
            histReportError={histReportError}
            sceneEmoji={sceneEmoji}
            modeEmoji={modeEmoji}
            viewSession={viewSession}
            deleteSelectedSession={deleteSelectedSession}
            deleteSessionFromList={deleteSessionFromList}
            setSelectedSession={setSelectedSession}
            setSessionTurns={setSessionTurns}
            setHistReportOpen={setHistReportOpen}
            setHistReport={setHistReport}
            setView={setView}
            toggleHistReport={toggleHistReport}
            batchMode={batchMode}
            selectedIds={selectedIds}
            toggleBatchMode={toggleBatchMode}
            toggleSelectId={toggleSelectId}
            selectAllIds={selectAllIds}
            batchDelete={batchDelete}
          />
        )}
        {view !== 'history' && (<>
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
          ) : (<ChatView
            turns={turns}
            partialText={partialText}
            aiCurrent={aiCurrent}
            aiStreaming={aiStreaming}
            hasConv={Boolean(hasConv)}
            isRecording={isRecording}
            wsReady={wsReady}
            captureError={captureError}
            chatEndRef={chatEndRef}
          />)}
        </>)}
      </main>

      {view === 'chat' && (
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
  );
}
