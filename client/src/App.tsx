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
        break;
    }
  }, [lastMessage]);

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

  const handleInterrupt = () => {
    messages.send({ type: 'interrupt' });
    setAiStreaming(false);
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
      // 新一轮录音：清空上一轮 AI 回复
      setAiText('');
      setAiStreaming(false);
      setFinalSegments([]);
      setPartialText('');
      await start();
    }
  }, [isRecording, start, stop]);

  const wsReady = status === 'connected';

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎙️ 英语口语教练</h1>
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
              <button onClick={handleInterrupt} className="interrupt-btn">
                ⏹ 打断
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
