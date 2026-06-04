# 英语口语教练 — AI English Coach

## 项目定位

AI 英语口语陪练工具，帮助用户在指定场景下进行真实对话训练。参赛作品，72 小时开发周期。

## 核心功能

```
✅ 场景选择        → 面试 / 点餐 / 会议（切换 System Prompt）
✅ 实时语音对话    → 流式 ASR + LLM + TTS，用户说完 <2 秒听到回复
✅ 发音评测        → 浏览器 SpeechRecognition + DeepSeek 文本推断
✅ 语法/表达纠错   → 三层纠错体系（即时提醒 + 课后报告 + 量化追踪）
✅ 课后总结        → 错误分类 + 薄弱音素 + 改进建议 + 词汇升级
✅ 对话历史        → 时间轴查看历史对话，中英双语对照
✅ 中文翻译        → LLM 双语输出 + 前端开关一键切换
✅ 三种纠错模式    → 沉浸（课后纠正）/ 教练（轻量提醒）/ 严师（追问重说）
✅ 量化反馈        → 评分曲线 + 雷达图 + 薄弱音素追踪 + 里程碑
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Node.js + TypeScript + Express + ws（tsx 运行） |
| 语音识别 ASR | 讯飞 实时语音转写大模型（已有 Key） |
| 语音合成 TTS | 讯飞 语音合成 v2（已有 Key） |
| 发音评测 | 浏览器 SpeechRecognition + DeepSeek 文本推断 |
| 对话 LLM | DeepSeek V4 Pro（1M 上下文，流式 SSE） |
| 数据库 | SQLite（better-sqlite3） |
| 共享类型 | `shared/types.ts` — 前后端共用的消息协议和数据结构 |

## 为什么选 Node.js/TypeScript 而不是 Python/C++/Java

- 后端本质是"消息路由器"：浏览器 WS → 转发讯飞 ASR → 收文本 → 转 DeepSeek SSE → 转讯飞 TTS → 推浏览器。纯 IO 操作，CPU 占用 <5%
- Node.js 事件驱动模型天然适配多条 WebSocket 的流式转发
- TypeScript 前后端共享类型定义，改字段编译器自动报错
- 一条命令启动，npm install 即刻可用，72 小时内开发效率最高
- 只维护两家服务商（讯飞+DeepSeek），鉴权逻辑复用

## 语音服务分工

```
讯飞 ASR    → 实时语音转写大模型（英语识别）
讯飞 TTS    → 语音合成 v2（英语发音人）
DeepSeek    → 对话理解 + 纠错 + 发音推断 + 双语翻译（1M 上下文）
两家服务各司其职，Node.js 后端是"指挥"不是"翻译官"
```

## 流式管道（延迟优化关键）

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

## 纠错三层体系

```
即时层（对话中）      → AI 回复末尾提 1-2 个关键错误，不打断对话流
课后层（对话结束后） → 完整语法/发音/表达报告（DeepSeek 1M 上下文全量分析）
量化层（多次对话后） → 评分曲线 + 雷达图 + 薄弱音素追踪 + 进步报告

三种用户可选模式：
  沉浸模式 → 对话中不纠正，课后出完整报告（适合初学者）
  教练模式 → 对话中轻量提醒 ≤2 条，课后完整报告（默认）
  严师模式 → 对话中逐个纠正 + 追问重说，课后完整报告（备考冲刺）
```

## 目录结构

```
english-coach/
├── .editorconfig
├── .env.example              # 所有 API key 模板
├── .gitignore
├── .prettierrc
├── eslint.config.js          # ESLint + TS + React + Prettier
├── shared/
│   └── types.ts              # 前后端共享：WS 消息类型 + 纠错/评测/报告接口
├── client/                   # React 19 + Vite + TypeScript（端口 5173）
│   ├── src/
│   │   ├── api/              # REST API 调用层
│   │   ├── components/       # UI 组件（按功能逐步创建）
│   │   ├── hooks/            # useWebSocket / useAudioCapture / useVoiceChat
│   │   ├── views/            # ChatView / ReportView / SettingsView / HistoryView
│   │   ├── workers/          # AudioWorklet processor
│   │   └── main.tsx
│   └── ...
├── server/                   # Node.js + Express + ws（端口 3000/3001）
│   ├── src/
│   │   ├── index.ts          # 入口 + HTTP + 优雅退出
│   │   ├── ws-server.ts      # WebSocket 连接管理 + 消息路由
│   │   ├── asr.ts            # 讯飞 ASR WS 客户端（PR3）
│   │   ├── tts.ts            # 讯飞 TTS WS 客户端（PR6）
│   │   ├── llm.ts            # DeepSeek 流式对话（PR5）
│   │   ├── correct.ts        # 纠错引擎（PR9）
│   │   ├── pronounce.ts      # 发音评测（PR8）
│   │   ├── report.ts         # 报告生成（PR10）
│   │   └── session.ts        # 对话会话管理（PR5）
│   └── ...
└── README.md
```

## 开发规范

### PR 分支命名

```
feature/<功能名>   新功能
fix/<问题名>       修 bug
chore/<杂项名>     杂项（依赖更新、配置调整）
docs/<文档名>      文档
```

### PR 描述必填四要素

1. **标题**：一句话说明新增/修改了什么
2. **功能描述**：说明功能作用与使用方式
3. **实现思路**：技术选型与核心逻辑
4. **测试方式**：如何验证功能正常运行

### 编码规范

- ESLint + Prettier + EditorConfig 统一
- TypeScript 严格模式（strict: true）
- 前端 React 函数式组件 + Hooks
- 后端 class 组织（WSServer / SessionManager 等）
- 类型定义放在 `shared/types.ts`，前后端共用
- 每个文件单一职责，不超过 200 行

### PR 粒度

每个 PR 只做一件事，大功能拆分为多个独立 PR。合并后主分支始终可运行。

## PR 路线图（15 个）

```
阶段一：核心管道
  feature/project-scaffold          脚手架 + WS 联通 ← 当前
  feature/audio-capture             音频采集 AudioWorklet
  feature/xunfei-asr                讯飞实时 ASR
  feature/live-caption              实时字幕（仅 ASR 消息）

阶段二：对话引擎
  feature/deepseek-chat             DeepSeek 流式对话 + 双语
  feature/xunfei-tts                讯飞 TTS + 播放

阶段三：纠错能力
  feature/scene-and-correction-mode 场景 + 三种纠错模式设置
  feature/xunfei-pronunciation-eval  讯飞发音评测
  feature/inline-correction         即时纠错气泡 + 严师重说

阶段四：课后体系
  feature/lesson-report             课后总结报告
  feature/progress-tracking         量化追踪

阶段五：收尾
  feature/ui-polish                 UI 打磨 + 深色模式 + 响应式
  feature/conversation-history      对话历史页
  docs/readme-and-demo              README + Demo 视频
```

## 评分标准对照

| 评分维度（权重） | 本项目对策 |
|---|---|
| 作品完整度与创新性（40%） | 9 大功能完整闭环，三层混合发音评测方案是差异化能力 |
| 开发过程与质量（40%） | 15 个小粒度 PR，持续提交，每个 PR 四要素完整，ESLint+Prettier 规范 |
| 演示与表达（20%） | 实时语音对话 + 发音纠正 + 量化报告，demo 视觉冲击力强 |

## 环境变量

复制 `.env.example` → `.env`，填入真实密钥：

```
讯飞：  XUNFEI_APP_ID / XUNFEI_API_KEY / XUNFEI_API_SECRET（ASR + TTS 共用）
DeepSeek：DEEPSEEK_API_KEY / DEEPSEEK_MODEL
```

## 启动命令

```bash
# 后端
cd server && npm run dev

# 前端
cd client && npm run dev
```

---

## 语言选型深度对比

本项目的核心工作负载：收浏览器 WS 消息 → 转发云服务 WS → 收结果 → 推浏览器 WS。纯 IO 操作，CPU 占用 <5%。基于此特点进行了多语言对比：

### 各语言对比结论

| 语言 | 结论 | 原因 |
|---|---|---|
| **TypeScript (Node.js)** | ✅ 选用 | 事件驱动天然适配流式中转，前后端共享类型，代码量最少 |
| Python | ❌ 不选 | asyncio 管理多条 WS 复杂，线程池需手动管理，但官方 SDK 最全 |
| C++ | ❌ 不选 | 瓶颈在网络 IO 非 CPU，用 C++ 最多省 5ms 但开发慢 10 倍 |
| Java | ❌ 不选 | Netty 可以但配置繁琐，JVM 预热慢，72h 内不值得 |
| Go | ❌ 不选 | goroutine 强但过度设计，Node.js 单进程够扛几千连接 |
| Rust | ❌ 不选 | 纯炫技，无计算密集型任务，编译器学习成本高 |

### 为什么不混用多语言

技术上可行（gRPC/Unix Socket/共享内存通信），但本项目不适合：
- 每个语言边界需要序列化/反序列化，抵消性能收益
- 调试跨语言 bug 耗时翻倍
- 72 小时时间不足以配置多语言工具链
- 评委看的是"架构清晰度"不是"技术栈多样性"

---

## 方案对比与选择过程

### 八个可行方案

| 方案 | ASR | TTS | 评测 | 费用 | 延迟 | 推荐 |
|---|---|---|---|---|---|---|
| A 讯飞全栈 | 讯飞 | 讯飞 | 讯飞 | 零 | 中 | ❌ 评测不支持英文 |
| B 阿里全栈 | 阿里 | 阿里 | 阿里 | 零 | 中 | ❌ 多一套鉴权 |
| **D 讯飞+DeepSeek** | **讯飞** | **讯飞** | **浏览器+DeepSeek** | **零** | **中** | **🥇 最终采用** |
| E 阿里VoChat | 阿里 | 阿里(一体) | 阿里 | 需付费 | 低 | ❌ LLM不可定制 |

**最终选择方案 D 的原因：** 讯飞 ASR+TTS 共用同一套 Key 和鉴权逻辑，代码复用度高；讯飞语音评测不支持英文，改用浏览器 SpeechRecognition + DeepSeek 文本推断的混合方案；DeepSeek 1M 上下文是课后全量对话分析的刚需。

---

## 新增功能可行性分析

### 功能一：对话历史保存 ✅ 可行且重要

SQLite `conversations` 表存储每轮对话（session_id / scene / role / original_text / translation / corrections / pronunciation_score），前端时间轴展示。录音只存文字不存音频（按需重新合成 TTS）。

### 功能二：中文翻译 ⚠️ 可行，方案为 LLM 双语输出 + 前端开关

采用方案 A：DeepSeek System Prompt 要求输出双语格式 `"English text.\n中文翻译。"`，前端语言开关控制中文行显示/隐藏。优点是翻译质量最好（上下文完整），零额外 API 调用。唯一代价是 LLM 输出 token 翻倍，但 DeepSeek 成本极低且 1M 上下文足够。

### 功能三：三种纠错模式切换 ⚠️ 可行，严师模式需状态机

沉浸/教练模式实现简单，配置参数控制即可。严师模式需要前端新增 `CORRECTION_DRILL` 子状态：用户进入跟读练习，最多重试 3 次后跳过，期间用户说的话不进对话历史。

---

## 架构设计原则

### 目录先行，文件渐进

目录结构在 PR1 一次性建好（展示组织能力），但具体文件在每个 PR 按需创建（保持 diff 干净）。不预先建空函数/空组件/空壳文件。

### PR 合并后主分支始终可运行

```
PR1 合并 → ✅ 页面显示连接状态指示灯
PR2 合并 → ✅ 能录音发帧（无识别）
PR3 合并 → ✅ 后端收到 ASR 文字（控制台可见）
PR4 合并 → ✅ 前端实时显示识别文字
PR5 合并 → ✅ AI 文字回复显示（无语音）
PR6 合并 → ✅ 完整语音对话闭环 ← 核心可用
每个后续 PR 都在可运行基础上叠加
```

### README 随 PR 同步生长

- PR1 → README 只有项目简介 + 技术栈 + 安装 + 目录
- PR6 后 → 加入核心对话功能使用说明
- PR10 后 → 加入纠错/报告功能截图
- PR13 → 最终定稿含完整文档 + Demo 链接
