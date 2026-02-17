/**
 * 国内版VAPI - TypeScript SDK
 * 支持网页端语音对话集成
 * 
 * 功能特性:
 * - WebSocket实时语音通信
 * - 麦克风音频采集
 * - 语音播放
 * - 事件驱动架构
 */

// ==================== 类型定义 ====================

/**
 * 助手配置
 */
export interface AssistantConfig {
  id: string;
  name: string;
  voiceConfig?: VoiceConfig;
  llmConfig?: LLMConfig;
}

/**
 * 语音配置
 */
export interface VoiceConfig {
  sttProvider?: 'aliyun' | 'xunfei';
  ttsProvider?: 'aliyun' | 'xunfei' | 'baidu';
  voiceId?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

/**
 * LLM配置
 */
export interface LLMConfig {
  provider?: 'aliyun' | 'baidu' | 'zhipu' | 'deepseek';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * 对话配置
 */
export interface ConversationConfig {
  assistantId: string;
  userId?: string;
  conversationId?: string;
}

/**
 * 消息类型
 */
export type MessageType = 
  | 'welcome' 
  | 'transcription' 
  | 'text_chunk' 
  | 'audio' 
  | 'status' 
  | 'error';

/**
 * 消息数据
 */
export interface MessageData {
  type: MessageType;
  data: any;
  timestamp: string;
}

/**
 * 事件处理器类型
 */
export type EventHandler<T = any> = (data: T) => void;

/**
 * VAPI客户端配置
 */
export interface VapiClientConfig {
  /** 服务器基础URL */
  baseUrl: string;
  /** WebSocket URL */
  wsUrl?: string;
  /** API密钥 */
  apiKey?: string;
  /** 调试模式 */
  debug?: boolean;
}

// ==================== 音频处理器 ====================

/**
 * 音频采集器
 * 负责从麦克风采集音频数据
 */
class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRecording: boolean = false;
  private onAudioData: (data: ArrayBuffer) => void;

  constructor(onAudioData: (data: ArrayBuffer) => void) {
    this.onAudioData = onAudioData;
  }

  /**
   * 开始录音
   */
  async start(): Promise<void> {
    try {
      // 获取麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // 创建音频上下文
      this.audioContext = new AudioContext({
        sampleRate: 16000,
      });

      // 创建音频源
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 创建处理节点
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      // 处理音频数据
      this.processorNode.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = this.float32ToPCM(inputData);
        this.onAudioData(pcmData);
      };

      // 连接节点
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isRecording = true;
      console.log('[VapiClient] 录音已启动');
    } catch (error) {
      console.error('[VapiClient] 启动录音失败:', error);
      throw error;
    }
  }

  /**
   * 停止录音
   */
  stop(): void {
    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('[VapiClient] 录音已停止');
  }

  /**
   * 检查是否正在录音
   */
  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * 将Float32Array转换为PCM格式
   */
  private float32ToPCM(float32Array: Float32Array): ArrayBuffer {
    const pcmArray = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcmArray[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcmArray.buffer;
  }
}

/**
 * 音频播放器
 * 负责播放服务器返回的音频数据
 */
class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor() {
    this.audioContext = new AudioContext({
      sampleRate: 16000,
    });
  }

  /**
   * 添加音频到播放队列
   */
  async addAudio(audioData: ArrayBuffer | string): Promise<void> {
    try {
      let buffer: ArrayBuffer;

      // 处理Base64编码的音频
      if (typeof audioData === 'string') {
        buffer = this.base64ToArrayBuffer(audioData);
      } else {
        buffer = audioData;
      }

      this.audioQueue.push(buffer);

      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (error) {
      console.error('[VapiClient] 添加音频失败:', error);
    }
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;
  }

  /**
   * 清空播放队列
   */
  clear(): void {
    this.audioQueue = [];
  }

  /**
   * 播放下一首音频
   */
  private async playNext(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioData = this.audioQueue.shift()!;

    try {
      // 解码音频数据
      const audioBuffer = await this.decodeAudioData(audioData);

      if (!this.audioContext) return;

      // 创建音频源
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.audioContext.destination);

      // 播放完成回调
      this.currentSource.onended = () => {
        this.playNext();
      };

      this.currentSource.start();
    } catch (error) {
      console.error('[VapiClient] 播放音频失败:', error);
      this.playNext();
    }
  }

  /**
   * 解码音频数据
   */
  private async decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    // 如果是MP3数据，需要解码
    // 这里简化处理，假设输入已经是PCM数据
    // 实际项目中可能需要使用解码库

    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    // 将Int16Array转换为Float32Array
    const int16Array = new Int16Array(audioData);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    // 创建AudioBuffer
    const audioBuffer = this.audioContext.createBuffer(
      1,
      float32Array.length,
      16000
    );
    audioBuffer.getChannelData(0).set(float32Array);

    return audioBuffer;
  }

  /**
   * Base64转ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// ==================== VAPI客户端 ====================

/**
 * VAPI客户端主类
 * 
 * 使用示例:
 * ```typescript
 * const client = new VapiClient({
 *   baseUrl: 'http://localhost:8000',
 *   debug: true
 * });
 * 
 * // 开始对话
 * await client.start({
 *   assistantId: 'assistant_uuid'
 * });
 * 
 * // 发送文本消息
 * client.send('你好');
 * 
 * // 停止对话
 * client.stop();
 * ```
 */
export class VapiClient {
  private config: VapiClientConfig;
  private ws: WebSocket | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private audioPlayer: AudioPlayer;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private isConnected: boolean = false;
  private conversationId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(config: VapiClientConfig) {
    this.config = {
      wsUrl: config.baseUrl.replace(/^http/, 'ws'),
      debug: false,
      ...config
    };
    this.audioPlayer = new AudioPlayer();
    this.log('VapiClient initialized', config);
  }

  // ==================== 核心方法 ====================

  /**
   * 开始语音对话
   * 
   * @param config 对话配置
   */
  async start(config: ConversationConfig): Promise<void> {
    try {
      this.log('Starting conversation', config);

      // 生成或获取对话ID
      this.conversationId = config.conversationId || this.generateId();

      // 建立WebSocket连接
      await this.connectWebSocket(config);

      // 初始化音频播放器
      this.audioPlayer = new AudioPlayer();

      // 启动录音
      this.audioRecorder = new AudioRecorder((audioData) => {
        this.sendAudio(audioData);
      });
      await this.audioRecorder.start();

      this.emit('started', { conversationId: this.conversationId });
      this.log('Conversation started');
    } catch (error) {
      this.log('Failed to start conversation', error);
      this.emit('error', { error });
      throw error;
    }
  }

  /**
   * 停止语音对话
   */
  stop(): void {
    this.log('Stopping conversation');

    // 停止录音
    if (this.audioRecorder) {
      this.audioRecorder.stop();
      this.audioRecorder = null;
    }

    // 停止播放
    this.audioPlayer.stop();

    // 关闭WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.emit('stopped', { conversationId: this.conversationId });
    this.log('Conversation stopped');
  }

  /**
   * 发送文本消息
   * 
   * @param text 文本内容
   */
  send(text: string): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      type: 'text',
      data: { content: text }
    };

    this.ws.send(JSON.stringify(message));
    this.log('Text message sent', text);
  }

  /**
   * 发送音频数据
   * 
   * @param audioData 音频数据
   */
  sendAudio(audioData: ArrayBuffer): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    this.ws.send(audioData);
  }

  /**
   * 暂停/恢复录音
   */
  toggleMute(): boolean {
    if (!this.audioRecorder) {
      return false;
    }

    if (this.audioRecorder.recording) {
      this.audioRecorder.stop();
      this.emit('muted', {});
      return true;
    } else {
      this.audioRecorder.start();
      this.emit('unmuted', {});
      return false;
    }
  }

  /**
   * 中断当前回复
   */
  interrupt(): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    // 停止播放
    this.audioPlayer.stop();

    // 发送中断命令
    const message = {
      type: 'control',
      data: { command: 'interrupt' }
    };

    this.ws.send(JSON.stringify(message));
    this.log('Interrupt sent');
  }

  // ==================== 事件处理 ====================

  /**
   * 注册事件处理器
   * 
   * @param event 事件名称
   * @param handler 处理函数
   */
  on<T>(event: string, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * 移除事件处理器
   * 
   * @param event 事件名称
   * @param handler 处理函数
   */
  off<T>(event: string, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * 
   * @param event 事件名称
   * @param data 事件数据
   */
  private emit<T>(event: string, data: T): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[VapiClient] Event handler error:`, error);
        }
      });
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 建立WebSocket连接
   */
  private async connectWebSocket(config: ConversationConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.config.wsUrl}/ws/conversations/${this.conversationId}?assistantId=${config.assistantId}`;
      
      if (config.userId) {
        wsUrl + `&userId=${config.userId}`;
      }

      this.log('Connecting WebSocket', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        this.log('WebSocket error', error);
        this.emit('error', { error });
        reject(error);
      };

      this.ws.onclose = () => {
        this.log('WebSocket closed');
        this.isConnected = false;
        this.emit('disconnected', {});

        // 尝试重连
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            this.connectWebSocket(config).catch(() => {});
          }, 2000);
        }
      };
    });
  }

  /**
   * 处理WebSocket消息
   */
  private handleMessage(data: string | Blob): void {
    // 处理二进制音频数据
    if (data instanceof Blob) {
      this.handleAudioData(data);
      return;
    }

    try {
      const message: MessageData = JSON.parse(data);
      this.log('Message received', message);

      switch (message.type) {
        case 'welcome':
          this.emit('welcome', message.data);
          break;

        case 'transcription':
          this.emit('transcription', message.data);
          break;

        case 'text_chunk':
          this.emit('message', message.data);
          break;

        case 'audio':
          this.handleAudioMessage(message.data);
          break;

        case 'status':
          this.emit('status', message.data);
          break;

        case 'error':
          this.emit('error', message.data);
          break;

        default:
          this.log('Unknown message type', message.type);
      }
    } catch (error) {
      this.log('Failed to parse message', error);
    }
  }

  /**
   * 处理音频消息
   */
  private handleAudioMessage(data: any): void {
    if (data.audio) {
      this.audioPlayer.addAudio(data.audio);
      this.emit('audio', { format: data.format });
    }
  }

  /**
   * 处理音频数据
   */
  private async handleAudioData(blob: Blob): Promise<void> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      this.audioPlayer.addAudio(arrayBuffer);
    } catch (error) {
      this.log('Failed to handle audio data', error);
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 日志输出
   */
  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[VapiClient] ${message}`, data || '');
    }
  }

  // ==================== 状态获取 ====================

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * 获取对话ID
   */
  get currentConversationId(): string | null {
    return this.conversationId;
  }

  /**
   * 获取录音状态
   */
  get isRecording(): boolean {
    return this.audioRecorder?.recording || false;
  }
}

// ==================== REST API客户端 ====================

/**
 * VAPI REST API客户端
 * 用于非实时操作（创建助手、获取对话历史等）
 */
export class VapiRestClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: VapiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  /**
   * 创建助手
   */
  async createAssistant(config: Partial<AssistantConfig>): Promise<AssistantConfig> {
    const response = await this.fetch('/assistants', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    return response;
  }

  /**
   * 获取助手列表
   */
  async listAssistants(): Promise<AssistantConfig[]> {
    return this.fetch('/assistants');
  }

  /**
   * 获取助手详情
   */
  async getAssistant(id: string): Promise<AssistantConfig> {
    return this.fetch(`/assistants/${id}`);
  }

  /**
   * 更新助手
   */
  async updateAssistant(id: string, config: Partial<AssistantConfig>): Promise<AssistantConfig> {
    return this.fetch(`/assistants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(config)
    });
  }

  /**
   * 删除助手
   */
  async deleteAssistant(id: string): Promise<void> {
    await this.fetch(`/assistants/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * 创建对话
   */
  async createConversation(config: ConversationConfig): Promise<any> {
    return this.fetch('/conversations', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  /**
   * 获取对话列表
   */
  async listConversations(assistantId?: string): Promise<any[]> {
    const params = assistantId ? `?assistantId=${assistantId}` : '';
    return this.fetch(`/conversations${params}`);
  }

  /**
   * 获取对话详情
   */
  async getConversation(id: string): Promise<any> {
    return this.fetch(`/conversations/${id}`);
  }

  /**
   * 语音识别
   */
  async speechToText(audioBase64: string, assistantId?: string): Promise<{ text: string }> {
    return this.fetch('/voice/stt', {
      method: 'POST',
      body: JSON.stringify({
        audio: audioBase64,
        assistantId
      })
    });
  }

  /**
   * 语音合成
   */
  async textToSpeech(text: string, assistantId?: string): Promise<{ audio: string }> {
    return this.fetch('/voice/tts', {
      method: 'POST',
      body: JSON.stringify({
        text,
        assistantId
      })
    });
  }

  /**
   * 拨打电话
   */
  async makeCall(phoneNumber: string, assistantId: string): Promise<any> {
    return this.fetch('/phone/calls', {
      method: 'POST',
      body: JSON.stringify({
        phoneNumber,
        assistantId
      })
    });
  }

  /**
   * 基础请求方法
   */
  private async fetch(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${error}`);
    }

    return response.json();
  }
}

// ==================== 默认导出 ====================

export default VapiClient;
