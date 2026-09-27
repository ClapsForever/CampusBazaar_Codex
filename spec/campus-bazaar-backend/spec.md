# CampusBazaar 本机完整后端规格

## 范围与架构

本仓库同时包含鸿蒙 App（`entry/`）、业务 API（`backend/api/`）和 Pi Agent（`backend/agent/`）。App 通过 8080 端口访问业务 API；API 以服务令牌调用本机 3000 端口的 Agent；Agent 用 DeepSeek API 处理对话，再以另一枚服务令牌读取业务商品。两个 Node 服务仍分别启动。业务数据存于本机 SQLite 和图片目录，Agent 对话暂存内存。

本阶段面向一台 Windows 电脑和鸿蒙模拟器。学校统一认证、真实短信、支付、物流、推送与公网部署不在范围内。

## 功能要求

### 身份与权限

- 本机手机号登录使用业务 API `.env` 中固定的六位 `DEV_LOGIN_CODE`，不实际发送短信。不同手机号对应独立测试用户。
- API 发放可撤销令牌；受保护操作从令牌确定身份，不信任 App 传入的买家、卖家、发送者或学校 ID。
- 注销后令牌失效；用户不可读写其他人的私有交易或 Agent 会话。

### 商品与图片

- API 提供商品发布、买家商品流、关键词搜索、商品详情及卖家自己的商品列表；列表稳定分页。
- 商品价格以整数分存入 SQLite，API 对前端仍使用元。发布时验证标题、描述、正价格、类别、成色、校区及最多三张图片。
- App 上传相机或相册照片的字节，API 在受控本机目录保存并生成模拟器可访问的签名图片 URL。不能把设备 `photo://` URI 直接作为跨用户图片。
- 已售出或被进行中交易占用的商品不再向买家和 Agent 作为可购商品推荐。数据库与图片目录一起备份。

### 交易与消息

- 买家不能购买自己的商品；同一商品同时最多一笔 `PENDING` 或 `ACCEPTED` 交易，依靠数据库约束与事务保证。
- 卖家可执行 `PENDING → ACCEPTED`、`PENDING → REJECTED`、`ACCEPTED → COMPLETED`；拒绝后释放占用，完成后商品售出。
- 买卖双方可查看交易并发送消息；终态只读。创建交易与发送消息支持幂等键，重试不应重复写入。
- API 重启后商品、图片、交易与消息仍存在。

### Pi Agent 找货

- App 的 `POST /api/agent/chat` 只发需求和会话 ID；业务 API 从登录态派生可信身份并调用 Agent 的 `POST /internal/agent/chat`。
- Agent 运行 `MODEL_MODE=real`、`MODEL_PROVIDER=deepseek`、`MOCK_BACKEND=false`，使用业务 API 的三个只读接口：`/internal/listings/search`、`/internal/listings/{listingId}`、`/internal/users/preferences`。
- 令牌 A：API 的 `AGENT_SERVICE_TOKEN` = Agent 的 `SERVICE_AUTH_TOKEN`。令牌 B：API 的 `INTERNAL_AGENT_TOKEN` = Agent 的 `BUSINESS_BACKEND_TOKEN`。A 与 B 必须不同。DeepSeek Key 只存在于 Agent `.env`。
- 推荐商品 ID 与业务 `Product.id` 一致，卡片可打开真实商品详情。支持同一会话内追问、条件继承和新对话；模型或业务接口故障返回错误，不伪装为“无商品”。
- Agent 会话目前存内存；重启 Agent 或 App 后旧对话不能续聊，应新建会话。业务数据持久化不受此限制。

## 公共接口

除登录与健康检查外，业务接口要求 `Authorization: Bearer <token>`。时间为 Unix 毫秒；列表使用 `{items,nextCursor}`，错误使用 `{requestId,code,message,retryable}`。

| 领域 | 路径 |
| --- | --- |
| 登录 | `POST /api/v1/auth/local/sessions`、`POST /api/v1/auth/logout`、`GET /api/v1/me` |
| 商品 | `GET /api/v1/products`、`GET /api/v1/products/{id}`、`GET /api/v1/me/products`、`POST /api/v1/products` |
| 图片 | `POST /api/v1/uploads`、`GET /api/v1/images/{id}` |
| 交易 | `POST /api/v1/transactions`、`GET /api/v1/transactions`、`GET /api/v1/transactions/{id}`、`POST /api/v1/transactions/{id}/accept|reject|complete` |
| 消息 | `GET/POST /api/v1/transactions/{id}/messages` |
| Agent | `POST /api/agent/chat` |
| 健康 | `GET /health/live`、`GET /health/ready` |

详细字段见 [`backend/api/README.md`](../../backend/api/README.md) 与 [`backend/agent/docs/api.md`](../../backend/agent/docs/api.md)。

## 验收与限制

两名测试用户在模拟器完成登录、发布带照片的商品、浏览搜索、Agent 多轮找货、下单、双向消息与卖家处理；API 重启后业务数据仍在。自动化测试覆盖权限、并发、幂等、持久化及 Agent 接口契约。手动步骤见 [`e2e-test.md`](e2e-test.md)。

8080 只在可信本机网络向模拟器开放；Agent 只监听 `127.0.0.1:3000`。本机明文 HTTP 不适用于公网部署，届时需改用 HTTPS 与正式认证。
