# VAPI 国内版 - 实时语音 AI 代理

基于 StepFun Realtime API 的低延迟语音对话系统。

## 功能特性

- 🎙️ 实时语音对话（双向流式）
- 📝 文本消息支持
- 🔊 AI 音频实时播放
- ⚡ 低延迟（<500ms）
- 🤖 可配置 AI 助手（系统提示词、音色）

## 快速开始

### 1. 安装依赖

```bash
cd server
bun install
```

### 2. 配置环境变量

创建 `server/.env` 文件：

```env
STEPFUN_API_KEY=your_api_key_here
PORT=3000
```

### 3. 启动服务器

```bash
cd server
bun run src/index.ts
```

### 4. 打开测试页面

访问 http://localhost:3000/test

## 使用方法

### 文本对话
1. 点击「连接服务器」
2. 在输入框输入文字
3. 点击「发送」或按回车

### 语音对话
1. 点击「连接服务器」
2. 点击红色麦克风按钮开始录音
3. 说话（AI 会自动打断并回复）
4. 点击红色按钮停止录音

## API 接口

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 服务信息 |
| `/health` | GET | 健康检查 |
| `/assistants` | POST | 创建助手 |
| `/assistants` | GET | 助手列表 |
| `/assistants/:id` | GET | 助手详情 |
| `/assistants/:id` | DELETE | 删除助手 |
| `/conversations` | POST | 创建对话 |
| `/conversations/:id` | GET | 对话详情 |

### WebSocket API

**连接地址：**
```
ws://localhost:3000/ws/conversations/:id?assistant_id=default
```

**消息格式：**

```json
// 发送文本
{ "type": "text", "data": { "content": "你好" } }

// 发送音频（二进制 PCM16，16000Hz）
// 直接发送 ArrayBuffer

// 控制命令
{ "type": "control", "data": { "command": "commit" } }
{ "type": "control", "data": { "command": "interrupt" } }
```

**服务端消息：**

```json
// 欢迎
{ "type": "welcome", "data": { "message": "...", "assistant_id": "...", "conversation_id": "..." } }

// 用户语音转写
{ "type": "transcription", "data": { "text": "...", "role": "user" } }

// AI 文本流
{ "type": "text_delta", "data": { "text": "...", "role": "assistant" } }

// AI 音频
{ "type": "audio", "data": { "audio": "base64...", "format": "pcm16", "sample_rate": 24000 } }

// 状态
{ "type": "status", "data": { "status": "...", "message": "..." } }

// 错误
{ "type": "error", "data": { "error": "..." } }
```

## 技术栈

- **运行时：** Bun
- **框架：** Hono
- **AI 服务：** StepFun Realtime API
- **音频格式：** PCM16（16kHz 输入，24kHz 输出）

## 配置选项

### 助手配置

```typescript
{
  name: "助手名称",
  description: "助手描述",
  system_prompt: "你是一个友好的语音助手。",
  voice: "qingchunshaonv",  // StepFun 音色
  model: "step-audio-2"      // StepFun 模型
}
```

### 可用音色

- `qingchunshaonv` - 青春少女（默认）
- 其他音色请参考 StepFun 文档

## 注意事项

1. **StepFun API 费用：** 实时语音对话会消耗费用，请注意账户余额
2. **浏览器兼容性：** 需要 Chrome/Edge 等现代浏览器
3. **HTTPS：** 生产环境需要 HTTPS 才能使用麦克风

## 开发路线

- [x] WebSocket 实时对话
- [x] StepFun Realtime API 集成
- [x] 文本消息支持
- [x] 语音录制和播放
- [ ] 前端 SDK
- [ ] 电话网关集成
- [ ] 多轮对话上下文管理
- [ ] 对话历史持久化

## License

MIT
