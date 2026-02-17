# 国内版VAPI - 语音AI代理开发平台

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-blue.svg" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-0.109+-green.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-18+-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
</p>

国内版VAPI是一个开源的语音AI代理开发平台，专为国内开发者设计。集成阿里云、讯飞、百度、智谱等国内主流AI服务，提供低延迟的实时语音对话能力。

## ✨ 特性

- 🎙️ **实时语音对话** - WebSocket双向通信，低延迟语音交互
- 🔊 **多厂商支持** - 阿里云/讯飞STT、百度/阿里/智谱LLM、阿里云/讯飞TTS
- 📞 **电话集成** - 支持电话呼入/呼出（阿里云/模拟）
- 🌐 **Web SDK** - TypeScript SDK，支持网页快速集成
- ⚛️ **React组件** - 开箱即用的React组件
- 🔧 **灵活配置** - 可切换不同AI服务提供商
- 📊 **对话管理** - 完整的对话历史和管理功能

## 🚀 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+ (前端开发)
- Docker & Docker Compose (可选)

### 1. 克隆项目

```bash
git clone https://github.com/your-org/vapi-china.git
cd vapi-china
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填写你的API密钥
vim .env
```

### 3. 启动服务

#### 方式一：开发模式

```bash
# 使用启动脚本
./start.sh dev

# 或手动启动
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

#### 方式二：Docker模式

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 4. 访问服务

- API文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

## 📚 API文档

### 助手管理

```bash
# 创建助手
curl -X POST http://localhost:8000/assistants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "客服助手",
    "voice_config": {
      "stt_provider": "aliyun",
      "tts_provider": "aliyun",
      "voice_id": "xiaoyun"
    },
    "llm_config": {
      "provider": "aliyun",
      "model": "qwen-turbo",
      "system_prompt": "你是一个 helpful 的客服助手"
    }
  }'

# 获取助手列表
curl http://localhost:8000/assistants

# 更新助手
curl -X PATCH http://localhost:8000/assistants/{assistant_id} \
  -H "Content-Type: application/json" \
  -d '{"name": "新名称"}'

# 删除助手
curl -X DELETE http://localhost:8000/assistants/{assistant_id}
```

### 对话管理

```bash
# 创建对话
curl -X POST http://localhost:8000/conversations \
  -H "Content-Type: application/json" \
  -d '{"assistant_id": "your-assistant-id"}'

# 发送消息
curl -X POST http://localhost:8000/conversations/{conversation_id}/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "你好"}'
```

### 语音处理

```bash
# 语音识别
curl -X POST http://localhost:8000/voice/stt \
  -H "Content-Type: application/json" \
  -d '{"audio": "base64_encoded_audio"}'

# 语音合成
curl -X POST http://localhost:8000/voice/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "你好，世界"}'
```

## 💻 前端集成

### 使用TypeScript SDK

```typescript
import { VapiClient } from './VapiClient';

// 创建客户端
const client = new VapiClient({
  baseUrl: 'http://localhost:8000',
  debug: true
});

// 注册事件监听
client.on('message', (data) => {
  console.log('收到消息:', data.text);
});

client.on('transcription', (data) => {
  console.log('语音识别:', data.text);
});

// 开始对话
await client.start({
  assistantId: 'your-assistant-id'
});

// 发送文本
client.send('你好');

// 停止对话
client.stop();
```

### 使用React组件

```tsx
import { VapiButton } from './components/VapiButton';
import { VapiChat } from './components/VapiChat';

// 简单按钮
<VapiButton
  assistantId="your-assistant-id"
  serverUrl="http://localhost:8000"
  onMessage={(msg) => console.log(msg)}
/>

// 完整聊天界面
<VapiChat
  assistantId="your-assistant-id"
  serverUrl="http://localhost:8000"
  title="智能客服"
  welcomeMessage="你好！我是智能客服助手"
/>
```

## 🔧 配置说明

### 阿里云配置

```env
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_APP_KEY=your_app_key
ALIYUN_API_KEY=your_api_key
```

### 讯飞配置

```env
XUNFEI_APP_ID=your_app_id
XUNFEI_API_KEY=your_api_key
XUNFEI_API_SECRET=your_api_secret
```

### 智谱配置

```env
ZHIPU_API_KEY=your_api_key
```

## 📁 项目结构

```
vapi-china/
├── backend/              # FastAPI后端
│   ├── main.py          # 主应用入口
│   ├── models.py        # 数据模型
│   ├── voice_engine.py  # 语音处理引擎
│   ├── websocket_handler.py  # WebSocket处理器
│   ├── phone_gateway.py # 电话网关
│   ├── requirements.txt # Python依赖
│   └── Dockerfile       # Docker镜像
├── frontend/            # 前端SDK和组件
│   ├── VapiClient.ts    # TypeScript SDK
│   └── components/      # React组件
│       ├── VapiButton.tsx
│       └── VapiChat.tsx
├── docker-compose.yml   # Docker编排
├── start.sh            # 启动脚本
├── .env.example        # 环境变量模板
└── README.md           # 项目说明
```

## 🔌 服务提供商支持

### 语音识别 (STT)

| 提供商 | 状态 | 备注 |
|--------|------|------|
| 阿里云 | ✅ | 一句话识别、实时识别 |
| 讯飞 | ✅ | 语音听写、实时转写 |

### 大语言模型 (LLM)

| 提供商 | 状态 | 模型 |
|--------|------|------|
| 阿里云 | ✅ | qwen-turbo, qwen-plus |
| 百度 | 🚧 | 文心一言 |
| 智谱 | ✅ | GLM-4, GLM-3-turbo |
| DeepSeek | 🚧 | DeepSeek-V2 |

### 语音合成 (TTS)

| 提供商 | 状态 | 备注 |
|--------|------|------|
| 阿里云 | ✅ | 多种音色可选 |
| 讯飞 | ✅ | 在线语音合成 |
| 百度 | 🚧 | 在线语音合成 |

## 🛠️ 开发指南

### 添加新的STT提供商

1. 在 `voice_engine.py` 中创建新的服务类
2. 继承 `STTService` 基类
3. 实现 `recognize` 和 `recognize_stream` 方法

```python
class NewSTTService(STTService):
    async def recognize(self, audio_data: bytes, format: str = "pcm") -> str:
        # 实现识别逻辑
        pass
```

### 添加新的LLM提供商

1. 在 `voice_engine.py` 中创建新的服务类
2. 继承 `LLMService` 基类
3. 实现 `chat` 和 `chat_stream` 方法

## 🧪 测试

```bash
# 运行测试
cd backend
pytest -v

# 运行特定测试
pytest tests/test_voice_engine.py -v
```

## 📦 部署

### 使用Docker部署

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f backend
```

### 手动部署

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 启动服务
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 🤝 贡献

欢迎提交Issue和Pull Request！

1. Fork 项目
2. 创建分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/)
- [阿里云智能语音](https://www.aliyun.com/product/nls)
- [讯飞开放平台](https://www.xfyun.cn/)
- [智谱AI](https://open.bigmodel.cn/)

## 📞 联系方式

- 项目主页: https://github.com/your-org/vapi-china
- 问题反馈: https://github.com/your-org/vapi-china/issues
- 邮箱: support@vapi-china.com

---

<p align="center">
  Made with ❤️ in China
</p>
