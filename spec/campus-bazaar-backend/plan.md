# CampusBazaar 单仓库部署与实施方案

## 代码组织

`entry/` 是鸿蒙前端；`backend/api/` 是 Node 24 业务服务；`backend/agent/` 是 Pi Agent 与 DeepSeek 适配服务。Agent 源码从 [`ClapsForever/pi-campus-market-agent`](https://github.com/ClapsForever/pi-campus-market-agent) 的 `3a10cab` 提交纳入本仓库，保留独立 `package-lock.json` 与测试；当前完整链路不使用旧开发网关或前端离线数据分支。

```text
HarmonyOS App → API :8080 → Agent :3000 → DeepSeek
                     ↘ SQLite 与本地图片
Agent → API 的受保护只读商品接口
```

## 本机配置

1. 在 `backend/api`、`backend/agent` 分别运行 `npm ci`，从各自的 `.env.example` 复制 `.env`。根目录不运行 `npm ci`。
2. API 配置开发验证码、会话密钥、电脑 IPv4 监听地址、图片公开基址，以及服务令牌 A/B。Agent 配置 DeepSeek Key、真实模型、HTTP 商品模式和与 API 一致的 A/B 令牌。可使用 `backend/api/scripts/sync-agent-env.ps1` 同步令牌。
3. 前端 `BackendRuntimeConfig.ets` 只配置模拟器可达的 API 地址。密钥和服务令牌留在被 Git 忽略的 `.env`。
4. 先启动 API，再启动 Agent；分别检查 `/health/ready` 与 `/health`。Agent 仅监听本机回环地址；只需向模拟器开放 API 的 8080 端口。

完整命令见[仓库 README](../../README.md)。

## 数据与服务边界

- API 用 SQLite 保存用户、登录会话、商品、图片元数据、交易、消息和幂等记录；图片文件在 `backend/api/.local-data/`。停止 API 后可整体备份该目录。
- API 从登录令牌确定用户和学校，在调用 Agent 时附带可信身份与令牌 A。Agent 用令牌 B 查询 API 的三个只读内部接口，不能修改商品或交易。
- Agent 使用 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai`，通过 DeepSeek 处理自然语言；业务商品 ID 原样返回给 App，App 再通过 API 获取卡片详情。
- Agent 会话为内存实现。业务持久化与 Agent 会话持久化是两个不同事项；当前部署要求重启后新建对话。

## 验证顺序

1. `backend/api` 和 `backend/agent` 分别执行 `npm run build`、`npm test`。
2. 启动两个服务，检查健康状态；用两名测试用户完成商品、Agent、交易与消息全链路。
3. 重启业务 API，确认业务数据与图片保留；重新打开 Agent 会话验证新对话可用。
4. 上传前检查 Git 暂存列表，确保 `.env`、SQLite、上传图片、`node_modules`、`dist` 与签名材料未入库。

具体手动步骤见 [`e2e-test.md`](e2e-test.md)。
