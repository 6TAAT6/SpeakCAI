import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { WSMessage } from '@shared/types.ts';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  sessionId: string | null;
  /** 仅在底层 WebSocket 建立新连接时递增；同一连接内新建会话不会递增。 */
  connectionVersion: number;
  messages: { send: (msg: WSMessage) => boolean };
  lastMessage: WSMessage | null;
}

const MAX_RETRIES = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const connectedSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCountRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    setStatus('connecting');
    const ws = new WebSocket(url);
    let hadError = false;
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === 'connected') {
          setStatus('connected');
          setSessionId(msg.sessionId);
          retryCountRef.current = 0;
          if (connectedSocketRef.current !== ws) {
            connectedSocketRef.current = ws;
            setConnectionVersion((version) => version + 1);
          }
        }
        setLastMessage(msg);
      } catch {
        // 服务端消息格式异常时忽略，保留当前连接。
      }
    };

    ws.onclose = () => {
      // 旧连接晚到的 close 事件不得影响已经创建的新连接。
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (!hadError) setStatus('disconnected');
      if (!shouldReconnectRef.current) return;

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY * 2 ** retryCountRef.current, MAX_DELAY);
        retryCountRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      } else {
        setStatus('error');
      }
    };

    ws.onerror = () => {
      hadError = true;
      setStatus('error');
      ws.close();
    };
  }, [url]);

  const send = useCallback((msg: WSMessage): boolean => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify(msg));
    return true;
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    retryCountRef.current = 0;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  const messages = useMemo(() => ({ send }), [send]);
  return { status, sessionId, connectionVersion, messages, lastMessage };
}

/** 默认使用同源 /ws，开发环境由 Vite 代理，生产环境由反向代理转发。 */
export function getWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
