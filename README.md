# 校园集市（CampusBazaar）

校园集市是鸿蒙校园二手商品应用。本仓库包含**全部项目源码**：HarmonyOS 前端、Node.js 业务 API 和基于开源 Pi Agent 的找货服务。支持邮箱密码登录、自助注册、商品与照片、搜索、交易、聊天，以及接入 DeepSeek 的多轮找货。下面介绍 Windows 电脑与鸿蒙模拟器的本机联调；邮件归属验证和自助找回密码尚未接入。

腾讯云 Ubuntu 24.04 的小组共同测试部署见 [Ubuntu 部署指南](deploy/ubuntu/README.md)，包含 systemd、Nginx、配置生成、备份及更新回滚模板。licx 的测试入口现为 `http://101.35.53.59:18080`，健康检查为 `http://101.35.53.59:18080/health/ready`，**不再限制来源 IP，通过预置邮箱密码账号登录**；组员接入、验证范围及云防火墙设置见 [IP 直连测试说明](docs/ip-direct-testing.md)。HTTP 会明文传输密码和登录令牌，仅使用测试账号；正式发布前恢复 HTTPS。域名入口与证书配置保留，见 [HTTPS 说明](deploy/ubuntu/licx-https/README.md)。

后续迁往阿里云的预备方案见[阿里云迁移指南](deploy/aliyun/README.md)：按 Ubuntu 24.04 单台 ECS 准备，包含源码打包、HTTPS 配置生成、完整 SQLite/图片迁移与校验、匿名注册验收和切换回退步骤。已按保留全部现有数据设计；尚未连接或改动现有服务器，也未切换 App 地址。

商品详情与“我发布的”支持卖家下架，买卖双方可取消待确认或待交易订单；普通搜索支持关键词与多选价格、大类和校区组合；AI 历史可手动删除整段对话，保留原有分页与数量策略。详见[功能及数据保留说明](docs/marketplace-actions.md)。注册、商品和交易升级统一使用 schema v5，兼容原 v3 及两种 v4 数据库。

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

仓库根目录没有 Node lockfile，**不要在根目录运行 `npm install --ignore-scripts --no-audit --no-fund`**。下面分别在两个服务目录安装依赖。

## 2. 配置业务 API

用 `ipconfig` 找到电脑当前 IPv4 地址，以下记作“电脑IPv4”。模拟器须能访问电脑 8080 端口。

```powershell
Set-Location .\backend\api
npm install --ignore-scripts --no-audit --no-fund
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

编辑 `backend/api/.env`：

| 变量 | 本机配置 |
| --- | --- |
| `HOST` | 电脑IPv4；也可在可信本机网络中用 `0.0.0.0` |
| `PORT` | `8080` |
| `PUBLIC_BASE_URL` | `http://电脑IPv4:8080`，用于生成模拟器可访问的图片 URL |
| `SESSION_SECRET` | 至少 32 字符的随机值 |
| `AGENT_BASE_URL` | `http://127.0.0.1:3000` |
| `AGENT_SERVICE_TOKEN` | 随机令牌 A，至少 24 字符 |
| `INTERNAL_AGENT_TOKEN` | 与 A 不同的随机令牌 B，至少 24 字符 |

其余 SQLite 与上传目录可保持示例默认值。可在本机生成三条随机密钥，再分别填入 `.env`；输出不要发给他人或提交 Git：

```powershell
node -e "const c=require('node:crypto'); for(const name of ['SESSION_SECRET','AGENT_SERVICE_TOKEN','INTERNAL_AGENT_TOKEN']) console.log(name+'='+c.randomBytes(32).toString('hex'))"
```

## 3. 配置 Pi Agent 与 DeepSeek

从 `backend/api` 进入同级的 Agent 目录：

```powershell
Set-Location ..\agent
npm install --ignore-scripts --no-audit --no-fund
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
2. 若使用 licx 的共享测试后端，保持 `entry/src/main/ets/service/BackendRuntimeConfig.ets` 中的 `http://101.35.53.59:18080`，在模拟器浏览器打开该地址的 `/health/ready` 确认返回 `{"status":"ok"}`。不再需要登记或放行组员公网 IP，使用分配的邮箱密码登录即可。若按本文启动自己的本机后端，把 `BUSINESS_API_BASE_URL` 改成 `http://电脑IPv4:8080`，与自己 API 的 `PUBLIC_BASE_URL` 使用同一个地址。
3. 选择 `entry` 运行配置，点击 **Run**。若提示签名，按 DevEco 的本机调试向导配置。

启动页通过登录按钮下的“没有账号？立即注册”进入注册，注册页通过“已有账号？返回登录”切回，顶部只显示当前表单标题。注册填写邮箱、6–64 位密码和确认密码，阅读并主动勾选用户协议与隐私政策草案后提交，成功后自动进入首页。图形验证码本轮暂时移除，恢复计划见[发布前清单](docs/legal/launch-checklist.md)。测试阶段允许任意邮箱，不验证邮箱归属或学生身份。也可按 [Demo 认证说明](docs/demo-auth.md) 导入预置账号；找回密码仍由项目组人工处理。本次源码变更需同步更新 API 和 App，已有云端部署不会自动更新。实现与验收步骤见[注册说明](docs/registration.md)。

## 6. 验证完整流程

用户 A 登录，通过底部“发布”发布带照片的商品，在“我的 → 我发布的”管理商品；退出后用户 B 登录，在首页浏览、搜索并打开该商品。进入首页“AI 找物”按预算找货，查看推荐卡片并追问；点击卡片进入详情。B 预约交易后，通过首页“消息”或“我的 → 我的交易”发送消息，再由 A 登录回复、接受并完成交易。停止并重启业务 API 后，商品、图片、交易与消息应仍在。

发布和首页浏览统一使用六个类别：教材、数码、外设、日用、运动、其他。键盘、耳机、显示器等选“外设”，台灯和收纳等选“日用”，具体物品名称写在标题中。旧商品的小类仍可显示和搜索；AI 同时兼容旧小类与新大类，找键盘时按具体关键词筛选，不会返回所有外设。分类兼容需要同时更新业务 API 与 Agent。

详细步骤和故障排查见[模拟器全链路测试](spec/campus-bazaar-backend/e2e-test.md)。两个服务可分别运行 `npm test`；自动化测试不会调用真实 DeepSeek。

## 7. 数据与协作

- 业务数据在 `backend/api/.local-data/`。停止 API 后备份整个目录，可同时保存 SQLite 和图片。队友首次启动会得到自己的空数据库。
- AI 对话每轮成功回复后自动保存在业务 SQLite，按账号隔离；“新对话”旁的“历史记录”可按时间分页查看，退出登录、重启 App 或服务不会丢失已保存内容。历史详情供回看；Agent 的续聊上下文仍存于内存，重启或过期后需新建对话。更新前已经丢失的内存对话无法补回。
- “我的 → 个人设置”支持相册头像、昵称及登录密码。修改密码需当前密码；演示密码为 6–64 位，以随机盐 scrypt 摘要保存，修改后撤销其他登录会话。详见[个人设置与历史记录说明](docs/profile-and-history.md)。
- `.env`、DeepSeek Key、数据库、上传图片、`node_modules`、构建产物均已被 Git 忽略。只提交源码、两个 `package-lock.json`、`.env.example`、文档和测试。
- 测试版不包含学校统一认证、邮箱归属验证或邮件找回密码服务；当前注册不获取或校验图形验证码，仍保留服务端注册限流。
- [用户协议草案](docs/legal/user-agreement.md)、[隐私政策草案](docs/legal/privacy-policy.md)和[社区与交易规则草案](docs/legal/community-rules.md)可从启动页及“我的”阅读。运营主体、联系方式、注销/删除流程及保存期限尚未确定，详见[发布前清单](docs/legal/launch-checklist.md)。三份正文作为离线文本随 App 打包；修改 Markdown 后运行 `node scripts/sync-legal-docs.cjs`，用 `node scripts/sync-legal-docs.cjs --check` 检查同步。协议版本变更须同时更新前端、后端版本常量与正文。

业务 API 接口和备份说明见 [backend/api/README.md](backend/api/README.md)；Agent 内部接口见 [backend/agent/docs/api.md](backend/agent/docs/api.md)。

## 8. 项目整理与回归

前后端整理说明、已删除文件和本地构建输出的重建方法见 [2026-10-15 清理记录](docs/cleanup-2026-10-15.md)。安装 `backend/api` 的开发依赖后，可直接在仓库根目录运行以下回归，无需指定 DevEco 内部 TypeScript 路径：

```sh
node --test scripts/ui-regression.cjs
node scripts/ui-api-regression.cjs
```

前者使用服务替身执行实际前端逻辑，后者运行全部 API 测试和 UI 契约，使用本机随机端口及临时数据库，保留测试数据。它们不代替模拟器或真机验收。

整理后的两个后端已于北京时间 2026-10-15 20:58 部署到 licx 独立实例，数据、图片及原网络规则保留，队友实例未改动。验证结果、备份和回切说明见[服务器部署记录](docs/backend-deployment-2026-10-15.md)。
