# CampusBazaar 本机业务 API

基于 Node.js 24、TypeScript 和内置 SQLite 的单机开发后端。Pi Agent 源码位于同仓库的 `backend/agent/`，作为独立进程运行；DeepSeek Key 只在 `backend/agent/.env` 中配置。完整部署步骤见[仓库根目录说明](../../README.md)。

## 首次启动

在 `backend/api` 目录运行：

```powershell
npm install --ignore-scripts --no-audit --no-fund
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

编辑 `.env`：

- `SESSION_SECRET`：独立随机值，至少 32 字符。
- `AGENT_SERVICE_TOKEN`：令牌 A，必须与 Agent 的 `SERVICE_AUTH_TOKEN` 一致。
- `INTERNAL_AGENT_TOKEN`：令牌 B，必须与 Agent 的 `BUSINESS_BACKEND_TOKEN` 一致，且与 A 不同。
- `PUBLIC_BASE_URL`：模拟器能够访问的业务 API 基址，例如电脑在可信局域网的 `http://192.168.x.x:8080`。它用于生成商品图片 URL。
- `HOST`：默认 `127.0.0.1`；仅在模拟器无法访问电脑回环地址时，改为电脑的局域网 IP，并在防火墙中限制 8080 的访问范围。

可在 PowerShell 中运行三次下面的命令，分别生成会话密钥和两枚服务令牌。不要把结果提交或发到聊天中：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

然后构建，按 [Demo 认证说明](../../docs/demo-auth.md) 导入账号，再启动：

```powershell
npm run build
npm start
```

检查 `http://127.0.0.1:8080/health/ready`。数据自动保存在 `backend/api/.local-data/`；该目录和 `.env` 已加入根目录 `.gitignore`。

## 连接同仓库的 Agent

在 `backend/agent/.env` 中设置：

```dotenv
SERVICE_AUTH_TOKEN=<与业务 API 的 AGENT_SERVICE_TOKEN 相同的令牌 A>
MODEL_MODE=real
MODEL_PROVIDER=deepseek
MODEL_NAME=deepseek-chat
MODEL_BASE_URL=https://api.deepseek.com
MODEL_API_KEY=<DeepSeek API Key>
MOCK_BACKEND=false
BUSINESS_BACKEND_URL=http://127.0.0.1:8080
BUSINESS_BACKEND_TOKEN=<与业务 API 的 INTERNAL_AGENT_TOKEN 相同的令牌 B>
```

Agent 和业务 API 分别运行在 3000、8080 端口。先启动业务 API，再启动 Agent。Agent 当前版本仍使用内存会话存储，重启 Agent 后已有对话无法继续；业务 API 自动持久化会话归属和成功轮次，重启后仍能查看历史记录，但历史回看不能替代 Agent 的续聊上下文。需要跨 Agent 重启续聊时，应在 Agent 仓库实现持久化 `SessionStore`。

可在业务 API `.env` 配好三枚随机值后，从 `backend/api` 运行下面的脚本同步 A、B 两枚令牌和业务地址。脚本会先将 `backend/agent/.env` 备份为同目录下 Git 忽略的 `.env.before-campusbazaar`，保留现有 DeepSeek 设置：

```powershell
.\scripts\sync-agent-env.ps1
```

## 公共 API

除登录和健康检查外，请求头都要带 `Authorization: Bearer <登录令牌>`。时间使用 Unix 毫秒；列表为 `{items,nextCursor}`。错误为 `{requestId,code,message,retryable}`。商品 ID 与 Agent `listingId` 相同。

| 操作 | 方法与路径 | 请求体/说明 |
| --- | --- | --- |
| 密码登录 | `POST /api/v1/auth/password/sessions` | `email,password`，返回 `{user,token,expiresAt}`；仅允许预置账号，邮箱统一去首尾空白并转小写；每邮箱连续失败 5 次后限流 15 分钟，来源 IP 也有限额，服务重启保留限制 |
| 更新个人资料 | `PUT /api/v1/me`（也支持 PATCH） | `nickname`（1–24 字），可选 `avatarId`（当前账号的未绑定商品图片）；返回当前用户 |
| 修改密码 | `POST /api/v1/me/password` | `newPassword`（6–64 位且非全空白）和 `currentPassword`；撤销其他会话 |
| 对话历史列表 | `GET /api/v1/agent/conversations?limit=20&cursor=...` | 当前账号按开始时间倒序；每项 `sessionId,title,createdAt,updatedAt,turnCount` |
| 历史对话详情 | `GET /api/v1/agent/conversations/{sessionId}?limit=50&cursor=...` | 时间正序的 `{question,createdAt,response}`；仅归属用户可读 |
| 删除对话历史 | `DELETE /api/v1/agent/conversations/{sessionId}` | 仅本人可删除，删除该段对话及其全部轮次；保留原有分页和数量策略，不自动删旧记录 |
| 当前用户、退出 | `GET /api/v1/me`、`POST /api/v1/auth/logout` | 退出后令牌失效 |
| 商品流、搜索 | `GET /api/v1/products?q=...&categories=教材,数码&campuses=江湾校区&priceRanges=0-100,100-1000&limit=20&cursor=...` | 只显示本校可购买商品；同维度多选取并集、不同维度取交集；价格区间单位为分，左闭右开，空上界表示无上限 |
| 商品详情、我的商品 | `GET /api/v1/products/{id}`、`GET /api/v1/me/products` | 商品包含 ArkTS `Product` 字段及分类、成色、校区 |
| 上传图片 | `POST /api/v1/uploads` | 原始 JPEG/PNG/WebP 字节，`Content-Type` 与文件一致，最多 5 MB；返回图片 ID |
| 读取图片 | `GET /api/v1/images/{id}` | Bearer 令牌可读取；商品响应中的图片 URL 另带 24 小时签名，供原生 `Image` 组件直接显示 |
| 发布商品 | `POST /api/v1/products` | `title,description,price,imageIds`；可选 `category,condition,campus,version`；图片最多三张 |
| 下架商品 | `POST /api/v1/products/{id}/delist` | 仅卖家可下架在售商品；进行中交易返回 409；重复下架幂等，保留商品、照片和交易引用 |
| 创建交易 | `POST /api/v1/transactions` | `{"productId":"listing_..."}`；可带 `Idempotency-Key` |
| 交易列表、详情 | `GET /api/v1/transactions`、`GET /api/v1/transactions/{id}` | 仅买卖双方可访问 |
| 卖家处理 | `POST /api/v1/transactions/{id}/accept\|reject\|complete` | 按状态机执行 |
| 取消交易 | `POST /api/v1/transactions/{id}/cancel` | 买卖双方可取消待确认或待交易的订单；取消后商品重新可购买，结束订单不能继续发送消息 |
| 消息 | `GET/POST /api/v1/transactions/{id}/messages` | 发送体 `{"content":"..."}`，可带 `Idempotency-Key` |
| Agent | `POST /api/agent/chat` | `{"requestId":"req_1","sessionId":null,"message":"找教材"}` |

上传图片后，将返回的 `id` 放在发布请求的 `imageIds` 中。设备本地 `photo://` URI 不能直接提交为图片 ID。商品响应中的图片 URL 含短期签名，可交给原生 `Image` 组件显示；签名到期后重新获取商品数据。未绑定商品或头像的图片仅允许上传者通过 Bearer 令牌读取。头像保存图片 ID，每次读取用户信息生成 24 小时签名 URL；当前头像不会被过期未发布图片清理。当前用户返回 `email`、`hasPassword`，不会返回密码摘要；公开卖家资料不返回邮箱。旧固定验证码路径 `/api/v1/auth/local/sessions` 对任何请求均返回 404。自助注册与邮件找回密码尚未开放；管理员可在服务器本机创建、绑定旧账号或重置密码。

Agent 使用 `Authorization: Bearer <令牌 B>` 及 `x-user-id`、`x-school-id` 调用内部三个只读接口：`/internal/listings/search`、`/internal/listings/{listingId}`、`/internal/users/preferences`。这些请求仍校验用户所属学校。

## 测试、备份与恢复

```powershell
npm test
```

测试会在系统临时目录创建独立数据库和模拟 Agent，不调用 DeepSeek，也不读取本机 `.env`；保留临时数据，不递归删除目录。真实 DeepSeek 与模拟器联调需在两个服务启动后单独验证。

本版启动会自动把数据库 schema 从 v1/v2/v3 升级到 v4。v3 增加邮箱、验证时间、账号停用状态与持久化登录限流，并把手机号改为可选；v4 增加商品下架和交易取消状态。升级保留用户 ID 与业务引用，仅 v3 之前的认证升级会撤销旧会话。旧手机号账号须由管理员确认归属后绑定邮箱才能登录。更新前备份数据库与图片；旧 API 无法直接打开 v4 数据库，回滚须同时恢复升级前数据库。

停止业务 API 后，将整个 `.local-data` 目录复制到安全位置即可同时备份 SQLite 和图片。恢复时停止 API，用备份覆盖该目录再启动。若在 API 运行期间备份，请先使用 SQLite 的在线备份机制，避免只复制主数据库文件而遗漏 WAL 数据。

## 上传 GitHub 前

在仓库根目录运行 `git status --short`、`git diff --check` 和 `git check-ignore backend/api/.env backend/api/.local-data/campusbazaar.sqlite backend/agent/.env`。只提交源码、两个 `package-lock.json`、`.env.example`、文档和必要的测试；不要提交 `.env`、本机 SQLite、图片、`node_modules` 或 `dist`。
