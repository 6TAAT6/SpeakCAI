import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WSMessage } from '../../shared/types.ts';
import { XunfeiASR } from './asr.ts';
import type { ASRConfig } from './asr.ts';
import { ConversationSession } from './session.ts';
import { DeepSeekLLM } from './llm.ts';
import type { LLMConfig } from './llm.ts';

// ---- 环境配置（运行时读取，避免 ES Module import hoisting 时序问题）----
const getASRConfig = (): ASRConfig => ({
  appId: process.env.XUNFEI_APP_ID || '',
  apiKey: process.env.XUNFEI_API_KEY || '',
  apiSecret: process.env.XUNFEI_API_SECRET || '',
});

const getLLMConfig = (): LLMConfig => ({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
});

function asrConfigured(): boolean {
  const cfg = getASRConfig();
  return Boolean(
    cfg.appId && cfg.apiKey && cfg.apiSecret && cfg.appId !== 'your_app_id' && cfg.apiKey !== 'your_api_key',
  );
}

function llmConfigured(): boolean {
  const cfg = getLLMConfig();
  return Boolean(cfg.apiKey && cfg.apiKey !== 'your_deepseek_api_key');
}

export class WSServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, { sessionId: string; createdAt: Date }> = new Map();
  private asrMap: Map<WebSocket, XunfeiASR> = new Map();
  private sessionMap: Map<WebSocket, ConversationSession> = new Map();
  // 每个客户端独立的 LLM 实例，避免多客户端并发时 AbortController 互相覆盖
  private llmMap: Map<WebSocket, DeepSeekLLM> = new Map();

  constructor(private port: number) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('listening', () => {
      console.log(`✅ WebSocket 服务已启动 → ws://localhost:${this.port}`);
      if (!asrConfigured()) {
        console.warn('⚠️  讯飞 ASR 未配置，语音识别不可用');
      }
      if (!llmConfigured()) {
        console.warn('⚠️  DeepSeek 未配置（缺少 DEEPSEEK_API_KEY），AI 对话不可用');
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const sessionId = uuidv4();
      this.clients.set(ws, { sessionId, createdAt: new Date() });

      // 为每个客户端创建独立的对话会话和 LLM 实例
      const session = new ConversationSession(sessionId);
      this.sessionMap.set(ws, session);

      if (llmConfigured()) {
        this.llmMap.set(ws, new DeepSeekLLM(getLLMConfig()));
      }

      console.log(`🔗 新连接: ${sessionId.slice(0, 8)} (当前在线: ${this.clients.size})`);

      this.send(ws, { type: 'connected', sessionId });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WSMessage;
          this.handleMessage(ws, msg);
        } catch {
          // 忽略无效 JSON
        }
      });

      ws.on('close', () => {
        const client = this.clients.get(ws);
        if (client) {
          console.log(`🔌 断开连接: ${client.sessionId.slice(0, 8)}`);
        }
        this.clients.delete(ws);
        this.cleanupASR(ws);
        this.sessionMap.delete(ws);
        this.llmMap.delete(ws);
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
    for (const ws of [...this.asrMap.keys()]) {
      this.cleanupASR(ws);
    }
    for (const [ws] of this.clients) {
      ws.close(1000, 'Server shutting down');
    }
    this.wss?.close();
    this.clients.clear();
    this.sessionMap.clear();
    this.llmMap.clear();
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

      case 'interrupt':
        this.handleInterrupt(ws);
        break;

      case 'config_update':
        this.handleConfigUpdate(ws, msg);
        break;

      default:
        console.warn('未处理的消息类型:', (msg as { type: string }).type);
    }
  }

  // ---- 音频帧 → ASR ----
  private handleAudioFrame(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'audio_frame' }>,
  ): void {
    if (!asrConfigured()) return;

    let asr = this.asrMap.get(ws);
    if (!asr) {
      asr = new XunfeiASR(getASRConfig(), {
        onPartial: (text: string) => {
          this.send(ws, { type: 'asr_partial', text });
        },
        onFinal: (text: string) => {
          this.send(ws, { type: 'asr_final', text });
          // ASR 确认一句话 → 触发 AI 对话
          this.handleUserInput(ws, text);
        },
        onError: (err: Error) => {
          console.error(`⚠️ ASR 错误: ${err.message}`);
        },
      });
      asr.connect();
      this.asrMap.set(ws, asr);
    }

    const buffer = Buffer.from(Int16Array.from(msg.data).buffer);
    asr.sendAudio(buffer);
  }

  // ---- 用户输入 → LLM ----
  private async handleUserInput(ws: WebSocket, text: string): Promise<void> {
    const llm = this.llmMap.get(ws);
    if (!llm) return;

    const session = this.sessionMap.get(ws);
    if (!session) return;

    session.addUserMessage(text);

    let llmBuffer = '';

    await llm.chat(session.getMessages(), {
      onStream: (chunk: string) => {
        llmBuffer += chunk;
        this.send(ws, { type: 'llm_stream', text: chunk });
      },
      onDone: (fullText: string) => {
        if (fullText) {
          session.addAssistantMessage(fullText);
        }
        this.send(ws, { type: 'llm_done' });
      },
      onError: (err: Error) => {
        console.error(`⚠️ LLM 错误: ${err.message}`);
        this.send(ws, { type: 'llm_done' });
      },
    });
  }

  // ---- 打断（仅影响当前客户端）----
  private handleInterrupt(ws: WebSocket): void {
    // 中断当前客户端的 LLM 流式输出
    const llm = this.llmMap.get(ws);
    llm?.abort();

    // 重置当前客户端的 ASR
    const asr = this.asrMap.get(ws);
    if (asr) {
      asr.end();
    }
  }

  // ---- 配置更新 ----
  private handleConfigUpdate(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'config_update' }>,
  ): void {
    const session = this.sessionMap.get(ws);
    if (session) {
      session.setScene(msg.payload.scene);
      console.log(
        `⚙️  场景切换: ${msg.payload.scene}（已清空历史）, 纠错模式: ${msg.payload.correctionMode}`,
      );
    }
    // TODO: PR7 纠正模式参数化
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
