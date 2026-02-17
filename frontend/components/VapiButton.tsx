/**
 * VapiButton - 语音对话按钮组件
 * 
 * 一个可复用的React组件，提供一键语音对话功能
 * 包含录音状态显示、连接状态指示等功能
 * 
 * 使用示例:
 * ```tsx
 * <VapiButton
 *   assistantId="your-assistant-id"
 *   serverUrl="http://localhost:8000"
 *   onMessage={(msg) => console.log(msg)}
 * />
 * ```
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { VapiClient, VapiClientConfig } from '../VapiClient';

// ==================== 类型定义 ====================

export interface VapiButtonProps {
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
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 按钮变体 */
  variant?: 'default' | 'outline' | 'ghost';
  /** 自定义样式 */
  className?: string;
  /** 自定义文本 */
  labels?: {
    start?: string;
    stop?: string;
    connecting?: string;
    error?: string;
  };
  /** 消息回调 */
  onMessage?: (message: { text: string; role: 'user' | 'assistant' }) => void;
  /** 转写回调 */
  onTranscription?: (text: string) => void;
  /** 音频回调 */
  onAudio?: (format: string) => void;
  /** 状态回调 */
  onStatus?: (status: string, message: string) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 开始回调 */
  onStart?: () => void;
  /** 停止回调 */
  onStop?: () => void;
}

type ButtonState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

// ==================== 样式定义 ====================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  button: {
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
  },
  buttonSmall: {
    width: '48px',
    height: '48px',
  },
  buttonMedium: {
    width: '64px',
    height: '64px',
  },
  buttonLarge: {
    width: '80px',
    height: '80px',
  },
  buttonDefault: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
  },
  buttonOutline: {
    background: 'transparent',
    border: '2px solid #667eea',
    color: '#667eea',
  },
  buttonGhost: {
    background: 'transparent',
    color: '#667eea',
  },
  buttonListening: {
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    animation: 'pulse 1.5s infinite',
  },
  buttonThinking: {
    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  buttonSpeaking: {
    background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  },
  buttonError: {
    background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  icon: {
    width: '50%',
    height: '50%',
  },
  status: {
    fontSize: '12px',
    color: '#666',
    textAlign: 'center',
  },
  waveContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    gap: '3px',
    alignItems: 'center',
  },
  waveBar: {
    width: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: '2px',
    animation: 'wave 1s ease-in-out infinite',
  },
};

// ==================== 图标组件 ====================

const MicIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const StopIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M6 6h12v12H6z" />
  </svg>
);

const WaveAnimation: React.FC = () => {
  const bars = [0.6, 0.8, 1, 0.8, 0.6];
  return (
    <div style={styles.waveContainer}>
      {bars.map((scale, i) => (
        <div
          key={i}
          style={{
            ...styles.waveBar,
            height: `${16 * scale}px`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
};

// ==================== 主组件 ====================

export const VapiButton: React.FC<VapiButtonProps> = ({
  assistantId,
  userId,
  serverUrl,
  apiKey,
  debug = false,
  size = 'medium',
  variant = 'default',
  className = '',
  labels = {},
  onMessage,
  onTranscription,
  onAudio,
  onStatus,
  onError,
  onStart,
  onStop,
}) => {
  // 状态
  const [state, setState] = useState<ButtonState>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // 引用
  const clientRef = useRef<VapiClient | null>(null);
  const messagesRef = useRef<Array<{ text: string; role: 'user' | 'assistant' }>>([]);

  // 默认标签
  const defaultLabels = {
    start: '开始对话',
    stop: '结束对话',
    connecting: '连接中...',
    error: '连接失败',
    ...labels,
  };

  // 获取按钮样式
  const getButtonStyle = useCallback((): React.CSSProperties => {
    const sizeStyle = styles[`button${size.charAt(0).toUpperCase()}${size.slice(1)}` as keyof typeof styles] || styles.buttonMedium;
    const variantStyle = styles[`button${variant.charAt(0).toUpperCase()}${variant.slice(1)}` as keyof typeof styles] || styles.buttonDefault;
    
    let stateStyle: React.CSSProperties = {};
    switch (state) {
      case 'listening':
        stateStyle = styles.buttonListening;
        break;
      case 'thinking':
        stateStyle = styles.buttonThinking;
        break;
      case 'speaking':
        stateStyle = styles.buttonSpeaking;
        break;
      case 'error':
        stateStyle = styles.buttonError;
        break;
    }

    return {
      ...styles.button,
      ...sizeStyle,
      ...variantStyle,
      ...stateStyle,
      ...(state === 'connecting' ? styles.buttonDisabled : {}),
    };
  }, [state, size, variant]);

  // 获取按钮图标
  const getButtonIcon = useCallback(() => {
    if (state === 'listening' || state === 'thinking' || state === 'speaking') {
      return <WaveAnimation />;
    }
    if (state === 'idle' || state === 'error') {
      return <MicIcon style={styles.icon} />;
    }
    return <StopIcon style={styles.icon} />;
  }, [state]);

  // 获取按钮文本
  const getButtonLabel = useCallback(() => {
    switch (state) {
      case 'connecting':
        return defaultLabels.connecting;
      case 'listening':
        return '正在听...';
      case 'thinking':
        return '思考中...';
      case 'speaking':
        return '播放中...';
      case 'error':
        return defaultLabels.error;
      default:
        return defaultLabels.start;
    }
  }, [state]);

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
    client.on('welcome', (data) => {
      setStatusMessage('已连接');
      setState('listening');
    });

    client.on('transcription', (data) => {
      setStatusMessage(`你说: ${data.text}`);
      onTranscription?.(data.text);
    });

    client.on('message', (data) => {
      messagesRef.current.push({ text: data.text, role: data.role });
      onMessage?.({ text: data.text, role: data.role });
      
      if (data.role === 'assistant') {
        setStatusMessage(data.text);
      }
    });

    client.on('audio', (data) => {
      setState('speaking');
      onAudio?.(data.format);
    });

    client.on('status', (data) => {
      setStatusMessage(data.message);
      onStatus?.(data.status, data.message);
      
      if (data.status === 'thinking') {
        setState('thinking');
      } else if (data.status === 'completed') {
        setState('listening');
      }
    });

    client.on('error', (data) => {
      setState('error');
      setStatusMessage(data.error || '发生错误');
      onError?.(new Error(data.error));
    });

    client.on('stopped', () => {
      setState('idle');
      setStatusMessage('');
    });

    clientRef.current = client;
    return client;
  }, [serverUrl, apiKey, debug, onMessage, onTranscription, onAudio, onStatus, onError]);

  // 处理按钮点击
  const handleClick = useCallback(async () => {
    if (state === 'idle' || state === 'error') {
      // 开始对话
      try {
        setState('connecting');
        setStatusMessage('正在连接...');
        
        const client = initClient();
        await client.start({ assistantId, userId });
        
        onStart?.();
      } catch (error) {
        setState('error');
        setStatusMessage('连接失败');
        onError?.(error as Error);
      }
    } else {
      // 停止对话
      const client = clientRef.current;
      if (client) {
        client.stop();
        onStop?.();
      }
    }
  }, [state, assistantId, userId, initClient, onStart, onStop, onError]);

  // 清理
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.stop();
        clientRef.current = null;
      }
    };
  }, []);

  return (
    <div style={styles.container} className={className}>
      <button
        style={getButtonStyle()}
        onClick={handleClick}
        disabled={state === 'connecting'}
        aria-label={getButtonLabel()}
      >
        {getButtonIcon()}
      </button>
      
      {statusMessage && (
        <span style={styles.status}>{statusMessage}</span>
      )}

      {/* CSS动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 15px rgba(240, 147, 251, 0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 6px 25px rgba(240, 147, 251, 0.6);
          }
        }

        @keyframes wave {
          0%, 100% {
            transform: scaleY(0.5);
          }
          50% {
            transform: scaleY(1);
          }
        }
      `}</style>
    </div>
  );
};

export default VapiButton;
