import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 加载 .env（必须在其他 import 之前）
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WSServer } from './ws-server.ts';
import { getSessions, getTurns, deleteSession, saveReport, getReport, getProgress, getErrorBook } from './db.ts';
import { closeDB } from './db.ts';
import type { ReportRequest, LLMAnalysis } from '../../shared/types.ts';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

// ---- HTTP 服务器（REST API）----
const app = express();
app.use(cors());
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
  } catch (e) {
    res.status(500).json({ error: '数据库查询失败' });
  }
});

// 对话历史 — 单场对话轮次
app.get('/api/sessions/:id/turns', (req, res) => {
  try {
    const turns = getTurns(req.params.id);
    res.json(turns);
  } catch (e) {
    res.status(500).json({ error: '数据库查询失败' });
  }
});

// 对话历史 — 删除会话
app.delete('/api/sessions/:id', (req, res) => {
  try {
    deleteSession(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 对话历史 — 批量删除会话
app.post('/api/sessions/batch-delete', (req, res) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的会话 ID 列表' });
    }
    for (const id of ids) deleteSession(id);
    res.json({ ok: true, deleted: ids.length });
  } catch (e) {
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

function parseReportJSON(raw: string): LLMAnalysis {
  // 尝试直接解析
  try { return JSON.parse(raw); } catch { /* 继续 */ }

  // 尝试剥离 markdown 代码围栏 ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { /* 继续 */ }
  }

  // 查找第一个 { 和最后一个 }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)); } catch { /* 继续 */ }
  }

  throw new Error('无法解析 LLM 返回的 JSON');
}

// POST /api/report — 生成学习报告（调用 DeepSeek 做定性分析）
app.post('/api/report', async (req, res) => {
  try {
    const body = req.body as ReportRequest;
    if (!body.turns || body.turns.length === 0) {
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

    const data = await resp.json() as any;
    const content: string = data?.choices?.[0]?.message?.content || '';
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
  } catch (e: any) {
    console.error('❌ 报告 API 异常:', e.message);
    res.status(500).json({ error: `报告生成失败: ${e.message}` });
  }
});

// GET /api/sessions/:id/report — 获取已有报告
app.get('/api/sessions/:id/report', (req, res) => {
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
  } catch (e) {
    res.status(500).json({ error: '查询失败' });
  }
});

// GET /api/error-book — 弱音素错题本
app.get('/api/error-book', (_req, res) => {
  try {
    res.json(getErrorBook());
  } catch (e) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 启动 HTTP
const httpServer = createServer(app);
httpServer.listen(SERVER_PORT, () => {
  console.log(`✅ HTTP 服务已启动 → http://localhost:${SERVER_PORT}`);
});

// ---- WebSocket 服务器 ----
const wsServer = new WSServer(WS_PORT);
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
