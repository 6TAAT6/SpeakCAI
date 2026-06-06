# 英语口语教练 — SpeakCAI

AI 英语口语陪练工具，支持场景选择、实时语音对话、发音评测、语法纠错和课后报告。72 小时参赛作品。

## 核心功能

- **场景选择** — 日常 / 面试 / 点餐 / 会议 / 旅游 / 购物 / 酒店，一键切换
- **实时语音对话** — 流式 ASR + LLM + TTS，说完 < 2 秒听到回复
- **实时字幕** — 前端实时显示识别文字（partial + final）
- **发音评测** — 讯飞 ISE 流式语音评测，音素级反馈
- **即时纠错** — 回复中的语法/表达错误自动提取为纠错卡片，教练模式追问重说
- **两种纠错模式** — 沉浸（课后纠正）/ 教练（追问重说，默认）
- **课后报告** — 发音曲线 + 雷达图 + 薄弱音素 + LLM 定性分析，自动存库
- **对话历史** — 查看、回放、删除过往对话记录
- **AI 打断/继续** — 随时打断 AI 回复和播报，支持从暂停位置续播
- **深色模式** — 自动 / 深色 / 浅色一键切换
- **中文翻译** — LLM 双语输出，每轮中文对照

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite + AudioWorklet |
| 后端 | Node.js + TypeScript + Express + ws |
| 语音识别 | 讯飞 实时语音转写大模型 |
| 语音合成 | 讯飞 语音合成 v2 |
| 发音评测 | 讯飞 ISE 流式语音评测 |
| 对话模型 | DeepSeek V4 Pro（1M 上下文，流式 SSE） |
| 数据库 | SQLite（better-sqlite3） |

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

- **即时层**：对话中自动提取纠错卡片（💡 Tips + 🔁 Try again）
- **课后层**：DeepSeek 全量分析对话记录，输出语法错误、表达升级、改进建议
- **量化层**：发音分数趋势柱状图 + 能力雷达图 + 薄弱音素追踪

两种模式：沉浸（课后纠正）/ 教练（追问重说，默认）

## 目录结构

```
SpeakCAI/
├── shared/
│   └── types.ts                  # 前后端共享类型定义
├── client/                       # React 前端（端口 5173）
│   └── src/
│       ├── main.tsx              # 入口
│       ├── App.tsx               # 主界面 + 对话逻辑 + TTS 播放
│       ├── App.css               # 样式（含深色模式）
│       ├── types.ts              # 前端共享类型
│       ├── components/
│       │   ├── TopBar.tsx        # 顶栏：品牌 + 场景/模式 + 状态
│       │   ├── BottomBar.tsx     # 底栏：录音/打断/报告按钮
│       │   ├── ChatView.tsx      # 对话气泡渲染
│       │   ├── HistoryView.tsx   # 历史列表 + 详情
│       │   ├── ReportView.tsx    # 报告面板 + 图表
│       │   └── ReportAnalysis.tsx # LLM 定性分析渲染
│       ├── hooks/
│       │   ├── useWebSocket.ts   # WebSocket 连接 + 自动重连
│       │   └── useAudioCapture.ts # 麦克风采集
│       └── workers/
│           └── audio-processor.ts # AudioWorklet 降采样
├── server/                       # Node.js 后端（HTTP 3000 / WS 3001）
│   └── src/
│       ├── index.ts              # 入口 + REST API + 报告生成
│       ├── ws-server.ts          # WebSocket 消息路由
│       ├── asr.ts                # 讯飞 ASR 客户端
│       ├── tts.ts                # 讯飞 TTS 客户端
│       ├── pronounce.ts          # 讯飞 ISE 发音评测
│       ├── llm.ts                # DeepSeek 流式对话
│       ├── session.ts            # 会话管理 + 系统提示词
│       └── db.ts                 # SQLite CRUD
├── .env.example                  # API Key 模板
├── .editorconfig                 # 编辑器规范
├── .prettierrc                   # 代码格式化
├── eslint.config.js              # 代码规范
└── start.bat                     # 启动脚本
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
| SQLite (better-sqlite3) | 对话数据持久化 |
| TypeScript | 类型安全 |
| ESLint + Prettier + EditorConfig | 代码规范 |

## 开发规划

- [x] 项目脚手架 + WS 联通
- [x] 音频采集 AudioWorklet
- [x] 讯飞实时 ASR
- [x] 实时字幕显示
- [x] DeepSeek 流式对话
- [x] 讯飞 TTS 语音合成
- [x] 场景选择 + 三种纠错模式
- [x] 讯飞 ISE 发音评测
- [x] 即时纠错气泡
- [x] 深色模式
- [x] 对话历史页
- [x] SQLite 对话持久化
- [x] 课后总结报告
- [x] 组件化拆分（TopBar / BottomBar / ChatView / HistoryView / ReportView / ReportAnalysis）
- [ ] 量化进度追踪（多场对比、成长曲线）
- [ ] README + Demo 视频
