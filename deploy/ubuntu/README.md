# Ubuntu 系统级生产部署

当前同窗集阿里云实例使用[用户级服务模板](../aliyun/licx-ip-test/)。本页用于需要系统级 systemd 的独立安装，数据迁移和回滚以[阿里云部署指南](../aliyun/README.md)为准。

1. 准备 Ubuntu、Node.js 24.21.0 或更新版本、Nginx、可用域名和 TLS 证书。为服务创建独立的 `campusbazaar` 用户和组，准备仅该用户可写的 `/var/lib/campusbazaar`。
2. 将源码部署到 `/srv/campusbazaar/releases/` 下的版本目录，在两个 `backend` 服务目录分别执行 `npm ci --ignore-scripts --no-audit --no-fund` 和 `npm run build`。把 `/srv/campusbazaar/current` 指向已验证的版本。
3. 使用 `node deploy/aliyun/prepare-config.mjs --output NEW_DIR --public-base-url https://YOUR_PUBLIC_HOST` 生成 HTTPS 模板。把 API 和 Agent 的环境文件安装到 `/etc/campusbazaar`，权限设为 `600`。填入经过验证的 DirectMail 发件配置及 DeepSeek 凭据。升级时保留原数据库、图片路径、会话密钥和学校范围，两个服务的内部令牌须配对。
4. 安装本目录的两个 `.service` 到 `/etc/systemd/system/`。如 Node 不在 `/opt/campusbazaar-node/bin/node`，调整 `ExecStart`。运行 `systemctl daemon-reload`，依次启动 API 和 Agent，并检查日志和回环健康接口。
5. 把生成的 HTTPS `nginx.conf` 安装到站点。将 `docs/legal/web/` 中的两个 HTML 放入 `/var/www/tongchuangji/legal/`，保证 Nginx 可读。执行 `nginx -t` 通过后再重载。公网开放 HTTPS，内部端口仅监听回环。
6. 按[上架准备](../../docs/legal/launch-checklist.md)验证协议页、邮件注册与业务全链路。
