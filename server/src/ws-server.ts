import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WSMessage } from '../../shared/types.ts';
import { XunfeiASR } from './asr.ts';
import type { ASRConfig } from './asr.ts';

// 从环境变量读取讯飞配置（ASR 和 TTS 共用同一套 Key）
const asrConfig: ASRConfig = {
  appId: process.env.XUNFEI_APP_ID || '',
  apiSecret: process.env.XUNFEI_API_SECRET || '',
};

function asrConfigured(): boolean {
  return Boolean(asrConfig.appId && asrConfig.apiSecret && asrConfig.appId !== 'your_app_id');
}

export class WSServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, { sessionId: string; createdAt: Date }> = new Map();
  // 每个浏览器客户端对应一个独立的讯飞 ASR 连接
  private asrMap: Map<WebSocket, XunfeiASR> = new Map();

  constructor(private port: number) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('listening', () => {
      console.log(`✅ WebSocket 服务已启动 → ws://localhost:${this.port}`);
      if (!asrConfigured()) {
        console.warn('⚠️  讯飞 ASR 未配置（缺少 XUNFEI_APP_ID / XUNFEI_API_SECRET），语音识别不可用');
      }
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

      // 断连清理（同时断开讯飞 ASR）
      ws.on('close', () => {
        const client = this.clients.get(ws);
        if (client) {
          console.log(`🔌 断开连接: ${client.sessionId.slice(0, 8)}`);
        }
        this.clients.delete(ws);
        this.cleanupASR(ws);
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
    // 断开所有 ASR 连接（先收集 key，避免迭代中修改 Map）
    for (const ws of [...this.asrMap.keys()]) {
      this.cleanupASR(ws);
    }
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
        this.handleAudioFrame(ws, msg);
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

  // ---- 音频帧处理 ----
  private handleAudioFrame(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'audio_frame' }>,
  ): void {
    if (!asrConfigured()) return;

    // 懒初始化：首次音频帧时创建该客户端的 ASR 连接
    let asr = this.asrMap.get(ws);
    if (!asr) {
      asr = new XunfeiASR(asrConfig, {
        onPartial: (text: string) => {
          this.send(ws, { type: 'asr_partial', text });
        },
        onFinal: (text: string) => {
          this.send(ws, { type: 'asr_final', text });
        },
        onError: (err: Error) => {
          console.error(`⚠️ ASR 错误 (session: ...): ${err.message}`);
        },
      });
      asr.connect();
      this.asrMap.set(ws, asr);
    }

    // 将 number[] 转为 Int16 Buffer 发送给讯飞
    const buffer = Buffer.from(Int16Array.from(msg.data).buffer);
    asr.sendAudio(buffer);
  }

  // ---- 清理 ----
  private cleanupASR(ws: WebSocket): void {
    const asr = this.asrMap.get(ws);
    if (asr) {
      asr.end();
      asr.disconnect();
      this.asrMap.delete(ws);
    }
  }

  // ---- 工具方法 ----
  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
