# 邮箱验证码注册

更新日期：2026-10-24。后端已接入阿里云 DirectMail 官方 SDK，采用 schema v6；鸿蒙 App 已接入发码、六位验证码、服务端倒计时和验证码注册，默认使用 `https://api.campus-bazzar.work`。正式 API 于 22:06 备份切换，22:29 完成真实 163 邮箱收件、验证码注册、自动登录、退出和密码重登，见 [上线记录](email-registration-rollout-2026-10-24.md)。签名 App 的真机验收尚待完成。未配置邮件时，新注册不可用，旧账号仍可密码登录。

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

## 客户端行为

`Index.ets` 提供发码按钮、六位验证码输入、发送状态、冷却倒计时与错误提示；`AuthenticationService.ets` 匿名发码并在注册时提交挑战 ID、验证码和协议版本。注册成功自动登录，清除密码和验证码。已安装的旧客户端仍须重新构建、签名并更新。

修改邮箱、重发、切换登录或离开页面时清除相应验证状态；迟到响应不能覆盖新邮箱或新请求。发送中禁止重复发送及注册，失败保留密码和协议选择，不自动重发。429 使用 `Retry-After` 或 JSON `retryAfter`，代理没有提供等待时间时保守等待 60 秒。倒计时依据截止时间重算，页面隐藏后恢复也不会从头计时。邮箱大小写及首尾空格变化不使同一邮箱的挑战失效。

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

`registration-regression.cjs` 覆盖验证码校验、并发与迟到响应、邮箱修改、重发失败、服务端冷却和 HTTP 错误解析。`registration-flow.cjs` 通过实际前端 ViewModel 和认证服务调用隔离 HTTP/SQLite 后端，验证发码、错码修正、注册自动登录、退出及密码重登；邮件使用内存传输。真实投递与真机验收仍需执行交接清单。

数据库从 v5 升级只增加两张表及索引，不改写旧用户、会话、协议、商品、交易、图片和消息。从更早版本先执行原升级再进入 v6。更新前备份实际业务数据；v5 程序不能直接读取 v6 数据库。自动化测试仅使用隔离临时数据和本地传输，不发送真实邮件，不删除测试文件。

## 协议与部署边界

正文版本为 `2026-10-23-draft-4`，仍保留运营主体、权益流程及实际供应商条款待补事项。历史接受记录保持原版本，不替旧用户追填新同意。Markdown 是正文源文件，App 从同步的 rawfile 离线读取：

```sh
node scripts/sync-legal-docs.cjs
node scripts/sync-legal-docs.cjs --check
```

阿里云正式 API、客户端源码和 HTTPS 已配套，线上真实邮箱验证码注册链路已经通过。当前构建产物仍须签名安装并完成真机验收，才能确认用户端全链路可用。
