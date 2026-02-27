# VAPI-CN 商用部署方案

> 基于 FreeSWITCH + StepFun Realtime API 的企业级语音 AI 平台

## 一、架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     接入层 (Edge)                           │
├─────────────────────────────────────────────────────────────┤
│  华为 UAP 9600 ──SIP──┐                                     │
│  WebRTC 客户端 ───────┼──► Nginx/HAProxy (LB)               │
│  移动 App ────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   FreeSWITCH 集群                           │
├─────────────────────────────────────────────────────────────┤
│  Node 1 (SIP+ESL)  Node 2 (SIP+ESL)  Node 3 (SIP+ESL)      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                    Keepalived (VIP)                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (Application)                     │
├─────────────────────────────────────────────────────────────┤
│  VAPI Server Cluster (Bun + Hono)                          │
│  ├─ WebSocket Gateway                                      │
│  ├─ Session Manager (Redis)                                │
│  ├─ Audio Processor (采样率转换)                            │
│  └─ Call Router (dialplan)                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI 服务层                                │
├─────────────────────────────────────────────────────────────┤
│  StepFun Realtime API (step-audio-2)                       │
│  ├─ 语音识别 (ASR)                                         │
│  ├─ 大语言模型 (LLM)                                       │
│  └─ 语音合成 (TTS)                                         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| **SIP 服务器** | FreeSWITCH 1.10+ | 开源、稳定、支持集群 |
| **应用服务器** | Bun + Hono | 高性能、低延迟 |
| **消息队列** | Redis Streams | 会话状态、事件流 |
| **负载均衡** | Nginx/HAProxy | 4层+7层负载 |
| **监控** | Prometheus + Grafana | 实时监控 |
| **日志** | ELK Stack | 集中式日志 |
| **容器化** | Docker + K8s | 可扩展部署 |

---

## 二、核心优化

### 2.1 性能优化

#### 2.1.1 音频处理优化

**问题：**
- FreeSWITCH 默认 8kHz (G.711)
- StepFun 要求 16kHz (输入) / 24kHz (输出)

**解决方案：**
```typescript
// server/src/audio/resampler.ts
import { Resampler } from 'node-resampler'

export class AudioProcessor {
  private upsampler: Resampler  // 8k → 16k
  private downsampler: Resampler // 24k → 8k
  
  constructor() {
    this.upsampler = new Resampler(8000, 16000, 1)
    this.downsampler = new Resampler(24000, 8000, 1)
  }
  
  // FreeSWITCH → StepFun
  toStepFun(pcm8k: Buffer): Buffer {
    return this.upsampler.process(pcm8k)
  }
  
  // StepFun → FreeSWITCH
  toFreeSWITCH(pcm24k: Buffer): Buffer {
    return this.downsampler.process(pcm24k)
  }
}
```

**优化点：**
- 使用 `libsamplerate` 或 `speexdsp`（更高质量）
- 启用 FreeSWITCH 的 `opus` 编码（原生 16kHz）
- 音频缓冲区优化（减少延迟）

#### 2.1.2 WebSocket 优化

```typescript
// server/src/websocket/optimized.ts
export class OptimizedWebSocket {
  private connectionPool: Map<string, WebSocket> = new Map()
  private messageQueue: Map<string, Buffer[]> = new Map()
  
  // 连接池
  getConnection(sessionId: string): WebSocket {
    if (!this.connectionPool.has(sessionId)) {
      const ws = new WebSocket(STEPFUN_WS_URL)
      this.connectionPool.set(sessionId, ws)
    }
    return this.connectionPool.get(sessionId)!
  }
  
  // 批量发送（减少网络开销）
  flushQueue(sessionId: string) {
    const queue = this.messageQueue.get(sessionId)
    if (!queue || queue.length === 0) return
    
    const ws = this.getConnection(sessionId)
    const batch = Buffer.concat(queue)
    ws.send(batch)
    queue.length = 0
  }
}
```

#### 2.1.3 并发优化

```yaml
# docker-compose.yml
services:
  vapi-server:
    replicas: 3
    environment:
      - BUN_THREADS=4
      - MAX_CONNECTIONS=1000
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### 2.2 高可用性

#### 2.2.1 FreeSWITCH 集群

```xml
<!-- freeswitch/conf/sip_profiles/cluster.xml -->
<profile name="cluster">
  <param name="sip-ip" value="$${local_ip_v4}"/>
  <param name="sip-port" value="5060"/>
  <param name="rtp-ip" value="$${local_ip_v4}"/>
  
  <!-- 集群配置 -->
  <param name="manage-presence" value="true"/>
  <param name="presence-hosts" value="node1@10.0.0.1,node2@10.0.0.2,node3@10.0.0.3"/>
  
  <!-- 数据库共享 -->
  <param name="db-name" value="freeswitch"/>
  <param name="db-host" value="postgres-cluster"/>
</profile>
```

#### 2.2.2 会话持久化

```typescript
// server/src/session/manager.ts
import { Redis } from 'ioredis'

export class SessionManager {
  private redis: Redis
  
  constructor() {
    this.redis = new Redis({
      host: 'redis-cluster',
      port: 6379,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    })
  }
  
  async saveSession(sessionId: string, data: SessionData) {
    await this.redis.hset(`session:${sessionId}`, {
      caller: data.caller,
      assistantId: data.assistantId,
      createdAt: Date.now(),
      status: 'active'
    })
    await this.redis.expire(`session:${sessionId}`, 3600) // 1小时过期
  }
  
  async getSession(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.hgetall(`session:${sessionId}`)
    return Object.keys(data).length > 0 ? data : null
  }
}
```

#### 2.2.3 故障转移

```bash
# keepalived.conf
vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1
    
    virtual_ipaddress {
        10.0.0.100
    }
    
    track_script {
        check_freeswitch
    }
}

# 健康检查脚本
vrrp_script check_freeswitch {
    script "/usr/local/bin/check_fs.sh"
    interval 2
    weight -5
}
```

### 2.3 安全性

#### 2.3.1 SIP 安全

```xml
<!-- freeswitch/conf/sip_profiles/secure.xml -->
<profile name="secure">
  <!-- TLS 加密 -->
  <param name="tls" value="true"/>
  <param name="tls-bind-params" value="transport=tls"/>
  <param name="tls-sip-port" value="5061"/>
  <param name="tls-cert-dir" value="/etc/freeswitch/tls"/>
  
  <!-- 认证 -->
  <param name="auth-calls" value="true"/>
  <param name="auth-all-packets" value="false"/>
  <param name="apply-inbound-acl" value="trusted"/>
</Profile>
```

#### 2.3.2 API 安全

```typescript
// server/src/middleware/auth.ts
import { verify } from 'jsonwebtoken'

export async function authMiddleware(ctx: Context, next: Next) {
  const token = ctx.req.header('Authorization')?.replace('Bearer ', '')
  
  if (!token) {
    return ctx.json({ error: 'Unauthorized' }, 401)
  }
  
  try {
    const payload = verify(token, process.env.JWT_SECRET!)
    ctx.set('user', payload)
    await next()
  } catch (err) {
    return ctx.json({ error: 'Invalid token' }, 401)
  }
}

// Rate limiting
app.use('*', rateLimiter({
  windowMs: 60 * 1000,  // 1分钟
  max: 100,              // 最多100次请求
  message: '请求过于频繁'
}))
```

#### 2.3.3 数据加密

```typescript
// server/src/crypto/aes.ts
import { createCipheriv, createDecipheriv } from 'crypto'

export class AES256 {
  private key: Buffer
  private algorithm = 'aes-256-gcm'
  
  constructor(key: string) {
    this.key = Buffer.from(key, 'hex')
  }
  
  encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const iv = randomBytes(12)
    const cipher = createCipheriv(this.algorithm, this.key, iv)
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex')
    ciphertext += cipher.final('hex')
    
    const tag = cipher.getAuthTag()
    
    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    }
  }
  
  decrypt(ciphertext: string, iv: string, tag: string): string {
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'hex')
    )
    
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8')
    plaintext += decipher.final('utf8')
    
    return plaintext
  }
}
```

---

## 三、对接华为 UAP 9600

### 3.1 网络拓扑

```
┌─────────────┐
│  PSTN/PLMN  │
│  (电话网)    │
└──────┬──────┘
       │ E1/T1
       ▼
┌─────────────┐      SIP Trunk       ┌─────────────┐
│ 华为 UAP    │◄────────────────────►│ FreeSWITCH  │
│   9600      │   10.0.0.2:5060      │   Cluster   │
│ 10.0.0.1    │                      │ 10.0.0.100  │
└─────────────┘                      └─────────────┘
       │                                    │
       │ SIP                                │ ESL
       │                                    │
       ▼                                    ▼
┌─────────────┐                      ┌─────────────┐
│  IP 电话    │                      │ VAPI Server │
│   终端      │                      │   Cluster   │
└─────────────┘                      └─────────────┘
                                            │
                                            ▼
                                      ┌─────────────┐
                                      │ StepFun API │
                                      └─────────────┘
```

### 3.2 UAP 9600 配置

```bash
# 1. 配置 SIP 中继
# 登录 UAP 9600 管理界面
# 路径：业务管理 → 中继管理 → SIP 中继

# 新增 SIP 中继
中继名称: VAPI_Trunk
对端IP地址: 10.0.0.100
对端端口: 5060
传输协议: UDP
编码格式: G.711A, G.711U
注册方式: 不注册（IP 中继）

# 2. 配置号码路由
# 路径：业务管理 → 呼叫路由

# 呼入路由
主叫号码: *
被叫号码: 400-XXX-XXXX  # 企业热线
路由目的地: SIP中继 → VAPI_Trunk
目的号码: 1000

# 呼出路由（可选）
主叫号码: 400-XXX-XXXX
被叫号码: *
路由目的地: SIP中继 → PSTN网关
```

### 3.3 FreeSWITCH 配置

```xml
<!-- freeswitch/conf/sip_profiles/uap9600.xml -->
<profile name="uap9600">
  <param name="sip-ip" value="10.0.0.100"/>
  <param name="sip-port" value="5060"/>
  <param name="context" value="from-uap"/>
  
  <!-- ACL 白名单 -->
  <param name="apply-inbound-acl" value="uap.acl"/>
  
  <!-- 编码协商 -->
  <param name="codec-prefs" value="PCMA@8000h@20i@64000b,PCMU@8000h@20i@64000b"/>
</profile>

<!-- freeswitch/conf/autoload_configs/acl.conf.xml -->
<list name="uap.acl" default="deny">
  <node type="allow" cidr="10.0.0.1/32"/>  <!-- UAP 9600 -->
</list>

<!-- freeswitch/conf/dialplan/from-uap.xml -->
<context name="from-uap">
  <extension name="to_vapi">
    <condition field="destination_number" expression="^(400\d{7}|1000)$">
      <action application="answer"/>
      <action application="set" data="hangup_after_bridge=true"/>
      <action application="set" data="vapi_assistant_id=${cond(${destination_number} == 4001234567 ? sales : support)}"/>
      <action application="socket" data="127.0.0.1:8021 async full"/>
    </condition>
  </extension>
</context>
```

### 3.4 桥接脚本优化

```typescript
// freeswitch-bridge/bridge.mjs

// 多路并发支持
export class ConcurrentBridge {
  private maxConcurrent = 100
  private activeCalls = new Map<string, CallSession>()
  
  async handleNewCall(uuid: string): Promise<boolean> {
    if (this.activeCalls.size >= this.maxConcurrent) {
      console.warn('⚠️ 达到最大并发数')
      return false
    }
    
    const session = new CallSession(uuid)
    this.activeCalls.set(uuid, session)
    
    session.on('end', () => {
      this.activeCalls.delete(uuid)
    })
    
    return true
  }
}

// 音频流优化
export class AudioStreamBridge {
  private readonly CHUNK_SIZE = 320  // 20ms @ 8kHz
  private readonly BUFFER_SIZE = 10   // 200ms buffer
  
  // FreeSWITCH → VAPI
  async handleFSAudio(uuid: string, audio: Buffer) {
    // 8kHz → 16kHz
    const upsampled = await this.resample(audio, 8000, 16000)
    
    const vapiWs = this.getVAPIConnection(uuid)
    vapiWs.send(upsampled)
  }
  
  // VAPI → FreeSWITCH
  async handleVAPIAudio(uuid: string, base64Audio: string) {
    const audio = Buffer.from(base64Audio, 'base64')
    
    // 24kHz → 8kHz
    const downsampled = await this.resample(audio, 24000, 8000)
    
    // 发送到 FreeSWITCH
    await this.sendToFS(uuid, downsampled)
  }
}
```

---

## 四、监控与运维

### 4.1 监控指标

```yaml
# prometheus/rules.yml
groups:
  - name: vapi_alerts
    rules:
      # 呼叫成功率
      - alert: LowCallSuccessRate
        expr: rate(vapi_calls_successful_total[5m]) / rate(vapi_calls_total[5m]) < 0.95
        for: 5m
        annotations:
          summary: "呼叫成功率低于 95%"
      
      # 平均通话时长
      - alert: ShortCallDuration
        expr: avg(vapi_call_duration_seconds) < 30
        for: 10m
        annotations:
          summary: "平均通话时长过短"
      
      # StepFun API 延迟
      - alert: HighAPILatency
        expr: histogram_quantile(0.95, rate(vapi_stepfun_latency_bucket[5m])) > 2
        for: 5m
        annotations:
          summary: "StepFun API P95 延迟超过 2s"
      
      # 并发数
      - alert: HighConcurrency
        expr: vapi_active_calls > 80
        annotations:
          summary: "并发呼叫数接近上限"
```

### 4.2 Grafana Dashboard

```json
{
  "panels": [
    {
      "title": "实时通话数",
      "type": "gauge",
      "targets": [{"expr": "vapi_active_calls"}]
    },
    {
      "title": "呼叫成功率",
      "type": "stat",
      "targets": [{"expr": "rate(vapi_calls_successful_total[1h]) / rate(vapi_calls_total[1h]) * 100"}]
    },
    {
      "title": "StepFun API 延迟",
      "type": "graph",
      "targets": [
        {"expr": "histogram_quantile(0.50, rate(vapi_stepfun_latency_bucket[5m]))", "legendFormat": "P50"},
        {"expr": "histogram_quantile(0.95, rate(vapi_stepfun_latency_bucket[5m]))", "legendFormat": "P95"},
        {"expr": "histogram_quantile(0.99, rate(vapi_stepfun_latency_bucket[5m]))", "legendFormat": "P99"}
      ]
    },
    {
      "title": "音频质量",
      "type": "graph",
      "targets": [
        {"expr": "avg(vapi_audio_rtp_jitter_ms)", "legendFormat": "Jitter"},
        {"expr": "avg(vapi_audio_packet_loss_percent)", "legendFormat": "Packet Loss"}
      ]
    }
  ]
}
```

### 4.3 日志系统

```yaml
# filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    paths:
      - /var/log/freeswitch/*.log
    fields:
      type: freeswitch
      
  - type: log
    paths:
      - /var/log/vapi/*.log
    fields:
      type: vapi

output.elasticsearch:
  hosts: ["http://elasticsearch:9200"]
  index: "vapi-logs-%{+yyyy.MM.dd}"
```

### 4.4 告警配置

```yaml
# alertmanager/config.yml
global:
  slack_api_url: https://hooks.slack.com/services/XXX

route:
  receiver: 'vapi-team'
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h

receivers:
  - name: 'vapi-team'
    slack_configs:
      - channel: '#vapi-alerts'
        send_resolved: true
        title: "{{ .GroupLabels.alertname }}"
        text: "{{ range .Alerts }}{{ .Annotations.summary }}\n{{ end }}"
```

---

## 五、部署方案

### 5.1 服务器配置

#### 最小配置（测试环境）

| 组件 | 规格 | 数量 | 说明 |
|------|------|------|------|
| FreeSWITCH | 4核8GB | 1 | 单机测试 |
| VAPI Server | 2核4GB | 1 | 单机测试 |
| Redis | 1核2GB | 1 | 会话存储 |
| **总计** | 7核14GB | 3 | 月成本 ~$200 |

#### 生产配置（高可用）

| 组件 | 规格 | 数量 | 说明 |
|------|------|------|------|
| FreeSWITCH | 8核16GB | 3 | 集群+VIP |
| VAPI Server | 4核8GB | 3 | 负载均衡 |
| Redis Cluster | 4核8GB | 3 | 哨兵模式 |
| PostgreSQL | 4核8GB | 2 | 主从复制 |
| Nginx LB | 2核4GB | 2 | 4层+7层 |
| 监控栈 | 4核8GB | 1 | Prometheus+Grafana+ELK |
| **总计** | 58核116GB | 14 | 月成本 ~$2000 |

### 5.2 容量规划

**假设：**
- 日均呼叫量：10,000 次
- 平均通话时长：3 分钟
- 峰值倍数：5x

**计算：**
```
峰值 CPS (Calls Per Second) = 10000 * 5 / 86400 ≈ 0.58
并发通话数 = 峰值CPS * 平均时长 = 0.58 * 180 ≈ 105

安全余量 = 105 * 2 = 210 路并发
```

**服务器选型：**
- 单台 FreeSWITCH：支持 500-1000 路并发
- 3 节点集群：支持 1500-3000 路并发
- 满足 10x 扩展需求

### 5.3 Docker 部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  freeswitch:
    image: drachtio/freeswitch:1.10
    network_mode: host
    volumes:
      - ./freeswitch/conf:/etc/freeswitch
      - ./freeswitch/logs:/var/log/freeswitch
    environment:
      - FS_SIP_IP=0.0.0.0
      - FS_ESL_PASSWORD=ClueCon
    restart: unless-stopped
    
  vapi-server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - STEPFUN_API_KEY=${STEPFUN_API_KEY}
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=info
    depends_on:
      - redis
    restart: unless-stopped
    deploy:
      replicas: 3
      
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    restart: unless-stopped

volumes:
  redis-data:
```

### 5.4 Kubernetes 部署

```yaml
# k8s/vapi-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vapi-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vapi-server
  template:
    metadata:
      labels:
        app: vapi-server
    spec:
      containers:
      - name: vapi-server
        image: vapi-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: STEPFUN_API_KEY
          valueFrom:
            secretKeyRef:
              name: vapi-secrets
              key: stepfun-api-key
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: vapi-server
spec:
  selector:
    app: vapi-server
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

---

## 六、成本评估

### 6.1 基础设施成本

| 项目 | 配置 | 月成本（USD） | 年成本（USD） |
|------|------|--------------|--------------|
| **云服务器** | 14 台（生产） | $2,000 | $24,000 |
| **带宽** | 100Mbps | $500 | $6,000 |
| **存储** | 1TB SSD | $100 | $1,200 |
| **CDN** | 1TB 流量 | $50 | $600 |
| **域名+SSL** | - | $20 | $240 |
| **小计** | - | **$2,670** | **$32,040** |

### 6.2 AI 服务成本

**StepFun Realtime API：**
- 语音识别：¥0.005/秒
- 大语言模型：¥0.002/千token
- 语音合成：¥0.003/秒

**月度估算（10,000 呼叫/天，平均 3 分钟）：**
```
ASR: 10000 * 30天 * 180秒 * ¥0.005 = ¥270,000
TTS: 10000 * 30天 * 180秒 * ¥0.003 = ¥162,000
LLM: 假设每通电话 500 token = 10000 * 30 * 0.5 * ¥0.002 = ¥300

总计: ¥432,300/月 ≈ $60,000/月
```

**优化方案：**
- 使用自有 ASR/TTS（如 Whisper + VITS）降低 80% 成本
- 缓存常见问题的回复
- 批量请求减少 API 调用

### 6.3 人力成本

| 角色 | 人数 | 月薪（USD） | 月成本（USD） |
|------|------|-----------|--------------|
| 后端工程师 | 2 | $8,000 | $16,000 |
| 运维工程师 | 1 | $6,000 | $6,000 |
| 产品经理 | 1 | $7,000 | $7,000 |
| **小计** | 4 | - | **$29,000** |

### 6.4 总成本

| 项目 | 月成本（USD） | 年成本（USD） |
|------|--------------|--------------|
| 基础设施 | $2,670 | $32,040 |
| AI 服务 | $60,000 | $720,000 |
| 人力 | $29,000 | $348,000 |
| **总计** | **$91,670** | **$1,100,040** |

**优化后（自建 ASR/TTS）：**
- AI 服务降低 80%：$12,000/月
- **总成本：$43,670/月，$524,040/年**

---

## 七、实施路线

### Phase 1: 基础设施搭建（2周）

**Week 1:**
- [ ] 购买云服务器
- [ ] 安装 Docker/K8s
- [ ] 配置网络（VPC、安全组）
- [ ] 部署 FreeSWITCH 集群

**Week 2:**
- [ ] 部署 VAPI Server 集群
- [ ] 配置 Redis 集群
- [ ] 配置 Nginx 负载均衡
- [ ] 配置监控（Prometheus+Grafana）

### Phase 2: 功能开发（3周）

**Week 3:**
- [ ] 音频重采样模块
- [ ] WebSocket 连接池
- [ ] 会话管理（Redis）
- [ ] API 认证鉴权

**Week 4:**
- [ ] FreeSWITCH ESL 桥接优化
- [ ] 多路并发支持
- [ ] 音频缓冲区优化
- [ ] 错误处理和重试

**Week 5:**
- [ ] 对接华为 UAP 9600
- [ ] SIP 中继测试
- [ ] 端到端测试
- [ ] 性能压测

### Phase 3: 测试上线（2周）

**Week 6:**
- [ ] 功能测试（100+ 场景）
- [ ] 性能测试（并发、延迟）
- [ ] 安全测试（渗透测试）
- [ ] 容灾演练

**Week 7:**
- [ ] 灰度发布（10% 流量）
- [ ] 全量上线
- [ ] 监控告警配置
- [ ] 文档编写

### Phase 4: 优化迭代（持续）

- [ ] 根据监控数据优化
- [ ] 成本优化（自建 ASR/TTS）
- [ ] 功能迭代
- [ ] 扩展新场景

---

## 八、风险评估

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|----------|
| StepFun API 不稳定 | 高 | 服务不可用 | 多供应商备份（阿里云、讯飞） |
| 并发超出预期 | 中 | 服务降级 | 自动扩容、限流 |
| 网络延迟 | 中 | 用户体验差 | 就近部署、CDN 加速 |
| 安全漏洞 | 高 | 数据泄露 | 定期安全审计、渗透测试 |
| 成本超支 | 中 | 项目延期 | 预算监控、成本优化 |

---

## 九、总结

**核心优势：**
1. ✅ 开源技术栈，无锁定
2. ✅ 高可用架构，99.9% SLA
3. ✅ 弹性扩展，支持 10x 增长
4. ✅ 完整监控，快速定位问题

**关键指标：**
- 延迟：< 500ms（端到端）
- 并发：1000+ 路通话
- 可用性：99.9%
- 成本：$0.50/分钟（优化后 $0.10/分钟）

**下一步行动：**
1. 确认服务器采购
2. 搭建测试环境
3. 对接 UAP 9600
4. 压力测试
5. 灰度上线

---

**联系方式：**
- GitHub: https://github.com/irisfeng/vapi-cn
- 文档: https://docs.vapi-cn.example.com
- 支持: support@vapi-cn.example.com
