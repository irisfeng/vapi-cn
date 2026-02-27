/**
 * WebSocket 实时语音对话服务器
 * 使用 Bun 原生 WebSocket API
 */

import { createStepFunClient, StepFunRealtimeClient } from "./stepfun-realtime";
import { createLogger } from "./logger";

const logger = createLogger('websocket')

// ==================== 类型定义 ====================

interface Assistant {
  id: string;
  name: string;
  system_prompt: string;
  voice: string;
  model: string;
}

interface Conversation {
  id: string;
  assistant_id: string;
  status: string;
  messages: Array<{ role: string; content: string }>;
}

// ==================== 会话管理 ====================

const assistants = new Map<string, Assistant>();
const conversations = new Map<string, Conversation>();

// 创建默认助手
const defaultAssistant: Assistant = {
  id: "default",
  name: "默认助手",
  system_prompt: "你是一个友好的语音助手，请用简洁自然的语言回答用户问题。",
  voice: "qingchunshaonv",
  model: "step-audio-2",
};
assistants.set(defaultAssistant.id, defaultAssistant);

// ==================== 辅助函数 ====================

function createServerMessage(type: string, data: any) {
  return JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString(),
  });
}

// ==================== WebSocket 处理 ====================

// 存储每个 WebSocket 连接的上下文
const wsContexts = new Map<
  WebSocket,
  {
    conversation: Conversation;
    sfClient: StepFunRealtimeClient;
  }
>();

export function handleWebSocketOpen(
  ws: WebSocket,
  conversationId: string,
  assistantId: string,
) {
  const apiKey = process.env.STEPFUN_API_KEY;

  if (!apiKey) {
    ws.send(createServerMessage("error", { error: "STEPFUN_API_KEY 未配置" }));
    ws.close();
    return;
  }

  // 获取助手配置
  const assistant = assistants.get(assistantId) || defaultAssistant;

  // 创建会话
  const conversation: Conversation = {
    id: conversationId,
    assistant_id: assistant.id,
    status: "active",
    messages: [],
  };
  conversations.set(conversationId, conversation);

  // 创建 StepFun 客户端
  const sfClient = createStepFunClient({
    apiKey,
    model: assistant.model,
    voice: assistant.voice,
    systemPrompt: assistant.system_prompt,
  });

  // 保存上下文
  wsContexts.set(ws, { conversation, sfClient });

  // 注册回调
  sfClient.onText((delta) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        createServerMessage("text_delta", { text: delta, role: "assistant" }),
      );
    }
  });

  sfClient.onAudio((audio) => {
    if (ws.readyState === WebSocket.OPEN) {
      const base64 = btoa(String.fromCharCode(...audio));
      ws.send(
        createServerMessage("audio", {
          audio: base64,
          format: "pcm16",
          sample_rate: 24000,
        }),
      );
    }
  });

  sfClient.onStatus((status, message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(createServerMessage("status", { status, message }));
    }
  });

  sfClient.onError((error) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(createServerMessage("error", { error }));
    }
  });

  sfClient.onUserTranscript((transcript) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        createServerMessage("transcription", {
          text: transcript,
          role: "user",
        }),
      );
      conversation.messages.push({ role: "user", content: transcript });
    }
  });

  sfClient.onInterrupt(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        createServerMessage("interrupted", { reason: "user_speech_detected" }),
      );
    }
  });

  // 连接 StepFun
  sfClient
    .connect()
    .then(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          createServerMessage("welcome", {
            message: "欢迎使用语音 AI 助手，请开始对话",
            assistant_id: assistant.id,
            conversation_id: conversationId,
          }),
        );
      }
    })
    .catch((error) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          createServerMessage("error", { error: `连接失败: ${error.message}` }),
        );
        ws.close();
      }
    });
}

export function handleWebSocketMessage(
  ws: WebSocket,
  message: string | Buffer,
) {
  const ctx = wsContexts.get(ws);
  if (!ctx) return;

  const { conversation, sfClient } = ctx;

  try {
    // 二进制数据 = 音频
    if (message instanceof Buffer || message instanceof Uint8Array) {
      sfClient.sendAudio(new Uint8Array(message as ArrayBuffer));
      return;
    }

    // 文本数据 = JSON 消息
    if (typeof message === "string") {
      const data = JSON.parse(message);

      switch (data.type) {
        case "text":
          const text = data.data?.content || "";
          conversation.messages.push({ role: "user", content: text });

          ws.send(createServerMessage("transcription", { text, role: "user" }));
          ws.send(
            createServerMessage("status", {
              status: "thinking",
              message: "AI 正在思考...",
            }),
          );

          sfClient
            .sendText(text)
            .then((response) => {
              conversation.messages.push({
                role: "assistant",
                content: response.text,
              });
              ws.send(
                createServerMessage("status", {
                  status: "completed",
                  message: "回复完成",
                }),
              );
            })
            .catch((error) => {
              ws.send(createServerMessage("error", { error: error.message }));
            });
          break;

        case "audio":
          if (data.data?.audio) {
            const audioBytes = Uint8Array.from(atob(data.data.audio), (c) =>
              c.charCodeAt(0),
            );
            sfClient.sendAudio(audioBytes);
          }
          break;

        case "control":
          const command = data.data?.command;
          if (command === "interrupt") {
            sfClient.cancelResponse();
          } else if (command === "commit") {
            sfClient.commitAudio();
          }
          break;
      }
    }
  } catch (error) {
    console.error("消息处理错误:", error);
  }
}

export function handleWebSocketClose(ws: WebSocket) {
  const ctx = wsContexts.get(ws);
  if (ctx) {
    ctx.conversation.status = "completed";
    ctx.sfClient.close();
    wsContexts.delete(ws);
    console.log(`会话已关闭: ${ctx.conversation.id}`);
  }
}

export { assistants, conversations };
