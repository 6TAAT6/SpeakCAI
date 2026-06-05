# 英语口语教练 — AI English Coach

AI 英语口语陪练工具，支持场景选择、实时语音对话、发音评测、语法纠错与课后总结。72 小时参赛作品。

## 核心功能

- **场景选择** — 面试 / 点餐 / 会议，切换对话上下文
- **实时语音对话** — 流式 ASR + LLM + TTS，用户说完 <2 秒听到回复
- **发音评测** — 浏览器 SpeechRecognition + DeepSeek 文本推断，混合方案
- **语法/表达纠错** — 三层体系（即时提醒 + 课后报告 + 量化追踪）
- **三种纠错模式** — 沉浸（课后纠正）/ 教练（轻量提醒）/ 严师（追问重说）
- **课后总结报告** — 错误分类 + 薄弱音素 + 改进建议 + 词汇升级
- **对话历史** — 时间轴查看，中英双语对照
- **中文翻译** — LLM 双语输出 + 前端开关一键切换
- **量化反馈** — 评分曲线 + 雷达图 + 薄弱音素追踪 + 学习里程碑

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Node.js + TypeScript + Express + ws |
| 语音识别 | 讯飞 实时语音转写大模型 |
| 语音合成 | 讯飞 语音合成 v2 |
| 发音评测 | 浏览器 SpeechRecognition + DeepSeek 文本推断 |
| 对话模型 | DeepSeek V4 Pro（1M 上下文，流式 SSE） |
| 数据库 | SQLite（better-sqlite3） |

## 流式管道

```
AudioWorklet 每 256ms 发一帧 ─→ 讯飞 ASR 流式返回文字 ─→ 前端实时字幕
                                                            ↓
                                        VAD 检测停顿（800ms 无声）
                                                            ↓
                                  DeepSeek SSE 流式吐回复文字
                                                            ↓
                                  讯飞 TTS 流式合成语音（并行）
                                                            ↓
                                                    浏览器播放

总延迟：用户说完 → 听到 AI 回复 < 2 秒
```

## 目录结构

```
english-coach/
├── shared/
│   └── types.ts              # 前后端共享类型定义
├── client/                   # React 前端（端口 5173）
│   └── src/
│       ├── api/              # REST API 调用
│       ├── components/       # UI 组件
│       ├── hooks/            # 自定义 Hooks
│       ├── views/            # 页面视图
│       └── workers/          # AudioWorklet processor
├── server/                   # Node.js 后端（端口 3000/3001）
│   └── src/
│       ├── index.ts          # 入口 + HTTP + 优雅退出
│       ├── ws-server.ts      # WebSocket 服务
│       ├── asr.ts            # 讯飞 ASR
│       ├── tts.ts            # 讯飞 TTS
│       ├── llm.ts            # DeepSeek 对话
│       ├── correct.ts        # 纠错引擎
│       ├── pronounce.ts      # 发音评测
│       ├── report.ts         # 报告生成
│       └── session.ts        # 会话管理
└── .env.example              # API Key 模板
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
| 讯飞开放平台 | 实时语音识别、语音合成 |
| DeepSeek | 对话生成与纠错分析 |
| React / React Router | 前端框架 |
| Express / ws | 后端 HTTP + WebSocket |
| SQLite (better-sqlite3) | 对话数据持久化 |
| TypeScript | 类型安全 |
| ESLint / Prettier | 代码规范 |

## 后续优化

- 对话内容导出（PDF / Markdown）
- 生词本与间隔复习
- 多人角色扮演对话
- 自定义场景模板
- PWA 离线支持
