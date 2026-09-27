# CampusBazaar Pi Agent

这里是 CampusBazaar 的找货 Agent，源码整合自 [`ClapsForever/pi-campus-market-agent`](https://github.com/ClapsForever/pi-campus-market-agent) 的 `3a10cab` 提交。它使用开源 Pi Agent SDK，经 DeepSeek 解析用户需求，并通过业务 API 的受保护接口查询真实商品。该服务与 `backend/api` 同仓库、分进程运行。

## 本机启动

完整的双服务配置见[仓库根目录 README](../../README.md)。在本目录执行：

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# 编辑 .env：填写 DeepSeek Key，并与业务 API 对齐两枚服务令牌
npm run build
npm start
```

`.env` 至少应设置 `MODEL_MODE=real`、`MODEL_PROVIDER=deepseek`、`MODEL_NAME=deepseek-chat`、`MODEL_BASE_URL=https://api.deepseek.com`、`MODEL_API_KEY`、`MOCK_BACKEND=false`、`SERVICE_AUTH_TOKEN`、`BUSINESS_BACKEND_URL=http://127.0.0.1:8080`、`BUSINESS_BACKEND_TOKEN`。服务只监听 `127.0.0.1:3000`，由本机业务 API 调用；App 不直接访问 Agent。

在另一个终端运行 `Invoke-RestMethod http://127.0.0.1:3000/health`，检查 `modelMode: real`、`modelConfigured: true`、`backendMode: http`。内部聊天接口与三个只读工具的契约见 [docs/api.md](docs/api.md)。

## 测试与限制

```powershell
npm test
```

测试使用模拟模型及业务客户端，不消耗 DeepSeek API。Agent 内部仍保留 Mock 实现用于单元、集成和评测测试，日常部署按 `.env.example` 的真实模型与 HTTP 商品模式运行。会话保存在内存；重启 Agent 后需要新建对话。不要提交 `.env` 或 DeepSeek Key。
