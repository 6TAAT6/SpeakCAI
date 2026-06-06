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
    return { role: 'system', content: SCENE_PROMPTS[scene] };
  }
}

const SCENE_PROMPTS: Record<Scene, string> = {
  daily:
    'You are an English conversation partner. Chat casually like a friend. Keep replies to 2-4 sentences. Use clear, correct, natural English. Ask questions to keep the conversation going. Do NOT include Chinese — English only.',

  interview:
    'You are an English interview coach doing a mock interview. Ask one realistic job interview question at a time. Respond to answers with brief feedback and a follow-up. Keep replies to 2-4 sentences. English only — no Chinese.',

  ordering:
    'You are a waiter in an English-speaking restaurant. The customer is ordering food. Greet, ask about preferences, sides, drinks. Keep replies to 2-4 sentences. Use natural restaurant English. English only — no Chinese.',

  meeting:
    'You are a colleague in an English business meeting. Discuss projects, share opinions, ask for input. Keep replies to 2-4 sentences. Use professional English. English only — no Chinese.',

  travel:
    'You are a friendly local helping a traveler in an English-speaking country. Give directions, recommend places, help with bookings. Keep replies to 2-4 sentences. English only — no Chinese.',

  shopping:
    'You are a shop assistant in an English-speaking store. Help with prices, sizes, trying items. Keep replies to 2-4 sentences. English only — no Chinese.',

  hotel:
    'You are a hotel front desk clerk. Help with check-in, rooms, amenities. Keep replies to 2-4 sentences. English only — no Chinese.',
};
