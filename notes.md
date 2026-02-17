# Notes: VAPI 国内版开发笔记

## 项目背景

### 原始架构
- **后端**: FastAPI + SQLAlchemy 异步
- **语音引擎**: 分立的 STT → LLM → TTS 流程
- **提供商**: 阿里云、讯飞、智谱等

### 发现的问题 (2026-02-17)
1. `voice_engine.py` 中大部分 AI 服务为 **mock 实现**
   - AliyunSTTService._get_token() 返回硬编码 token
   - XunfeiSTTService.recognize() 返回假数据
   - 无法实际使用

2. 架构复杂度高
   - 需要3个独立服务连接
   - 延迟叠加（STT延迟 + LLM延迟 + TTS延迟）
   - 打断机制需要自行实现

---

## 技术调研

### StepFun Realtime API

#### 基本信息
- **文档**: https://platform.stepfun.com/docs/zh/guide/realtime
- **URL**: `wss://api.stepfun.com/v1/realtime?model=step-1o-audio`
- **认证**: Bearer Token

#### 可用模型 (2026-02-17 更新)
| 模型 | 说明 |
|------|------|
| **step-audio-2** | 最新旗舰模型，支持中/英/日/方言，理解环境声音/情绪/音乐，原生 Tool Call |
| **step-audio-2-mini** | 轻量版，速度更快资源更少，数理推理略弱于 step-audio-2 |
| step-1o-audio | 第一代端到端语音模型 |

**推荐**: `step-audio-2` (最新 + 功能最强 + Tony 有经验)

#### 核心特性
- **统一接口**: STT + LLM + TTS 合并在一个 WebSocket
- **内置 VAD**: 自动检测语音端点
- **智能打断**: 用户随时可打断 AI 回复
- **Tools 支持**: web_search, retrieval, 自定义函数
- **音频格式**: PCM16 (base64 编码)

#### 事件协议 (与 OpenAI Realtime 高度兼容)
```
session.created     - 会话创建
session.update      - 配置更新
input_audio_buffer.append  - 发送音频
response.audio.delta       - 接收音频片段
response.text.delta        - 接收文本片段
```

### 用户经验 (Tony)
- 已在另一个 vibe coding 项目使用 StepFun Realtime API
- 熟悉 step-audio-2 模型
- 有智能打断机制实现经验
- 有 WebSocket 独立代理服务器经验

---

## 架构决策

### 方案对比

| 对比项 | 原方案 (分立服务) | StepFun Realtime |
|--------|------------------|------------------|
| 延迟 | 高 (3跳) | 低 (1跳) |
| 复杂度 | 高 (3个适配器) | 低 (1个适配器) |
| 打断支持 | 需自行实现 | 内置 VAD |
| 可用性 | mock 实现 | 真实 API |
| 用户熟悉度 | 无 | 有经验 |

### 推荐方案
**采用 StepFun Realtime API**，理由：
1. 降低实现复杂度
2. 减少延迟
3. 内置打断支持
4. 用户有使用经验

---

## StepFun Realtime API 官方文档要点

### 连接信息
- **URL**: `wss://api.stepfun.com/v1/realtime`
- **认证**: `Authorization: Bearer STEP_API_KEY` (在 header 中)
- **模型**: `step-audio-2`, `step-audio-2-mini`, `step-audio-2-think`, `step-audio-2-mini-think`

### 可用音色 (step-audio-2)
- `qingchunshaonv` - 青春少女
- `wenrounansheng` - 温柔男声
- `elegantgentle-female` - 高雅女声
- `livelybreezy-female` - 活力女声

### 关键 Client Events
| Event | 说明 |
|-------|------|
| `session.update` | 创建/更新会话配置 |
| `input_audio_buffer.append` | 发送音频 (Base64) |
| `input_audio_buffer.commit` | 提交音频触发推理 |
| `conversation.item.create` | 添加消息项 (文本) |
| `response.create` | 触发模型推理 |
| `response.cancel` | 取消/打断响应 |

### 关键 Server Events
| Event | 说明 |
|-------|------|
| `session.created` | 会话创建成功 |
| `input_audio_buffer.speech_started` | 用户开始说话 (VAD) |
| `input_audio_buffer.speech_stopped` | 用户停止说话 |
| `response.audio.delta` | 音频片段 (Base64) |
| `response.audio_transcript.delta` | 文本片段 |
| `response.done` | 响应完成 |
| `conversation.item.input_audio_transcription.completed` | 用户语音转写结果 |

### VAD 配置 (session.update)
```json
{
  "turn_detection": {
    "type": "server_vad",
    "prefix_padding_ms": 500,
    "silence_duration_ms": 100,
    "energy_awakeness_threshold": 2500
  }
}
```

### 官方 Demo 参考架构
- 使用 Bun 原生 WebSocket (不兼容 Node.js)
- 需要 WebSocket 中转服务器 (浏览器无法在 header 中传 API Key)
- 基于 OpenAI Realtime API SDK 修改版

---

## 文件结构 (计划)

```
backend/
├── stepfun_realtime.py   # 新增: StepFun Realtime 适配器
├── websocket_handler.py  # 修改: 集成 StepFun
├── voice_engine.py       # 保留: 作为备用/扩展
└── main.py               # 微调: 环境变量
```

---

## 待办
- [ ] 确认技术方案
- [ ] 获取 StepFun API Key
- [ ] 实现 StepFun Realtime 适配器
- [ ] 端到端测试
