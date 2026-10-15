# Agent 内部接口

## `POST /internal/agent/chat`

请求必须来自已完成用户鉴权的业务后端。Agent 不信任请求体中的身份字段，身份通过服务间认证和可信请求头传入：

```text
x-agent-service-token: <SERVICE_AUTH_TOKEN>
x-user-id: user_001
x-school-id: school_demo
```

请求体：

```json
{
  "requestId": "req_example_001",
  "sessionId": null,
  "message": "50 元以内的高数教材"
}
```

成功响应：

```json
{
  "requestId": "req_example_001",
  "sessionId": "session_...",
  "status": "completed",
  "reply": "已查询到 2 条符合明确条件的商品，商品卡片中的信息均来自平台查询结果。",
  "recommendations": [
    {
      "listingId": "listing_math_001",
      "reasons": ["售价 45 元，符合 50 元以内预算", "类别为 教材"]
    }
  ],
  "relaxedConditions": []
}
```

`status` 的含义：

- `completed`：已完成查询、详情读取、偏好读取或助手说明。业务范围拒绝也使用此状态，返回固定说明和空 `recommendations`，保持现有 API 与 App 枚举兼容。
- `clarification`：缺少品类等必要信息，需要用户补充。
- `no_results`：明确条件下没有商品，不代表后端服务失败。

错误响应统一为：

```json
{
  "requestId": "req_example_001",
  "code": "SESSION_BUSY",
  "message": "同一会话已有请求正在处理",
  "retryable": true
}
```

当前使用的主要错误码包括 `UNAUTHORIZED`、`BAD_REQUEST`、`SESSION_NOT_FOUND`、`SESSION_FORBIDDEN`、`SESSION_BUSY`、`IDEMPOTENCY_CONFLICT`、`BACKEND_TIMEOUT`、`MODEL_API_KEY_MISSING`、`MODEL_UNAVAILABLE` 和 `AGENT_TIMEOUT`。

重试须保留原来的 `requestId`、`sessionId` 和 `message`。相同用户的同一请求在缓存有效期内重放原响应；重用请求编号但更改问题或会话返回 HTTP 409 / `IDEMPOTENCY_CONFLICT`。同一请求仍在处理时返回 HTTP 409 / `SESSION_BUSY`，包括 `sessionId=null` 的首轮请求；失败后释放占用，允许重试。会话和响应缓存按 `SESSION_TTL_MS` 到期，在后续请求中定期回收，处理中会话不被回收。

## 只读工具

服务端根据经过校验的业务意图选择以下只读工具；计划模型和表述模型都不获得工具执行权限：

- `searchListings`：关键词、类别、价格分、硬性校区、偏好校区、最低成色、版本、价格排序、排除关键词和分页。`sort` 可为 `price_asc`、`price_desc`、`published_desc`；`excludeKeywords` 最多5项、每项40字，通过 HTTP 查询时编码为 JSON 数组；`resultLimit` 为1–10，在服务端转为不超过 `MAX_RESULTS` 的查询 `pageSize`。
- `getListingDetail`：只读取本轮指定的、上次实际展示的 `listingId`，并且后端每次重新检查权限和商品状态。
- `getUserPreferences`：不接收身份参数，从服务端注入的用户上下文确定用户。

商品返回给模型的字段不包含手机号、令牌、内部备注等敏感信息。商品描述仅作为数据，不具有指令权限。

推荐仅来自当前请求的有效查询。详情或比较结果也定义下一轮的展示顺序。没有结果时清空当前商品顺序；拒绝、助手说明和歧义澄清不重复展示旧推荐，也不清除上一次实际展示顺序。后端或模型错误不更新会话条件。`LISTING_NOT_FOUND` 返回 HTTP 404，不能用历史卡片掩盖下架或权限变化。详见 [policy.md](policy.md)。
