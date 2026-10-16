# licx 的域名 HTTPS 入口

2026-10-16 当前测试入口已按用户选择改为 `http://101.35.53.59:18080`，保留全部 IP 白名单。前端和 API 的图片公网地址已同步；本页记录的 Caddy 域名入口及证书配置仍保留，但当前 App 不依赖该入口。组员接入与验证范围见 [IP 直连测试说明](../../../docs/ip-direct-testing.md)。

此配置用于 `api.campusbazaar.cn` → `101.35.53.59` 的独立后端。Caddy 仅监听 TCP 443，自动申请和续期 Let's Encrypt 证书，转发到 licx 的 Nginx `127.0.0.1:18080`，最终由业务 API `127.0.0.1:18081` 处理。它不使用 80 端口，不修改队友的入口。

通过 TLS-ALPN-01 验证域名，腾讯云防火墙需允许公网 TCP 443。无需 DNS API 密钥，也无需接管队友的 HTTP 服务。仅开放 TLS 并不开放所有业务访问；Nginx 继续保留已有的来源 IP 白名单。

部署前，licx Nginx 需在其 `server` 中添加 `set_real_ip_from 127.0.0.1;` 和 `real_ip_header X-Real-IP;`，用于识别 HTTPS 入口传递的真实来源，并把 `api.campusbazaar.cn` 加入 `server_name`。在 `http` 层添加以下协议映射，并把该站点的 `proxy_set_header X-Forwarded-Proto` 改为 `$cb_forwarded_proto`；只有来自本机代理的 HTTPS 协议信息会被采信：

```nginx
map "$realip_remote_addr:$http_x_forwarded_proto" $cb_forwarded_proto {
    default $scheme;
    "127.0.0.1:https" https;
}
```

保留原有 `allow` 和 `deny all`，校验配置后只重载 licx 的 Nginx 用户服务。

准备文件与校验过的 Caddy 放在服务器 `/home/licx/campusbazaar/ops/licx-https/`，其中 `caddy.sha256` 记录二进制摘要。检查文件后，在本机终端执行：

```bash
ssh -t -i /Users/llliz/.ssh/campusbazaar_deploy_ed25519 -o IdentitiesOnly=yes licx@101.35.53.59 'sudo bash /home/licx/campusbazaar/ops/licx-https/install-https.sh'
```

管理员权限用于安装专用系统服务，并只向以 licx 身份运行的 Caddy 授予绑定 443 端口所需的能力。API、Agent、Nginx 保持原有用户服务。

验证：

```bash
curl --noproxy '*' https://api.campusbazaar.cn/health/ready
systemctl status campusbazaar-licx-https.service --no-pager
journalctl -u campusbazaar-licx-https.service -n 50 --no-pager
```

验证成功后，将 API 的 `PUBLIC_BASE_URL` 和 App 的 `BUSINESS_API_BASE_URL` 更新为 `https://api.campusbazaar.cn`，重新构建安装 App。当前已采用预置邮箱密码 Demo，固定验证码入口已关闭；自助注册、邮件验证码和找回密码后续接入。

## 2026-10-13 部署记录

- `campusbazaar-licx-https.service` 已启动并设置开机启动，Caddy 2.11.7 自动管理 Let's Encrypt 证书；公网正常域名请求返回 HTTP 200 和 `{"status":"ok"}`，证书校验通过。
- 服务器 `/home/licx/campusbazaar/shared/env/api.env` 中的 `PUBLIC_BASE_URL` 已切换为 `https://api.campusbazaar.cn`，备份原配置后仅重启 licx 的 API。现有商品的签名图片链接使用 HTTPS，图片请求验证为 HTTP 200。
- 前端 `entry/src/main/ets/service/BackendRuntimeConfig.ets` 已使用该 HTTPS 地址，ArkTS 编译及 `assembleHap` 通过。使用已安装的 API 24 SDK，项目目标与兼容版本保持 API 23；产物未签名，需通过自己的 DevEco 签名配置安装到手机。
- 未登录访问业务商品接口返回 HTTP 401；公网内部接口返回 HTTP 404。Nginx 保留来源 IP 白名单，所以新网络可能返回 HTTP 403。腾讯云的 443 入站规则无需逐人添加，但服务器白名单仍需维护。
- 队友的 80 端口和独立 Agent 未改动。licx 的 Agent 进程未重启，原有 18080 测试入口继续存在。

停用新增入口：`sudo systemctl disable --now campusbazaar-licx-https.service`。这不会停止原有的 18080 入口或队友服务。

## 2026-10-14 邮箱 Demo 更新

17:03（北京时间）已更新 licx 的 API 为邮箱密码登录，创建用户指定的三个测试账号，旧验证码路径返回 404。数据库升级到 v3，旧业务数据与图片保留，旧登录会话撤销。按用户要求保持全部原 IP 白名单、监听和云侧规则，仅重载自己的 Nginx 登录路由；Caddy、自己的 Agent 和队友服务的进程与启动时间保持原样。

服务器端经正常域名证书校验的 HTTPS 登录、业务读取、签名图片与退出验证通过。当前 Mac 网络的公网 TLS 连接复核未通过，当前出口也不在原白名单；尚需在已放行网络进行模拟器联调。重新签名安装 `CampusBazaar_Codex` 新版 App 后，登录页填写邮箱和密码。

完整发布、备份、回滚与验证记录见 [Demo 认证说明](../../../docs/demo-auth.md)。
