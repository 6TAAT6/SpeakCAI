import { useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket.ts';

export function App() {
  const { status, sessionId, messages } = useWebSocket('ws://localhost:3001');

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
          <button onClick={handlePing} disabled={status !== 'connected'}>
            Ping
          </button>
        </div>
      </header>

      <main className="app-main">
        <p className="placeholder">
          {status === 'connected'
            ? '系统就绪，等待后续模块接入...'
            : '正在建立连接，请确保服务端已启动...'}
        </p>
      </main>
    </div>
  );
}
