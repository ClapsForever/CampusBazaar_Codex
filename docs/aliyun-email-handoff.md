# 阿里云邮箱验证码注册：队友配置与交接清单

更新日期：2026-10-24。本文对应 `codex/aliyun-email-verification` 的邮箱验证码实现；客户端已接入，正式 API 于 22:06 备份切换，22:29 已完成真实 163 邮箱收件及验证码注册、自动登录、退出和密码重登，见 [上线记录](email-registration-rollout-2026-10-24.md)。签名 App 的真机验收尚待完成。

2026-10-30：线上发件人昵称、邮件主题和正文名称已统一为“同窗集”，现有域名、发信地址及凭据沿用。验证与回退见[邮件名称更新记录](mail-brand-rollout-2026-10-30.md)。

## 先了解本次范围

- 后端已提供匿名发码与强制邮箱验证码注册，使用阿里云官方 DirectMail SDK 的 `SingleSendMail`。
- 鸿蒙注册页面已增加邮箱验证码输入、发码按钮和倒计时，默认使用正式 HTTPS 域名；需更新安装包并与邮件版 API 配套验收。
- 未配置邮件服务时发码返回 503，新注册不能绕过验证；已有账号继续使用原密码登录，旧账号不会被自动标记为已验证。
- 云端负责人 2026-10-24 的外部交接记录已确认域名验证、HTTPS、专用 RAM 凭据和独立真实收件；该验收未切换正式 API、未完成真实验证码注册。下述云端步骤可用于复核，不能将历史待办视为尚未完成的事实。
- 修改前的代码备份：[GitHub 备份分支](https://github.com/ClapsForever/CampusBazaar_Codex/tree/codex/backup-before-email-verification-20261023)，提交 `7768bb4cc250ed5a098b20cd189a1d464b920440`。这是源码备份，不包含服务器数据库、图片或密钥。

## 一、云端队友需要完成的工作

### 1. 开通 DirectMail，确定地域

- [ ] 在实际运营使用的阿里云账号开通“邮件推送 DirectMail”，完成账号要求的认证。
- [ ] 明确发信地域。面向国内用户可先评估华东1（杭州）；以实际开通和投递情况为准。
- [ ] 配置发信额度、余额/费用告警，检查账号是否受限。免费额度是主账号共 2000 封、每天最多免费 200 封，不是无限期每天免费 200 封。

[开通流程](https://help.aliyun.com/zh/direct-mail/getting-started/simplified-procedure-of-sending-by-api-and-smtp)、[计费说明](https://help.aliyun.com/zh/direct-mail/billing-methods)

### 2. 发信子域名和 DNS

假设持有主域名 `example.com`，建议使用 `notify.example.com` 作为发信子域名。示例不是你们已配置的真实地址。

- [ ] 在 DirectMail 的对应地域添加发信域名。
- [ ] 在实际 DNS 管理控制台添加 DirectMail 提供的所有权验证、SPF、DKIM、DMARC、MX 等实际要求的记录。
- [ ] 每条主机记录和值以控制台为准，不复制他人的 DKIM、TXT 或 MX 值。
- [ ] 等待解析生效，在 DirectMail 点击验证，确认所需项目全部通过。
- [ ] 若主域名已有企业邮箱，使用独立子域名，避免覆盖原有收发信解析；同一主机名的 SPF 记录按官方规则合并。

[发信域名配置](https://help.aliyun.com/zh/direct-mail/user-guide/configurations/)

### 3. 创建触发邮件发信地址

- [ ] 创建例如 `noreply@notify.example.com` 的发信地址，**类型选“触发邮件”**。
- [ ] 确定发件人名称，默认“同窗集”。
- [ ] 若启用发信 IP 防护，确认服务器实际出站 IP 在允许范围内。
- [ ] 该地址用于发信，不因此自动获得收件箱。当前代码关闭回信地址功能；如要接收用户回信，后续另行设置有效回信邮箱并调整代码。

[发信地址配置](https://help.aliyun.com/zh/direct-mail/user-guide/setup-sender-addresses/)

### 4. 配置运行身份与最小权限

优先方案：若服务器支持 ECS 实例 RAM 角色，为实例绑定专用角色，授权发信。应用直接从实例元数据获取并自动刷新临时凭据，不需要保存长期 AccessKey。代码使用 IMDSv2，关闭 IMDSv1 降级；需确认实例的元数据访问设置允许使用 IMDSv2。

若实例类型或组织条件暂不支持，可使用专用 RAM 用户的 AccessKey。只保存在受限服务器配置中，不使用主账号 AccessKey。

应用调用所需的最小权限策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dm:SingleSendMail",
      "Resource": "*"
    }
  ]
}
```

这个接口当前不支持按具体发信地址进行资源级授权，`Resource` 按官方说明使用 `*`。控制台创建域名、发信地址所用的管理身份权限，与应用的运行权限分开配置。

[接口授权说明](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-singlesendmail)、[Node.js 凭据配置](https://help.aliyun.com/zh/sdk/developer-reference/v2-manage-node-js-access-credentials)

### 5. HTTPS、服务器运行配置与代理

- [ ] 正式 API 域名解析到实际入口，安装有效 TLS 证书，完成适用备案/接入要求。
- [ ] 将 `PUBLIC_BASE_URL` 配置为实际 HTTPS API 基址，图片地址也由该基址生成。
- [ ] 业务 API 保持回环监听，Agent 内部服务不对公网开放；Nginx 覆盖 `X-Real-IP`，避免由用户伪造限流来源。
- [ ] 代理放行匿名 `POST /api/v1/auth/email-verifications` 和 `POST /api/v1/auth/registrations`。这两个接口不能要求用户先登录。
- [ ] 给发码接口配置代理限流。仓库内 Nginx 模板已增加相应 location；不能直接覆盖实际实例的域名、端口、证书和其他配置。
- [ ] 确认服务进程能出站访问所选 DirectMail API 的 HTTPS 443，系统时间同步正常。

仓库仍保留 HTTP 测试入口，阿里云邮件模式会拒绝非回环的 HTTP `PUBLIC_BASE_URL`。修改 `.env` 不会自动更新 App 中的 API 地址，也不会自动安装证书。

## 二、直接使用的环境变量

添加到**业务 API** 的私有环境文件，Agent 不需要这些配置。现有 `SESSION_SECRET`、服务令牌、数据库路径等应保留，不要为了开通邮件重新生成。

### 推荐：ECS 实例角色

```dotenv
PUBLIC_BASE_URL=https://api.example.com
EMAIL_PROVIDER=aliyun
EMAIL_SEND_DAILY_LIMIT=200
ALIYUN_DM_REGION_ID=cn-hangzhou
ALIYUN_DM_SENDER=noreply@notify.example.com
ALIYUN_DM_SENDER_NAME=同窗集
ALIYUN_DM_CREDENTIAL_TYPE=ecs_ram_role
ALIYUN_DM_ROLE_NAME=实际绑定的角色名称
```

### 备选：专用 RAM 用户 AccessKey

```dotenv
ALIYUN_DM_CREDENTIAL_TYPE=access_key
ALIBABA_CLOUD_ACCESS_KEY_ID=在服务器填写实际值
ALIBABA_CLOUD_ACCESS_KEY_SECRET=在服务器填写实际值
```

备选方案仍需前面的 `EMAIL_PROVIDER`、地域、发信地址等配置。不要同时误用旧主账号凭据；环境文件应仅对运行用户及必要管理员可读。不要通过命令参数传入密钥，也不要把整份环境文件、配置备份或含密钥的截图发到聊天/GitHub。

当前支持的地域及代码自动选择的公网 Endpoint：

| `ALIYUN_DM_REGION_ID` | Endpoint |
| --- | --- |
| `cn-hangzhou` | `dm.aliyuncs.com` |
| `ap-southeast-1` | `dm.ap-southeast-1.aliyuncs.com` |
| `us-east-1` | `dm.us-east-1.aliyuncs.com` |
| `eu-central-1` | `dm.eu-central-1.aliyuncs.com` |

无需另填 Endpoint 环境变量，代码按地域固定选择；发信地址必须属于同一地域。非默认地域涉及实际处理地域变化，应同步核实隐私告知。

[官方 Endpoint 列表](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-endpoint)

`EMAIL_PROVIDER=disabled` 是示例默认值，用于在未开通邮件时继续使用旧账号。它不允许无验证码注册，也没有控制台回显验证码、万能码或可被 HTTP 开启的 mock 模式。

## 三、队友需要交给代码负责人的信息

下面可以直接复制填写；均为非密钥信息：

```text
阿里云邮件配置交接
1. 主域名：
2. 发信子域名：
3. DirectMail 地域 ID：
4. 发信地址（已创建，触发邮件类型）：
5. 发件人显示名称：
6. 域名验证状态（SPF / DKIM / DMARC / MX 等）：
7. 凭据方式：ECS 实例角色 / 专用 RAM AccessKey
8. 若用实例角色，角色名称及绑定状态：
9. dm:SingleSendMail 权限是否已授权：
10. 若用 AccessKey，服务器配置文件位置及是否已配置：
11. 是否启用发信 IP 防护，出站 IP 是否已放行：
12. 正式 HTTPS API 基址及证书状态：
13. 实际服务器服务名、API 环境文件路径、运行用户：
14. 当前可用发送额度及费用告警负责人：
15. 双方约定的受控测试邮箱（仅用于本人同意的收件测试）：
16. 真实投递测试结果、时间与脱敏供应商请求 ID：
17. 隐私政策待补事实：签约主体、服务地域、邮件/投递记录留存及官方政策链接：
```

代码负责人需要根据这些信息核对环境变量、正式域名和投递结果；真实 AccessKey Secret 由云端负责人安全配置，不必发给代码负责人。实例角色方案无需交接长期 AccessKey。

## 四、代码已经实现的规则

| 规则 | 当前实现 |
| --- | --- |
| 验证码 | 安全随机 6 位数字，保留前导零；5 分钟有效 |
| 存储 | SQLite 保存绑定挑战 ID、邮箱、注册用途的 HMAC 摘要，不存明文验证码 |
| 发送间隔 | 同一邮箱至少 60 秒；服务重启不重置 |
| 邮箱上限 | 每个邮箱每个固定计数窗口最多 5 封/小时、10 封/24 小时 |
| IP 上限 | 每来源 IP 每 15 分钟最多 20 次发码 |
| 全局上限 | 每分钟最多 30 次；每个 24 小时计数窗口默认 200 次，可用 `EMAIL_SEND_DAILY_LIMIT` 调整 |
| 错误次数 | 同一挑战最多 5 次错误，计数写入数据库，耗尽后正确码也不可使用 |
| 重发 | 新请求替换旧挑战；旧邮件晚到也不能用于注册；失败或仍在发送的挑战不能使用 |
| 发送失败 | 返回通用 503，不回退；发送尝试仍计入限额，不自动重复发送 |
| 接口响应 | 不包含验证码；已有邮箱的发码返回相同成功形状，但不再发送注册邮件 |
| 创建账号 | 校验消费、账号、协议记录和会话一起提交，写入失败整体回滚 |
| 清理 | 启动时、发码时和每分钟清除到期验证码及到期限流行；不清理账号、商品、图片、消息或备份 |
| 旧账号 | 不补造验证时间，不覆盖密码；邮箱找回密码、换邮箱和旧账号补验尚未开放 |

24 小时限额从该计数窗口首次请求起算，不是每天零点重置。发送失败及已有账号的请求也计数，因此后台预算与供应商实际计费封数不会完全相同；费用仍以供应商账单为准。

## 五、后端接口与客户端对接

### 获取注册验证码

```http
POST /api/v1/auth/email-verifications
Content-Type: application/json

{"email":"用户自己的邮箱","purpose":"register"}
```

202 响应示例（不保证已进入收件箱）：

```json
{
  "verificationId": "emailv_0123456789abcdef0123456789abcdef",
  "expiresAt": 1790000000000,
  "expiresIn": 300,
  "resendAfter": 60
}
```

客户端需保存本次 `verificationId`，让用户填写邮箱收到的验证码。修改邮箱时清空旧 ID 与验证码；重发后使用新的 ID，倒计时以服务端返回值为准。

### 提交注册

```http
POST /api/v1/auth/registrations
Content-Type: application/json

{
  "email":"与获取验证码时相同的邮箱",
  "password":"用户设置的密码",
  "emailVerificationId":"发码接口返回的 verificationId",
  "emailCode":"用户收到的六位验证码",
  "agreementVersion":"2026-10-23-draft-4",
  "privacyVersion":"2026-10-23-draft-4"
}
```

成功为 201，继续返回 `{user,token,expiresAt}` 并自动登录，当前用户增加 `emailVerified: true`。此版本仍是法律文档草案；注册协议必须主动同意，不以邮件验证替代协议告知。

| HTTP / code | 客户端处理 |
| --- | --- |
| 400 `INVALID_EMAIL` | 提示用户修正邮箱，仅支持单个邮箱地址 |
| 400 `EMAIL_VERIFICATION_REQUIRED` | 获取并填写验证码；旧客户端不得绕过 |
| 400 `EMAIL_CODE_INVALID` | 错误、过期、旧挑战或次数耗尽，提示检查或重新获取 |
| 400 `AGREEMENT_REQUIRED` | 阅读并接受当前版本，再提交 |
| 409 `EMAIL_EXISTS` | 登录现有账号；不覆盖或合并原账号 |
| 429 `EMAIL_SEND_RATE_LIMITED` | 读取 `Retry-After` 响应头或 JSON `retryAfter`，等待后再尝试 |
| 429 `TOO_MANY_ATTEMPTS` | 注册本身触发既有限流，等待后重试 |
| 503 `EMAIL_DELIVERY_UNAVAILABLE` | 邮件未配置或供应商失败，不宣称已送达，不连续自动重试 |

## 六、部署与共同验收

1. 先冻结实际部署版本并备份服务器 SQLite、WAL 一致性数据及图片。GitHub 源码备份不能替代业务数据备份。
2. 在新的发布目录安装锁定依赖并构建；不要只复制旧 `dist`。从 `backend/api` 执行：

   ```sh
   npm ci --ignore-scripts --no-audit --no-fund
   npm run build
   npm test
   ```

3. 在原有私有 API 环境文件增加邮件配置，保留既有会话密钥和业务路径；按实际服务名重启。本仓库 `deploy/aliyun/prepare-config.mjs` 支持继承上述邮件配置，但生成器不等于远程部署。
4. 启动将数据库升级到 v6，保留旧账号、密码、会话、业务数据和图片。旧 v5 API 不能直接打开 v6 数据库；回滚需有配套策略及升级前备份，不能丢弃升级后的新业务写入。
5. 用双方约定且有人实际控制的测试邮箱，在可信 API 客户端按第五节发码、收件并提交注册。不要把密码/验证码放进 URL、截图或共享终端历史。
6. 代码负责人确认响应为 201，`user.emailVerified=true`，登录及 `/api/v1/me` 正常；云端负责人检查投递记录、退信及脱敏请求 ID。
7. 分别验证 QQ、163、Outlook 或实际目标邮箱；查看垃圾箱和延迟。API 接受请求不等于投递成功，不承诺固定到达秒数。
8. 验证错误码、过期、重发旧码失效、连续点击限流，以及旧客户端缺码不能注册。测试会消耗真实邮件额度，请控制次数。
9. App 验证码 UI 接入、HTTPS 地址更新、隐私告知和旧账号补验方案完成后，再安排真机完整注册验收。

只检查路由与强制验证码、不发真实邮件：

```sh
node deploy/aliyun/smoke.mjs --base-url https://api.example.com --registration-test
```

此探针不会完成真实邮箱注册，也不证明邮件配置成功；真实收件与注册仍须执行上面的步骤。

## 七、出现问题时各自检查什么

| 现象 | 代码负责人 | 云端队友 |
| --- | --- | --- |
| 发码 404/401 | 核对请求路径、HTTP 方法、匿名路由及部署版本 | 核对代理是否转发到正确 API，是否错误配置统一登录限制 |
| 发码 503 | 核对 `EMAIL_PROVIDER`、配置加载、服务日志中的脱敏 providerCode | 核对身份权限、地域、发信地址、DNS、IP 防护、额度和服务状态 |
| 202 但收不到 | 核对是否误用已注册邮箱，避免立即连续重试 | 查真实投递状态、退信原因、垃圾箱与收件方拦截 |
| 429 | 按 `retryAfter` 等待，检查是否重复触发请求 | 检查代理限流与应用预算，避免为测试直接移除全部保护 |
| 验证码无效 | 核对邮箱、挑战 ID、验证码、过期、重发和错误次数 | 确认服务器时间；检查是否读到旧邮件 |
| App 无法注册 | 核对已安装版本、HTTPS 地址、发码及验证码提交 | 核对正式 API 发布路径、邮件环境加载及匿名路由 |

邮箱验证仅证明本次可以接收该邮箱的邮件，不代表实名认证、学籍或学校授权。相关公开发布事项仍按法律文件发布清单推进。
