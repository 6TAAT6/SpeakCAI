// ===== ConversationAgent — 自适应教练决策层 =====
// 插在 ASR final 和 LLM call 之间。根据发音分数、对话进度、
// 错误模式动态调整 AI 的教学策略。纯本地规则计算，零 API 延迟。

import type { ActionPlan, AgentAction, Scene, CorrectionMode } from '../../shared/types.ts';

// ---- Agent 决策上下文 ----
export interface AgentContext {
  /** 用户当前说的文本 */
  userText: string;
  /** 本轮是第几轮对话（从 1 开始） */
  turnNumber: number;
  /** 最近 N 轮发音总分 */
  recentScores: number[];
  /** 最近 N 轮准确度分数 */
  recentAccuracy: number[];
  /** 最近 N 轮流利度分数 */
  recentFluency: number[];
  /** 薄弱音素列表（累积，去重） */
  weakPhones: string[];
  /** 当前纠错模式 */
  correctionMode: CorrectionMode;
  /** 当前对话场景 */
  scene: Scene;
  /** 上一轮 AI 的回复文本（可选） */
  lastAiText?: string;
}

// ---- ConversationAgent ----
export class ConversationAgent {
  /** 主决策方法：根据上下文返回 ActionPlan */
  decide(ctx: AgentContext): ActionPlan {
    const avgScore = this.avg(ctx.recentScores);
    const scoreTrend = this.trend(ctx.recentScores);
    const action = this.pickAction(ctx.turnNumber, ctx.recentScores, ctx.weakPhones);
    const difficulty = this.mapDifficulty(avgScore);
    const tone = this.pickTone(action, scoreTrend);
    const focusAreas = this.pickFocusAreas(ctx.weakPhones, ctx.recentScores);
    const hint = focusAreas.length > 0
      ? focusAreas.map((p) => `/${p}/`).join(' ') + ' 注意发音'
      : undefined;

    return { action, tone, difficulty, focusAreas, preConversationHint: hint };
  }

  // ---- 私有决策方法 ----

  private pickAction(
    turnNumber: number,
    recentScores: number[],
    weakPhones: string[],
  ): AgentAction {
    // 热身阶段：前 2 轮不干预
    if (turnNumber <= 2) return 'reply';

    // 同一弱音素出现 3+ 次 → 建议专项练习（优先级高于整体低分）
    if (weakPhones.length >= 3) {
      return 'drill';
    }

    // 连续 3 轮发音 < 70 → 纠错提醒
    if (recentScores.length >= 3 && recentScores.slice(-3).every((s) => s < 70)) {
      return 'correct_prompt';
    }

    // 连续 3 轮发音 > 85 → 鼓励
    if (recentScores.length >= 3 && recentScores.slice(-3).every((s) => s > 85)) {
      return 'encourage';
    }

    return 'reply';
  }

  /** 根据平均分映射 CEFR 难度等级 */
  private mapDifficulty(avgScore: number): ActionPlan['difficulty'] {
    if (avgScore <= 0) return 'B1'; // 无评分数据 → 默认中等
    if (avgScore < 50) return 'A1';
    if (avgScore < 65) return 'A2';
    if (avgScore < 80) return 'B1';
    if (avgScore < 90) return 'B2';
    return 'C1';
  }

  /** 根据 action 和分数趋势选语气 */
  private pickTone(action: AgentAction, trend: 'up' | 'down' | 'flat'): ActionPlan['tone'] {
    switch (action) {
      case 'correct_prompt': return 'corrective';
      case 'drill': return 'corrective';
      case 'encourage': return 'encouraging';
      case 'reply': return trend === 'down' ? 'encouraging' : 'warm';
    }
  }

  /** 生成本轮 focusAreas（取最高频 3 个弱音素） */
  private pickFocusAreas(weakPhones: string[], recentScores: number[]): string[] {
    // 如果最近一轮分数 < 70，优先提醒弱音素
    const lastScore = recentScores[recentScores.length - 1] ?? 100;
    if (lastScore >= 70) return [];
    return weakPhones.slice(0, 3);
  }

  /** 将 ActionPlan 转为可注入 LLM 系统提示词的指令文本 */
  buildAgentInstruction(plan: ActionPlan): string {
    const lines: string[] = [];

    // 难度档位
    const diffMap: Record<string, string> = {
      A1: 'Use very simple vocabulary and short sentences. Speak as if to a beginner.',
      A2: 'Use basic vocabulary and simple sentence structures.',
      B1: 'Use everyday vocabulary and natural sentence length.',
      B2: 'Use moderately advanced vocabulary and varied sentence structures.',
      C1: 'Use rich vocabulary and sophisticated expressions freely.',
    };
    lines.push(diffMap[plan.difficulty] || '');

    // 语气指令
    const toneMap: Record<string, string> = {
      warm: 'Keep a warm, friendly tone — like chatting with a friend.',
      encouraging: 'Be especially encouraging and supportive this round.',
      corrective: 'Gently point out 1 improvement area after your reply. Be kind.',
      playful: 'Keep a light, playful tone.',
    };
    lines.push(toneMap[plan.tone] || '');

    // action 指令
    switch (plan.action) {
      case 'correct_prompt':
        lines.push('After your reply, briefly mention ONE pronunciation or grammar area the student could improve. Keep it encouraging.');
        break;
      case 'drill':
        if (plan.focusAreas.length > 0) {
          lines.push(`The student struggles with these sounds: ${plan.focusAreas.join(', ')}. If a natural opportunity arises, use a word containing one of these sounds.`);
        }
        break;
      case 'encourage':
        lines.push('The student is doing well! Offer genuine praise and keep the conversation flowing naturally.');
        break;
      // 'reply' — 不加额外指令
    }

    return lines.filter(Boolean).join('\n');
  }

  // ---- 工具方法 ----

  private avg(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  private trend(nums: number[]): 'up' | 'down' | 'flat' {
    if (nums.length < 2) return 'flat';
    const recent = nums.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (last > first + 5) return 'up';
    if (last < first - 5) return 'down';
    return 'flat';
  }
}
