import { useRef, useState, useCallback, useEffect } from 'react';
import type { WSMessage } from '@shared/types.ts';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  sessionId: string | null;
  messages: { send: (msg: WSMessage) => void };
  lastMessage: WSMessage | null;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorOccurredRef = useRef(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus('connecting');
    errorOccurredRef.current = false;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === 'connected') {
          setStatus('connected');
          setSessionId(msg.sessionId);
          errorOccurredRef.current = false;
        }
        setLastMessage(msg);
      } catch {
        // 忽略解析失败
      }
    };

    ws.onclose = () => {
      if (!errorOccurredRef.current) {
        setStatus('disconnected');
      }
      reconnectTimerRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => {
      errorOccurredRef.current = true;
      setStatus('error');
      ws.close();
    };
  }, [url]);

  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, sessionId, messages: { send }, lastMessage };
}
