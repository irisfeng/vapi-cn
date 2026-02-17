/**
 * StepFun Realtime API 客户端
 * 基于 WebSocket 的实时语音对话
 */

// ==================== 类型定义 ====================

export interface StepFunConfig {
  apiKey: string
  model?: string
  voice?: string
  systemPrompt?: string
}

export interface RealtimeResponse {
  text: string
  audioChunks: Uint8Array[]
  isComplete: boolean
}

export type OnTextCallback = (delta: string) => void
export type OnAudioCallback = (audio: Uint8Array) => void
export type OnStatusCallback = (status: string, message: string) => void
export type OnErrorCallback = (error: string) => void

// ==================== StepFun 事件类型 ====================

export const StepFunEvents = {
  // Server Events
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SPEECH_STARTED: 'input_audio_buffer.speech_started',
  SPEECH_STOPPED: 'input_audio_buffer.speech_stopped',
  RESPONSE_CREATED: 'response.created',
  AUDIO_DELTA: 'response.audio.delta',
  AUDIO_DONE: 'response.audio.done',
  AUDIO_TRANSCRIPT_DELTA: 'response.audio_transcript.delta',
  AUDIO_TRANSCRIPT_DONE: 'response.audio_transcript.done',
  INPUT_TRANSCRIPT_COMPLETED: 'conversation.item.input_audio_transcription.completed',
  RESPONSE_DONE: 'response.done',
  ERROR: 'error',
} as const

// ==================== StepFun Realtime 客户端 ====================

export class StepFunRealtimeClient {
  private ws: WebSocket | null = null
  private config: StepFunConfig
  private isConnected = false
  private sessionId: string | null = null

  // 回调
  private onTextCallback?: OnTextCallback
  private onAudioCallback?: OnAudioCallback
  private onStatusCallback?: OnStatusCallback
  private onErrorCallback?: OnErrorCallback
  private onUserTranscriptCallback?: OnTextCallback
  private onInterruptCallback?: () => void

  // 状态
  private isAiSpeaking = false
  private isUserSpeaking = false
  private currentResponse: RealtimeResponse | null = null
  private responseResolve?: () => void

  constructor(config: StepFunConfig) {
    this.config = {
      model: 'step-audio-2',
      voice: 'qingchunshaonv',
      systemPrompt: '你是一个友好的语音助手。',
      ...config
    }
  }

  // ==================== 回调注册 ====================

  onText(callback: OnTextCallback) {
    this.onTextCallback = callback
  }

  onAudio(callback: OnAudioCallback) {
    this.onAudioCallback = callback
  }

  onStatus(callback: OnStatusCallback) {
    this.onStatusCallback = callback
  }

  onError(callback: OnErrorCallback) {
    this.onErrorCallback = callback
  }

  onUserTranscript(callback: OnTextCallback) {
    this.onUserTranscriptCallback = callback
  }

  onInterrupt(callback: () => void) {
    this.onInterruptCallback = callback
  }

  // ==================== 连接管理 ====================

  async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        const url = `wss://api.stepfun.com/v1/realtime?model=${this.config.model}`

        this.ws = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        })

        this.ws.onopen = () => {
          console.log('[StepFun] WebSocket 连接已建立')
          this.notifyStatus('connecting', '正在建立连接...')
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string)
        }

        this.ws.onerror = (error) => {
          console.error('[StepFun] WebSocket 错误:', error)
          this.notifyStatus('error', '连接错误')
          reject(new Error('WebSocket 连接错误'))
        }

        this.ws.onclose = () => {
          console.log('[StepFun] WebSocket 连接已关闭')
          this.isConnected = false
          this.notifyStatus('disconnected', '连接已关闭')
        }

        // 等待 session.created
        const checkConnected = setInterval(() => {
          if (this.isConnected) {
            clearInterval(checkConnected)
            resolve(true)
          }
        }, 100)

        // 超时
        setTimeout(() => {
          clearInterval(checkConnected)
          if (!this.isConnected) {
            reject(new Error('连接超时'))
          }
        }, 10000)

      } catch (error) {
        reject(error)
      }
    })
  }

  close() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }

  // ==================== 会话配置 ====================

  private updateSession() {
    if (!this.ws) return

    const sessionUpdate = {
      event_id: this.generateEventId(),
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.systemPrompt,
        voice: this.config.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          prefix_padding_ms: 500,
          silence_duration_ms: 100,
          energy_awakeness_threshold: 2500
        },
        tools: [],
        tool_choice: 'auto'
      }
    }

    this.ws.send(JSON.stringify(sessionUpdate))
    console.log('[StepFun] 会话配置已发送')
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // ==================== 音频发送 ====================

  sendAudio(audioData: ArrayBuffer | Uint8Array) {
    if (!this.ws || !this.isConnected) {
      console.warn('[StepFun] 未连接，无法发送音频')
      return
    }

    const base64 = this.arrayBufferToBase64(audioData)

    const event = {
      event_id: this.generateEventId(),
      type: 'input_audio_buffer.append',
      audio: base64
    }

    this.ws.send(JSON.stringify(event))
  }

  commitAudio() {
    if (!this.ws || !this.isConnected) return

    const event = {
      event_id: this.generateEventId(),
      type: 'input_audio_buffer.commit'
    }

    this.ws.send(JSON.stringify(event))
    console.log('[StepFun] 音频已提交')
  }

  // ==================== 文本发送 ====================

  async sendText(text: string): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) {
        reject(new Error('未连接'))
        return
      }

      // 重置响应
      this.currentResponse = {
        text: '',
        audioChunks: [],
        isComplete: false
      }

      // 添加消息
      const createEvent = {
        event_id: this.generateEventId(),
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: text
          }]
        }
      }

      this.ws.send(JSON.stringify(createEvent))

      // 触发响应
      const responseEvent = {
        event_id: this.generateEventId(),
        type: 'response.create'
      }

      this.ws.send(JSON.stringify(responseEvent))

      // 等待响应完成
      this.responseResolve = () => {
        if (this.currentResponse) {
          resolve(this.currentResponse)
        }
      }
    })
  }

  // ==================== 响应取消 ====================

  cancelResponse() {
    if (!this.ws || !this.isConnected) return

    const event = {
      event_id: this.generateEventId(),
      type: 'response.cancel'
    }

    this.ws.send(JSON.stringify(event))
    this.isAiSpeaking = false
    console.log('[StepFun] 响应已取消')
  }

  // ==================== 消息处理 ====================

  private handleMessage(data: string) {
    try {
      const event = JSON.parse(data)
      const eventType = event.type

      // console.log('[StepFun] 收到事件:', eventType)

      switch (eventType) {
        case StepFunEvents.SESSION_CREATED:
          this.sessionId = event.session?.id
          this.isConnected = true
          console.log('[StepFun] 会话已创建:', this.sessionId)
          this.notifyStatus('connected', `会话已创建: ${this.sessionId}`)
          // 发送会话配置
          this.updateSession()
          break

        case StepFunEvents.SESSION_UPDATED:
          console.log('[StepFun] 会话配置已更新')
          break

        case StepFunEvents.SPEECH_STARTED:
          this.isUserSpeaking = true
          this.notifyStatus('user_speaking', '用户开始说话')
          // 如果 AI 正在说话，触发打断
          if (this.isAiSpeaking) {
            this.cancelResponse()
            this.onInterruptCallback?.()
          }
          break

        case StepFunEvents.SPEECH_STOPPED:
          this.isUserSpeaking = false
          this.notifyStatus('user_silent', '用户停止说话')
          break

        case StepFunEvents.INPUT_TRANSCRIPT_COMPLETED:
          // 用户语音转写结果
          const transcript = event.transcript
          if (transcript && this.onUserTranscriptCallback) {
            this.onUserTranscriptCallback(transcript)
          }
          console.log('[StepFun] 用户语音转写:', transcript)
          break

        case StepFunEvents.RESPONSE_CREATED:
          this.isAiSpeaking = true
          this.currentResponse = {
            text: '',
            audioChunks: [],
            isComplete: false
          }
          this.notifyStatus('ai_speaking', 'AI 开始回复')
          break

        case StepFunEvents.AUDIO_TRANSCRIPT_DELTA:
          // AI 回复文本
          const delta = event.delta
          if (this.currentResponse) {
            this.currentResponse.text += delta
          }
          if (this.onTextCallback) {
            this.onTextCallback(delta)
          }
          break

        case StepFunEvents.AUDIO_DELTA:
          // AI 回复音频
          const audioBase64 = event.delta
          if (audioBase64) {
            const audioBytes = this.base64ToUint8Array(audioBase64)
            if (this.currentResponse) {
              this.currentResponse.audioChunks.push(audioBytes)
            }
            if (this.onAudioCallback) {
              this.onAudioCallback(audioBytes)
            }
          }
          break

        case StepFunEvents.AUDIO_DONE:
          console.log('[StepFun] 音频输出完成')
          break

        case StepFunEvents.RESPONSE_DONE:
          this.isAiSpeaking = false
          if (this.currentResponse) {
            this.currentResponse.isComplete = true
          }
          this.notifyStatus('ai_done', 'AI 回复完成')
          this.responseResolve?.()
          break

        case StepFunEvents.ERROR:
          const errorMsg = event.error?.message || '未知错误'
          console.error('[StepFun] 错误:', errorMsg)
          this.notifyStatus('error', errorMsg)
          if (this.onErrorCallback) {
            this.onErrorCallback(errorMsg)
          }
          break

        default:
          // console.log('[StepFun] 未处理事件:', eventType)
      }
    } catch (error) {
      console.error('[StepFun] 消息解析错误:', error)
    }
  }

  // ==================== 工具函数 ====================

  private notifyStatus(status: string, message: string) {
    if (this.onStatusCallback) {
      this.onStatusCallback(status, message)
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}

// ==================== 工厂函数 ====================

export function createStepFunClient(config: StepFunConfig): StepFunRealtimeClient {
  return new StepFunRealtimeClient(config)
}
