/**
 * FreeSWITCH ESL 桥接脚本
 * 
 * 功能：将 SIP 呼入的音频流转发到 VAPI WebSocket，双向实时通话
 * 
 * 使用：
 *   1. 启动 VAPI 服务器（port 3000）
 *   2. 启动此脚本：node bridge.js
 *   3. SIP 呼入 → FreeSWITCH → ESL → 此脚本 → VAPI WebSocket
 */

import { Socket } from 'net'
import WebSocket from 'ws'

const ESL_HOST = '127.0.0.1'
const ESL_PORT = 8021
const ESL_PASSWORD = 'ClueCon'

const VAPI_WS_URL = 'ws://localhost:3000/ws/conversations'

class FreeSWITCHBridge {
  constructor() {
    this.eslSocket = null
    this.vapiConnections = new Map() // uuid -> WebSocket
  }

  async start() {
    console.log('🚀 FreeSWITCH-VAPI 桥接启动中...')
    await this.connectESL()
    console.log('✅ 已连接到 FreeSWITCH ESL')
  }

  connectESL() {
    return new Promise((resolve, reject) => {
      this.eslSocket = new Socket()
      
      this.eslSocket.connect(ESL_PORT, ESL_HOST, () => {
        console.log('📡 连接到 FreeSWITCH ESL...')
      })

      this.eslSocket.on('data', (data) => {
        this.handleESLData(data.toString())
      })

      this.eslSocket.on('error', reject)
      
      // 等待连接成功
      setTimeout(() => {
        this.eslSocket.write(`auth ${ESL_PASSWORD}\n\n`)
        this.eslSocket.write('event plain CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP CUSTOM\n\n')
        resolve()
      }, 1000)
    })
  }

  handleESLData(data) {
    const lines = data.split('\n')
    const event = {}
    
    lines.forEach(line => {
      const [key, ...values] = line.split(': ')
      if (key && values.length > 0) {
        event[key.trim()] = values.join(': ').trim()
      }
    })

    if (event['Event-Name'] === 'CHANNEL_ANSWER') {
      this.handleChannelAnswer(event)
    } else if (event['Event-Name'] === 'CHANNEL_HANGUP') {
      this.handleChannelHangup(event)
    } else if (event['Event-Name'] === 'CUSTOM') {
      this.handleCustomEvent(event)
    }
  }

  async handleChannelAnswer(event) {
    const uuid = event['Unique-ID']
    const caller = event['Caller-Caller-ID-Number']
    
    console.log(`📞 呼入接通: ${caller} (UUID: ${uuid})`)

    // 连接到 VAPI
    const vapiWs = new WebSocket(`${VAPI_WS_URL}/${uuid}?assistant_id=default`)
    
    vapiWs.on('open', () => {
      console.log(`✅ VAPI WebSocket 已连接: ${uuid}`)
      this.vapiConnections.set(uuid, vapiWs)
      
      // 启动双向音频流
      this.startAudioBridge(uuid, vapiWs)
    })

    vapiWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'audio' && msg.data.audio) {
          // VAPI 音频 → FreeSWITCH
          this.sendAudioToFS(uuid, msg.data.audio)
        }
      } catch (e) {}
    })

    vapiWs.on('close', () => {
      console.log(`🔌 VAPI WebSocket 关闭: ${uuid}`)
      this.vapiConnections.delete(uuid)
    })
  }

  startAudioBridge(uuid, vapiWs) {
    // 使用 FreeSWITCH 的 uuid_media 项目来桥接音频
    // 这里需要配置 FreeSWITCH 发送音频到 ESL
    this.eslSocket.write(`api uuid_media ${uuid}\n\n`)
    
    // 订阅 DTMF 和音频事件
    this.eslSocket.write(`api uuid_broadcast ${uuid} play::tone_stream://%(1000,0,440)\n\n`)
  }

  sendAudioToFS(uuid, base64Audio) {
    // 将 VAPI 返回的音频发送到 FreeSWITCH
    const audioBuffer = Buffer.from(base64Audio, 'base64')
    // 这里需要通过 ESL 的 uuid_write_media 发送音频
    // 实际实现需要更复杂的音频流处理
  }

  handleChannelHangup(event) {
    const uuid = event['Unique-ID']
    console.log(`📵 呼叫挂断: ${uuid}`)
    
    const vapiWs = this.vapiConnections.get(uuid)
    if (vapiWs) {
      vapiWs.close()
      this.vapiConnections.delete(uuid)
    }
  }

  handleCustomEvent(event) {
    // 处理自定义事件（如音频数据）
    const uuid = event['Unique-ID']
    if (event['Event-Subclass'] === 'audio::data') {
      const vapiWs = this.vapiConnections.get(uuid)
      if (vapiWs) {
        // FreeSWITCH 音频 → VAPI
        vapiWs.send(JSON.stringify({
          type: 'audio',
          data: {
            audio: event['audio-data'], // Base64 编码
            format: 'pcm16',
            sample_rate: 16000
          }
        }))
      }
    }
  }
}

// 启动桥接
const bridge = new FreeSWITCHBridge()
bridge.start().catch(console.error)
