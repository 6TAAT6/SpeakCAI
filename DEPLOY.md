# SpeakCAI 部署文档

## 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | ≥ 18 | 推荐 v20+ |
| npm | ≥ 9 | 随 Node.js 自带 |
| Git | 任意 | 克隆仓库用 |

**第三方服务（必须注册并获取 API Key）：**

| 服务 | 用途 | 注册地址 |
|------|------|----------|
| 讯飞开放平台 | ASR 语音识别 / TTS 语音合成 / ISE 发音评测 | https://console.xfyun.cn |
| DeepSeek | 大模型对话生成 | https://platform.deepseek.com |

## 快速部署（本地开发）

```bash
# 1. 克隆仓库
git clone <repo-url>
cd SpeakCAI

# 2. 安装根目录依赖（concurrently）
npm install

# 3. 安装子项目依赖
npm run install:all

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 填入讯飞和 DeepSeek 的 API Key（见下方说明）

# 5. 一键启动
npm run dev          # 同时启动前后端
# 或 Windows 双击 start.bat
```

启动后：
- 前端：http://localhost:5173
- 后端 HTTP：http://localhost:3000
- 后端 WebSocket：ws://localhost:3001

## 环境变量说明

编辑项目根目录的 `.env` 文件：

```ini
# ===== 讯飞开放平台 =====
# 控制台 https://console.xfyun.cn → 实时语音转写大模型
# 同一套 Key 适用于 ASR / TTS / ISE 三个服务
XUNFEI_APP_ID=your_app_id
XUNFEI_API_KEY=your_api_key
XUNFEI_API_SECRET=your_api_secret

# ===== DeepSeek 大模型 =====
# https://platform.deepseek.com → API Keys
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat

# ===== 服务端口（可选，使用默认值即可）=====
SERVER_PORT=3000
WS_PORT=3001
CLIENT_PORT=5173
```

> **注意**：讯飞 ISE 发音评测需要额外开通服务。ASR 和 TTS 开通即可用。

## 分别启动（调试用）

```bash
# 后端
cd server
npm run dev        # tsx watch → 文件变更自动重载

# 前端
cd client
npm run dev        # Vite dev server + HMR
```

## 生产构建

```bash
# 前端构建
cd client
npm run build       # 输出到 client/dist/
npm run preview     # 预览构建产物

# 后端构建
cd server
npm run build       # tsc 编译到 server/dist/
npm start           # 运行编译后的 JS
```

### 生产部署架构

```
                    ┌─────────────────┐
  用户浏览器 ──────→│  Nginx / Caddy  │
                    │  (静态文件 +     │
                    │   API 反向代理)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         /          /api/*        ws://
     dist/        localhost:     localhost:
    (静态文件)      3000           3001
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │       Node.js 后端           │
              │  Express + WebSocket +       │
              │  讯飞/DeepSeek 客户端         │
              └─────────────────────────────┘
```

推荐 Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /path/to/client/dist;
    index index.html;
    location / { try_files $uri /index.html; }

    # API 代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # WebSocket 代理
    location /ws/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 可用脚本汇总

| 目录 | 命令 | 作用 |
|------|------|------|
| 根目录 | `npm run dev` | concurrently 同时启动前后端 |
| 根目录 | `npm run install:all` | 一次性安装前后端依赖 |
| server | `npm run dev` | tsx watch 后端开发模式 |
| server | `npm run build` | tsc 编译 TypeScript |
| server | `npm start` | 运行编译产物 |
| server | `npm test` | 运行后端单元测试 (vitest) |
| client | `npm run dev` | Vite 前端开发模式 |
| client | `npm run build` | 生产构建 |
| client | `npm run preview` | 预览构建产物 |

## 数据库

SQLite 数据库文件位于 `server/data/speakcai.db`，首次启动自动创建。包含三个表：

- `sessions` — 会话记录
- `turns` — 对话轮次
- `pronunciations` — 发音评测分数

WAL 模式 + 外键约束，断电安全。

## 故障排查

| 问题 | 解决方式 |
|------|----------|
| 端口被占用 | `taskkill /F /IM node.exe`（Windows）或 `lsof -ti:3000 \| xargs kill`（macOS/Linux） |
| 语音识别不工作 | 检查讯飞控制台是否开通了"实时语音转写大模型"服务，确认 API Key 正确 |
| 发音评测返回 0 分 | 确认讯飞 ISE 服务已开通，不是所有账号默认有 |
| AI 不回复 | 检查 DeepSeek API Key 和账户余额 |
| `npm install` 失败 | 删除 `node_modules` 和 `package-lock.json` 后重试；Windows 需安装 VS Build Tools |
