/**
 * FreeSWITCH-VAPI 桥接脚本
 * 
 * 使用 ESL (Event Socket Library) 连接 FreeSWITCH
 * 将呼入电话的音频流桥接到 VAPI WebSocket
 * 
 * 使用：
 *   node bridge.mjs
 * 
 * 要求：
 *   - FreeSWITCH 运行在 localhost:8021
 *   - VAPI 服务器运行在 localhost:3000
 *   - FreeSWITCH dialplan 配置转发到此脚本
 */

import { Socket } from 'net'
import { WebSocket } from 'ws'

const ESL_HOST = '127.0.0.1'
const ESL_PORT = 8021
const ESL_PASSWORD = 'ClueCon'

const VAPI_WS_URL = 'ws://localhost:3000/ws/conversations'

class FreeSWITCHVAPIBridge {
  constructor() {
    this.eslSocket = null
    this.vapiConnections = new Map() // uuid -> { ws, audioBuffer }
    this.buffer = ''
  }

  async start() {
    console.log('🚀 FreeSWITCH-VAPI 桥接启动中...')
    await this.connectESL()
    console.log('✅ 已连接到 FreeSWITCH ESL')
    console.log('📞 等待呼入...')
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

      this.eslSocket.on('error', (err) => {
        console.error('❌ ESL 连接错误:', err)
        reject(err)
      })
      
      this.eslSocket.on('close', () => {
        console.log('🔌 ESL 连接关闭')
        setTimeout(() => this.connectESL(), 5000) // 重连
      })

      // 等待连接成功
      setTimeout(() => {
        this.eslSocket.write(`auth ${ESL_PASSWORD}\n\n`)
        this.eslSocket.write('event plain CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP DTMF\n\n')
        resolve()
      }, 500)
    })
  }

  handleESLData(data) {
    this.buffer += data
    
    // 解析事件
    const events = this.buffer.split('\n\n')
    this.buffer = events.pop() || ''
    
    events.forEach(eventText => {
      if (!eventText.trim()) return
      
      const event = this.parseEvent(eventText)
      if (!event) return
      
      this.handleEvent(event)
    })
  }

  parseEvent(text) {
    const lines = text.split('\n')
    const event = {}
    
    lines.forEach(line => {
      const colonIndex = line.indexOf(': ')
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim()
        const value = line.substring(colonIndex + 2).trim()
        event[key] = value
      }
    })
    
    return event['Event-Name'] ? event : null
  }

  handleEvent(event) {
    const eventName = event['Event-Name']
    const uuid = event['Unique-ID']
    
    switch (eventName) {
      case 'CHANNEL_ANSWER':
        this.handleChannelAnswer(event)
        break
        
      case 'CHANNEL_HANGUP':
        this.handleChannelHangup(event)
        break
        
      case 'DTMF':
        this.handleDTMF(event)
        break
    }
  }

  async handleChannelAnswer(event) {
    const uuid = event['Unique-ID']
    const caller = event['Caller-Caller-ID-Number']
    const destination = event['Caller-Destination-Number']
    
    console.log(`📞 呼入接通: ${caller} → ${destination} (UUID: ${uuid})`)
    
    // 连接到 VAPI
    const vapiUrl = `${VAPI_WS_URL}/${uuid}?assistant_id=default`
    const vapiWs = new WebSocket(vapiUrl)
    
    const connection = {
      ws: vapiWs,
      uuid,
      caller,
      audioQueue: []
    }
    
    vapiWs.on('open', () => {
      console.log(`✅ VAPI WebSocket 已连接: ${uuid}`)
      this.vapiConnections.set(uuid, connection)
      
      // 启动音频流
      this.startAudioStream(uuid)
    })

    vapiWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        this.handleVAPIMessage(uuid, msg)
      } catch (e) {
        console.error('VAPI 消息解析错误:', e)
      }
    })

    vapiWs.on('close', () => {
      console.log(`🔌 VAPI WebSocket 关闭: ${uuid}`)
      this.vapiConnections.delete(uuid)
    })

    vapiWs.on('error', (err) => {
      console.error(`❌ VAPI WebSocket 错误: ${uuid}`, err)
    })
  }

  startAudioStream(uuid) {
    // 使用 FreeSWITCH 的 uuid_media 命令启动音频流
    // 这里需要配置 FreeSWITCH 发送音频到 ESL
    // 简化版本：使用 echo 测试
    console.log(`🎵 启动音频流: ${uuid}`)
  }

  handleVAPIMessage(uuid, msg) {
    const connection = this.vapiConnections.get(uuid)
    if (!connection) return

    switch (msg.type) {
      case 'audio':
        // VAPI 返回音频 → 发送到 FreeSWITCH
        if (msg.data && msg.data.audio) {
          this.sendAudioToFreeSWITCH(uuid, msg.data.audio)
        }
        break
        
      case 'transcription':
        console.log(`📝 转写 (${msg.data.role}): ${msg.data.text}`)
        break
        
      case 'status':
        console.log(`📊 状态: ${msg.data.status} - ${msg.data.message}`)
        break
    }
  }

  sendAudioToFreeSWITCH(uuid, base64Audio) {
    // 将 VAPI 返回的音频发送到 FreeSWITCH
    // 这里需要使用 uuid_write_media 或类似命令
    // 简化版本：先记录日志
    console.log(`🔊 发送音频到 FreeSWITCH: ${uuid} (${base64Audio.length} bytes)`)
  }

  handleChannelHangup(event) {
    const uuid = event['Unique-ID']
    const cause = event['Hangup-Cause']
    
    console.log(`📵 呼叫挂断: ${uuid} (${cause})`)
    
    const connection = this.vapiConnections.get(uuid)
    if (connection) {
      connection.ws.close()
      this.vapiConnections.delete(uuid)
    }
  }

  handleDTMF(event) {
    const uuid = event['Unique-ID']
    const digit = event['DTMF-Digit']
    
    console.log(`🔢 DTMF: ${digit} (${uuid})`)
    
    // 可以转发 DTMF 到 VAPI
    const connection = this.vapiConnections.get(uuid)
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify({
        type: 'dtmf',
        data: { digit }
      }))
    }
  }
}

// 启动桥接
const bridge = new FreeSWITCHVAPIBridge()
bridge.start().catch(console.error)
