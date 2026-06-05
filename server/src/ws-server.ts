import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WSMessage } from '../../shared/types.ts';

export class WSServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, { sessionId: string; createdAt: Date }> = new Map();

  constructor(private port: number) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('listening', () => {
      console.log(`✅ WebSocket 服务已启动 → ws://localhost:${this.port}`);
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const sessionId = uuidv4();
      this.clients.set(ws, { sessionId, createdAt: new Date() });

      console.log(`🔗 新连接: ${sessionId.slice(0, 8)} (当前在线: ${this.clients.size})`);

      // 发送 connected 消息（携带 sessionId）
      this.send(ws, { type: 'connected', sessionId });

      // 处理消息
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WSMessage;
          this.handleMessage(ws, msg);
        } catch {
          // 忽略无效 JSON
        }
      });

      // 断连清理
      ws.on('close', () => {
        const client = this.clients.get(ws);
        if (client) {
          console.log(`🔌 断开连接: ${client.sessionId.slice(0, 8)}`);
        }
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error(`⚠️ WebSocket 错误: ${err.message}`);
      });
    });

    this.wss.on('error', (err) => {
      console.error('❌ WebSocket 服务错误:', err.message);
    });
  }

  stop(): void {
    // 通知所有客户端后关闭
    for (const [ws] of this.clients) {
      ws.close(1000, 'Server shutting down');
    }
    this.wss?.close();
    this.clients.clear();
  }

  // ---- 消息路由 ----
  private handleMessage(ws: WebSocket, msg: WSMessage): void {
    switch (msg.type) {
      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      case 'audio_frame':
        // TODO: PR3 接入讯飞 ASR 后处理音频帧
        break;

      case 'config_update':
        // TODO: PR7 场景/纠错模式切换后处理
        break;

      case 'interrupt':
        // TODO: PR9 实现打断逻辑
        break;

      default:
        console.warn('未处理的消息类型:', (msg as { type: string }).type);
    }
  }

  // ---- 工具方法 ----
  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
