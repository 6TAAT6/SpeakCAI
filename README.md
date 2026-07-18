# 英语口语教练 — SpeakCAI

AI 英语口语陪练工具，支持场景选择、实时语音对话、发音评测、语法纠错和课后学习报告。

## 核心功能

### 🤖 自适应教练引擎（ConversationAgent）
- **实时决策** — 每轮对话前，Agent 根据发音分数趋势、弱音素累积、对话进度自动调整教学策略
- **四级动作** — 通用回复 / 纠错提醒 / 弱音素专项练习 / 鼓励表扬，全自动切换
- **CEFR 难度映射** — 根据发音水平自适应匹配 A1-C1 五个难度等级，动态调整 AI 用词和句式
- **语气调制** — 温暖 / 鼓励 / 纠正 / 有趣四种语气，跟随分数趋势智能切换
- **零延迟决策** — 纯本地规则引擎，无额外 API 调用

### 🗣️ 对话交互
- **场景选择** — 日常 / 面试 / 点餐 / 会议 / 旅游 / 购物 / 酒店，一键切换
- **实时语音对话** — 流式 ASR + LLM + TTS，说完 < 2 秒听到回复
- **实时字幕** — 前端实时显示识别文字（partial + final）
- **发音评测** — 讯飞 ISE 流式语音评测，音素级反馈
- **即时纠错** — 回复中的语法/表达错误自动提取为纠错卡片，教练模式追问重说
- **两种纠错模式** — 沉浸（课后纠正）/ 教练（追问重说，默认）
- **中文翻译** — LLM 双语输出，每轮中文对照

### 📊 课后反馈
- **课后报告** — 发音曲线 + 雷达图 + 薄弱音素 + LLM 定性分析，自动存库
- **成长曲线** — 多场对话趋势对比，量化追踪口语进步

### 🎛️ 交互体验
- **对话历史** — 查看、回放、继续、删除过往对话记录
- **AI 打断/继续** — 随时打断 AI 回复和播报，支持从暂停位置续播
- **AI 语音重播** — 每条 AI 回复支持一键重播语音
- **深色模式** — 自动 / 深色 / 浅色一键切换
- **字体调整** — 小 / 中 / 大三档字体自由切换
- **批量管理** — 对话历史支持批量选择和删除

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

## 自适应教学体系

```
ConversationAgent 决策层（每轮对话前）
  ├─ 分析 → 发音分数趋势 + 弱音素累积 + 对话轮次
  ├─ 决策 → reply / correct_prompt / drill / encourage
  ├─ 分级 → CEFR A1-C1 自适应难度
  └─ 注入 → 将指令嵌入 LLM 系统提示词，引导 AI 教学行为

三层反馈
  ├─ 即时层 → 💡 纠错卡片 + 🔁 追问重说
  ├─ 课后层 → DeepSeek 全量分析（语法/表达/建议）
  └─ 量化层 → 发音趋势 + 雷达图 + 薄弱音素追踪

两种模式：沉浸（课后纠正）/ 教练（追问重说，默认）
```

## 项目亮点

- **自适应教练引擎**：ConversationAgent 实时分析发音表现，自动切换教学动作、CEFR 难度等级和语气风格，实现个性化口语教学
- **全链路实时性**：AudioWorklet → 讯飞 ASR → Agent 决策 → DeepSeek LLM → 讯飞 TTS → Web Audio API 播放，端到端延迟 < 2 秒
- **四层纠错体系**：Agent 自适应决策 + 即时纠错 + 课后全量分析 + 量化趋势追踪，覆盖口语学习的完整闭环
- **组件化架构**：前端 10+ 组件拆分，后端 Class 组织 + Agent 独立决策层，前后端共享类型定义
- **持久化存储**：SQLite 存储对话历史、发音评分、课后报告，支持历史回放和成长曲线
- **多场景适配**：7 种对话场景 + 2 种纠错模式 + 4 种 Agent 动作，可扩展的系统提示词设计

## 项目亮点

- **全链路实时性**：AudioWorklet → 讯飞 ASR → DeepSeek LLM → 讯飞 TTS → Web Audio API 播放，端到端延迟 < 2 秒
- **三层纠错体系**：即时纠错 + 课后全量分析 + 量化趋势追踪，覆盖口语学习的完整闭环
- **组件化架构**：前端 10+ 组件拆分，后端 Class 组织，前后端共享类型定义
- **持久化存储**：SQLite 存储对话历史、发音评分、课后报告，支持历史回放和成长曲线
- **多场景适配**：7 种对话场景 + 2 种纠错模式，可扩展的系统提示词设计

## 目录结构

```
SpeakCAI/
├── shared/
│   └── types.ts                  # 前后端共享类型定义
├── client/                       # React 前端（端口 5173）
│   ├── index.html                # HTML 入口
│   ├── package.json              # 依赖与脚本
│   ├── vite.config.ts            # Vite 配置 + API 代理
│   ├── tsconfig.json             # TypeScript 配置
│   └── src/
│       ├── main.tsx              # 应用入口
│       ├── App.tsx               # 主界面 + 对话逻辑 + TTS 播放
│       ├── App.css               # 全局样式（含深色模式）
│       ├── types.ts              # 前端共享类型
│       ├── components/
│       │   ├── Sidebar.tsx       # 侧边栏：新对话 + 历史 + 批量
│       │   ├── TopBar.tsx        # 顶栏：品牌 + 场景/模式 + 设置
│       │   ├── BottomBar.tsx     # 底栏：录音/打断/报告按钮
│       │   ├── ChatView.tsx      # 对话气泡渲染 + 语音重播
│       │   ├── HistoryView.tsx   # 历史列表 + 详情
│       │   ├── ReportView.tsx    # 报告面板 + 图表
│       │   ├── ReportView.css    # 报告面板样式
│       │   ├── ReportAnalysis.tsx # LLM 定性分析渲染
│       │   └── ProgressView.tsx  # 成长曲线 + 趋势图
│       ├── hooks/
│       │   ├── useWebSocket.ts   # WebSocket 连接 + 自动重连
│       │   └── useAudioCapture.ts # 麦克风采集
│       ├── workers/
│       │   └── audio-processor.ts # AudioWorklet 降采样
│       └── utils/
│           └── binary.ts         # Base64 编解码
├── server/                       # Node.js 后端（HTTP 3000 / WS 3001）
│   ├── package.json              # 依赖与脚本
│   ├── tsconfig.json             # TypeScript 配置
│   └── src/
│       ├── index.ts              # 入口 + REST API + 报告生成
│       ├── ws-server.ts          # WebSocket 消息路由
│       ├── asr.ts                # 讯飞 ASR 客户端
│       ├── tts.ts                # 讯飞 TTS 客户端
│       ├── pronounce.ts          # 讯飞 ISE 发音评测
│       ├── llm.ts                # DeepSeek 流式对话
│       ├── session.ts            # 会话管理 + 系统提示词
│       ├── agent.ts              # ConversationAgent 自适应教练
│       ├── agent.test.ts         # Agent 单元测试
│       └── db.ts                 # SQLite CRUD
├── .env.example                  # API Key 模板
├── .gitignore                    # Git 忽略规则
├── .editorconfig                 # 编辑器规范
├── .prettierrc                   # 代码格式化
├── eslint.config.js              # 代码规范
└── start.bat                     # 一键启动脚本
```

## 快速开始

```bash
# 0. 一键启动（推荐）
start.bat            # Windows 双击启动
npm run dev          # 跨平台 concurrently

# 1. 配置密钥
cp .env.example .env
# 编辑 .env 填入讯飞和 DeepSeek 的 API Key

# 2. 安装依赖
cd client && npm install
cd ../server && npm install
npm install          # 根目录 concurrently

# 3. 或分别启动
cd server && npm run dev    # 后端 HTTP 3000 + WS 3001
cd client && npm run dev    # 前端 http://localhost:5173
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
