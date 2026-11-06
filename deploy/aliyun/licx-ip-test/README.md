# 同窗集阿里云用户级生产部署

公开入口为 `https://api.campus-bazzar.work`。现有系统 Caddy 终止 TLS 并转发至 `127.0.0.1:18080`，此处的 Nginx 模板转发到回环 API `18081`，Agent 在回环 `3300`。保留公网 HTTPS 和证书更新所需端口，旧的 IP 明文直连端口不用于发布。

本目录适用于 `/home/licx/campusbazaar` 下的 Ubuntu 用户级服务。源码按版本安装在 `releases/`，服务通过 `current` 指向目标版本。保留 `shared/` 的原数据库、上传文件和私有 env。升级前核对 `systemctl --user cat` 中实际的 `WorkingDirectory` 和 `EnvironmentFile`；旧 drop-in 如果固定了发布目录，需在备份后改为当前目标，邮件凭据可继续由 `shared/env/aliyun-mail.env` 注入。

API 配置 `APP_MODE=production`、`HOST=127.0.0.1`、`PORT=18081`、`PUBLIC_BASE_URL=https://api.campus-bazzar.work` 和 DirectMail。Agent 配置 `NODE_ENV=production`、`PORT=3300`、`MODEL_MODE=real`、`MOCK_BACKEND=false` 与真实模型凭据。两个服务的内部令牌须配对。更新时保留原 `SESSION_SECRET`、数据路径和学校 ID。

服务模板放在 `~/.config/systemd/user/`，Nginx 模板放在 `~/campusbazaar/nginx/nginx.conf`。准备可写的日志及 `tmp/` 路径，将发布包里的用户协议和隐私政策 HTML 放到 `/var/www/tongchuangji/legal/`，确保 Nginx 服务用户可读。管理员为 licx 开启 linger。

完成数据备份、源码构建与配置检查后，先运行 Nginx `-t` 和 `systemctl --user daemon-reload`，再按 API、Agent、Nginx 顺序切换。验证回环服务、HTTPS、协议网页和真实注册后再提交 App。具体核对及回退边界见[上架准备](../../../docs/legal/launch-checklist.md)及[阿里云部署指南](../README.md)。
