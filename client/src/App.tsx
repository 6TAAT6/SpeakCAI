import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket, getWsUrl } from './hooks/useWebSocket.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';

interface Turn { role: 'user' | 'ai'; text: string; score?: number; accuracy?: number; fluency?: number }

export function App() {
  const { status, messages, lastMessage } = useWebSocket(getWsUrl());
  const [frameCount, setFrameCount] = useState(0);
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
          setTurns((prev) => [...prev, { role: 'ai', text }]);
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
      setTurns([]);
      setAiCurrent('');
      aiCurrentRef.current = '';
      setAiStreaming(false);
      setPartialText('');
      setInterrupted(false);
      audioChunksRef.current = [];
      await start();
    }
  }, [isRecording, start, stop]);

  const wsReady = status === 'connected';
  const hasConv = turns.length > 0 || partialText || aiCurrent || aiStreaming;

  return (
    <div className="app">
      <header className="top-bar">
        <span className="brand">SpeakCAI</span>
        <div className="config-selectors">
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
        {!hasConv && !isRecording && !captureError && (
          <p className="placeholder">{wsReady ? '点击底部按钮开始录音对话' : '正在建立连接...'}</p>
        )}
        {captureError && <p className="error-message">{captureError}</p>}

        {/* 已完成对话 — 按时间线交替显示 */}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
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
      </main>

      <footer className="bottom-bar">
        {isRecording && (
          <span className="record-timer">● {frameCount > 0 ? Math.round((frameCount * 256) / 1000) : 0}s</span>
        )}
        <button onClick={handleRecordToggle} disabled={!wsReady} className={`record-btn ${isRecording ? 'recording' : ''}`}>
          {isRecording ? '⏹ 停止' : '🎤 开始对话'}
        </button>
        {(turns.length > 0 || aiCurrent || aiStreaming || ttsPlaying || interrupted) && (
          <button onClick={handleInterruptToggle} className="ctrl-btn">
            {interrupted ? '▶ 继续' : '⏹ 打断'}
          </button>
        )}
      </footer>
    </div>
  );
}
