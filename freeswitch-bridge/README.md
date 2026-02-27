# FreeSWITCH-VAPI 桥接

连接 FreeSWITCH 电话呼入到 VAPI 语音 AI 服务。

## 状态

✅ FreeSWITCH 已启动
- SIP: localhost:5060
- ESL: localhost:8021
- 密码: ClueCon

✅ VAPI 服务已启动
- WebSocket: localhost:3000

## 测试步骤

### 1. 启动桥接脚本

```bash
cd ~/.openclaw/workspace/vapi-cn/freeswitch-bridge
npm install ws
node bridge.mjs
```

### 2. 使用 SIP 软电话测试

**下载 X-Lite 或 MicroSIP**

**配置 SIP 账号：**
- 服务器：`127.0.0.1:5060`
- 用户名：`1000`
- 密码：（留空）

**拨打：**
- 拨打 `1000` → 应该听到 AI 语音

### 3. 手动测试 ESL

```bash
# 连接 ESL
telnet 127.0.0.1 8021

# 认证
auth ClueCon

# 查看状态
api status

# 订阅事件
events plain all
```

## 配置文件

- Dialplan: `/opt/homebrew/etc/freeswitch/dialplan/vapi.xml`
- ESL: `/opt/homebrew/etc/freeswitch/autoload_configs/event_socket.conf.xml`

## 故障排查

**查看 FreeSWITCH 日志：**
```bash
tail -f /opt/homebrew/var/log/freeswitch/freeswitch.log
```

**查看 ESL 连接：**
```bash
lsof -i:8021
```

**查看 SIP 端口：**
```bash
lsof -i:5060
```

## 下一步

- [ ] 安装 ws 包
- [ ] 启动桥接脚本
- [ ] 测试 SIP 呼入
- [ ] 配置音频流双向转发
- [ ] 对接华为 UAP 9600
