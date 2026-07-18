// ===== ConversationAgent 单元测试 =====
import { describe, it, expect } from 'vitest';
import { ConversationAgent } from './agent.ts';
import type { AgentContext } from './agent.ts';

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    userText: 'Hello, how are you?',
    turnNumber: 1,
    recentScores: [],
    recentAccuracy: [],
    recentFluency: [],
    weakPhones: [],
    correctionMode: 'coach',
    scene: 'daily',
    ...overrides,
  };
}

describe('ConversationAgent', () => {
  const agent = new ConversationAgent();

  // ---- 1. 热身阶段 ----
  it('前2轮返回 reply + warm tone', () => {
    const plan = agent.decide(makeCtx({ turnNumber: 1 }));
    expect(plan.action).toBe('reply');
    expect(plan.tone).toBe('warm');
    expect(plan.difficulty).toBe('B1'); // 无数据默认中等
  });

  // ---- 2. 连续低分 ----
  it('连续3轮发音 < 70 返回 correct_prompt', () => {
    const plan = agent.decide(makeCtx({
      turnNumber: 5,
      recentScores: [60, 55, 50],
    }));
    expect(plan.action).toBe('correct_prompt');
    expect(plan.tone).toBe('corrective');
  });

  // ---- 3. 弱音素累积 ----
  it('同音素多次薄弱返回 drill', () => {
    const plan = agent.decide(makeCtx({
      turnNumber: 6,
      recentScores: [65, 60, 58],
      weakPhones: ['th', 'th', 'th', 'r'], // 'th' 出现3次
    }));
    expect(plan.action).toBe('drill');
    expect(plan.tone).toBe('corrective');
    // 最近分数 58 < 70，所以会输出 focusAreas
    expect(plan.focusAreas.length).toBeGreaterThan(0);
    expect(plan.focusAreas).toContain('th');
  });

  // ---- 4. 连续高分 ----
  it('连续3轮发音 > 85 返回 encourage', () => {
    const plan = agent.decide(makeCtx({
      turnNumber: 8,
      recentScores: [90, 88, 92],
    }));
    expect(plan.action).toBe('encourage');
    expect(plan.tone).toBe('encouraging');
  });

  // ---- 5. 难度适配 ----
  it('根据分数适配 CEFR 难度等级', () => {
    expect(agent.decide(makeCtx({ recentScores: [40] })).difficulty).toBe('A1');
    expect(agent.decide(makeCtx({ recentScores: [55] })).difficulty).toBe('A2');
    expect(agent.decide(makeCtx({ recentScores: [70] })).difficulty).toBe('B1');
    expect(agent.decide(makeCtx({ recentScores: [85] })).difficulty).toBe('B2');
    expect(agent.decide(makeCtx({ recentScores: [95] })).difficulty).toBe('C1');
  });

  // ---- 6. buildAgentInstruction ----
  it('buildAgentInstruction 生成有效指令文本', () => {
    const plan = agent.decide(makeCtx({ turnNumber: 5, recentScores: [86, 90, 92] }));
    const instruction = agent.buildAgentInstruction(plan);
    // encourage action → generous praise + keep conversation flowing
    expect(instruction).toContain('genuine praise');
    expect(instruction).toContain('flowing naturally');
    // B2 difficulty → moderately advanced
    expect(instruction).toContain('moderately advanced');
  });

  it('correct_prompt 指令包含纠错引导', () => {
    const plan = agent.decide(makeCtx({ turnNumber: 5, recentScores: [60, 55, 50] }));
    const instruction = agent.buildAgentInstruction(plan);
    expect(instruction).toContain('improvement area');
    expect(instruction).toContain('Keep it encouraging');
  });

  // ---- 7. empty context 安全兜底 ----
  it('空上下文安全兜底（不抛异常）', () => {
    const plan = agent.decide(makeCtx({}));
    expect(plan.action).toBe('reply');
    expect(plan.difficulty).toBe('B1');
    expect(plan.tone).toBe('warm');
    expect(plan.focusAreas).toEqual([]);
  });

  // ---- 8. immersive 模式不影响 action ----
  it('coach 和 immersive 模式 action 无差异', () => {
    const coachPlan = agent.decide(makeCtx({ correctionMode: 'coach', turnNumber: 5, recentScores: [60, 55, 50] }));
    const immersivePlan = agent.decide(makeCtx({ correctionMode: 'immersive', turnNumber: 5, recentScores: [60, 55, 50] }));
    expect(coachPlan.action).toBe(immersivePlan.action);
  });

  // ---- 9. 分数上升趋势 → 回复温暖 ----
  it('分数上升趋势中 reply + warm', () => {
    const plan = agent.decide(makeCtx({
      turnNumber: 5,
      recentScores: [60, 70, 80], // 上升趋势
    }));
    expect(plan.action).toBe('reply');
    expect(plan.tone).toBe('warm');
  });

  // ---- 10. 分数下降趋势 → reply + encouraging ----
  it('分数下降趋势中 reply + encouraging', () => {
    const plan = agent.decide(makeCtx({
      turnNumber: 5,
      recentScores: [80, 70, 60], // 下降趋势
    }));
    expect(plan.action).toBe('reply');
    expect(plan.tone).toBe('encouraging');
  });
});
