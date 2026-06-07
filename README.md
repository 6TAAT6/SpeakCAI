# 英语口语教练 — SpeakCAI

AI 英语口语陪练工具，支持场景选择、实时语音对话、发音评测、语法纠错和课后报告。72 小时参赛作品。

## 核心功能

- **场景选择** — 日常 / 面试 / 点餐 / 会议 / 旅游 / 购物 / 酒店，一键切换
- **实时语音对话** — 流式 ASR + LLM + TTS，说完 < 2 秒听到 AI 语音回复
- **实时字幕** — 前端实时显示识别文字（partial + final），边说边出字
- **发音评测** — 讯飞 ISE 流式语音评测，每句自动打分，音素级反馈
- **即时纠错** — 回复中的语法/表达错误自动提取为纠错卡片，教练模式追问重说
- **两种纠错模式** — 沉浸（课后纠正，不打断）/ 教练（追问重说，默认）
- **课后报告** — 发音分数趋势图 + 能力雷达图 + 薄弱音素 + LLM 定性分析，自动存库
- **对话历史** — 左侧栏查看过往记录，支持继续对话、生成/查看报告、批量删除
- **继续历史对话** — 点击历史项可接着之前的上下文继续聊天
- **AI 打断/继续** — 随时打断 AI 回复和播报，支持从暂停位置续播
- **AI 语音重播** — 每个 AI 气泡旁有 🔊 按钮，点击重听该句语音
- **深色模式** — 自动 / 深色 / 浅色，跟随系统或手动切换
- **字体大小** — 小 / 中 / 大三档可调
- **中文翻译** — 每轮 AI 回复附带中文翻译对照

## 使用指南

### 第一次使用

1. **获取 API Key**

| 平台 | 地址 | 需要什么 |
|------|------|---------|
| 讯飞开放平台 | https://console.xfyun.cn/ | 创建应用 → 获取 APP_ID / API_KEY / API_SECRET |
| DeepSeek | https://platform.deepseek.com/ | API Keys → 创建 Key |

注意：讯飞 ASR、TTS、ISE 三项服务共用同一套 Key，只需开通「实时语音转写」「语音合成」「语音评测」三项即可。

2. **配置密钥**

```bash
cp .env.example .env
```

用记事本打开 `.env`，填入你的真实 Key：

```
XUNFEI_APP_ID=你的讯飞APP_ID
XUNFEI_API_KEY=你的讯飞API_KEY
XUNFEI_API_SECRET=你的讯飞API_SECRET
DEEPSEEK_API_KEY=你的DeepSeek_API_KEY
DEEPSEEK_MODEL=deepseek-chat
```

3. **安装依赖**

```bash
cd client && npm install
cd ../server && npm install
```

4. **启动服务**

**方式一：一键启动（Windows）**
```
双击 start.bat → 自动启动前后端，浏览器打开 http://localhost:5173
```

**方式二：手动启动**
```bash
# 终端 1 — 启动后端
cd server && npm run dev

# 终端 2 — 启动前端
cd client && npm run dev
# 浏览器打开 http://localhost:5173
```

> ⚠️ 地址栏输入 **`http://localhost:5173`**（要带上 `http://`），不要只打 `localhost:5173`，否则浏览器可能自动升级到 HTTPS 导致无法访问。

### 开始对话

| 步骤 | 操作 |
|------|------|
| 1 | 顶部栏选择场景（日常/面试/点餐...）和模式（教练/沉浸） |
| 2 | 点击底部 🎤 **开始对话**，授权麦克风 |
| 3 | 对着麦克风说英语，AI 实时语音回复 |
| 4 | 点击 ⏹ **停止** 结束录音，对话保留在页面上 |
| 5 | 再次点击 🎤 **开始对话**，接着刚才的话题继续聊 |

### 常用操作

| 操作 | 按钮 | 说明 |
|------|------|------|
| 停止/开始录音 | 🎤 开始对话 / ⏹ 停止 | 停止后再次开始不丢失对话内容 |
| 打断 AI | ⏹ 打断 | 中断正在播放的语音和 LLM 生成 |
| 继续对话 | ▶ 继续 | 打断后恢复，AI 重新生成回复 |
| 重听语音 | 🔊 | 每个 AI 气泡上方，点击重播该句语音 |
| 生成报告 | 📊 报告 | 当前对话生成学习报告，自动保存 |
| 新建对话 | ＋ 新建对话 | 清空页面，开始全新对话 |
| 切换场景 | 顶栏下拉框 | 切换后清空对话，开始新话题 |
| 调整字体 | ⚙ 设置 | 小 / 中 / 大三档字体 |

### 查看历史

1. 左侧栏显示所有历史对话，按时间倒序排列
2. 点击某条记录 → 查看完整对话内容
3. 点 **💬 继续对话** → 恢复到聊天区，接着往下聊
4. 点 **📊 学习报告** → 查看该场对话的分析报告（已生成则直接显示）
5. 点 **🗑 删除** → 删除该条记录
6. 点 **☑ 批量** → 进入多选模式，可批量删除

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
│   └── types.ts                     # 前后端共享类型定义
├── client/                          # React 前端（端口 5173）
│   └── src/
│       ├── main.tsx                 # 入口
│       ├── App.tsx                  # 主界面 + 对话逻辑 + TTS 播放
│       ├── App.css                  # 样式（含深色模式）
│       ├── types.ts                 # 前端共享类型
│       ├── components/
│       │   ├── TopBar.tsx           # 顶栏：品牌 + 场景/模式 + 状态
│       │   ├── Sidebar.tsx          # 左侧栏：对话历史列表 + 批量操作
│       │   ├── BottomBar.tsx        # 底栏：录音/打断/报告按钮
│       │   ├── ChatView.tsx         # 对话气泡渲染
│       │   ├── HistoryView.tsx      # 历史对话详情
│       │   ├── ReportView.tsx       # 报告面板 + 图表
│       │   └── ReportAnalysis.tsx   # LLM 定性分析渲染
│       ├── hooks/
│       │   ├── useWebSocket.ts      # WebSocket 连接 + 自动重连
│       │   └── useAudioCapture.ts   # 麦克风采集 (AudioWorklet)
│       └── workers/
│           └── audio-processor.ts   # AudioWorklet 降采样处理器
├── server/                          # Node.js 后端（HTTP 3000 / WS 3001）
│   └── src/
│       ├── index.ts                 # 入口 + REST API + 报告生成
│       ├── ws-server.ts             # WebSocket 消息路由 + 管道编排
│       ├── asr.ts                   # 讯飞 ASR 客户端
│       ├── tts.ts                   # 讯飞 TTS 客户端
│       ├── pronounce.ts             # 讯飞 ISE 发音评测
│       ├── llm.ts                   # DeepSeek 流式对话
│       ├── session.ts               # 会话管理 + 系统提示词
│       └── db.ts                    # SQLite CRUD
├── .env.example                     # API Key 模板
├── .editorconfig                    # 编辑器规范
├── .prettierrc                      # 代码格式化
├── eslint.config.js                 # 代码规范
└── start.bat                        # Windows 一键启动脚本
```

## 端口说明

| 端口 | 服务 |
|------|------|
| 3000 | Express HTTP（REST API + 报告生成） |
| 3001 | WebSocket（实时语音 + 对话） |
| 5173 | Vite 前端开发服务器 |

## 开发规划

- [x] 项目脚手架 + WS 联通
- [x] 音频采集 AudioWorklet
- [x] 讯飞实时 ASR
- [x] 实时字幕显示
- [x] DeepSeek 流式对话
- [x] 讯飞 TTS 语音合成
- [x] 场景选择 + 纠错模式
- [x] 讯飞 ISE 发音评测
- [x] 即时纠错气泡
- [x] 深色模式 + 字体大小
- [x] 对话历史 + 侧边栏
- [x] SQLite 对话持久化
- [x] 课后总结报告
- [x] 继续历史对话
- [x] AI 语音重播
- [ ] 量化进度追踪（多场对比、成长曲线）
- [ ] Demo 视频
