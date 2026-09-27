# CampusBazaar 模拟器全链路测试

## 0. 确认本机配置

先运行 `ipconfig` 确认自己电脑的 IPv4 地址。前端配置在 `entry/src/main/ets/service/BackendRuntimeConfig.ets`，后端地址在 Git 忽略的 `backend/api/.env` 中；将前端 `BUSINESS_API_BASE_URL` 和后端 `PUBLIC_BASE_URL` 都设为 `http://电脑IPv4:8080`，并确保后端 `HOST` 监听该地址，然后重新运行 App。业务 API 的 `HOST=0.0.0.0` 仅用于可信的本机/局域网测试，防火墙应只允许模拟器访问 8080。Agent 只监听本机 `127.0.0.1:3000`，模拟器不直接访问它。

后端 `.env` 中的 `DEV_LOGIN_CODE` 是本机随机六位码。测试时在电脑上查看它，不要放进 App 源码或 Git。两个账号可用 `13800000011`、`13800000012`；不会真正发送短信。账号只按手机号区分。

```powershell
# 当前目录：CampusBazaar_Codex/backend/api
(Get-Content .env | Select-String '^DEV_LOGIN_CODE=').Line
```

## 1. 启动两个服务

先确认 `node --version` 至少为 `v24.21.0`。首次安装或更新代码后，在下面两个目录分别运行 `npm ci` 和 `npm run build`；仓库根目录没有 Node lockfile，不要在根目录运行 `npm ci`。然后在两个独立的 PowerShell 窗口启动服务：

```powershell
# 当前目录：CampusBazaar_Codex/backend/api
npm ci
npm run build
npm start
```

```powershell
# 当前目录：CampusBazaar_Codex/backend/agent
npm ci
npm run build
npm start
```

在电脑上检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health/ready
Invoke-RestMethod http://127.0.0.1:3000/health
$PcIpv4 = '替换为你电脑的IPv4地址'
Invoke-RestMethod "http://${PcIpv4}:8080/health/ready"
```

期望业务 API 为 `status: ok`，Agent 为 `modelMode: real`、`modelConfigured: true`、`backendMode: http`。如果 3000/8080 端口已被占用，先停止旧进程，避免误连旧版本。

## 2. 在 DevEco Studio 运行 App

打开仓库工程，启动 HarmonyOS 模拟器，选择 `entry` 的默认运行配置，点击 Run。前端只访问业务 API；若 DevEco 提示签名，按本机调试签名向导配置。

先在模拟器验证它能访问电脑的 `http://电脑IPv4:8080/health/ready`（将“电脑IPv4”替换为实际地址）。若页面登录提示无法连接，核对电脑 IP、模拟器网络、Windows 防火墙、`HOST`、前端 `BUSINESS_API_BASE_URL`，然后重新运行 App。

## 3. 按顺序操作两名用户

| 步骤 | 页面操作 | 期望结果 |
| --- | --- | --- |
| A 登录 | 手机号 `13800000011`，输入后端 `.env` 的 `DEV_LOGIN_CODE` | 显示 A 的用户主页；页面不提供短信发送与 CAS |
| A 发布 | 我是卖家 → 新增商品；名称“高等数学教材”，价格 45 元，类别“教材”，校区“江湾校区”，成色“良好”，选择一张照片 | 发布成功；返回卖家列表后可看到商品和图片 |
| B 登录 | 主页点击“退出”，用 `13800000012` 登录 | B 的用户 ID 与 A 不同；卖家列表不显示 A 的商品 |
| B 浏览 | 我是买家 → 商品流、搜索“高等数学” → 商品详情 | 能看到 A 的商品、45 元、图片和卖家昵称 |
| B 找货 | 买家页点“智能助手”，输入“找 50 元以内的高等数学教材” | Agent 返回推荐商品卡片；点击进入同一个商品详情 |
| B 下单聊天 | 在详情点“立即购买”；打开交易提醒和交易详情，发送一条消息 | 交易状态“待处理”；消息显示 B 发送者身份 |
| A 处理 | B 退出，A 登录 → 交易提醒 → 进入这笔交易，回复消息并点“接受” | A 可读 B 消息；B 重新登录后约 3 秒内可见新消息与“已接受” |
| A 完成 | A 在交易详情点“标记完成” | 交易为“已完成”，输入框只读；B 不可再购买该商品 |
| 持久化 | 停止并重新启动业务 API，A/B 重新登录 | 商品、交易、图片和消息仍在 |

如果不想等图片权限和上传流程，第一轮可先不选照片，先验证登录、商品、Agent、交易和聊天，再单独做带照片的第二轮。Agent 重启后会话暂时不能续聊，重新打开助手发起新会话即可。

## 4. 再做一轮异常与重启检查

- 用错误的本机验证码登录，应提示失败；换回正确验证码后可以登录。
- A 打开自己的商品详情，应看到不可点击的“自己的商品”购买按钮；后端直接购买自己的商品会返回 `403 OWN_PRODUCT`，可运行 `backend/api` 中的 `npm test` 验证该规则。
- 另发布一件尚未售出的测试商品。B 在它的详情页首次购买后不要离开该页，再次点击“立即购买”，应提示商品已有进行中的交易；交易提醒中只能看到一笔有效交易。进行中的商品会从买家商品流隐藏。
- 已完成交易的商品会从买家商品流隐藏；原交易详情仍可从“交易提醒”打开，其消息输入框应只读。后端对此商品再次下单会返回 `409 PRODUCT_SOLD`。
- 只在业务 API 的 PowerShell 窗口按 `Ctrl+C`，然后在 `backend/api` 目录重新运行 `npm start`；不要清空 `.local-data`。重新登录并确认商品、图片、交易、消息仍可查看。Agent 服务重启后请新建聊天会话。

## 5. 故障定位

- **登录报连接错误**：业务 API 8080、电脑 IP、`BackendRuntimeConfig.ets`、防火墙或模拟器网络。
- **能登录但图片不显示**：核对 `.env` 的 `PUBLIC_BASE_URL` 是否是模拟器可访问地址；图片 URL 带 24 小时签名，过期后重新打开列表。
- **Agent 返回 503**：检查 `backend/agent` 的 3000 健康检查、`.env` 中 `MODEL_API_KEY` 与 `MOCK_BACKEND=false`、DeepSeek 网络/余额；查看 Agent 终端的错误码。
- **Agent 没推荐刚发布的商品**：确认商品仍在售，发布时类别与校区正确，搜索需求与标题/类别一致。商品已被进行中的交易占用时不会出现在 Agent 搜索结果。
- **A/B 聊天未同步**：保持交易详情页打开约 3 秒；页面仅在可见期间轮询。终态交易不允许再发消息。

后端自动化回归可在 `backend/api` 执行 `npm test`。测试覆盖权限、并发、幂等、持久化与 Agent 接口契约；模拟器中的相册权限、图片上传、导航和网络仍需按上面步骤手动验收。
