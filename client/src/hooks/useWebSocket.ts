import { useRef, useState, useCallback, useEffect } from 'react';
import type { WSMessage } from '@shared/types.ts';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  sessionId: string | null;
  messages: { send: (msg: WSMessage) => void };
  lastMessage: WSMessage | null;
}

const MAX_RETRIES = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCountRef = useRef(0);
  const errorOccurredRef = useRef(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const connect = useCallback(() => {
    // 防止重入：已连接或正在连接中时跳过
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

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
          retryCountRef.current = 0; // 连接成功，重置重试计数
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

      // 指数退避重连，上限 MAX_RETRIES 次
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY * 2 ** retryCountRef.current, MAX_DELAY);
        retryCountRef.current++;
        reconnectTimerRef.current = setTimeout(() => connect(), delay);
      }
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
    } else {
      console.warn('WS 未就绪，消息丢弃:', msg.type);
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

/** 根据当前页面地址动态拼接 WebSocket URL */
export function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:3001`;
}
