# 2026-10-30：线上注册邮件名称统一为同窗集

按用户要求完成现有阿里云业务 API 的邮件品牌名称更新。发件人昵称由 SingleSendMail 的 `FromAlias` 参数指定，本次无需变更阿里云控制台中的发信域名、DNS、发信地址或权限配置。

## 实际更新

- API 服务：`campusbazaar-licx-api.service`。
- 实际目录：`/home/licx/campusbazaar/releases/email-ae19695/backend/api`。
- 只在现有 `src/config.ts`、`src/mailer.ts` 及对应 `dist/src/config.js`、`dist/src/mailer.js` 中替换品牌字符串；未整体部署本地工作区或调整业务逻辑。
- 运行配置：`/home/licx/campusbazaar/shared/env/aliyun-mail.env` 中 `ALIYUN_DM_SENDER_NAME` 改为 `同窗集`，保留原引用格式、权限和其他配置。
- 邮件发件人昵称：同窗集。
- 邮件主题：同窗集注册邮箱验证码。
- 邮件正文中的产品名称：同窗集；验证码、有效期及其他提示不变。
- 重启业务 API 后生效；API PID 由 `102225` 变为 `125834`。

Agent、Nginx 的进程号保持不变；`current` 链接保持原状。未改动非邮件环境文件、发信地址、地域、凭据、会话密钥、服务间令牌、数据库与图片路径。没有执行数据迁移或发送真实邮件。

## 验证

1. 修改前，核对线上四个代码文件和运行中的旧昵称，内网 readiness 为 200。
2. 本机三项邮件回归通过，覆盖默认昵称、官方 SDK HTTP 序列化以及异常日志脱敏。
3. 更新后，运行中 API 的实际进程环境显示昵称为 `同窗集`，其他关键配置逐项与修改前相同。
4. 用服务器实际部署的 `loadConfig` 和 `AliyunVerificationEmailSender`，注入本机模拟发送客户端，断言昵称、主题和正文均为新名称。验证没有调用阿里云发信 API。
5. 内网 `http://127.0.0.1:18081/health/ready` 与从服务器访问正式 `https://api.campus-bazzar.work/health/ready` 均返回 200、`{"status":"ok"}`。
6. 四个线上源码/编译文件的旧名称已消失，均包含新名称。

当前执行环境直接访问公网 HTTPS 曾遇到连接重置，另一个网页读取工具也未能访问；因此 HTTPS 状态按服务器侧访问结果记录，不据此宣称所有客户端网络均已验收。真实收件、收件箱显示与投递延迟未在此次变更中验证；可在 App 中由用户主动获取一次验证码确认。

## 私有备份与回退

服务器备份目录：

```text
/home/licx/campusbazaar/ops/20261030-160237-tongchuangji-mail-brand/
```

该目录权限为 700，保存了五个原文件备份、修改前后摘要、运行验证及结果；含密钥的环境备份权限为 600，仅保存在服务器。不要把备份环境文件或运行诊断日志发到聊天或提交仓库。

回退时根据私有 `before.json` 中的路径和摘要，将对应备份逐个恢复到上述四个代码文件及邮件环境文件，再重启同一个 API 服务并核对健康状态。无需恢复数据库、切换 `current` 或重启 Agent/Nginx。此次更新成功，未触发自动恢复。

官方参数说明：[阿里云 SingleSendMail](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-singlesendmail/)。
