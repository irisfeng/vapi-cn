# FreeSWITCH + VAPI 集成

将 SIP 电话呼入转发到 VAPI 语音 AI 服务。

## 架构

```
SIP 电话 → FreeSWITCH → ESL Bridge → VAPI WebSocket → StepFun Realtime API
```

## 安装步骤

### 1. 安装 FreeSWITCH

```bash
brew install freeswitch
```

### 2. 配置 SIP Profile

编辑 `/opt/homebrew/etc/freeswitch/sip_profiles/internal.xml`:

```xml
<profile name="internal">
  <param name="sip-ip" value="0.0.0.0"/>
  <param name="sip-port" value="5060"/>
  <param name="rtp-ip" value="0.0.0.0"/>
  <param name="context" value="default"/>
</profile>
```

### 3. 配置 Dialplan

编辑 `/opt/homebrew/etc/freeswitch/dialplan/default.xml`:

```xml
<extension name="vapi_bridge">
  <condition field="destination_number" expression="^1000$">
    <action application="answer"/>
    <action application="set" data="hangup_after_bridge=true"/>
    <action application="bridge" data="esl://127.0.0.1:8021"/>
  </condition>
</extension>
```

### 4. 配置 ESL

编辑 `/opt/homebrew/etc/freeswitch/autoload_configs/event_socket.conf.xml`:

```xml
<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="127.0.0.1"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="ClueCon"/>
    <param name="apply-inbound-acl" value="loopback.auto"/>
  </settings>
</configuration>
```

### 5. 启动服务

```bash
# 启动 FreeSWITCH
brew services start freeswitch

# 启动 VAPI 服务器
cd ../server && bun run src/index.ts

# 启动桥接脚本
cd freeswitch-bridge && node bridge.mjs
```

### 6. 测试

**使用 SIP 软电话测试：**

1. 下载 X-Lite 或 MicroSIP
2. 配置 SIP 账号：
   - 服务器：`127.0.0.1:5060`
   - 用户名：`1000`
   - 密码：（留空或配置 FreeSWITCH directory）
3. 拨打 `1000` → 应该听到 AI 语音

## 音频流处理

**采样率转换：**
- FreeSWITCH 默认：8kHz (G.711)
- StepFun Realtime：16kHz (输入) / 24kHz (输出)

**解决方案：**
1. FreeSWITCH 配置 `opus` 编码（支持 16kHz）
2. 或在桥接脚本中用 `ffmpeg` 重采样

## 生产部署

**推荐配置：**
- Ubuntu 22.04 LTS
- FreeSWITCH 1.10+
- 4 核 8GB 内存
- 公网 IP + 域名

**对接华为 UAP 9600：**

1. 在 UAP 9600 配置 SIP 中继：
   - 对端 IP：你的服务器 IP
   - 对端端口：5060
   - 编码：G.711A / G.711U

2. FreeSWITCH 配置 SIP Profile：
   ```xml
   <param name="sip-ip" value="0.0.0.0"/>
   <param name="context" value="from-uap"/>
   ```

3. Dialplan 路由：
   ```xml
   <extension name="from_uap">
     <condition field="context" expression="^from-uap$">
       <action application="answer"/>
       <action application="set" data="hangup_after_bridge=true"/>
       <action application="bridge" data="esl://127.0.0.1:8021"/>
     </condition>
   </extension>
   ```

## 故障排查

**FreeSWITCH 日志：**
```bash
tail -f /opt/homebrew/var/log/freeswitch/freeswitch.log
```

**ESL 连接测试：**
```bash
telnet 127.0.0.1 8021
auth ClueCon
events plain all
```

**音频编解码：**
```bash
fs_cli -x "codec"
```

## 下一步

- [ ] 音频双向流优化
- [ ] 多路并发支持
- [ ] VAD（语音活动检测）
- [ ] 打断机制
- [ ] 录音存储
