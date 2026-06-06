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
import { getSessions, getTurns, deleteSession } from './db.ts';
import { closeDB } from './db.ts';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

// ---- HTTP 服务器（REST API）----
const app = express();
app.use(cors());
app.use(express.json());

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
