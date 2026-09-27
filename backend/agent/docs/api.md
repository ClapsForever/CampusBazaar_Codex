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

- `completed`：已完成查询或详情读取。
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

当前使用的主要错误码包括 `UNAUTHORIZED`、`BAD_REQUEST`、`SESSION_NOT_FOUND`、`SESSION_FORBIDDEN`、`SESSION_BUSY`、`BACKEND_TIMEOUT`、`MODEL_API_KEY_MISSING`、`MODEL_UNAVAILABLE` 和 `AGENT_TIMEOUT`。

## 只读工具

Agent 只注册以下工具：

- `searchListings`：关键词、类别、价格分、硬性校区、偏好校区、成色、版本和分页。
- `getListingDetail`：只能读取当前会话已经展示或验证过的 `listingId`，并且后端每次重新检查权限。
- `getUserPreferences`：不接收身份参数，从服务端注入的用户上下文确定用户。

商品返回给模型的字段不包含手机号、令牌、内部备注等敏感信息。商品描述仅作为数据，不具有指令权限。
