# Task Plan: VAPI 国内版 - 核心功能落地

## Goal
实现一个**可用的**实时语音 AI 对话系统，让用户能够通过 WebSocket 与 AI 进行低延迟的语音交互。

## Phases
- [x] Phase 1: 技术方案决策 - 确定 AI 服务集成方式
- [x] Phase 2: StepFun Realtime 适配器开发
- [x] Phase 3: 技术栈重评估 - **切换到 TypeScript/Bun**
- [x] Phase 4: TypeScript 版本开发
- [x] Phase 6: 音频播放优化 + 错误处理
- [ ] Phase 7: FreeSWITCH 集成（移至 Linux 部署阶段）

## 关键决策
- [2026-02-17] 技术栈切换：**Python → TypeScript (Bun)**
- 原因：用户有 TypeScript 经验，可参考官方 Demo

## Key Questions
1. ~~AI 服务选择~~: ✅ StepFun Realtime API
2. ~~模型选择~~: ✅ step-audio-2
3. **打断机制**: StepFun 内置双向打断 ✅
4. **备用方案**: 保留原 voice_engine.py 作为扩展基础 ✅

## Decisions Made
- [2026-02-17] 评估结论：StepFun Realtime API 更适合（低延迟、统一接口、用户有经验）
- [2026-02-17] 模型选择：**step-audio-2**（最新旗舰 + Tony 有经验）
- [2026-02-17] API Key：Tony 已有
- [2026-02-17] 架构：新建 realtime_handler.py，保留原 websocket_handler.py 作为 legacy

## Errors Encountered
- 无

## Status
**Phase 6 完成** ✅ - 优化音频播放和错误处理

## Next Action
Phase 7: FreeSWITCH 集成测试

## 完成的文件变更
| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/stepfun_realtime.py` | 新建 | StepFun Realtime API 适配器 |
| `backend/realtime_handler.py` | 新建 | 实时语音对话处理器 |
| `backend/models.py` | 修改 | 添加 RealtimeProvider, RealtimeConfig |
| `backend/main.py` | 修改 | 集成 StepFun，WebSocket 支持双模式 |
| `.env.example` | 修改 | 添加 STEPFUN_API_KEY 配置 |
| `TEST_GUIDE.md` | 新建 | 测试指南 |
| `notes.md` | 更新 | 添加官方 API 文档要点 |

## 官方参考
- API 文档: https://platform.stepfun.com/docs/zh/api-reference/realtime/chat
- 官方 Demo: https://github.com/stepfun-ai/Step-Realtime-Console (Bun + Svelte)
