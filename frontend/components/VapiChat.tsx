/**
 * VapiChat - 语音对话聊天组件
 * 
 * 一个完整的语音对话界面组件，包含:
 * - 消息历史显示
 * - 语音输入按钮
 * - 文本输入框
 * - 实时状态显示
 * 
 * 使用示例:
 * ```tsx
 * <VapiChat
 *   assistantId="your-assistant-id"
 *   serverUrl="http://localhost:8000"
 *   title="智能客服"
 * />
 * ```
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { VapiClient, VapiClientConfig } from '../VapiClient';

// ==================== 类型定义 ====================

export interface Message {
  id: string;
  text: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  audioUrl?: string;
  isPlaying?: boolean;
}

export interface VapiChatProps {
  /** 助手ID */
  assistantId: string;
  /** 用户ID（可选） */
  userId?: string;
  /** 服务器URL */
  serverUrl: string;
  /** API密钥（可选） */
  apiKey?: string;
  /** 调试模式 */
  debug?: boolean;
  /** 聊天窗口标题 */
  title?: string;
  /** 欢迎消息 */
  welcomeMessage?: string;
  /** 自定义样式 */
  className?: string;
  /** 消息回调 */
  onMessage?: (message: Message) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// ==================== 样式定义 ====================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '480px',
    height: '600px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#4ade80',
  },
  statusDotConnecting: {
    backgroundColor: '#fbbf24',
    animation: 'blink 1s infinite',
  },
  statusDotError: {
    backgroundColor: '#ef4444',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    backgroundColor: '#f8fafc',
  },
  message: {
    display: 'flex',
    marginBottom: '16px',
    animation: 'fadeIn 0.3s ease',
  },
  messageUser: {
    justifyContent: 'flex-end',
  },
  messageAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: '16px',
    fontSize: '14px',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  messageBubbleUser: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    borderBottomRightRadius: '4px',
  },
  messageBubbleAssistant: {
    backgroundColor: '#fff',
    color: '#1f2937',
    borderBottomLeftRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  },
  messageTime: {
    fontSize: '11px',
    opacity: 0.7,
    marginTop: '4px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '8px',
    fontSize: '16px',
  },
  avatarUser: {
    backgroundColor: '#e0e7ff',
    color: '#667eea',
    order: 1,
    marginLeft: '8px',
    marginRight: 0,
  },
  avatarAssistant: {
    backgroundColor: '#f3e8ff',
    color: '#9333ea',
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: '#fff',
    borderTop: '1px solid #e5e7eb',
  },
  textInput: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '24px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  voiceButton: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
  },
  voiceButtonActive: {
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    animation: 'pulse 1.5s infinite',
  },
  voiceButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  sendButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#667eea',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 16px',
    backgroundColor: '#fff',
    borderRadius: '16px',
    borderBottomLeftRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  },
  typingDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#9333ea',
    borderRadius: '50%',
    animation: 'typing 1.4s infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af',
    textAlign: 'center',
    padding: '40px',
  },
  emptyIcon: {
    width: '64px',
    height: '64px',
    marginBottom: '16px',
    opacity: 0.5,
  },
};

// ==================== 图标组件 ====================

const MicIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const SendIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const ChatIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
  </svg>
);

const TypingIndicator: React.FC = () => (
  <div style={styles.typingIndicator}>
    <span style={{ ...styles.typingDot, animationDelay: '0s' }} />
    <span style={{ ...styles.typingDot, animationDelay: '0.2s' }} />
    <span style={{ ...styles.typingDot, animationDelay: '0.4s' }} />
  </div>
);

// ==================== 主组件 ====================

export const VapiChat: React.FC<VapiChatProps> = ({
  assistantId,
  userId,
  serverUrl,
  apiKey,
  debug = false,
  title = '语音助手',
  welcomeMessage = '你好！我是你的语音助手，点击麦克风按钮开始对话吧。',
  className = '',
  onMessage,
  onError,
}) => {
  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // 引用
  const clientRef = useRef<VapiClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 初始化欢迎消息
  useEffect(() => {
    if (welcomeMessage && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          text: welcomeMessage,
          role: 'assistant',
          timestamp: new Date(),
        },
      ]);
    }
  }, [welcomeMessage]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 初始化客户端
  const initClient = useCallback(() => {
    if (clientRef.current) {
      return clientRef.current;
    }

    const config: VapiClientConfig = {
      baseUrl: serverUrl,
      apiKey,
      debug,
    };

    const client = new VapiClient(config);

    // 注册事件处理器
    client.on('welcome', () => {
      setConnectionState('connected');
    });

    client.on('transcription', (data) => {
      const message: Message = {
        id: Date.now().toString(),
        text: data.text,
        role: 'user',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      onMessage?.(message);
    });

    client.on('message', (data) => {
      const message: Message = {
        id: Date.now().toString(),
        text: data.text,
        role: data.role,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      onMessage?.(message);
    });

    client.on('status', (data) => {
      if (data.status === 'thinking') {
        setIsTyping(true);
      } else if (data.status === 'completed') {
        setIsTyping(false);
      }
    });

    client.on('error', (data) => {
      setConnectionState('error');
      onError?.(new Error(data.error));
    });

    client.on('stopped', () => {
      setConnectionState('disconnected');
      setIsRecording(false);
    });

    clientRef.current = client;
    return client;
  }, [serverUrl, apiKey, debug, onMessage, onError]);

  // 处理语音按钮点击
  const handleVoiceClick = useCallback(async () => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      try {
        setConnectionState('connecting');
        const client = initClient();
        await client.start({ assistantId, userId });
        setIsRecording(true);
      } catch (error) {
        setConnectionState('error');
        onError?.(error as Error);
      }
    } else {
      const client = clientRef.current;
      if (client) {
        client.stop();
        setIsRecording(false);
      }
    }
  }, [connectionState, assistantId, userId, initClient, onError]);

  // 处理文本发送
  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      role: 'user',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    onMessage?.(userMessage);

    // 发送消息
    const client = clientRef.current;
    if (client && connectionState === 'connected') {
      client.send(inputText);
      setIsTyping(true);
    }

    setInputText('');
    inputRef.current?.focus();
  }, [inputText, connectionState, onMessage]);

  // 处理按键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 获取状态点样式
  const getStatusDotStyle = useCallback((): React.CSSProperties => {
    const baseStyle = styles.statusDot;
    switch (connectionState) {
      case 'connecting':
        return { ...baseStyle, ...styles.statusDotConnecting };
      case 'error':
        return { ...baseStyle, ...styles.statusDotError };
      default:
        return baseStyle;
    }
  }, [connectionState]);

  // 获取状态文本
  const getStatusText = useCallback(() => {
    switch (connectionState) {
      case 'connecting':
        return '连接中';
      case 'connected':
        return '在线';
      case 'error':
        return '错误';
      default:
        return '离线';
    }
  }, [connectionState]);

  // 格式化时间
  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <div style={styles.container} className={className}>
      {/* 头部 */}
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
        <div style={styles.status}>
          <span style={getStatusDotStyle()} />
          <span>{getStatusText()}</span>
        </div>
      </div>

      {/* 消息列表 */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <ChatIcon style={styles.emptyIcon} />
            <p>开始对话吧</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              style={{
                ...styles.message,
                ...(message.role === 'user' ? styles.messageUser : styles.messageAssistant),
              }}
            >
              {message.role !== 'user' && (
                <div style={{ ...styles.avatar, ...styles.avatarAssistant }}>🤖</div>
              )}
              <div
                style={{
                  ...styles.messageBubble,
                  ...(message.role === 'user'
                    ? styles.messageBubbleUser
                    : styles.messageBubbleAssistant),
                }}
              >
                <div>{message.text}</div>
                <div style={styles.messageTime}>{formatTime(message.timestamp)}</div>
              </div>
              {message.role === 'user' && (
                <div style={{ ...styles.avatar, ...styles.avatarUser }}>👤</div>
              )}
            </div>
          ))
        )}

        {isTyping && (
          <div style={{ ...styles.message, ...styles.messageAssistant }}>
            <div style={{ ...styles.avatar, ...styles.avatarAssistant }}>🤖</div>
            <TypingIndicator />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div style={styles.inputContainer}>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          style={styles.textInput}
          disabled={connectionState !== 'connected'}
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || connectionState !== 'connected'}
          style={{
            ...styles.sendButton,
            ...(!inputText.trim() || connectionState !== 'connected'
              ? styles.sendButtonDisabled
              : {}),
          }}
        >
          <SendIcon style={{ width: '20px', height: '20px' }} />
        </button>

        <button
          onClick={handleVoiceClick}
          style={{
            ...styles.voiceButton,
            ...(isRecording ? styles.voiceButtonActive : {}),
            ...(connectionState === 'connecting' ? styles.voiceButtonDisabled : {}),
          }}
          disabled={connectionState === 'connecting'}
        >
          <MicIcon style={{ width: '24px', height: '24px' }} />
        </button>
      </div>

      {/* CSS动画 */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(240, 147, 251, 0.5);
          }
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-10px);
          }
        }
      `}</style>
    </div>
  );
};

export default VapiChat;
