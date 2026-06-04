# 英语口语教练 — AI English Coach

AI 英语口语陪练工具，支持场景选择、实时语音对话、发音评测、语法纠错与课后总结。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Node.js + TypeScript + Express + ws |
| 语音识别 | 讯飞 实时语音转写大模型 |
| 语音合成 | 讯飞 语音合成 v2 |
| 发音评测 | 浏览器 SpeechRecognition + DeepSeek 文本推断 |
| 对话模型 | DeepSeek V4 Pro（1M 上下文） |

## 目录结构

```
english-coach/
├── client/                   # React 前端（端口 5173）
│   └── src/
│       ├── api/              # REST API 调用
│       ├── components/       # UI 组件
│       ├── hooks/            # 自定义 Hooks
│       ├── views/            # 页面视图
│       └── workers/          # AudioWorklet
├── server/                   # Node.js 后端（端口 3000/3001）
│   └── src/
│       ├── index.ts          # 入口
│       ├── ws-server.ts      # WebSocket 服务
│       ├── asr.ts            # 讯飞 ASR（待实现）
│       ├── tts.ts            # 讯飞 TTS（待实现）
│       ├── llm.ts            # DeepSeek 对话（待实现）
│       ├── correct.ts        # 纠错引擎（待实现）
│       ├── pronounce.ts      # 发音评测（待实现）
│       ├── report.ts         # 报告生成（待实现）
│       └── session.ts        # 会话管理（待实现）
├── shared/
│   └── types.ts              # 前后端共享类型定义
└── CLAUDE.md                 # 项目开发文档
```

## 快速开始

```bash
# 1. 配置密钥
cp .env.example .env
# 编辑 .env 填入讯飞和 DeepSeek 的 API Key

# 2. 安装依赖
cd client && npm install
cd ../server && npm install

# 3. 启动后端（终端1）
cd server && npm run dev

# 4. 启动前端（终端2）
cd client && npm run dev
# 浏览器打开 http://localhost:5173
```

## 功能清单

- [ ] 场景选择（面试 / 点餐 / 会议）
- [ ] 实时语音对话（流式 ASR + LLM + TTS）
- [ ] 发音评测
- [ ] 语法/表达纠错（三层纠错体系）
- [ ] 课后总结报告
- [ ] 对话历史 + 中英双语对照
- [ ] 三种纠错模式（沉浸 / 教练 / 严师）
- [ ] 口语能力量化追踪

## 后续优化

- 对话内容导出（PDF / Markdown）
- 生词本与间隔复习
- 多人角色扮演对话
- 自定义场景模板
- PWA 离线支持

## 第三方依赖

| 依赖 | 用途 |
|---|---|
| 讯飞开放平台 | 实时语音识别、语音合成 |
| DeepSeek | 对话生成与纠错分析 |
| React / React Router | 前端框架 |
| Express / ws | 后端 HTTP + WebSocket |
| TypeScript | 类型安全 |
| ESLint / Prettier | 代码规范 |

## 开发规范

- 分支命名：`feature/xxx` `fix/xxx` `chore/xxx` `docs/xxx`
- 每个 PR 只做一件事，必须包含：标题、功能描述、实现思路、测试方式
- TypeScript 严格模式，ESLint + Prettier 统一格式化
