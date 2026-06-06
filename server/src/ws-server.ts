import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WSMessage } from '../../shared/types.ts';
import { TIPS_STRIP_RE } from '../../shared/types.ts';
import { XunfeiASR } from './asr.ts';
import type { ASRConfig } from './asr.ts';
import { ConversationSession } from './session.ts';
import { DeepSeekLLM } from './llm.ts';
import type { LLMConfig } from './llm.ts';
import { XunfeiTTS } from './tts.ts';
import type { TTSConfig } from './tts.ts';
import { XunfeiISE } from './pronounce.ts';
import type { ISEConfig } from './pronounce.ts';
import { createSession, updateSessionConfig, endSession, addTurn, addPronunciation } from './db.ts';

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

const getTTSConfig = (): TTSConfig => ({
  appId: process.env.XUNFEI_APP_ID || '',
  apiKey: process.env.XUNFEI_API_KEY || '',
  apiSecret: process.env.XUNFEI_API_SECRET || '',
  voiceName: 'catherine', // 英文女声-Catherine
  speed: 50,
});

const getISEConfig = (): ISEConfig => ({
  appId: process.env.XUNFEI_APP_ID || '',
  apiKey: process.env.XUNFEI_API_KEY || '',
  apiSecret: process.env.XUNFEI_API_SECRET || '',
});

function asrConfigured(): boolean {
  const cfg = getASRConfig();
  return Boolean(
    cfg.appId && cfg.apiKey && cfg.apiSecret &&
    cfg.appId !== 'your_app_id' &&
    cfg.apiKey !== 'your_api_key' &&
    cfg.apiSecret !== 'your_api_secret',
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
  private ttsMap: Map<WebSocket, XunfeiTTS> = new Map();
  // 每个客户端缓冲一句话的音频帧 + 文本，用于发音评测
  private iseBuffer: Map<WebSocket, { audio: Buffer[]; text: string }> = new Map();

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

      // 持久化会话
      createSession(sessionId);

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
          endSession(client.sessionId);
        }
        this.clients.delete(ws);
        this.cleanupASR(ws);
        this.sessionMap.delete(ws);
        this.llmMap.delete(ws);
        this.ttsMap.get(ws)?.abort();
        this.ttsMap.delete(ws);
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
    this.ttsMap.clear();
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

      case 'resume':
        this.handleResume(ws);
        break;

      case 'config_update':
        this.handleConfigUpdate(ws, msg);
        break;

      default:
        console.warn('未处理的消息类型:', (msg as { type: string }).type);
    }
  }

  // 缓冲 ASR 握手期间的音频帧，连接就绪后立即发送（per-client）
  private pendingAudio: Map<WebSocket, Buffer[]> = new Map();

  private clientFrameCount = new Map<WebSocket, number>();

  // ---- 音频帧 → ASR ----
  private handleAudioFrame(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'audio_frame' }>,
  ): void {
    const cnt = (this.clientFrameCount.get(ws) || 0) + 1;
    this.clientFrameCount.set(ws, cnt);
    if (cnt <= 3) console.log(`🎙 帧#${cnt} seq=${msg.seq} len=${msg.data.length}`);

    if (!asrConfigured()) return;

    let asr = this.asrMap.get(ws);
    if (!asr) {
      const pending: Buffer[] = [];
      this.pendingAudio.set(ws, pending);
      this.iseBuffer.set(ws, { audio: [], text: '' });

      asr = new XunfeiASR(getASRConfig(), {
        onReady: () => {
          const buffered = this.pendingAudio.get(ws);
          console.log(`🔗 ASR ready, 缓冲帧数: ${buffered?.length || 0}`);
          if (buffered && buffered.length > 0) {
            for (const buf of buffered) {
              asr!.sendAudio(buf);
            }
            this.pendingAudio.delete(ws);
          }
        },
        onPartial: (text: string) => {
          console.log(`📝 partial: "${text}"`);
          this.send(ws, { type: 'asr_partial', text });
        },
        onFinal: (text: string) => {
          console.log(`✅ final: "${text}"`);
          this.send(ws, { type: 'asr_final', text });
          this.handleUserInput(ws, text);
          // 记录最后一句文本，停止时统一评测
          const ise = this.iseBuffer.get(ws);
          if (ise) ise.text = text;
        },
        onError: (err: Error) => {
          console.error(`⚠️ ASR 错误: ${err.message}`);
          this.pendingAudio.delete(ws);
          this.iseBuffer.delete(ws);
        },
      });
      asr.connect();
      this.asrMap.set(ws, asr);
    }

    const buffer = Buffer.from(Int16Array.from(msg.data).buffer);
    // 缓冲音频帧供发音评测
    const ise = this.iseBuffer.get(ws);
    if (ise) ise.audio.push(buffer);

    const pending = this.pendingAudio.get(ws);
    if (pending) {
      pending.push(buffer);
    } else {
      asr.sendAudio(buffer);
    }
  }

  // ---- 用户输入 → LLM ----
  private async handleUserInput(ws: WebSocket, text: string, isResume = false): Promise<void> {
    const llm = this.llmMap.get(ws);
    if (!llm) return;

    const session = this.sessionMap.get(ws);
    if (!session) return;

    if (!isResume) {
      session.addUserMessage(text);
      addTurn(session.sessionId, 'user', text);
    }

    let llmBuffer = '';

    await llm.chat(session.getMessages(), {
      onStream: (chunk: string) => {
        llmBuffer += chunk;
        this.send(ws, { type: 'llm_stream', text: chunk });
      },
      onDone: (fullText: string) => {
        if (!fullText) {
          this.send(ws, { type: 'llm_done' });
          return;
        }

        // 解析纠错内容：💡 Tips: ... 和 🔁 Try again: ...
        const tipsMatch = fullText.match(/💡\s*Tips:\s*([\s\S]*?)(?:🔁\s*Try again:|$)/);
        const tryAgainMatch = fullText.match(/🔁\s*Try again:\s*([\s\S]*)/);
        const tips = tipsMatch?.[1]?.trim() || '';
        const tryAgain = tryAgainMatch?.[1]?.trim() || '';

        // 清洗文本（去掉纠错部分用于 TTS + 会话存储）
        const cleanText = fullText.replace(TIPS_STRIP_RE, '').trim();

        session.addAssistantMessage(cleanText);
        addTurn(session.sessionId, 'assistant', cleanText);

        // llm_done 附带纠错信息（前端一次性渲染，无时序竞争）
        this.send(ws, {
          type: 'llm_done',
          tips: tips || undefined,
          tryAgain: tryAgain || undefined,
        });

        // TTS 用清洗后的文本（不朗读纠错提示）
        this.handleTTS(ws, cleanText);
      },
      onError: (err: Error) => {
        console.error(`⚠️ LLM 错误: ${err.message}`);
        this.send(ws, { type: 'llm_done' });
      },
    });
  }

  // ---- LLM 文本 → TTS 语音 ----
  private handleTTS(ws: WebSocket, text: string): void {
    const cfg = getTTSConfig();
    if (!cfg.appId || cfg.appId === 'your_app_id') return;
    if (!text) return;

    // 中止上一次 TTS，避免重叠语音
    this.ttsMap.get(ws)?.abort();

    const tts = new XunfeiTTS(cfg);
    this.ttsMap.set(ws, tts);

    let chunkIndex = 0;
    tts.synthesize(text, {
      onAudio: (chunk: Buffer) => {
        this.send(ws, {
          type: 'tts_audio',
          data: chunk.toString('base64'),
          chunkIndex: chunkIndex++,
        });
      },
      onDone: () => {
        this.send(ws, { type: 'tts_done' });
      },
      onError: (err: Error) => {
        console.error(`⚠️ TTS 错误: ${err.message}`);
      },
    });
  }

  // ---- 发音评测 → 讯飞 ISE ----
  private evaluatePronounce(ws: WebSocket, text: string): void {
    console.log(`🔊 ISE evaluate: text="${text.slice(0, 30)}"`);
    const cfg = getISEConfig();
    if (!cfg.appId || cfg.appId === 'your_app_id') { console.log('  -> skip: no ISE config'); return; }
    const buf = this.iseBuffer.get(ws);
    if (!buf || buf.audio.length === 0) { console.log('  -> skip: no audio buffer'); return; }
    const audio = Buffer.concat(buf.audio);
    console.log(`  -> audio: ${audio.length} bytes`);
    this.iseBuffer.set(ws, { audio: [], text: '' });

    const ise = new XunfeiISE(cfg);
    ise.evaluate(text, audio, {
      onResult: (result) => {
        this.send(ws, {
          type: 'pronounce_result',
          totalScore: result.totalScore,
          accuracyScore: result.accuracyScore,
          fluencyScore: result.fluencyScore,
          integrityScore: result.integrityScore,
          weakPhones: result.weakPhones,
        });
        // 持久化评测结果
        const sid = this.sessionMap.get(ws)?.sessionId;
        if (sid) addPronunciation(sid, text, result.totalScore, result.accuracyScore, result.fluencyScore, result.integrityScore);
      },
      onError: () => { /* 评测失败不影响对话 */ },
    });
  }

  // ---- 打断（仅影响当前客户端）----
  private handleInterrupt(ws: WebSocket): void {
    // 移除打断导致的截断 assistant 消息
    const session = this.sessionMap.get(ws);
    session?.popLastAssistant();

    // 中断当前客户端的 LLM 流式输出
    const llm = this.llmMap.get(ws);
    llm?.abort();

    // 中断当前 TTS 合成
    this.ttsMap.get(ws)?.abort();

    // 重置 ASR（cleanupASR 会触发发音评测）
    this.cleanupASR(ws);
  }

  // ---- 继续对话（打断后，复用已有上下文重新生成）----
  private handleResume(ws: WebSocket): void {
    // 取最后一条用户消息，重新走 LLM（不重复添加到会话）
    const session = this.sessionMap.get(ws);
    if (!session) return;
    const lastUser = session.getMessages().filter((m) => m.role === 'user').pop();
    if (!lastUser) return;
    this.handleUserInput(ws, lastUser.content, true);
  }

  // ---- 配置更新 ----
  private handleConfigUpdate(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'config_update' }>,
  ): void {
    const session = this.sessionMap.get(ws);
    if (session) {
      session.setConfig(msg.payload.scene, msg.payload.correctionMode);
      updateSessionConfig(session.sessionId, msg.payload.scene, msg.payload.correctionMode);
      console.log(
        `⚙️  场景: ${msg.payload.scene}, 纠错: ${msg.payload.correctionMode}`,
      );
    }
  }

  // ---- 清理 ----
  private cleanupASR(ws: WebSocket): void {
    const asr = this.asrMap.get(ws);
    if (asr) {
      asr.end();
      asr.disconnect();
      this.asrMap.delete(ws);
    }
    // 停止录音时触发发音评测
    const buf = this.iseBuffer.get(ws);
    if (buf && buf.audio.length > 0 && buf.text) {
      this.evaluatePronounce(ws, buf.text);
    }
  }

  // ---- 工具方法 ----
  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
