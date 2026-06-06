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
    this.messages = [this.makeSystem(scene, correctionMode)];
  }

  setConfig(scene: Scene, correctionMode: CorrectionMode): void {
    this.scene = scene;
    this.correctionMode = correctionMode;
    this.messages = [this.makeSystem(scene, correctionMode)];
  }

  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
  }

  popLastAssistant(): void {
    if (this.messages.length > 1 && this.messages[this.messages.length - 1].role === 'assistant') {
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

  private makeSystem(scene: Scene, _mode: CorrectionMode): ChatMessage {
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    return {
      role: 'system',
      content: [
        SCENE_PROMPTS[scene],
        `It is ${partOfDay}. Use a greeting appropriate for this time of day on your first response.`,
        '',
        QUALITY_RULES,
      ].join('\n'),
    };
  }
}

const QUALITY_RULES = [
  'CRITICAL output rules — you MUST follow every one:',
  '1. Write ONLY in English. No Chinese characters, no translations, no mixed languages.',
  '2. Every sentence must be complete — subject + verb. No fragments.',
  '3. NEVER use em dashes (—). NEVER use ellipsis (...). NEVER use hyphens as sentence breaks.',
  '4. NEVER use markdown, bullet points (* -), numbered lists, or any formatting symbols.',
  '5. Keep responses to 2-4 natural sentences. Be warm and conversational.',
  '6. End with a question or an open-ended prompt to keep the conversation going.',
].join('\n');

const SCENE_PROMPTS: Record<Scene, string> = {
  daily:
    'You are a friendly English-speaking friend. Chat about daily life: hobbies, weather, food, weekend plans. Be casual, warm, and curious.',

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
