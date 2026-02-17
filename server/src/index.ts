/**
 * VAPI 国内版 - StepFun Realtime API 服务器
 * 基于 Hono 框架 + Bun 运行时
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import {
  handleWebSocketOpen,
  handleWebSocketMessage,
  handleWebSocketClose,
  assistants,
  conversations,
} from "./websocket";

// 创建应用
const app = new Hono();

// 中间件
app.use("*", cors());
app.use("*", logger());

// 静态文件 (测试页面)
app.use("/test", serveStatic({ path: "./public/test.html" }));

// ==================== 健康检查 ====================

app.get("/", (c) => {
  return c.json({
    name: "VAPI 国内版",
    version: "1.0.0",
    description: "基于 StepFun Realtime API 的语音 AI 代理服务",
    endpoints: {
      rest: {
        "GET /": "服务信息",
        "GET /health": "健康检查",
        "POST /assistants": "创建助手",
        "GET /assistants": "助手列表",
        "GET /assistants/:id": "助手详情",
        "DELETE /assistants/:id": "删除助手",
        "POST /conversations": "创建对话",
        "GET /conversations/:id": "对话详情",
      },
      websocket: {
        "WS /ws/conversations/:id": "实时语音对话 (需要 assistant_id 参数)",
      },
    },
  });
});

app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    version: "1.0.0",
    services: {
      stepfun: !!process.env.STEPFUN_API_KEY,
    },
  });
});

// ==================== 助手管理 ====================

interface CreateAssistantBody {
  name: string;
  description?: string;
  system_prompt?: string;
  voice?: string;
  model?: string;
}

app.post("/assistants", async (c) => {
  const body = await c.req.json<CreateAssistantBody>();
  const id = crypto.randomUUID();

  const assistant = {
    id,
    name: body.name,
    description: body.description || "",
    system_prompt: body.system_prompt || "你是一个友好的语音助手。",
    voice: body.voice || "qingchunshaonv",
    model: body.model || "step-audio-2",
    created_at: new Date().toISOString(),
  };

  assistants.set(id, assistant);

  return c.json(assistant, 201);
});

app.get("/assistants", (c) => {
  const list = Array.from(assistants.values());
  return c.json(list);
});

app.get("/assistants/:id", (c) => {
  const id = c.req.param("id");
  const assistant = assistants.get(id);

  if (!assistant) {
    return c.json({ error: "助手不存在" }, 404);
  }

  return c.json(assistant);
});

app.delete("/assistants/:id", (c) => {
  const id = c.req.param("id");

  if (!assistants.has(id)) {
    return c.json({ error: "助手不存在" }, 404);
  }

  assistants.delete(id);
  return c.json({ message: "已删除" });
});

// ==================== 对话管理 ====================

interface CreateConversationBody {
  assistant_id: string;
  user_id?: string;
}

app.post("/conversations", async (c) => {
  const body = await c.req.json<CreateConversationBody>();

  if (!assistants.has(body.assistant_id)) {
    return c.json({ error: "助手不存在" }, 404);
  }

  const id = crypto.randomUUID();
  const conversation = {
    id,
    assistant_id: body.assistant_id,
    user_id: body.user_id || null,
    status: "created",
    messages: [],
    created_at: new Date().toISOString(),
  };

  conversations.set(id, conversation);

  return c.json(conversation, 201);
});

app.get("/conversations/:id", (c) => {
  const id = c.req.param("id");
  const conversation = conversations.get(id);

  if (!conversation) {
    return c.json({ error: "对话不存在" }, 404);
  }

  return c.json(conversation);
});

// ==================== 启动服务器 (使用 Bun 原生) ====================

const port = parseInt(process.env.PORT || "3000");

console.log("🚀 VAPI 服务器启动中...");
console.log(`📍 地址: http://localhost:${port}`);
console.log(
  `🔑 StepFun API Key: ${process.env.STEPFUN_API_KEY ? "已配置" : "未配置"}`,
);

// 使用 Bun 原生服务器（支持 WebSocket）
Bun.serve({
  port,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket 升级
    if (url.pathname.startsWith("/ws/conversations/")) {
      const conversationId = url.pathname.split("/").pop() || "";
      const assistantId = url.searchParams.get("assistant_id") || "default";

      // 升级为 WebSocket
      if (
        server.upgrade(req, {
          data: { conversationId, assistantId },
        })
      ) {
        return; // WebSocket 已升级
      }

      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // 其他请求交给 Hono 处理
    return app.fetch(req, server);
  },

  websocket: {
    open(ws) {
      const { conversationId, assistantId } = ws.data as {
        conversationId: string;
        assistantId: string;
      };
      handleWebSocketOpen(ws, conversationId, assistantId);
    },

    message(ws, message) {
      handleWebSocketMessage(ws, message as string);
    },

    close(ws) {
      handleWebSocketClose(ws);
    },
  },
});

console.log("✅ 服务器已启动");
