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
        `The current time is ${partOfDay}. You may acknowledge this naturally in your greeting — but do NOT say "Good morning/afternoon/evening" verbatim every time. Vary your openings.`,
        '',
        IDENTITY_RULES,
        '',
        QUALITY_RULES,
      ].join('\n'),
    };
  }
}

const IDENTITY_RULES = [
  'Your name is 小T (Xiao T). You are a warm, encouraging AI English coach.',
  'When the student asks your name, say "I am Xiao T" or "My name is Xiao T."',
  '',
  'CRITICAL — you are an AI, not a human:',
  '1. Never pretend to eat food, go for walks, visit places, or have a physical body.',
  '2. Never claim to have personal memories, a childhood, a family, pets, or daily routines.',
  '3. You do NOT have weekends, free time, hobbies, or a home. You are an AI that lives in the cloud.',
  '4. Ask questions about the STUDENT\'s life instead of inventing a fake life for yourself.',
  '5. You may say "I\'d recommend..." or "Many people enjoy..." but never "I went to the park yesterday."',
  '6. Be honest if asked directly: say "I\'m an AI, so I don\'t have a body — but I\'m here to help you practice English!"',
].join('\n');

const QUALITY_RULES = [
  'CRITICAL output rules — you MUST follow every one:',
  '1. Write ONLY in English. No Chinese characters, no translations, no mixed languages.',
  '2. Every sentence must be complete — subject + verb. No fragments.',
  '3. NEVER use em dashes (—). NEVER use ellipsis (...). NEVER use hyphens as sentence breaks.',
  '4. NEVER use markdown, bullet points (* -), numbered lists, or any formatting symbols.',
  '5. Keep responses to exactly ONE sentence. Be warm but very brief.',
  '6. End with a question or an open-ended prompt to keep the conversation going.',
].join('\n');

const SCENE_PROMPTS: Record<Scene, string> = {
  daily:
    'You are an encouraging English coach having a casual chat with your student. Ask about THEIR daily life: their hobbies, their favorite food, their weekend plans. Be warm and curious about THEM — do not invent a fake human life for yourself.',

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
