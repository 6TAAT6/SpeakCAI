import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 .env（必须在其他 import 之前）
config({ path: resolve(process.cwd(), '../.env') });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WSServer } from './ws-server.ts';
import { getSessions, getTurns, deleteSession, deleteSessions, saveReport, getReport, getProgress } from './db.ts';
import { closeDB } from './db.ts';
import type { ReportRequest, LLMAnalysis } from '../../shared/types.ts';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
const MAX_SESSION_ID_LENGTH = 64;
const MAX_REPORT_TURNS = 200;
const MAX_TURN_TEXT_LENGTH = 5_000;
const SCENES = new Set(['daily', 'interview', 'ordering', 'meeting', 'travel', 'shopping', 'hotel']);
const MODES = new Set(['immersive', 'coach']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const wsServer = new WSServer(WS_PORT);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_SESSION_ID_LENGTH
    && UUID_PATTERN.test(value);
}

function isOptionalScore(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
}

function isOptionalText(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function parseReportRequest(value: unknown): ReportRequest | null {
  if (!isRecord(value)
    || !Array.isArray(value.turns)
    || value.turns.length === 0
    || value.turns.length > MAX_REPORT_TURNS
    || typeof value.scene !== 'string'
    || !SCENES.has(value.scene)
    || typeof value.mode !== 'string'
    || !MODES.has(value.mode)
    || (value.sessionId !== undefined && !isSessionId(value.sessionId))) {
    return null;
  }

  const turns: ReportRequest['turns'] = [];
  for (const item of value.turns) {
    if (!isRecord(item)
      || (item.role !== 'user' && item.role !== 'ai')
      || typeof item.text !== 'string'
      || item.text.trim().length === 0
      || item.text.length > MAX_TURN_TEXT_LENGTH
      || !isOptionalScore(item.score)
      || !isOptionalScore(item.accuracy)
      || !isOptionalScore(item.fluency)
      || !isOptionalScore(item.integrity)
      || !isOptionalText(item.tips, 1_000)
      || !isOptionalText(item.tryAgain, 1_000)
      || (item.weakPhones !== undefined
        && (!Array.isArray(item.weakPhones)
          || item.weakPhones.length > 50
          || !item.weakPhones.every(phone => typeof phone === 'string' && phone.length > 0 && phone.length <= 32)))) {
      return null;
    }

    turns.push({
      role: item.role,
      text: item.text.trim(),
      score: item.score,
      accuracy: item.accuracy,
      fluency: item.fluency,
      integrity: item.integrity,
      weakPhones: item.weakPhones as string[] | undefined,
      tips: item.tips,
      tryAgain: item.tryAgain,
    });
  }

  return {
    sessionId: value.sessionId as string | undefined,
    turns,
    scene: value.scene,
    mode: value.mode,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

// ---- HTTP 服务器（REST API）----
const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: '500kb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 对话历史 — 会话列表
app.get('/api/sessions', (_req, res) => {
  try {
    const sessions = getSessions(50);
    res.json(sessions);
  } catch {
    res.status(500).json({ error: '数据库查询失败' });
  }
});

// 对话历史 — 单场对话轮次
app.get('/api/sessions/:id/turns', (req, res) => {
  if (!isSessionId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  try {
    const turns = getTurns(req.params.id);
    res.json(turns);
  } catch {
    res.status(500).json({ error: '数据库查询失败' });
  }
});

// 对话历史 — 删除会话
app.delete('/api/sessions/:id', (req, res) => {
  if (!isSessionId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  if (wsServer.isSessionActive(req.params.id)) {
    return res.status(409).json({ error: 'This session is active. Start or switch to another conversation first.' });
  }
  try {
    deleteSession(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: '删除失败' });
  }
});

// 对话历史 — 批量删除会话
app.post('/api/sessions/batch-delete', (req, res) => {
  try {
    if (!isRecord(req.body) || !Array.isArray(req.body.ids) || req.body.ids.length === 0 || req.body.ids.length > 50) {
      return res.status(400).json({ error: '请提供要删除的会话 ID 列表' });
    }
    if (!req.body.ids.every(isSessionId)) {
      return res.status(400).json({ error: 'The session ID list contains invalid values.' });
    }
    const ids = [...new Set(req.body.ids as string[])];
    const activeIds = ids.filter(id => wsServer.isSessionActive(id));
    if (activeIds.length > 0) {
      return res.status(409).json({
        error: 'The selection includes an active conversation. Start or switch to another conversation first.',
        activeIds,
      });
    }
    const deleted = deleteSessions(ids);
    res.json({ ok: true, deleted });
  } catch {
    res.status(500).json({ error: '批量删除失败' });
  }
});

// ---- 学习报告生成 ----

function buildReportPrompt(body: ReportRequest): string {
  const sceneNames: Record<string, string> = { daily: '日常', interview: '面试', ordering: '点餐', meeting: '会议', travel: '旅游', shopping: '购物', hotel: '酒店' };
  const modeNames: Record<string, string> = { immersive: '沉浸（不纠错）', coach: '教练（要求重说）' };

  let transcript = '';
  for (const t of body.turns) {
    const label = t.role === 'user' ? '学生' : 'AI 教练';
    let extra = '';
    if (t.role === 'user' && t.score !== undefined) {
      extra = ` [发音: ${t.score}分, 准确度:${t.accuracy ?? '-'}, 流利度:${t.fluency ?? '-'}, 完整度:${t.integrity ?? '-'}]`;
    }
    if (t.role === 'ai' && t.tips) {
      extra += `\n💡 纠错建议: ${t.tips}`;
      if (t.tryAgain) extra += `\n🔁 要求重说: ${t.tryAgain}`;
    }
    transcript += `【${label}】${extra}\n${t.text}\n\n`;
  }

  return `你是一位资深的英语口语教练。请根据以下对话练习记录，生成一份学习报告。

=== 会话信息 ===
场景: ${sceneNames[body.scene] || body.scene}
模式: ${modeNames[body.mode] || body.mode}
对话轮次: ${body.turns.filter(t => t.role === 'user').length} 轮

=== 对话记录 ===
${transcript}

=== 要求 ===
请返回一个严格的 JSON 对象，字段如下：
{
  "overallLevel": "根据词汇量、语法准确性、流利度综合评估：A1 入门 / A2 基础 / B1 中级 / B2 中高级 / C1 高级 — 请给出最符合的等级",
  "grammarErrors": [
    { "original": "原文错误表达", "corrected": "正确表达", "errorType": "grammar|expression|word_choice|tense", "explanationShort": "简短中文解释（15字以内）" }
  ],
  "expressionUpgrades": [
    { "original": "原文简单表达", "suggestion": "更地道/自然的表达方式", "reason": "简短中文说明" }
  ],
  "improvementTips": ["3-5 条具体的改进建议，中文，每条20字以内"]
}

规则：
- 只返回 JSON，不要 markdown 代码围栏，不要任何额外文字
- 如果没有发现错误，对应字段返回空数组 []
- 语法错误最多列出 5 个，优先最严重的
- 改进建议要具体可执行，关联对话中的实际表现`;
}

function parseJSONValue(raw: string): unknown {
  // 尝试直接解析
  try { return JSON.parse(raw) as unknown; } catch { /* Continue. */ }

  // 尝试剥离 markdown 代码围栏 ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()) as unknown; } catch { /* Continue. */ }
  }

  // 查找第一个 { 和最后一个 }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as unknown; } catch { /* Continue. */ }
  }

  throw new Error('无法解析 LLM 返回的 JSON');
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeReportAnalysis(value: unknown): LLMAnalysis | null {
  if (!isRecord(value)) return null;
  const overallLevel = boundedString(value.overallLevel, 100);
  if (!overallLevel) return null;

  const grammarErrors: LLMAnalysis['grammarErrors'] = [];
  if (Array.isArray(value.grammarErrors)) {
    for (const item of value.grammarErrors.slice(0, 5)) {
      if (!isRecord(item)) continue;
      const original = boundedString(item.original, 1_000);
      const corrected = boundedString(item.corrected, 1_000);
      const explanationShort = boundedString(item.explanationShort, 500);
      if (!original || !corrected || !explanationShort) continue;
      grammarErrors.push({
        original,
        corrected,
        errorType: boundedString(item.errorType, 50) || 'expression',
        explanationShort,
      });
    }
  }

  const expressionUpgrades: LLMAnalysis['expressionUpgrades'] = [];
  if (Array.isArray(value.expressionUpgrades)) {
    for (const item of value.expressionUpgrades.slice(0, 5)) {
      if (!isRecord(item)) continue;
      const original = boundedString(item.original, 1_000);
      const suggestion = boundedString(item.suggestion, 1_000);
      const reason = boundedString(item.reason, 500);
      if (original && suggestion && reason) expressionUpgrades.push({ original, suggestion, reason });
    }
  }

  const improvementTips = Array.isArray(value.improvementTips)
    ? value.improvementTips
      .slice(0, 5)
      .map(item => boundedString(item, 500))
      .filter((item): item is string => item !== null)
    : [];

  return { overallLevel, grammarErrors, expressionUpgrades, improvementTips };
}

function parseReportJSON(raw: string): LLMAnalysis {
  const analysis = normalizeReportAnalysis(parseJSONValue(raw));
  if (!analysis) throw new Error('LLM report does not match the expected structure');
  return analysis;
}

function extractDeepSeekContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) return '';
  const firstChoice = value.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return '';
  return typeof firstChoice.message.content === 'string' ? firstChoice.message.content : '';
}

// POST /api/report — 生成学习报告（调用 DeepSeek 做定性分析）
app.post('/api/report', async (req, res) => {
  try {
    const body = parseReportRequest(req.body);
    if (!body) {
      return res.status(400).json({ error: '对话数据为空，无法生成报告' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'your_deepseek_api_key') {
      return res.status(503).json({ error: 'DeepSeek API Key 未配置' });
    }

    const prompt = buildReportPrompt(body);

    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error(`❌ DeepSeek 报告生成失败: ${resp.status} ${errBody.slice(0, 200)}`);
      return res.status(502).json({ error: `DeepSeek API 返回错误 (${resp.status})` });
    }

    const data: unknown = await resp.json();
    const content = extractDeepSeekContent(data);
    if (!content) {
      return res.status(502).json({ error: 'DeepSeek 返回空内容' });
    }

    try {
      const analysis = parseReportJSON(content);
      // 关联 sessionId，自动存库
      if (body.sessionId) {
        saveReport(body.sessionId, JSON.stringify(analysis));
      }
      res.json(analysis);
    } catch {
      console.error('❌ 报告 JSON 解析失败, 原始内容:', content.slice(0, 500));
      const fallback: LLMAnalysis = {
        overallLevel: '无法评估',
        grammarErrors: [],
        expressionUpgrades: [],
        improvementTips: [content.slice(0, 200)],
      };
      if (body.sessionId) {
        saveReport(body.sessionId, JSON.stringify(fallback));
      }
      res.json(fallback);
    }
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.error('❌ 报告 API 异常:', message);
    res.status(500).json({ error: `报告生成失败: ${message}` });
  }
});

// GET /api/sessions/:id/report — 获取已有报告
app.get('/api/sessions/:id/report', (req, res) => {
  if (!isSessionId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  try {
    const json = getReport(req.params.id);
    if (!json) return res.status(404).json({ error: '暂无报告' });
    res.json(JSON.parse(json));
  } catch {
    res.status(500).json({ error: '读取报告失败' });
  }
});

// GET /api/progress — 成长曲线聚合数据
app.get('/api/progress', (_req, res) => {
  try {
    res.json(getProgress());
  } catch {
    res.status(500).json({ error: '查询失败' });
  }
});

// 启动 HTTP
const httpServer = createServer(app);
httpServer.listen(SERVER_PORT, () => {
  console.log(`✅ HTTP 服务已启动 → http://localhost:${SERVER_PORT}`);
});

// ---- WebSocket 服务器 ----
wsServer.start();

// 优雅退出
const shutdown = () => {
  console.log('\n🛑 正在关闭服务...');
  wsServer.stop();
  closeDB();

  // 等待 HTTP 连接关闭，超时 5 秒后强制退出
  const forceExit = setTimeout(() => {
    console.log('⚠️  强制退出（超时）');
    process.exit(0);
  }, 5000);

  httpServer.close(() => {
    clearTimeout(forceExit);
    console.log('✅ 服务已安全关闭');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
