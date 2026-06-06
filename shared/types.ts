// ===== 英语口语教练 — 前后端共享类型定义 =====
// 此文件被 client/ 和 server/ 共同引用，确保消息协议一致

// ---- 场景类型 ----
export type Scene = 'daily' | 'interview' | 'ordering' | 'meeting' | 'travel' | 'shopping' | 'hotel';

// ---- 纠错模式 ----
export type CorrectionMode = 'immersive' | 'coach';

// ---- WebSocket 消息类型枚举 ----
export type WSMessage =
  // 连接管理
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'connected'; sessionId: string }

  // 音频流（浏览器 → 后端）
  | { type: 'audio_frame'; data: number[]; seq: number }

  // 语音识别（后端 → 浏览器）
  | { type: 'asr_partial'; text: string }
  | { type: 'asr_final'; text: string }

  // AI 对话流（后端 → 浏览器）
  | { type: 'llm_stream'; text: string }
  | {
      type: 'llm_done';
      text?: string;
      tips?: string;
      tryAgain?: string;
    }

  // 语音合成（后端 → 浏览器）
  | { type: 'tts_audio'; data: string; chunkIndex: number }
  | { type: 'tts_done' }

  // 纠错（后端 → 浏览器）
  | {
      type: 'correction';
      tips: string;
      tryAgain?: string;
    }

  // 发音评测（后端 → 浏览器）
  | {
      type: 'pronounce_result';
      totalScore: number;
      accuracyScore: number;
      fluencyScore: number;
      integrityScore: number;
      weakPhones: string[];
    }

  // 中文翻译（独立 LLM 调用后返回）
  | {
      type: 'llm_translation';
      translation?: string;
      tips?: string;
      tryAgain?: string;
    }

  // TTS 播放完成通知（前端 → 后端，解除回声屏蔽）
  | { type: 'tts_playback_done' }

  // 打断信号（双向）
  | { type: 'interrupt' }

  // 继续对话（打断后恢复）
  | { type: 'resume' }

  // 配置更新（浏览器 → 后端）
  | {
      type: 'config_update';
      payload: {
        scene: Scene;
        correctionMode: CorrectionMode;
      };
    };

// ---- 纠错条目 ----
export interface CorrectionItem {
  original: string;
  corrected: string;
  errorType: 'grammar' | 'expression' | 'word_choice' | 'tense';
  confidence: number;
  explanationShort: string;
}

// ---- 发音评测结果 ----
export interface PronunciationResult {
  totalScore: number;
  wordScores: Array<{
    word: string;
    score: number;
    phonemes: Array<{ phoneme: string; score: number }>;
  }>;
  weakPhonemes: Array<{ phoneme: string; score: number; exampleWords: string[] }>;
}

// ---- 课后报告 ----
export interface LessonReport {
  sessionId: string;
  scene: Scene;
  date: string;
  durationSeconds: number;
  turnCount: number;
  overallScore: string;
  grammarErrors: CorrectionItem[];
  pronunciation: PronunciationResult;
  expressionUpgrades: Array<{ original: string; suggestion: string; reason: string }>;
  improvementTips: string[];
}

// ---- 报告生成 ----

/** 前端发送给后端报告 API 的请求体 */
export interface ReportRequest {
  sessionId?: string;
  turns: Array<{
    role: 'user' | 'ai';
    text: string;
    score?: number;
    accuracy?: number;
    fluency?: number;
    integrity?: number;
    weakPhones?: string[];
    tips?: string;
    tryAgain?: string;
  }>;
  scene: string;
  mode: string;
}

/** DeepSeek 生成的定性分析 */
export interface LLMAnalysis {
  overallLevel: string;
  grammarErrors: Array<{
    original: string;
    corrected: string;
    errorType: string;
    explanationShort: string;
  }>;
  expressionUpgrades: Array<{
    original: string;
    suggestion: string;
    reason: string;
  }>;
  improvementTips: string[];
}

