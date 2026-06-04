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

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

// ---- HTTP 服务器（REST API）----
const app = express();
app.use(cors({ origin: `http://localhost:${process.env.CLIENT_PORT || '5173'}` }));
app.use(express.json());

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
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
  httpServer.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
