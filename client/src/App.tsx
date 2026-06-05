import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket, getWsUrl } from './hooks/useWebSocket.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';

export function App() {
  const { status, messages, lastMessage } = useWebSocket(getWsUrl());
  const [frameCount, setFrameCount] = useState(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ---- 字幕状态 ----
  const [partialText, setPartialText] = useState('');
  const [finalSegments, setFinalSegments] = useState<string[]>([]);

  // ---- AI 对话状态 ----
  const [aiSegments, setAiSegments] = useState<string[]>([]);
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

  /** 停止当前播放的音频 */
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
    setAiSegments([]);
    setAiSegments([]);
    setAiCurrent('');
    aiCurrentRef.current = '';
    setAiStreaming(false);
    setFinalSegments([]);
    setPartialText('');
    setInterrupted(false);
    setTtsPlaying(false);
    stopAudio();
  }, [stopAudio]);

  /** 播放 PCM 16kHz 16bit mono 音频 */
  const playPCM = useCallback((pcmData: Uint8Array) => {
    stopAudio();
    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;

    const samples = new Int16Array(pcmData.buffer);
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, samples.length, 16000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    activeSourceRef.current = source;
    source.onended = () => { activeSourceRef.current = null; };
    source.start();
  }, [stopAudio]);

  // ---- 自动滚动到底部 ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [finalSegments, aiSegments, aiCurrent]);

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
          setFinalSegments((prev) => {
            if (prev.length > 0 && prev[prev.length - 1] === text) return prev;
            return [...prev, text];
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
          setAiSegments((prev) => [...prev, text]);
          aiCurrentRef.current = '';
          setAiCurrent('');
        }
        setAiStreaming(false);
        setInterrupted(false);
        break;
      }
      case 'tts_audio':
        setTtsPlaying(true);
        if (lastMessage.chunkIndex === 0) {
          audioChunksRef.current = [];
          stopAudio();
        }
        audioChunksRef.current.push(
          new Uint8Array(
            atob(lastMessage.data)
              .split('')
              .map((c) => c.charCodeAt(0)),
          ),
        );
        break;
      case 'tts_done': {
        const chunks = audioChunksRef.current;
        if (chunks.length > 0) {
          const totalLen = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
          }
          audioChunksRef.current = [];
          playPCM(merged);
          const dur = (merged.byteLength / 2) / 16000 * 1000;
          setTimeout(() => setTtsPlaying(false), dur);
        }
        break;
      }
    }
  }, [lastMessage, playPCM, stopAudio]);

  const statusIndicator = useMemo(() => {
    switch (status) {
      case 'connecting':
        return { emoji: '🟡', text: '连接中...', color: '#c6901a' };
      case 'connected':
        return { emoji: '🟢', text: '已就绪', color: '#1a8c4a' };
      case 'disconnected':
        return { emoji: '🔴', text: '已断连', color: '#b02828' };
      case 'error':
        return { emoji: '⚠️', text: '连接错误', color: '#b02828' };
    }
  }, [status]);

  const handleInterruptToggle = () => {
    if (interrupted) {
      messages.send({ type: 'resume' });
      setInterrupted(false);
      setAiStreaming(true);
      setAiCurrent('');
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
      messagesRef.current.send({
        type: 'audio_frame',
        data: Array.from(frame.data),
        seq: frame.seq,
      });
      setFrameCount((c) => c + 1);
    },
  });

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      stop();
      setFrameCount(0);
      setPartialText('');
      setFinalSegments([]);
    } else {
      setAiSegments([]);
      setAiCurrent('');
      setAiStreaming(false);
      setFinalSegments([]);
      setPartialText('');
      setInterrupted(false);
      audioChunksRef.current = [];
      await start();
    }
  }, [isRecording, start, stop]);

  const wsReady = status === 'connected';
  const hasConversation = partialText || finalSegments.length > 0 || aiSegments.length > 0 || aiCurrent || aiStreaming;

  return (
    <div className="app">
      {/* ---- 顶部固定栏 ---- */}
      <header className="top-bar">
        <span className="brand">SpeakCAI</span>
        <div className="config-selectors">
          <select
            value={scene}
            onChange={(e) => updateConfig(e.target.value as typeof scene, correctionMode)}
            className="mini-select"
          >
            <option value="interview">💼 面试</option>
            <option value="ordering">🍽️ 点餐</option>
            <option value="meeting">📊 会议</option>
          </select>
          <select
            value={correctionMode}
            onChange={(e) => updateConfig(scene, e.target.value as typeof correctionMode)}
            className="mini-select"
          >
            <option value="immersive">🌊 沉浸</option>
            <option value="coach">🎯 教练</option>
            <option value="strict">📏 严师</option>
          </select>
        </div>
        <span className="status-badge" style={{ color: statusIndicator.color }}>
          {statusIndicator.emoji} {statusIndicator.text}
        </span>
      </header>

      {/* ---- 对话滚动区 ---- */}
      <main className="chat-area">
        {!hasConversation && !isRecording && !captureError && (
          <p className="placeholder">
            {wsReady ? '点击底部按钮开始录音对话' : '正在建立连接，请确保服务端已启动...'}
          </p>
        )}

        {captureError && <p className="error-message">{captureError}</p>}

        {finalSegments.map((text, i) => (
          <div key={`u-${i}`} className="bubble user-bubble">
            <span className="bubble-label">You</span>
            <p>{text}</p>
          </div>
        ))}

        {partialText && (
          <div className="bubble user-bubble partial">
            <span className="bubble-label">You</span>
            <p>{partialText}</p>
          </div>
        )}

        {aiSegments.map((text, i) => (
          <div key={`a-${i}`} className="bubble ai-bubble">
            <span className="bubble-label">🤖 AI</span>
            <p>{text}</p>
          </div>
        ))}

        {(aiCurrent || aiStreaming) && (
          <div className="bubble ai-bubble streaming">
            <div className="bubble-header">
              <span className="bubble-label">🤖 AI</span>
              {aiStreaming && <span className="streaming-dot" />}
            </div>
            <p>{aiCurrent || '...'}</p>
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* ---- 底部录音控制栏 ---- */}
      <footer className="bottom-bar">
        {isRecording && (
          <span className="record-timer">
            ● {frameCount > 0 ? Math.round((frameCount * 256) / 1000) : 0}s
          </span>
        )}

        <button
          onClick={handleRecordToggle}
          disabled={!wsReady}
          className={`record-btn ${isRecording ? 'recording' : ''}`}
        >
          {isRecording ? '⏹ 停止' : '🎤 开始对话'}
        </button>

        {(aiSegments.length > 0 || aiCurrent || aiStreaming || ttsPlaying || interrupted) && (
          <button onClick={handleInterruptToggle} className="ctrl-btn">
            {interrupted ? '▶ 继续' : '⏹ 打断'}
          </button>
        )}
      </footer>
    </div>
  );
}
