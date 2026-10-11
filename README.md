# CampusBazaar

CampusBazaar 是鸿蒙校园二手商品应用。本仓库包含**全部项目源码**：HarmonyOS 前端、Node.js 业务 API 和基于开源 Pi Agent 的找货服务。支持本机手机号登录、商品与照片、搜索、交易、聊天，以及接入 DeepSeek 的多轮找货。当前部署面向 Windows 电脑和鸿蒙模拟器；学校统一认证与真实短信尚未接入。

## 目录与运行架构

```text
CampusBazaar_Codex/
├─ entry/          HarmonyOS App
├─ backend/api/    业务 API，8080；SQLite 和本地图片
├─ backend/agent/  Pi Agent 服务，3000；调用 DeepSeek
└─ spec/campus-bazaar-backend/  当前后端规格与验收步骤

App → 业务 API → Pi Agent → DeepSeek API
             ↘ SQLite、图片目录
Pi Agent → 业务 API 的受保护商品查询接口
```

App 只访问业务 API，不保存 DeepSeek Key 或服务间令牌。`backend/api` 与 `backend/agent` 在同一个 Git 仓库，但仍是两个独立的 Node.js 进程，各有自己的 `package.json` 和 `.env`。Agent 源码整合自 [`pi-campus-market-agent`](https://github.com/ClapsForever/pi-campus-market-agent) 的提交 `3a10cab`；现在只需克隆**本仓库**。

## 1. 准备环境

- Git、PowerShell、Node.js **24.21.0 或更新版本**。可运行 `node --version`、`npm --version` 检查。
- DevEco Studio、HarmonyOS **6.1.0(23)** SDK 和鸿蒙模拟器。
- 可用的 DeepSeek API Key，以及电脑访问 `https://api.deepseek.com` 的网络。

```powershell
git clone https://github.com/ClapsForever/CampusBazaar_Codex.git
Set-Location .\CampusBazaar_Codex
```

仓库根目录没有 Node lockfile，**不要在根目录运行 `npm ci`**。下面分别在两个服务目录安装依赖。

## 2. 配置业务 API

用 `ipconfig` 找到电脑当前 IPv4 地址，以下记作“电脑IPv4”。模拟器须能访问电脑 8080 端口。

```powershell
Set-Location .\backend\api
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

编辑 `backend/api/.env`：

| 变量 | 本机配置 |
| --- | --- |
| `HOST` | 电脑IPv4；也可在可信本机网络中用 `0.0.0.0` |
| `PORT` | `8080` |
| `PUBLIC_BASE_URL` | `http://电脑IPv4:8080`，用于生成模拟器可访问的图片 URL |
| `SESSION_SECRET` | 至少 32 字符的随机值 |
| `DEV_LOGIN_CODE` | 自设的 6 位数字；本机登录使用，不发送短信 |
| `AGENT_BASE_URL` | `http://127.0.0.1:3000` |
| `AGENT_SERVICE_TOKEN` | 随机令牌 A，至少 24 字符 |
| `INTERNAL_AGENT_TOKEN` | 与 A 不同的随机令牌 B，至少 24 字符 |

其余 SQLite 与上传目录可保持示例默认值。可在本机生成三条随机密钥，再分别填入 `.env`；输出不要发给他人或提交 Git：

```powershell
node -e "const c=require('node:crypto'); for(const name of ['SESSION_SECRET','AGENT_SERVICE_TOKEN','INTERNAL_AGENT_TOKEN']) console.log(name+'='+c.randomBytes(32).toString('hex')); console.log('DEV_LOGIN_CODE='+c.randomInt(100000,1000000))"
```

## 3. 配置 Pi Agent 与 DeepSeek

从 `backend/api` 进入同级的 Agent 目录：

```powershell
Set-Location ..\agent
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

编辑 `backend/agent/.env`，重点确认：

```dotenv
PORT=3000
SERVICE_AUTH_TOKEN=<业务 API 的令牌 A>
MOCK_BACKEND=false
MODEL_MODE=real
MODEL_PROVIDER=deepseek
MODEL_NAME=deepseek-chat
MODEL_BASE_URL=https://api.deepseek.com
MODEL_API_KEY=<自己的 DeepSeek API Key>
BUSINESS_BACKEND_URL=http://127.0.0.1:8080
BUSINESS_BACKEND_TOKEN=<业务 API 的令牌 B>
```

令牌 A 必须与 API 的 `AGENT_SERVICE_TOKEN` 相同；令牌 B 必须与 API 的 `INTERNAL_AGENT_TOKEN` 相同。也可先填好两份 `.env`，再从 `backend/api` 执行 `./scripts/sync-agent-env.ps1` 同步两枚令牌和业务地址；脚本会备份 Agent 原 `.env`，保留 DeepSeek 设置。`deepseek-chat` 是本项目联调使用的模型名；如模型可用性变化，以 [DeepSeek 官方 API 文档](https://api-docs.deepseek.com/guides/harness)为准。

## 4. 启动和检查

打开两个 PowerShell 窗口，分别进入 `CampusBazaar_Codex/backend/api` 和 `CampusBazaar_Codex/backend/agent`。**先启动业务 API，再启动 Agent**；首次启动或更新源码后都先构建：

```powershell
# 窗口一：当前目录为 backend/api
npm run build
npm start
```

```powershell
# 窗口二：当前目录为 backend/agent
npm run build
npm start
```

在第三个 PowerShell 窗口检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health/ready
Invoke-RestMethod http://127.0.0.1:3000/health
```

业务 API 应返回 `status: ok`；Agent 应显示 `status: ok`、`modelMode: real`、`modelConfigured: true`、`backendMode: http`。再访问 `http://电脑IPv4:8080/health/ready` 检查模拟器到电脑的网络。Windows 防火墙应只允许模拟器访问 8080；Agent 只监听本机 `127.0.0.1:3000`。

## 5. 在 DevEco Studio 运行 App

1. 打开本仓库根目录，等待工程与 OHPM 同步；选择匹配的 HarmonyOS SDK 和模拟器。
2. 打开 `entry/src/main/ets/service/BackendRuntimeConfig.ets`，把 `BUSINESS_API_BASE_URL` 改成 `http://电脑IPv4:8080`，与 API 的 `PUBLIC_BASE_URL` 使用同一个地址。仓库中的开发者 IP 不能直接照搬。
3. 选择 `entry` 运行配置，点击 **Run**。若提示签名，按 DevEco 的本机调试向导配置。

登录页填写有效的 11 位手机号及**自己 API `.env` 中的 `DEV_LOGIN_CODE`**。例如 `13800000011` 和 `13800000012` 可模拟两名用户。

## 6. 验证完整流程

用户 A 登录，通过底部“发布”发布带照片的商品，在“我的 → 我发布的”管理商品；退出后用户 B 登录，在首页浏览、搜索并打开该商品。进入首页“AI 找物”按预算找货，查看推荐卡片并追问；点击卡片进入详情。B 预约交易后，通过首页“消息”或“我的 → 我的交易”发送消息，再由 A 登录回复、接受并完成交易。停止并重启业务 API 后，商品、图片、交易与消息应仍在。

详细步骤和故障排查见[模拟器全链路测试](spec/campus-bazaar-backend/e2e-test.md)。两个服务可分别运行 `npm test`；自动化测试不会调用真实 DeepSeek。

## 7. 数据与协作

- 业务数据在 `backend/api/.local-data/`。停止 API 后备份整个目录，可同时保存 SQLite 和图片。队友首次启动会得到自己的空数据库。
- Agent 会话目前存于内存；重启 Agent 或 App 后需新建助手会话，业务商品和交易数据不受影响。
- `.env`、DeepSeek Key、数据库、上传图片、`node_modules`、构建产物均已被 Git 忽略。只提交源码、两个 `package-lock.json`、`.env.example`、文档和测试。
- 本机部署不包含学校统一认证、真实短信或公网服务。

业务 API 接口和备份说明见 [backend/api/README.md](backend/api/README.md)；Agent 内部接口见 [backend/agent/docs/api.md](backend/agent/docs/api.md)。
