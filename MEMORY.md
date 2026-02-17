# MEMORY.md - VAPI 国内版长期记忆

## 项目概述

**国内版 VAPI** - 语音 AI 代理开发平台，集成国内主流 AI 服务。

---

## 开发进度 (2026-02-17 更新)

### Phase 1 & 2 已完成 ✅

| 模块 | 状态 | 说明 |
|------|------|------|
| **StepFun Realtime 适配器** | ✅ 完成 | `backend/stepfun_realtime.py` |
| **实时语音处理器** | ✅ 完成 | `backend/realtime_handler.py` |
| **数据模型** | ✅ 完成 | 添加 `RealtimeConfig`, `RealtimeProvider` |
| **主应用集成** | ✅ 完成 | WebSocket 支持双模式 |
| **环境配置** | ✅ 完成 | 添加 `STEPFUN_API_KEY` |

### 核心架构变更

```
之前：用户音频 → STT → LLM → TTS → 返回音频（高延迟、mock实现）

现在：用户音频 → StepFun Realtime API → 返回音频（低延迟、真实API）
```

### WebSocket 端点

```
ws://localhost:8000/ws/conversations/{conversation_id}?assistant_id={id}&mode=realtime
```

参数：
- `mode=realtime` (默认): 使用 StepFun Realtime API
- `mode=legacy`: 使用传统 STT→LLM→TTS 流程

---

## 技术栈

| 组件 | 选择 | 说明 |
|------|------|------|
| 实时语音 | StepFun Realtime API | step-audio-2 模型 |
| 后端框架 | FastAPI | Python 异步 |
| 数据库 | SQLite/PostgreSQL | SQLAlchemy 异步 |
| 前端 SDK | TypeScript | WebSocket 客户端 |

---

## 下一步

- [ ] Phase 4: 端到端测试
- [ ] Phase 5: 文档更新

---

## 关键决策记录

### 2026-02-17
- 技术选型：**StepFun Realtime API**
- 模型：**step-audio-2**（最新旗舰）
- 架构：新建 realtime_handler.py，保留原 websocket_handler.py 作为 legacy
