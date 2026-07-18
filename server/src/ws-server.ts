import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WSMessage, CorrectionMode } from '../../shared/types.ts';
import { XunfeiASR } from './asr.ts';
import type { ASRConfig } from './asr.ts';
import { ConversationSession } from './session.ts';
import { DeepSeekLLM } from './llm.ts';
import type { LLMConfig } from './llm.ts';
import { XunfeiTTS } from './tts.ts';
import type { TTSConfig } from './tts.ts';
import { XunfeiISE } from './pronounce.ts';
import type { ISEConfig } from './pronounce.ts';
import { createSession, updateSessionConfig, endSession, resumeSession, addTurn, addPronunciation } from './db.ts';
import { ConversationAgent } from './agent.ts';
import type { AgentContext } from './agent.ts';

// ---- 工具函数 ----

/** 英语语音约 20 字符/秒，250 字符 ≈ 12.5 秒语音，给讯飞 WS 15 秒超时留足余量 */
const TTS_MAX_CHARS = 250;

/**
 * 截断文本到安全长度，优先在句末边界截断。
 * 讯飞 TTS WebSocket 约 15 秒空闲断开，TTS 合成过长文本时连接超时导致语音中断。
 * 截断后字幕=TTS 文本，用户看到的就是听到的。
 */
function truncateForTTS(text: string, maxLen: number = TTS_MAX_CHARS): string {
  if (text.length <= maxLen) return text;
  const within = text.slice(0, maxLen);
  const lastEnd = Math.max(
    within.lastIndexOf('.'),
    within.lastIndexOf('!'),
    within.lastIndexOf('?'),
  );
  if (lastEnd > maxLen * 0.5) {
    return within.slice(0, lastEnd + 1).trim();
  }
  const lastSpace = within.lastIndexOf(' ');
  return lastSpace > maxLen * 0.5
    ? within.slice(0, lastSpace).trim()
    : within.trim();
}

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
  speed: 65,
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
  // 每个客户端缓冲当前语音段的音频帧，每句说完整即触发评测并重置
  // evaluatePronounce 独立 WebSocket，不阻塞 LLM / TTS 管道
  private iseBuffer: Map<WebSocket, Buffer[]> = new Map();
  // TTS 播放期间屏蔽回声 ASR：合成时设 Infinity，前端播完发 tts_playback_done 解除
  private ttsActiveUntil: Map<WebSocket, number> = new Map();
  // ConversationAgent — 单实例，所有客户端共用（纯计算，无状态）
  private agent = new ConversationAgent();
  // 每客户端累积的发音分数 + 薄弱音素（供 Agent 决策用）
  private clientScores: Map<WebSocket, number[]> = new Map();
  private clientWeakPhones: Map<WebSocket, string[]> = new Map();
  // 回复防抖：用户停 800ms 后才触发 AI，避免口误停顿被抢话
  private replyDebounce: Map<WebSocket, ReturnType<typeof setTimeout>> = new Map();
  private pendingFinals: Map<WebSocket, string[]> = new Map();

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
        this.ttsActiveUntil.delete(ws);
        this.ttsMap.delete(ws);
        const t = this.replyDebounce.get(ws);
        if (t) clearTimeout(t);
        this.replyDebounce.delete(ws);
        this.pendingFinals.delete(ws);
        this.clientScores.delete(ws);
        this.clientWeakPhones.delete(ws);
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

      case 'tts_playback_done':
        this.ttsActiveUntil.delete(ws); // 前端播放完成，解除回声屏蔽
        break;

      case 'interrupt':
        this.handleInterrupt(ws);
        break;

      case 'resume':
        this.handleResume(ws);
        break;

      case 'tts_speak':
        this.handleTTSSpeak(ws, msg);
        break;

      case 'config_update':
        this.handleConfigUpdate(ws, msg);
        break;

      case 'new_session':
        this.handleNewSession(ws, msg);
        break;

      case 'continue_session':
        this.handleContinueSession(ws, msg);
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
      this.iseBuffer.set(ws, []);

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
          // 清理 ASR 误识别的句首/句尾标点（语音输入不可能有标点）
          let cleaned = text.replace(/^[.,;:!?'"()\[\]{}，。；：！？、""''（）【】…• ]+/, '').replace(/[.,;:!?'"()\[\]{}，。；：！？、""''（）【】…• ]+$/, '').trim();
          if (!cleaned) return;

          console.log(`✅ final: "${cleaned}"`);

          // TTS 播放期间忽略回声（前端播完 + 打断时解除）
          const until = this.ttsActiveUntil.get(ws);
          if (until && Date.now() < until) {
            console.log('  -> TTS 回声，忽略');
            return;
          }

          this.send(ws, { type: 'asr_final', text: cleaned });

          // 防抖：用户停 800ms 没新语音才触发 AI，避免口误停顿被抢话
          const pending = this.pendingFinals.get(ws) || [];
          pending.push(cleaned);
          this.pendingFinals.set(ws, pending);
          const prev = this.replyDebounce.get(ws);
          if (prev) clearTimeout(prev);
          this.replyDebounce.set(ws, setTimeout(() => {
            this.replyDebounce.delete(ws);
            const all = (this.pendingFinals.get(ws) || []).join(' ');
            this.pendingFinals.delete(ws);
            if (all) this.handleUserInput(ws, all);
          }, 800));
          // 当前语音段说完 → 立即异步评测（ISE 独立连接，不阻塞 LLM/TTS）
          const segBuf = this.iseBuffer.get(ws);
          if (segBuf && segBuf.length > 0) {
            const utteranceAudio = Buffer.concat(segBuf);
            this.iseBuffer.set(ws, []); // 重置，下一句从头累积
            this.evaluatePronounce(ws, cleaned, utteranceAudio);
          }
        },
        onError: (err: Error) => {
          console.error(`⚠️ ASR 错误: ${err.message}`);
          this.send(ws, { type: 'service_error', service: 'asr', message: err.message });
          this.pendingAudio.delete(ws);
          this.iseBuffer.delete(ws);
          this.asrMap.delete(ws);
        },
      });
      asr.connect();
      this.asrMap.set(ws, asr);
    }

    const buffer = Buffer.from(Int16Array.from(msg.data).buffer);
    // 缓冲音频帧供发音评测（上限 30 秒 ≈ 120 帧 @256ms）
    const ise = this.iseBuffer.get(ws);
    if (ise) {
      ise.push(buffer);
      if (ise.length > 120) this.iseBuffer.set(ws, ise.slice(-120));
    }

    const pending = this.pendingAudio.get(ws);
    if (pending) {
      pending.push(buffer);
    } else {
      asr.sendAudio(buffer);
    }
  }

  // ---- 用户输入 → LLM 英文 + 翻译纠错 ----
  private async handleUserInput(ws: WebSocket, text: string, isResume = false): Promise<void> {
    const llm = this.llmMap.get(ws);
    if (!llm) return;

    const session = this.sessionMap.get(ws);
    if (!session) return;

    if (!isResume) {
      session.addUserMessage(text);
      addTurn(session.sessionId, 'user', text);
    }

    // Agent 决策：根据发音数据 + 对话进程决定教学策略
    try {
      const ctx = this.buildAgentContext(ws, text, session);
      const plan = this.agent.decide(ctx);
      session.setAgentPlan(plan);
      // 通知前端当前 Agent 决策，供状态指示器展示
      this.send(ws, {
        type: 'agent_plan',
        action: plan.action,
        difficulty: plan.difficulty,
        tone: plan.tone,
      });
    } catch (err) {
      console.warn('⚠️ Agent 决策失败，降级为默认行为:', err);
    }

    let englishText = '';

    // Step 1: 生成英语（缓冲后一次性发送，保证字幕=TTS 文本一致）
    await llm.chat(session.getMessages(), {
      onStream: (chunk: string) => {
        englishText += chunk;
      },
      onDone: () => {
        englishText = englishText.trim();
        if (!englishText) {
          this.send(ws, { type: 'llm_done' });
          return;
        }

        session.addAssistantMessage(englishText);
        addTurn(session.sessionId, 'assistant', englishText);

        // TTS 安全截断：讯飞 WS 约 15 秒超时，~250 字符 ≈ 12 秒语音，留足余量
        const ttsText = truncateForTTS(englishText);
        if (ttsText !== englishText) {
          console.log(`✂️ TTS 文本截断: ${englishText.length} → ${ttsText.length} 字符`);
        }

        // 字幕 = TTS 文本，保证看到的就是听到的
        this.send(ws, { type: 'llm_done', text: ttsText });

        this.handleTTS(ws, ttsText);

        // Step 2: 异步中文翻译 + 纠错（用完整文本，保证翻译准确）
        this.handleTranslation(ws, englishText, text, session.correctionMode);
      },
      onError: (err: Error) => {
        console.error(`⚠️ LLM 错误: ${err.message}`);
        this.send(ws, { type: 'llm_done' });
      },
    });
  }

  // ---- 翻译 + 纠错（独立 LLM 调用，不阻塞 TTS）----
  private async handleTranslation(
    ws: WebSocket,
    englishText: string,
    userText: string,
    mode: CorrectionMode,
  ): Promise<void> {
    const llm = this.llmMap.get(ws);
    if (!llm) return;

    const correctionPrompt = mode === 'immersive'
      ? 'Do NOT correct any errors. Only translate.'
      : [
          'Check if the student made REAL grammar or vocabulary mistakes. Be conservative — only flag clear, objective errors.',
          '',
          'CRITICAL: Prefer UNDER-correction to OVER-correction. A false positive (correcting something that is already fine) is WORSE than missing a minor mistake.',
          '',
          'Rules:',
          '- The student speaks via voice recognition, so punctuation and capitalization are NOT errors. Never correct them.',
          '- ONLY correct objective errors: wrong verb tense, subject-verb disagreement, missing articles where unambiguously required, incorrect word that changes meaning.',
          '- Do NOT correct: natural paraphrases, informal but correct expressions, alternative wording choices, slightly-conversational phrasing.',
          '- "What do you do in your free time" is correct English. "What do you like to do when you have some free time" is also correct. They mean nearly the same thing — do NOT flag one as wrong.',
          '- If the student asked a question but used a statement tone, you may gently suggest adding question words, but only once per conversation.',
          '- If you are unsure whether something is an error, assume it is CORRECT and skip it.',
          '- If there is no clear grammar/vocabulary mistake, output ONLY the translation line. Do NOT invent errors.',
        ].join('\n');

    const translatePrompt = [
      `Translate this AI reply to natural, everyday Chinese:`,
      `"${englishText}"`,
      '',
      `The student said: "${userText}"`,
      '',
      'Rules:',
      '- Write in plain text. No markdown, no dashes, no special symbols.',
      '- The translation should sound like how real people talk, not like a textbook.',
      correctionPrompt,
      '',
      'Output exactly in this format:',
      '中文翻译：<natural Chinese translation>',
      mode !== 'immersive' ? '💡 Tips: <brief Chinese explanation of the error>' : '',
      mode !== 'immersive' ? '🔁 Try again: <ask student to repeat correctly>' : '',
    ].filter(Boolean).join('\n');

    try {
      const result = await llm.chatOnce(translatePrompt);
      if (!result) return;

      const translationMatch = result.match(/中文翻译[：:]\s*(.+)/);
      const tipsMatch = result.match(/💡\s*Tips[：:]\s*([\s\S]*?)(?:🔁|$)/);
      const tryAgainMatch = result.match(/🔁\s*Try again[：:]\s*(.+)/);

      const translation = translationMatch?.[1]?.trim() || '';
      const tips = tipsMatch?.[1]?.trim() || '';
      const tryAgain = tryAgainMatch?.[1]?.trim() || '';

      this.send(ws, {
        type: 'llm_translation',
        translation: translation || undefined,
        tips: tips || undefined,
        tryAgain: tryAgain || undefined,
      });
    } catch {
      // 翻译失败不影响对话
    }
  }

  // ---- LLM 文本 → TTS 语音 ----
  private handleTTS(ws: WebSocket, text: string): void {
    const cfg = getTTSConfig();
    if (!cfg.appId || cfg.appId === 'your_app_id') return;
    if (!text) return;

    // 中止上一次 TTS，避免重叠语音
    this.ttsMap.get(ws)?.abort();

    this.ttsActiveUntil.set(ws, Infinity);
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
        this.ttsActiveUntil.delete(ws); // 合成失败，解除屏蔽
        console.error(`⚠️ TTS 错误: ${err.message}`);
        this.send(ws, { type: 'service_error', service: 'tts', message: err.message });
      },
    });
  }

  // ---- 对比播放 TTS（用户点击 🎧 按钮触发）----
  private handleTTSSpeak(ws: WebSocket, msg: { text: string }): void {
    const cfg = getTTSConfig();
    if (!cfg.appId || cfg.appId === 'your_app_id') return;
    const text = msg.text?.trim();
    if (!text) return;

    const tts = new XunfeiTTS(cfg);
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
        console.error(`⚠️ 对比播放 TTS 错误: ${err.message}`);
      },
    });
  }

  // ---- 发音评测 → 讯飞 ISE ----
  private evaluatePronounce(ws: WebSocket, text: string, audio: Buffer): void {
    console.log(`🔊 ISE evaluate: text="${text.slice(0, 30)}" audio=${audio.length}B`);
    const cfg = getISEConfig();
    if (!cfg.appId || cfg.appId === 'your_app_id') { console.log('  -> skip: no ISE config'); return; }

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
          phoneScores: result.phoneScores,
        });
        // 持久化评测结果
        const sid = this.sessionMap.get(ws)?.sessionId;
        if (sid) addPronunciation(sid, text, result.totalScore, result.accuracyScore, result.fluencyScore, result.integrityScore, result.weakPhones);
        // 累积发音数据供 Agent 决策（保留最近 10 条）
        const scores = this.clientScores.get(ws) || [];
        scores.push(result.totalScore);
        if (scores.length > 10) scores.shift();
        this.clientScores.set(ws, scores);
        // 累积薄弱音素
        if (result.weakPhones.length > 0) {
          const phones = this.clientWeakPhones.get(ws) || [];
          phones.push(...result.weakPhones);
          this.clientWeakPhones.set(ws, phones);
        }
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
    this.ttsActiveUntil.delete(ws); // 打断：立即解除屏蔽，用户可以马上说话

    // 清除回复防抖 + 未发送文本
    const t = this.replyDebounce.get(ws);
    if (t) clearTimeout(t);
    this.replyDebounce.delete(ws);
    this.pendingFinals.delete(ws);

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

  // ---- 新建会话 ----
  private handleNewSession(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'new_session' }>,
  ): void {
    const oldSession = this.sessionMap.get(ws);
    // 结束旧会话的 DB 记录
    if (oldSession) {
      endSession(oldSession.sessionId);
    }

    // 创建新会话
    const sessionId = uuidv4();
    const session = new ConversationSession(sessionId, msg.scene, msg.correctionMode);
    this.sessionMap.set(ws, session);

    // 更新客户端映射
    const client = this.clients.get(ws);
    if (client) client.sessionId = sessionId;

    // 持久化
    createSession(sessionId, msg.scene, msg.correctionMode);

    // 通知前端新 session ID
    this.send(ws, { type: 'connected', sessionId });

    console.log(
      `🆕 新会话: ${sessionId.slice(0, 8)} 场景: ${msg.scene}, 纠错: ${msg.correctionMode}`,
    );
  }

  // ---- 继续历史会话 ----
  private handleContinueSession(
    ws: WebSocket,
    msg: Extract<WSMessage, { type: 'continue_session' }>,
  ): void {
    // 重建历史上下文到当前 ConversationSession
    const session = this.sessionMap.get(ws);
    if (!session) return;

    // 将会话 ID 切换到历史会话，确保后续 addTurn 写入正确 session
    session.sessionId = msg.sessionId;
    const client = this.clients.get(ws);
    if (client) client.sessionId = msg.sessionId;
    session.setConfig(msg.scene, msg.correctionMode);
    for (const t of msg.turns) {
      if (t.role === 'user') {
        session.addUserMessage(t.text);
      } else {
        session.addAssistantMessage(t.text);
      }
    }

    // DB 层面继续该会话
    resumeSession(msg.sessionId, msg.scene, msg.correctionMode);

    console.log(
      `📜 继续会话: ${msg.sessionId.slice(0, 8)} (${msg.turns.length} 条历史)`,
    );
  }

  /** 收集 Agent 决策所需的上下文数据 */
  private buildAgentContext(ws: WebSocket, text: string, session: ConversationSession): AgentContext {
    return {
      userText: text,
      turnNumber: session.turnCount,
      recentScores: this.clientScores.get(ws)?.slice(-5) || [],
      recentAccuracy: [],
      recentFluency: [],
      weakPhones: this.clientWeakPhones.get(ws) || [],
      correctionMode: session.correctionMode,
      scene: session.scene,
      lastAiText: session.getLastAssistantText(),
    };
  }

  // ---- 清理 ----
  private cleanupASR(ws: WebSocket): void {
    const asr = this.asrMap.get(ws);
    if (asr) {
      asr.end();
      asr.disconnect();
      this.asrMap.delete(ws);
    }
    // 停止录音时清空评测缓冲（已有文本的语音段已在 onFinal 即时评测完成）
    this.iseBuffer.set(ws, []);
  }

  // ---- 工具方法 ----
  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
