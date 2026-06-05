// ===== 对话会话管理 =====
// 维护每个客户端的对话上下文（System Prompt + 历史消息）
// 用于在 LLM 调用前组装完整的 messages 数组

import type { Scene, CorrectionMode } from '../../shared/types.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ConversationSession {
  readonly sessionId: string;
  readonly createdAt: Date;
  scene: Scene;
  correctionMode: CorrectionMode;
  messages: ChatMessage[];

  constructor(sessionId: string, scene: Scene = 'interview', correctionMode: CorrectionMode = 'coach') {
    this.sessionId = sessionId;
    this.createdAt = new Date();
    this.scene = scene;
    this.correctionMode = correctionMode;
    this.messages = [this.buildSystemPrompt(scene, correctionMode)];
  }

  /** 更换场景或纠错模式时重建 System Prompt，清空历史对话 */
  setConfig(scene: Scene, correctionMode: CorrectionMode): void {
    this.scene = scene;
    this.correctionMode = correctionMode;
    this.messages = [this.buildSystemPrompt(scene, correctionMode)];
  }

  private static readonly MAX_TURNS = 20;

  /** 添加用户消息（超过 20 轮则截断旧消息） */
  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
    this.trimHistory();
  }

  /** 移除最后一条 assistant 消息（打断后去除截断回复） */
  popLastAssistant(): void {
    if (this.messages.length > 1 && this.messages[this.messages.length - 1].role === 'assistant') {
      this.messages.pop();
    }
  }

  /** 添加助手回复 */
  addAssistantMessage(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
  }

  /** 获取传给 LLM 的完整消息数组（副本，防止外部修改内部状态） */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /** 统计对话轮数（user+assistant 为一轮） */
  get turnCount(): number {
    return this.messages.filter((m) => m.role === 'user').length;
  }

  /** 截断旧消息，保留 System Prompt + 最近 MAX_TURNS 轮 */
  private trimHistory(): void {
    const userCount = this.messages.filter((m) => m.role === 'user').length;
    if (userCount <= ConversationSession.MAX_TURNS) return;

    const systemMsg = this.messages.find((m) => m.role === 'system');
    // 跳过 System Prompt，只计 user 消息，保留最后 MAX_TURNS 轮
    let keepFrom = 0;
    let userSeen = 0;
    const skip = userCount - ConversationSession.MAX_TURNS;
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].role === 'user') userSeen++;
      if (userSeen > skip) { keepFrom = i; break; }
    }
    this.messages = systemMsg
      ? [systemMsg, ...this.messages.slice(keepFrom).filter((m) => m.role !== 'system')]
      : this.messages.slice(keepFrom);
  }

  // ---- System Prompt ----
  private buildSystemPrompt(scene: Scene, mode: CorrectionMode): ChatMessage {
    return {
      role: 'system',
      content: [
        SCENE_PROMPTS[scene],
        '',
        BILINGUAL_INSTRUCTION,
        '',
        CORRECTION_PROMPTS[mode],
      ].join('\n'),
    };
  }
}

// ---- 场景 System Prompt ----
const SCENE_PROMPTS: Record<Scene, string> = {
  interview: [
    'You are a professional English interview coach. The user is practicing for a job interview.',
    '- Ask realistic interview questions one at a time.',
    '- Respond naturally to the user\'s answers, occasionally asking follow-up questions.',
    '- Keep the conversation flowing like a real interview.',
    '- Occasionally give brief, encouraging feedback on their answers.',
    '- Keep responses concise (2-4 sentences).',
  ].join('\n'),

  ordering: [
    'You are a waiter/waitress in an English-speaking restaurant. The user is a customer.',
    '- Greet the customer, take their order, and respond naturally.',
    '- Ask about preferences, allergies, drink choices, etc.',
    '- Keep the conversation casual and realistic like a real restaurant interaction.',
    '- Keep responses concise (2-4 sentences).',
  ].join('\n'),

  meeting: [
    'You are a colleague in a business meeting conducted in English. The user is another participant.',
    '- Discuss project updates, share opinions, ask for the user\'s input.',
    '- Use professional but friendly business English.',
    '- Keep the conversation productive and collaborative.',
    '- Keep responses concise (2-4 sentences).',
  ].join('\n'),
};

const BILINGUAL_INSTRUCTION = [
  'IMPORTANT — Output format:',
  'Always reply in this exact format:',
  'English response.',
  '中文翻译。',
  'The first line is English, the second line is the Chinese translation.',
  'Never omit the Chinese line. Never add extra blank lines between them.',
].join('\n');

// ---- 三种纠错模式 System Prompt ----
const CORRECTION_PROMPTS: Record<CorrectionMode, string> = {
  immersive: [
    'Correction mode: 沉浸模式（仅在课后纠正）',
    '- Do NOT correct any grammar or expression errors during the conversation.',
    '- Just focus on keeping the conversation flowing naturally.',
    '- Be encouraging and supportive.',
  ].join('\n'),

  coach: [
    'Correction mode: 教练模式（轻量提醒）',
    '- If the user makes a grammar or expression error, briefly note 1-2 key mistakes',
    '  at the end of your response, after the Chinese translation, prefixed with "💡 Tips:".',
    '- Focus on the most important errors, not every minor mistake.',
    '- Be encouraging, not harsh.',
  ].join('\n'),

  strict: [
    'Correction mode: 严师模式（追问重说）',
    '- If the user makes a grammar or expression error, point it out clearly.',
    '  Prefixed with "💡 Tips:" after the Chinese translation.',
    '- Ask the user to repeat the sentence correctly.',
    '  Prefixed with "🔁 Try again:" as a follow-up.',
    '- Insist on correct grammar. Keep the user accountable.',
  ].join('\n'),
};
