import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket, getWsUrl } from './hooks/useWebSocket.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';

export function App() {
  const { status, sessionId, messages, lastMessage } = useWebSocket(getWsUrl());
  const [frameCount, setFrameCount] = useState(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ---- 字幕状态 ----
  const [partialText, setPartialText] = useState('');
  const [finalSegments, setFinalSegments] = useState<string[]>([]);

  // ---- AI 对话状态 ----
  const [aiText, setAiText] = useState('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [interrupted, setInterrupted] = useState(false);

  // ---- TTS 音频状态 ----
  const audioChunksRef = useRef<Uint8Array[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  /** 停止当前播放的音频 */
  const stopAudio = useCallback(() => {
    try { activeSourceRef.current?.stop(); } catch { /* 可能已停止 */ }
    activeSourceRef.current = null;
    audioChunksRef.current = [];
  }, []);

  /** 播放 PCM 16kHz 16bit mono 原始音频 */
  const playPCM = useCallback((pcmData: Uint8Array) => {
    // 停止当前播放中的音频
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
        setAiText((prev) => prev + lastMessage.text);
        break;
      case 'llm_done':
        setAiStreaming(false);
        setInterrupted(false);
        break;
      case 'tts_audio':
        // 新 TTS 会话开始，清空上一轮的缓冲
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
        }
        break;
      }
    }
  }, [lastMessage, playPCM]);

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

  const handlePing = () => {
    messages.send({ type: 'ping' });
  };

  const handleInterruptToggle = () => {
    if (interrupted) {
      // 继续：通知后端重新生成
      messages.send({ type: 'resume' });
      setInterrupted(false);
      setAiStreaming(true);
      setAiText('');
    } else {
      // 打断
      messages.send({ type: 'interrupt' });
      setAiStreaming(false);
      setInterrupted(true);
      stopAudio();
    }
  };

  // ---- 音频采集：AudioWorklet → WebSocket ----
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
      // 新一轮录音：清空上一轮 AI 回复和 TTS 缓冲
      setAiText('');
      setAiStreaming(false);
      setFinalSegments([]);
      setPartialText('');
      setInterrupted(false);
      audioChunksRef.current = [];
      await start();
    }
  }, [isRecording, start, stop]);

  const wsReady = status === 'connected';

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎙️ SpeakCAI</h1>
        <div className="connection-status" style={{ borderColor: statusIndicator.color }}>
          <span className="status-dot">{statusIndicator.emoji}</span>
          <span className="status-text">
            {statusIndicator.text}
            {sessionId && <small> · Session: {sessionId.slice(0, 8)}</small>}
          </span>
          <button onClick={handlePing} disabled={!wsReady}>
            Ping
          </button>
          <button
            onClick={handleRecordToggle}
            disabled={!wsReady}
            className={isRecording ? 'recording-btn' : ''}
          >
            {isRecording ? '⏹ 停止' : '🎤 录音'}
          </button>
        </div>
      </header>

      <main className="app-main">
        {(partialText || finalSegments.length > 0) && (
          <div className="caption-area">
            {finalSegments.map((text, i) => (
              <p key={i} className="caption-final">
                {text}
              </p>
            ))}
            {partialText && <p className="caption-partial">{partialText}</p>}
          </div>
        )}

        {/* ---- AI 对话回复 ---- */}
        {(aiText || aiStreaming) && (
          <div className="ai-response-area">
            <div className="ai-response-header">
              <span>🤖 AI 教练</span>
              {aiStreaming && <span className="streaming-indicator">● 回复中...</span>}
              <button onClick={handleInterruptToggle} className="interrupt-btn">
                {interrupted ? '▶ 继续' : '⏹ 打断'}
              </button>
            </div>
            <p className="ai-response-text">{aiText || '...'}</p>
          </div>
        )}

        {isRecording ? (
          <div className="recording-indicator">
            <span className="recording-dot" />
            <span>
              录音中 · 已发送 {frameCount} 帧
              <small>（{frameCount > 0 ? Math.round((frameCount * 256) / 1000) : 0}s）</small>
            </span>
          </div>
        ) : captureError ? (
          <p className="error-message">{captureError}</p>
        ) : (
          <p className="placeholder">
            {wsReady
              ? '系统就绪，点击"录音"开始采集音频'
              : '正在建立连接，请确保服务端已启动...'}
          </p>
        )}
      </main>
    </div>
  );
}
