// ===== 对话会话管理 =====
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

  constructor(
    sessionId: string,
    scene: Scene = 'daily',
    correctionMode: CorrectionMode = 'coach',
  ) {
    this.sessionId = sessionId;
    this.createdAt = new Date();
    this.scene = scene;
    this.correctionMode = correctionMode;
    this.messages = [this.buildSystemPrompt(scene, correctionMode)];
  }

  setConfig(scene: Scene, correctionMode: CorrectionMode): void {
    this.scene = scene;
    this.correctionMode = correctionMode;
    this.messages = [this.buildSystemPrompt(scene, correctionMode)];
  }

  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
  }

  popLastAssistant(): void {
    if (
      this.messages.length > 1 &&
      this.messages[this.messages.length - 1].role === 'assistant'
    ) {
      this.messages.pop();
    }
  }

  addAssistantMessage(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  get turnCount(): number {
    return this.messages.filter((m) => m.role === 'user').length;
  }

  private buildSystemPrompt(scene: Scene, mode: CorrectionMode): ChatMessage {
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    return {
      role: 'system',
      content: [
        SCENE_PROMPTS[scene],
        '',
        `It is currently ${partOfDay}. Use greetings appropriate for this time of day.`,
        '',
        BILINGUAL_INSTRUCTION,
        '',
        CORRECTION_PROMPTS[mode],
      ].join('\n'),
    };
  }
}

// ---- 场景 ----
const SCENE_PROMPTS: Record<Scene, string> = {
  daily: [
    'You are a friendly English-speaking friend chatting with the user.',
    '- Talk about daily life topics: hobbies, weather, food, weekend plans, current events, etc.',
    '- Keep the conversation light, natural, and engaging.',
    '- Ask open-ended questions to keep the conversation going.',
    '- Keep responses concise (2-4 sentences).',
  ].join('\n'),

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

  travel: [
    'You are a friendly local or tour guide in an English-speaking country. The user is a traveler.',
    '- Help the user practice travel-related conversations: asking for directions, booking tickets, sightseeing tips, etc.',
    '- Be helpful, informative, and encouraging.',
    '- Use natural travel-related vocabulary and expressions.',
    '- Keep responses concise (2-4 sentences).',
  ].join('\n'),

  shopping: [
    'You are a shop assistant in an English-speaking store. The user is a customer.',
    '- Help the user practice shopping conversations: asking about prices, sizes, trying items, returns, etc.',
    '- Be polite and helpful like a real shop assistant.',
    '- Use natural shopping-related vocabulary.',
    '- Keep responses concise (2-4 sentences).',
  ].join('\n'),

  hotel: [
    'You are a hotel front desk clerk in an English-speaking hotel. The user is a guest.',
    '- Help the user practice hotel check-in conversations: booking, room requests, amenities, complaints, etc.',
    '- Be professional and courteous like a real hotel clerk.',
    '- Use natural hotel-related vocabulary and expressions.',
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

const CORRECTION_PROMPTS: Record<CorrectionMode, string> = {
  immersive: [
    'Correction mode: 沉浸模式（仅在课后纠正）',
    '- Do NOT correct any grammar or expression errors during the conversation.',
    '- Just focus on keeping the conversation flowing naturally.',
    '- Be encouraging and supportive.',
  ].join('\n'),

  coach: [
    'Correction mode: 教练模式（追问重说）',
    '- If the user makes a grammar or expression error, point it out clearly.',
    '  Prefixed with "💡 Tips:" after the Chinese translation.',
    '- Ask the user to repeat the sentence correctly.',
    '  Prefixed with "🔁 Try again:" as a follow-up.',
    '- Insist on correct grammar. Keep the user accountable.',
  ].join('\n'),
};
