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

## 找货执行流程

每轮采用“需求计划 → 服务端查询 → 结果表述”的受控流程。计划模型只能输出经过 schema 校验的业务意图和筛选条件增量；服务端按意图调用搜索、详情或偏好工具。表述模型只接收本轮查询结果。两个模型阶段都没有工具调用权限，商品描述不能参与下一步工具选择。

会话独立保存有效筛选条件、上一次展示的商品顺序和搜索页码。用户明确修改或取消条件后才更新；切换品类清除旧品类条件。详情和比较按最近一次展示顺序解析并重新查询后端，推荐卡片只来自本轮有效结果。业务接口或模型故障时不提交本轮状态。

交易操作和无关请求返回固定说明及空推荐，保持当前找货条件。意图无法解析或商品指代不明确时先追问。支持教材、键盘、自行车以外的实际商品品类。详细规则及验证场景见 [docs/policy.md](docs/policy.md)。

## 测试与限制

```powershell
npm test
```

测试使用模拟模型及业务客户端，不消耗 DeepSeek API。Mock 计划器使用有限的确定性规则；真实模式使用模型理解自然语言，再执行相同的服务端策略。实际模型的意图准确率和表述质量仍需单独联调。真实模式通常每轮需要一次计划调用和一次表述调用，无结果、拒绝和澄清使用固定回复。整个流程共用 `TURN_TIMEOUT_MS`，`MAX_TOOL_CALLS` 限制每轮后端读取次数。会话保存在内存；重启 Agent 后需要新建对话。不要提交 `.env` 或 DeepSeek Key。
