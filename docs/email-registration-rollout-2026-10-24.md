# 2026-10-24：App 邮箱验证码接入与线上 API 切换

时间均为北京时间。2026-10-24 22:06:14 开始正式切换，22:06:15 新 API 就绪并完成 Nginx 重载；22:09 完成旧账号与图片读取验收。

## 当前状态

- App 已提供邮箱发码、六位数字输入、发送中状态、服务端冷却倒计时和验证码注册，注册成功自动登录。
- App API 基址为 `https://api.campus-bazzar.work`。邮箱改变、重发及退出注册时清除旧挑战，迟到响应不覆盖新请求；发送失败保留其他表单输入，不自动重发。
- 正式 API 已切到验收提交 `ae19695ad6aafc515dc22008e59eba2cafb4a683`，实际路径为 `/home/licx/campusbazaar/releases/email-ae19695/backend/api`，数据库为 schema v6。
- API 仍为 `campusbazaar-licx-api.service`，依次加载 `shared/env/api.env`、`shared/env/aliyun-mail.env`。后者覆盖邮件变量和 HTTPS 公共基址，原会话密钥、内部令牌、数据库与图片路径保持。
- `/home/licx/campusbazaar/current` 仍指向 `releases/20261020-aliyun-c3301aa`；Agent 保留原发布和原进程，未整体切换链接。旧邮件发布目录没有 Agent 构建产物，不能直接用作整套服务的 `current`。
- Nginx 只新增匿名发码接口的专用代理和登录级限流；Caddy 配置及三个私有环境文件内容未改动。

API 覆盖配置位于 `/home/licx/.config/systemd/user/campusbazaar-licx-api.service.d/20-email-release.conf`，对应仓库模板见 [API 邮件发布覆盖配置](../deploy/aliyun/licx-ip-test/campusbazaar-licx-api-email.conf)。后续更新 API 时，应同时核对这一覆盖配置；仅修改 `current` 不再改变 API 运行版本。

## 备份与数据保留

本次服务器私有运维目录：

```text
/home/licx/campusbazaar/ops/20261024-email-rollout-2200/
```

正式停止 API 后，先完成备份并通过校验，再升级真实数据库和启动新服务。没有使用源码备份替代业务数据备份。

`backup/` 内包含：

- `business-data/`：SQLite backup API 导出的独立 v5 数据库、全部上传文件及带 SHA-256 的 manifest，包含 WAL 中已提交的数据；已执行完整性、外键、图片引用和校验和核验。
- `shared-before.tar.gz`：停写后的原始 shared 目录，包含环境文件、数据库及当时存在的 WAL/SHM。
- `env/`：原 API、Agent 和邮件环境文件副本，权限 600。
- `api.service`、`services.txt`、`nginx.conf`、`Caddyfile`、`current.txt`：原服务、代理配置及发布指向。

`backup-checksums.json` 记录 19 个备份文件的大小和校验和。运维目录权限为 700，备份含真实业务数据和密钥，仅保留在服务器私有目录，不提交仓库或发送聊天。

升级前先在数据库副本上演练 v5→v6；正式升级时逐表比较所有原有行与列，14 张旧表完全一致，8 个上传文件大小及 SHA-256 完全一致。业务记录保留数量：

| 记录 | 数量 |
| --- | ---: |
| 用户 | 8 |
| 商品 | 8 |
| 图片记录及上传文件 | 8 |
| 交易 | 2 |
| 消息 | 4 |
| AI 会话 | 11 |
| AI 轮次 | 9 |
| 原登录会话 | 39 |

逐表证据保存在 `data-preservation.json`，服务切换结果在 `switch-result.json`，读取验收结果在 `acceptance.json`。这些文件位于上述服务器私有目录。

## 验证结果

- 本机前端回归 61 项通过，覆盖注册校验、六位验证码前导零、并发、迟到响应、邮箱切换、重发失败、429 冷却及 JSON/响应头错误解析。
- 实际 ArkTS ViewModel 与认证服务通过隔离 HTTP/SQLite 后端完成发码、错码修正、注册自动登录、资料读取、退出、旧令牌拒绝及密码重登；邮件使用内存替身。
- 邮件 API 在本机和服务器均通过全部 44 项自动测试。服务器 28 个 API 源码、测试、锁文件及备份工具文件与本地 SHA-256 对照一致，并重新构建。
- DevEco `assembleHap` 成功，产物为 `entry/build/default/outputs/default/entry-default-unsigned.hap`。当前工程没有签名配置，安装前仍需在 DevEco 配置本机调试签名。
- 公网 HTTPS 健康检查 200，内部路径 404；空注册请求 400 `INVALID_EMAIL`，缺少验证码的注册请求 400 `EMAIL_VERIFICATION_REQUIRED`。
- 匿名发码路由已由切换前的 401 变为正确的输入校验：空邮箱返回 400 `INVALID_EMAIL`。API 实际进程环境与两份环境文件合并结果一致，邮件提供者为 Aliyun。
- 4 个具备邮箱密码的旧账号通过短期验收会话读取资料、本人商品、交易及 AI 历史，6 张可访问的 HTTPS 签名图片下载后逐字节校验成功。其余历史无密码账号仍逐表保留，不改造其登录能力。
- 临时验收会话已精确移除，39 条原会话保留；核心业务表未被验收修改。Agent 健康正常、模型配置有效，Agent/Nginx 主进程及 Caddy 配置保持原状。

## 22:29 真实 163 邮箱注册验收

云端队友此前已在独立临时 API 上完成真实收件。本次切换后的真实验收使用用户提供并控制的 163 邮箱，先确认该邮箱未注册，通过正式 HTTPS API 发送一封验证码邮件并得到 202，随后用户确认收件并提供六位验证码。

22:29:22 完成真实验收：

- 验证码注册返回 201，`user.emailVerified=true`；使用自动登录令牌读取 `/api/v1/me` 为 200。
- 退出为 200，原令牌再次读取资料为 401。
- 使用生成的随机密码登录为 201，读取资料为 200，返回用户仍为邮箱已验证。
- 数据库写入真实验证时间，挑战已消费且验证码摘要已清空。
- 新增一条正式验收账号，用户总数由上述备份时的 8 条增至 9 条；此为验收新增数据，未覆盖旧账号。

本次随机密码只保存在服务器私有文件 `/home/licx/campusbazaar/ops/20261024-email-rollout-2200/real-email-2224/test-account.private.json`，权限 600；没有输出到聊天、文档或命令日志。验证码通过标准输入提交，本地一次性输入文件已删除。脱敏报告在同目录 `registration-acceptance.json`。

真实收件和注册链路已经完成。尚未安装签名 App 做真机验收，也未验证其他邮箱服务商。后续在新版 App 验证登录、页面交互及主要业务；旧安装包缺少验证码控件，须更新。旧 HTTP IP 入口仍保留，但新包应使用 HTTPS 域名。

## 回退边界

v5 程序不能读取 v6 数据库。出现问题时优先在 v6 兼容版本修复；需要回退前先停止 API、保存最新 v6 数据和配置并确认是否产生新写入。只有确认没有新增业务写入，才能使用本次配套的 v5 一致性备份、原服务和原代理配置恢复；不能仅删除覆盖配置或把 API 指回旧代码，也不能直接用旧备份覆盖升级后的新数据。

当前 `current` 和 Agent 未切换；回退或再次部署时须明确处理 API 的独立覆盖配置。
