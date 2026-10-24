# 阿里云 licx 用户级部署模板

当前入口为 `https://api.campus-bazzar.work`，由系统 Caddy 转发到原 Nginx 18080。2026-10-24 邮件版 API 已单独切换，备份、配置和验收见[邮件注册上线记录](../../../docs/email-registration-rollout-2026-10-24.md)；原迁移记录见[2026-10-20 部署记录](../../../docs/aliyun-migration-2026-10-20.md)。

本目录适用于 Ubuntu 24.04、`licx` 用户，以及固定目录 `/home/licx/campusbazaar`。Node 放在 `runtime/nodejs`，Nginx 放在 `runtime/nginx`；业务代码经 `current` 链接选择，env 和数据库独立保存在 `shared` 下。模板中没有运行密钥，不可用示例 env 替换正在使用的私有配置。

实际 API 现另有 `~/.config/systemd/user/campusbazaar-licx-api.service.d/20-email-release.conf`，内容见 `campusbazaar-licx-api-email.conf`：API 工作目录指向固定邮件发布，并在原 `api.env` 后追加 `aliyun-mail.env`。`current` 与 Agent 保留旧发布，因此以后只改 `current` 不会更新 API。安装覆盖配置前先核对发布目录、构建和数据备份；v5 程序不能打开 v6 数据库。

三个 `.service` 和 `.slice` 安装到 `~/.config/systemd/user/`；`nginx.conf` 安装到 `~/campusbazaar/nginx/nginx.conf`。Nginx 日志及 `tmp/licx-client`、`tmp/licx-proxy`、`tmp/fastcgi`、`tmp/uwsgi`、`tmp/scgi` 目录须由 licx 创建并具有写权限。配置包含全局 `http` 块，仅供这套独立 Nginx 使用。

```bash
systemctl --user daemon-reload
~/campusbazaar/runtime/nginx/usr/sbin/nginx -p ~/campusbazaar/nginx/ -c ~/campusbazaar/nginx/nginx.conf -e ~/campusbazaar/nginx/logs/error.log -t
systemctl --user enable --now campusbazaar-licx-api.service campusbazaar-licx-agent.service campusbazaar-licx-nginx.service
```

首次安装必须先恢复数据库和图片、核对两份环境配置，再启动服务；`nginx.service` 会通过依赖启动 API，不能用首次启动代替数据恢复。管理员需为 licx 开启 linger，并在安全组中放行公网 TCP 18080。API `HOST=127.0.0.1`、`PORT=18081`，Agent `PORT=3300`，内部互访地址及令牌须配对。

业务 API、Agent 和 Nginx 保持用户级服务；当前 HTTPS 入口由独立系统 Caddy 服务管理。本目录保留原服务基础模板和 API 邮件发布覆盖配置，不能用旧模板直接覆盖实际部署。
