// ===== 对话会话管理 =====
import type { Scene, CorrectionMode, ActionPlan } from '../../shared/types.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ConversationSession {
  sessionId: string;
  readonly createdAt: Date;
  scene: Scene;
  correctionMode: CorrectionMode;
  messages: ChatMessage[];
  private _agentPlan: ActionPlan | null = null;

  constructor(
    sessionId: string,
    scene: Scene = 'daily',
    correctionMode: CorrectionMode = 'coach',
  ) {
    this.sessionId = sessionId;
    this.createdAt = new Date();
    this.scene = scene;
    this.correctionMode = correctionMode;
    this.messages = [this.makeSystem(scene, correctionMode, null)];
  }

  setConfig(scene: Scene, correctionMode: CorrectionMode): void {
    this.scene = scene;
    this.correctionMode = correctionMode;
    // 只更新 system prompt，保留已有对话上下文
    const userMsgs = this.messages.filter((m) => m.role !== 'system');
    this.messages = [this.makeSystem(scene, correctionMode, this._agentPlan), ...userMsgs];
  }

  /** 注入 Agent 决策结果，下次 getMessages 时系统提示词自动生效 */
  setAgentPlan(plan: ActionPlan): void {
    this._agentPlan = plan;
    // 热更新 system prompt 中的 Agent 指令（保留已有对话）
    const userMsgs = this.messages.filter((m) => m.role !== 'system');
    this.messages = [this.makeSystem(this.scene, this.correctionMode, plan), ...userMsgs];
  }

  get agentPlan(): ActionPlan | null {
    return this._agentPlan;
  }

  /** 获取上一轮 AI 回复文本（Agent 决策用） */
  getLastAssistantText(): string | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'assistant') return this.messages[i].content;
    }
    return undefined;
  }

  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
    this.trimHistory();
  }

  popLastAssistant(): void {
    if (this.messages.length > 1 && this.messages[this.messages.length - 1].role === 'assistant') {
      this.messages.pop();
    }
  }

  addAssistantMessage(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
    this.trimHistory();
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /** 保留 system + 最近 12 轮，防止上下文过大导致 LLM 超时/退化 */
  private trimHistory(keepTurns = 12): void {
    const sys = this.messages.find((m) => m.role === 'system');
    const chats = this.messages.filter((m) => m.role !== 'system');
    if (chats.length <= keepTurns * 2) return;
    this.messages = sys ? [sys, ...chats.slice(-keepTurns * 2)] : chats.slice(-keepTurns * 2);
  }

  get turnCount(): number {
    return this.messages.filter((m) => m.role === 'user').length;
  }

  private makeSystem(scene: Scene, _mode: CorrectionMode, plan: ActionPlan | null): ChatMessage {
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const base = [
      SCENE_PROMPTS[scene],
      `The current time is ${partOfDay}. You may acknowledge this naturally in your greeting — but do NOT say "Good morning/afternoon/evening" verbatim every time. Vary your openings.`,
      '',
      IDENTITY_RULES,
      '',
      QUALITY_RULES,
    ];

    // Agent 指令注入（训练指令：告诉 LLM 本轮的教学策略）
    if (plan) {
      base.push(
        '',
        '=== COACHING DIRECTIVE FOR THIS TURN ===',
        `Difficulty level: ${plan.difficulty}. ${this.difficultyHint(plan.difficulty)}`,
        plan.action === 'correct_prompt'
          ? 'After your reply, briefly mention ONE area the student could improve. Be kind and encouraging.'
          : '',
        plan.action === 'drill' && plan.focusAreas.length > 0
          ? `The student needs practice with these sounds: ${plan.focusAreas.join(', ')}. If natural, use a word with one of these sounds.`
          : '',
        plan.action === 'encourage'
          ? 'The student is progressing well. Offer genuine praise and keep the conversation flowing.'
          : '',
      );
    }

    return {
      role: 'system',
      content: base.filter(Boolean).join('\n'),
    };
  }

  private difficultyHint(d: string): string {
    const map: Record<string, string> = {
      A1: 'Use very simple vocabulary and short sentences.',
      A2: 'Use basic vocabulary. Keep sentences straightforward.',
      B1: 'Use everyday English with natural sentence length.',
      B2: 'Use moderately advanced vocabulary and varied structures.',
      C1: 'Use rich vocabulary and sophisticated expressions freely.',
    };
    return map[d] || '';
  }
}

const IDENTITY_RULES = [
  'Your name is Xiao T. You are a warm, encouraging English coach — like chatting with a friend.',
  'When asked your name, say "I am Xiao T" or "My name is Xiao T."',
  '',
  'HOW TO HANDLE QUESTIONS ABOUT YOURSELF:',
  '1. DO NOT announce you are an AI unless the student explicitly asks "are you an AI?", "are you a real person?", or a similar direct question about your nature.',
  '2. Casual questions like "how are you?", "how about you?", "what do you think?", "do you like...?" are NOT asking about your AI nature — answer them warmly and naturally, as a friend would.',
  '3. For "How are you?": say "I am doing great, thanks" or "Pretty good today." Keep it natural and brief.',
  '4. For "Do you like...?" questions: share an opinion or recommendation. Say "I think that sounds great" or "I would recommend..." — never say "I cannot because I am an AI."',
  '5. Never invent a fake human life (childhood, family, pets, daily routines). Stay in the friendly coach character without fabricating a backstory.',
  '6. If the student says "take a break", "don\'t push yourself", or similar caring words: thank them warmly. Say "That is kind of you" or "I appreciate that." Do NOT respond with "I am an AI so I do not get tired."',
].join('\n');

const QUALITY_RULES = [
  'CRITICAL output rules — you MUST follow every one:',
  '1. Write ONLY in English. No Chinese characters, no translations, no mixed languages.',
  '2. Every sentence must be complete — subject + verb. No fragments.',
  '3. NEVER use em dashes (—). NEVER use ellipsis (...). NEVER use hyphens as sentence breaks.',
  '4. NEVER use markdown, bullet points, numbered lists, or any formatting symbols.',
  '5. Keep responses warm and natural — typically 1 to 3 sentences. Do not be too short or robotic.',
  '6. Do NOT end every response with a question. Only ask when it flows naturally. A warm comment is often enough.',
  '7. Match the student\'s energy and tone. If they sound tired, be gentle. If they are playful, be playful back.',
].join('\n');

const SCENE_PROMPTS: Record<Scene, string> = {
  daily:
    'You are having a relaxed, personal chat with your English student — like a cafe conversation with a friend. Talk about anything: hobbies, food, plans, movies, music, travel, culture. Read their mood, match their energy. Share opinions, disagree lightly, laugh at jokes — be a real conversation partner. Ask follow-up questions naturally but do not interrogate. Sometimes just share a thought. Be warm, curious, and genuine.',

  interview:
    'You are an English interview coach. Ask one realistic job interview question at a time. Respond naturally to answers with brief feedback or a follow-up question.',

  ordering:
    'You are a waiter in an English-speaking restaurant. Take the order naturally. Ask about preferences, sides, drinks. Use casual restaurant English.',

  meeting:
    'You are a business colleague. Discuss project updates, share opinions, ask for input. Use professional but friendly English.',

  travel:
    'You are a friendly local helping a traveler. Give directions, recommend places, help with bookings. Use natural travel vocabulary.',

  shopping:
    'You are a shop assistant. Help with prices, sizes, trying items. Be polite and helpful like a real store clerk.',

  hotel:
    'You are a hotel front desk clerk. Help with check-in, rooms, amenities. Be professional and courteous.',
};
