# 邮箱验证码注册（后端）

更新日期：2026-10-23。当前后端已接入阿里云 DirectMail 官方 SDK，采用 schema v6；云端真实邮件配置、投递和鸿蒙验证码 UI 尚待接入验收。未配置邮件时，新注册不可用，旧账号仍可密码登录。

## 当前接口

1. 匿名 `POST /api/v1/auth/email-verifications`，正文 `{"email":"本人邮箱","purpose":"register"}`。
2. 成功接受为 202，返回 `verificationId,expiresAt,expiresIn,resendAfter`，不返回验证码。
3. 用户收到邮件后，匿名 `POST /api/v1/auth/registrations` 提交：

```json
{
  "email": "与发码时相同的邮箱",
  "password": "用户设置的密码",
  "emailVerificationId": "发码接口返回的 ID",
  "emailCode": "用户收到的六位验证码",
  "agreementVersion": "2026-10-23-draft-4",
  "privacyVersion": "2026-10-23-draft-4"
}
```

4. 校验成功后，消费验证码、创建账号、记录协议和签发会话在同一事务完成，返回 201 `{user,token,expiresAt}`。当前用户增加 `emailVerified` 字段；新注册写入 `email_verified_at`，旧账号不补造验证时间。

账号仍接受非学校邮箱；邮箱验证不代表真实身份、学籍或学校授权。改邮箱、旧账号补验、邮件找回密码不在本轮范围。图形验证码路由 `/api/v1/auth/captchas` 继续返回 404，不作为邮箱验证码入口。

## 保护与失败处理

- 六位安全随机验证码、五分钟有效，数据库保存与邮箱、用途及挑战 ID 绑定的 HMAC 摘要。
- 每个挑战最多五次错误，错误计数独立提交，重启不重置；成功消费与注册写入一起提交，注册写入失败不吞掉可重试的验证码。
- 重发替换旧挑战，发送中、发送失败、过期、消费过或被替换的挑战不可用；延迟的旧邮件响应不会覆盖新挑战。
- 同邮箱至少间隔六十秒；另有邮箱小时/日、IP、全局分钟/日预算和存储行数上限。发码失败及已占用邮箱请求也计数。
- 已占用邮箱的发码返回相同 202 形状但不发送邮件，不覆盖原账号。注册的重复邮箱仍返回 `EMAIL_EXISTS`。
- 邮件未配置或供应商失败返回 503，禁止回退到无验证码注册；没有可由环境变量或 HTTP 启用的明文回显、固定码或 mock 服务。测试通过代码注入内存传输替身。
- 新挑战与发码限流行在启动、发码及每分钟维护时清理到期记录；此任务不删除账号、商品、图片、交易、消息或备份。
- 原注册限流继续生效。业务 API 只信任回环反向代理传入的合法 `X-Real-IP`，代理须覆盖该头，不能把 API 端口直接暴露到公网。

错误码、环境变量、阿里云配置和交接表详见 [阿里云邮件配置交接清单](aliyun-email-handoff.md)。

## 客户端待办

当前 `Index.ets`、`AuthViewModel.ets`、`AuthenticationService.ets` 尚未提供邮箱验证码字段；仅协议版本常量及离线草案同步至新版本。旧客户端提交缺码请求会明确失败，不能直接与新后端完成注册。

接入时需增加发码按钮、六位输入框、倒计时，缓存 `verificationId`；修改邮箱/重发时重置相应状态。注册需提交 ID 和验证码，并继续主动同意协议。失败时不要自动重发邮件或清空全部表单。服务端返回 429 时使用 `Retry-After` 或 `retryAfter`，不能只依赖客户端倒计时。

## 运行与验证

在 `backend/api` 安装锁定依赖后执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

仓库根目录可运行：

```sh
node --test scripts/ui-regression.cjs scripts/registration-regression.cjs
node scripts/ui-api-regression.cjs
node --test scripts/registration-flow.cjs
node --test deploy/aliyun/migration.test.mjs
node scripts/sync-legal-docs.cjs --check
```

前端服务替身测试不代表 App 已接入。`registration-flow.cjs` 明确验证旧 App 缺码被拒绝，再通过隔离邮件替身验证新后端注册和实际前端登录；真实投递与真机验收仍需执行交接清单。

数据库从 v5 升级只增加两张表及索引，不改写旧用户、会话、协议、商品、交易、图片和消息。从更早版本先执行原升级再进入 v6。更新前备份实际业务数据；v5 程序不能直接读取 v6 数据库。自动化测试仅使用隔离临时数据和本地传输，不发送真实邮件，不删除测试文件。

## 协议与部署边界

正文版本为 `2026-10-23-draft-4`，仍保留运营主体、权益流程及实际供应商条款待补事项。历史接受记录保持原版本，不替旧用户追填新同意。Markdown 是正文源文件，App 从同步的 rawfile 离线读取：

```sh
node scripts/sync-legal-docs.cjs
node scripts/sync-legal-docs.cjs --check
```

此次源码和测试不等于已更新阿里云服务。云端配置完成、客户端接入、正式 HTTPS、告知及真实投递验收后，才能宣布新注册流程可用。
