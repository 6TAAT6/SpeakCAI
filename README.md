# 英语口语教练 — SpeakCAI

AI 英语口语陪练工具，支持场景选择、实时语音对话、发音评测、语法纠错。72 小时参赛作品。

## 核心功能

- **场景选择** — 面试 / 点餐 / 会议，一键切换对话上下文
- **实时语音对话** — 流式 ASR + LLM + TTS，说完 < 2 秒听到回复
- **实时字幕** — 录音时前端实时显示识别文字（partial + final）
- **发音评测** — 讯飞 ISE 流式语音评测，音素级反馈
- **三种纠错模式** — 沉浸（课后纠正）/ 教练（轻量提醒）/ 严师（追问重说）
- **中文翻译** — LLM 双语输出，每轮中文对照
- **打断/继续** — 随时打断 AI 回复，重新提问

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite + AudioWorklet |
| 后端 | Node.js + TypeScript + Express + ws |
| 语音识别 | 讯飞 实时语音转写大模型 |
| 语音合成 | 讯飞 语音合成 v2 |
| 发音评测 | 讯飞 ISE 流式语音评测 |
| 对话模型 | DeepSeek V4 Pro（1M 上下文，流式 SSE） |

## 流式管道

```
AudioWorklet 256ms/帧 ─→ 讯飞 ASR 流式识别 ─→ 前端实时字幕
                                                    ↓
                              VAD 800ms 静音检测 → LLM SSE 流式回复
                                                    ↓
                                          讯飞 TTS 语音合成
                                                    ↓
                                              浏览器播放

总延迟：说完 → AI 语音回复 < 2 秒
```

## 纠错三层体系

- **即时层**：对话中回复末尾提 1-2 个关键错误
- **课后层**：DeepSeek 1M 上下文全量分析（规划中）
- **量化层**：评分曲线 + 雷达图 + 薄弱音素追踪（规划中）

## 目录结构

```
SpeakCAI/
├── shared/
│   └── types.ts              # 前后端共享类型定义
├── client/                   # React 前端（端口 5173）
│   └── src/
│       ├── App.tsx            # 主界面 + 对话逻辑
│       ├── App.css            # 样式（含暗色模式）
│       ├── hooks/             # useWebSocket / useAudioCapture
│       └── workers/           # AudioWorklet processor
├── server/                   # Node.js 后端（端口 3000/3001）
│   └── src/
│       ├── index.ts           # 入口 + HTTP + 优雅退出
│       ├── ws-server.ts       # WebSocket 消息路由
│       ├── asr.ts             # 讯飞 ASR
│       ├── tts.ts             # 讯飞 TTS
│       ├── pronounce.ts       # 讯飞 ISE 发音评测
│       ├── llm.ts             # DeepSeek 流式对话
│       └── session.ts         # 会话管理 + 系统提示词
└── .env.example               # API Key 模板
```

## 快速开始

```bash
# 1. 配置密钥
cp .env.example .env
# 编辑 .env 填入讯飞和 DeepSeek 的 API Key

# 2. 安装依赖
cd client && npm install
cd ../server && npm install

# 3. 启动后端（终端 1）
cd server && npm run dev

# 4. 启动前端（终端 2）
cd client && npm run dev
# 浏览器打开 http://localhost:5173
```

## 第三方依赖

| 依赖 | 用途 |
|---|---|
| 讯飞开放平台 | ASR / TTS / ISE 发音评测 |
| DeepSeek | 对话生成与语法纠错 |
| React + Vite | 前端框架与构建 |
| Express + ws | HTTP + WebSocket |
| TypeScript | 类型安全 |
| ESLint + Prettier | 代码规范 |

## 开发规划

- [x] 项目脚手架 + WS 联通
- [x] 音频采集 AudioWorklet
- [x] 讯飞实时 ASR
- [x] 实时字幕显示
- [x] DeepSeek 流式对话
- [x] 讯飞 TTS 语音合成
- [x] 场景选择 + 三种纠错模式
- [x] 讯飞 ISE 发音评测
- [ ] 即时纠错气泡
- [ ] 课后总结报告
- [ ] 对话历史记录
- [ ] 量化进度追踪
- [ ] README + Demo 视频
