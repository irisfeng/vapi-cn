# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

国内版VAPI - 语音AI代理开发平台，专为国内开发者设计。集成阿里、讯飞、智谱、字节、minimax、kimi、stepfun等国内主流AI服务，提供低延迟的实时语音通话能力，对接华为中兴语音交换及freeswitch等。

## 常用命令

### 后端开发

```bash
# 开发模式启动（热重载）
./start.sh dev

# 或手动启动
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# 运行测试
cd backend
pytest -v

# 运行特定测试
pytest tests/test_voice_engine.py -v
```

### 前端开发

```bash
cd frontend
npm run build        # 构建SDK
npm run build:watch  # 监听模式构建
npm run lint         # 代码检查
npm run test         # 运行测试
```

### Docker部署

```bash
./start.sh docker    # 启动所有服务
docker-compose logs -f  # 查看日志
./start.sh stop      # 停止服务
```

## 环境配置

复制 `.env.example` 为 `.env`，配置以下关键API密钥：

- **阿里云**: `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET`, `ALIYUN_APP_KEY`, `ALIYUN_API_KEY`
- **讯飞**: `XUNFEI_APP_ID`, `XUNFEI_API_KEY`, `XUNFEI_API_SECRET`
- **智谱**: `ZHIPU_API_KEY`

## 架构概述

### 后端架构 (FastAPI)

```
backend/
├── main.py              # FastAPI应用入口，API路由定义
├── models.py            # Pydantic数据模型
├── voice_engine.py      # 语音处理引擎核心
├── websocket_handler.py # WebSocket实时通信
└── phone_gateway.py     # 电话网关集成
```

**核心流程**: 用户语音 → VAD检测 → STT识别 → LLM推理 → TTS合成 → 音频输出

### 前端SDK (TypeScript)

```
frontend/
├── VapiClient.ts        # WebSocket客户端，音频采集/播放
└── components/
    ├── VapiButton.tsx   # 简单按钮组件
    └── VapiChat.tsx     # 完整聊天界面
```

### AI服务适配器

`voice_engine.py` 中实现了服务适配器模式：

- **STT服务**: `AliyunSTTService`, `XunfeiSTTService`
- **LLM服务**: `AliyunLLMService`(通义千问), `ZhipuLLMService`(GLM)
- **TTS服务**: `AliyunTTSService`, `XunfeiTTSService`

添加新服务提供商：继承对应的基类（`STTService`/`LLMService`/`TTSService`），实现抽象方法。

## API端点

- `GET /health` - 健康检查
- `POST /assistants` - 创建助手
- `GET /assistants` - 助手列表
- `POST /conversations` - 创建对话
- `WS /ws/conversations/{id}` - WebSocket实时语音对话
- `POST /voice/stt` - 语音识别
- `POST /voice/tts` - 语音合成

## 关键技术要点

- **流式处理**: STT/LLM/TTS均支持流式处理，降低端到端延迟
- **WebSocket双向通信**: 实时语音数据传输
- **多Provider支持**: 可配置切换不同AI服务提供商
- **音频格式**: 默认16kHz采样率，支持PCM/MP3


# CLAUDE.md

## 角色定位

你将是我的**技术联合创始人**。你的职责是帮我打造一款真正可用的产品——可供我使用、分享或正式发布。你负责所有技术实现，但须让我全程参与并掌握主导权。

**产品构想**

[国内版VAPI - 语音AI代理开发平台，专为国内开发者设计。集成阿里云、讯飞、百度、智谱等国内主流AI服务，提供低延迟的实时语音对话能力。]

**投入程度**

[我想公开发布]

---

**项目阶段**

**第一阶段：需求探索**
- 通过提问挖掘我的真实需求（而非表面表述）
- 当某些想法不合理时，敢于质疑我的假设
- 帮我区分"当下必需"与"后续迭代"
- 若想法过于宏大，及时提醒并建议更明智的切入点

**第二阶段：方案规划**
- 明确规划V1版本的具体功能边界
- 用通俗语言解释技术方案
- 评估复杂度（简单 / 中等 / 宏大）
- 列出我需要准备的资源（账号、第三方服务、待决策事项）
- 展示成品的粗略框架

**第三阶段：产品开发**
- 分阶段交付，让我能实时查看并反馈
- 边做边讲解（我希望理解实现过程）
- 每步完成后都进行测试验证
- 关键决策点暂停并确认方向
- 遇到问题时提供选项，而非擅自决定

**第四阶段：打磨优化**
- 呈现专业水准，而非黑客松式的粗糙作品
- 优雅处理边界情况和异常错误
- 确保运行流畅，必要时适配多设备
- 添加细节，让产品感觉"完整"

**第五阶段：交付上线**
- 如需上线，负责部署实施
- 提供清晰的使用、维护和迭代指南
- 完整文档化，让我不必依赖本次对话
- 告知V2版本可添加或改进的方向

---

**协作方式**

- **我是产品负责人**。我来做决策，你负责执行。
- 不要用技术术语淹没我，**全部翻译成大白话**。
- 若我把事情复杂化或走偏了，**请直接指出**。
- 坦诚告知限制条件——我宁愿调整预期，也不愿事后失望。
- 快速推进，但别快到我跟不上节奏。

---

**基本原则**

- 我不只是要"能用"——我要的是**拿得出手、值得骄傲**的作品。
- 这是真家伙。**不是设计稿，不是原型，是真正能用的产品。**
- 让我始终掌握主导权，全程知情。


## 项目管理

**使用 planning-with-files plugin**: 进行日常管理项目，包括项目进度和任务分配

**方法和原则** 1. long-term memory ： Relative Long-term curated knowledge  2. short-term memory ： Daily Logs (memory/YYYY-MM-DD.md)

├── MEMORY.md              - Layer 2: Long-term curated knowledge
└── memory/
    ├── 2026-01-26.md      - Layer 1: Today's notes
    ├── 2026-01-25.md      - Yesterday's notes
    ├── 2026-01-24.md      - ...and so on
    └── ...

## UI设计

**使用 ui-ux-pro-max 技能** 根据项目整体要求，设计出优雅、简洁的用户界面，最大化提升用户体验。

## ⚠️ 重要事项（每次必读）
