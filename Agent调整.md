# Agent 专用化：简单有效的方法

目标：让找货 Agent 只做校园二手商品查找，防止业务范围外的操作。

按"性价比"排序，只列最有效的几条。

---

## 1. 收紧工具（最有效，能力的硬边界）

文件：`backend/agent/src/tools/index.ts`

- 不需要的工具直接删掉。例：`return [searchListings, getListingDetail];`
- 参数改成枚举，只允许固定类别：

```ts
category: Type.Optional(Type.Union([
  Type.Literal("教材"), Type.Literal("键盘"), Type.Literal("自行车"),
])),
```

- 在 `execute` 里加拦截，防止模型绕过 schema：

```ts
if (params.keyword && /下单|付款|联系卖家/.test(params.keyword)) {
  throw new AppError("TOOL_INPUT_INVALID", "超出找货范围");
}
```

> 删工具 = 删能力，这是最硬的约束。

## 2. 改系统提示词（最简单，直接见效）

文件：`backend/agent/src/agent/prompts.ts`

在 `SYSTEM_PROMPT` 追加：

```text
11. 只回答与校园二手商品查找、筛选、比较相关的问题；无关问题一律回复“我只能帮你找校园二手商品”。
12. 只能查询类别为教材、键盘、自行车的商品。
```

## 3. 限制可见数据（防止越权/越范围）

文件：`backend/api/src/store.ts`

- `internalSearch()` 加类别白名单：

```ts
where.push(`p.category IN ('教材','键盘','自行车')`);
```

- `backend/agent/src/contracts/index.ts` 的 `listingToModelView()` 删掉不想给模型的字段（如 `description`）。

## 4. 代理层拦截（请求进 Agent 前先挡住）

文件：`backend/api/src/server.ts` 的 `proxyAgent()`

```ts
const message = text(body.message, 'message', 1, 2000);
if (/付款|下单|联系卖家/.test(message)) {
  throw new ApiError(400, 'BAD_REQUEST', '超出智能助手业务范围');
}
```

## 5. 配置参数（不用改代码）

文件：`backend/agent/.env`

```dotenv
MAX_RESULTS=5
MAX_TOOL_CALLS=3
MAX_MESSAGE_CHARS=500
```

---

## 验证

```powershell
cd backend/api && npm test
cd backend/agent && npm test
```

手动测："帮我下单"、"联系卖家"、"查别的学校商品"、"讲个笑话" → 都应被拒绝。

---

**总结**：改 4 个文件 + 1 份配置即可 —— 收紧工具、改提示词、限制数据、代理拦截。
其中**收紧工具**最硬，**系统提示词**最简单，两者先改，其余按需补。 
