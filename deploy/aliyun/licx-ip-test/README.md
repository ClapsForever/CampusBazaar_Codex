# 阿里云 licx 用户级部署模板

当前小组测试入口为 `http://47.117.96.16:18080`。实际迁移、数据与备份说明见[2026-10-20 部署记录](../../../docs/aliyun-migration-2026-10-20.md)。

本目录适用于 Ubuntu 24.04、`licx` 用户，以及固定目录 `/home/licx/campusbazaar`。Node 放在 `runtime/nodejs`，Nginx 放在 `runtime/nginx`；业务代码经 `current` 链接选择，env 和数据库独立保存在 `shared` 下。模板中没有运行密钥，不可用示例 env 替换正在使用的私有配置。

三个 `.service` 和 `.slice` 安装到 `~/.config/systemd/user/`；`nginx.conf` 安装到 `~/campusbazaar/nginx/nginx.conf`。Nginx 日志及 `tmp/licx-client`、`tmp/licx-proxy`、`tmp/fastcgi`、`tmp/uwsgi`、`tmp/scgi` 目录须由 licx 创建并具有写权限。配置包含全局 `http` 块，仅供这套独立 Nginx 使用。

```bash
systemctl --user daemon-reload
~/campusbazaar/runtime/nginx/usr/sbin/nginx -p ~/campusbazaar/nginx/ -c ~/campusbazaar/nginx/nginx.conf -e ~/campusbazaar/nginx/logs/error.log -t
systemctl --user enable --now campusbazaar-licx-api.service campusbazaar-licx-agent.service campusbazaar-licx-nginx.service
```

首次安装必须先恢复数据库和图片、核对两份环境配置，再启动服务；`nginx.service` 会通过依赖启动 API，不能用首次启动代替数据恢复。管理员需为 licx 开启 linger，并在安全组中放行公网 TCP 18080。API `HOST=127.0.0.1`、`PORT=18081`，Agent `PORT=3300`，内部互访地址及令牌须配对。

用户级运行无需修改系统 Nginx、占用 80/443 或安装 root 应用服务。正式 HTTPS 部署可参考上级迁移指南；当前模板继续用于已有的 HTTP 小组测试场景。
