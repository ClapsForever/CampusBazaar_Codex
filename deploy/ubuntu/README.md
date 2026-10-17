# 腾讯云 Ubuntu 24.04 部署指南

2026-10-17 licx 现有实例已采用 IP:18080、预置邮箱密码登录、不限来源 IP 的小组测试配置，见 [当前接入与部署记录](../../docs/ip-direct-testing.md) 及 [实际 Nginx 配置](licx-ip-test/nginx.conf)。下文是通用的首次部署指南，其中成员 IP 限制不代表该实例当前策略。

适用：一台 Ubuntu 24.04 LTS、2 核 4 GB、公网 IPv4，无域名，CampusBazaar 小组共同测试。以当前 `CampusBazaar_Codex` 为版本基准；`CampusBazaar_UI` 为历史参考版本，本次邮箱认证修改仅应用到 `CampusBazaar_Codex`。

本目录提供配置模板，并未自动连接或更改你的云服务器。下面命令以首次部署、SSH 用户具有 sudo 权限为前提。所有 `user`、`YOUR_PUBLIC_IPV4`、`YOUR_ADMIN_PUBLIC_IPV4`、`YOUR_MEMBER_PUBLIC_IPV4` 都要替换为实际值。公网访问地址不带 `:8080`。

当前邮箱 Demo 的部署应结合 [Demo 认证说明](../../docs/demo-auth.md) 与 [域名 HTTPS 说明](licx-https/README.md)。本文的 HTTP 初始部署模板仅供受限局域网/运维检查；对小组开放前须采用 HTTPS。

## 1. 项目实际结构与部署边界

```text
同学的 HarmonyOS App
        │ http://服务器公网IPv4（仅允许成员来源 IP）
        ▼
Nginx :80
        ▼
业务 API 127.0.0.1:8080 ─── SQLite / 本地商品图片
        │
        ▼
Pi Agent 127.0.0.1:3000 ─── HTTPS ─── DeepSeek API
        │
        └── 回调业务 API /internal/* 查询商品
```

- 两个服务都采用 Node.js / TypeScript，使用 Node **24.21.0 LTS**，满足 API 的 `engines` 要求。API 使用 `node:sqlite`，无需另装 MySQL、Redis 或数据库服务。
- 2 核 4 GB 可作为少量同学测试的起点；模型在 DeepSeek 运行。这不是并发容量保证，后续应根据 CPU、内存、响应时间和磁盘占用压测。
- 200 Mbps 是带宽峰值，不能直接换算并发人数；检查套餐的月流量、持续带宽规则和系统盘容量。商品图片、备份与日志会持续占用磁盘。
- API 当前只接受 `APP_MODE=local`。不能直接改成 `production`，否则启动失败。systemd 使用 `NODE_ENV=production`，不改变现有登录机制。
- Demo 仅允许管理员预置的邮箱密码账号，固定验证码登录入口已关闭；自助注册和邮件找回密码后续接入。
- HTTP 会明文传输登录令牌和内容，IP 白名单不能提供传输加密。要测试真实资料，先配置 HTTPS，或通过可信 VPN / 加密隧道访问。正式上线采用域名和 HTTPS。

参考：[Node 官方下载](https://nodejs.org/en/download)、[腾讯云安全组规则](https://cloud.tencent.com/document/product/213/112614/)、[Ubuntu 防火墙](https://ubuntu.com/server/docs/firewalls/)。

## 2. 先设置腾讯云入站规则

如果是轻量应用服务器，进入实例的“防火墙”；如果是 CVM，进入实例绑定的“安全组”。检查所有现有入站允许规则，不能同时保留“放通全部端口”。

| 入站 TCP 端口 | 允许来源 | 用途 |
| --- | --- | --- |
| 22 | 管理员当前公网 IP `/32` | SSH，先保留能正常登录的规则 |
| 80 | 各位成员当前公网出口 IP `/32` | 本次 HTTP 测试 |
| 443 | 本次无需开放；配置 HTTPS 时再开放 | 后续 HTTPS |
| 8080、3000 | 不开放 | 两个进程仅监听回环地址 |

“成员公网 IP”是成员所在网络的公网出口，不是电脑上的 `192.168.*`。校园网可能共用出口，切换 Wi-Fi / 手机热点可能改变 IP。IP 经常变化时可选择 VPN，采用域名 HTTPS 并确认预置账号认证生效后，可取消业务入口来源 IP 限制；SSH 与内部端口保持限制。

出站需允许 DNS 和 HTTPS，以便安装依赖、访问 DeepSeek。云防火墙和 Ubuntu 防火墙都必须放行正确的入站来源。

## 3. 在服务器安装基础环境

**以下在服务器执行**：

```bash
ssh user@YOUR_PUBLIC_IPV4
sudo apt update
sudo apt install -y nginx curl ca-certificates xz-utils ufw
free -h
df -h /
uname -m
```

按下面方式安装官方 Node 二进制到固定路径，systemd 不依赖 SSH 会话或 nvm。此步骤只用于首次安装，后续 Node 升级安排维护窗口。

```bash
cb_node_version=24.21.0
case "$(uname -m)" in
  x86_64) cb_node_arch=x64 ;;
  aarch64) cb_node_arch=arm64 ;;
  *) echo '不支持的 CPU 架构，停止此安装步骤'; exit 1 ;;
esac
cb_node_work="$(mktemp -d)"
cd "$cb_node_work"
cb_node_archive="node-v${cb_node_version}-linux-${cb_node_arch}.tar.xz"
curl --fail --show-error --location --remote-name "https://nodejs.org/dist/v${cb_node_version}/${cb_node_archive}"
curl --fail --show-error --location --remote-name "https://nodejs.org/dist/v${cb_node_version}/SHASUMS256.txt"
awk -v file="$cb_node_archive" '$2 == file {print}' SHASUMS256.txt | sha256sum -c -
```

**只有校验结果为 OK 才执行安装**：

```bash
sudo install -d -m 0755 /opt/campusbazaar-node
sudo tar -xJf "$cb_node_archive" -C /opt/campusbazaar-node --strip-components=1
export PATH="/opt/campusbazaar-node/bin:$PATH"
node --version
npm --version
node -e "require('node:sqlite'); console.log('SQLite available')"
```

版本应为 `v24.21.0`，SQLite 应能导入。以后每次重新 SSH、需要运行 npm 时，先执行上面的 `export PATH=...`。systemd 已使用绝对 Node 路径，不需要这条 export。

创建专用运行用户和目录。SSH 用户负责发布源码，后端以无 sudo 权限的 `campusbazaar` 用户运行：

```bash
sudo useradd --system --user-group --home-dir /var/lib/campusbazaar --shell /usr/sbin/nologin campusbazaar
sudo install -d -m 0700 -o campusbazaar -g campusbazaar /var/lib/campusbazaar
sudo install -d -m 0755 -o "$(id -un)" -g "$(id -gn)" /srv/campusbazaar /srv/campusbazaar/releases
mkdir -p /srv/campusbazaar/releases/v1/backend /srv/campusbazaar/releases/v1/deploy/ubuntu
```

这些是首次初始化命令。如果用户或发布目录已存在，先检查原部署，不要重复覆盖。

配置 Ubuntu 防火墙。**先添加 SSH 允许规则，再启用；保留当前 SSH 窗口，并用第二个窗口确认仍能登录**。如果 SSH 使用其他端口，把 22 改为实际端口。

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow proto tcp from YOUR_ADMIN_PUBLIC_IPV4 to any port 22
sudo ufw allow proto tcp from YOUR_MEMBER_PUBLIC_IPV4 to any port 80
sudo ufw status numbered
sudo ufw enable
sudo ufw status verbose
```

为每位成员重复添加 80 的来源规则；已有更宽的允许规则时，先核对并收紧。遇到无法 SSH，使用腾讯云控制台登录检查规则，避免关掉当前唯一的连接。

## 4. 从电脑上传当前源码

**以下在你的 Mac 本地终端执行**。上传后端和本指南即可；不需要把 DevEco、鸿蒙 SDK、签名文件或整个 App 构建环境放到服务器。

```bash
rsync -av \
  --exclude='node_modules/' --exclude='dist/' \
  --exclude='.env' --exclude='.env.*' --exclude='.local-data/' \
  /Users/llliz/Dev/Agent/OpenHarmony/CampusBazaar_Codex/backend/ \
  user@YOUR_PUBLIC_IPV4:/srv/campusbazaar/releases/v1/backend/

rsync -av \
  /Users/llliz/Dev/Agent/OpenHarmony/CampusBazaar_Codex/deploy/ubuntu/ \
  user@YOUR_PUBLIC_IPV4:/srv/campusbazaar/releases/v1/deploy/ubuntu/
```

使用 Windows 的同学可以通过 SFTP 上传这两个目录，排除相同的本地数据和密钥文件。以上方式上传电脑当前的源码；也可以从 GitHub 克隆已提交版本到新的发布目录，确认该版本包含 `deploy/ubuntu`。

**回到服务器执行**。分别安装依赖、构建；构建需要 TypeScript，所以此时不能省略 devDependencies。首次发布目录应没有 `node_modules`。

```bash
export PATH="/opt/campusbazaar-node/bin:$PATH"
cd /srv/campusbazaar/releases/v1/backend/api
npm install --ignore-scripts --no-audit --no-fund --include=dev
npm run build

cd /srv/campusbazaar/releases/v1/backend/agent
npm install --ignore-scripts --no-audit --no-fund --include=dev
npm run build
```

两次构建都成功后继续。不要在项目根目录运行 `npm install --ignore-scripts --no-audit --no-fund`。每次更新都创建新的发布目录，不在运行中的依赖目录内重新安装。

## 5. 生成服务器专用配置

**在服务器执行**：

```bash
sudo /opt/campusbazaar-node/bin/node /srv/campusbazaar/releases/v1/deploy/ubuntu/init-env.mjs
sudo nano /etc/campusbazaar/api.env
```

生成器会自动生成独立的会话密钥、两枚配对的服务令牌。已有配置时拒绝覆盖；源码更新不要重新运行生成器。

在 `api.env` 中将这一行替换为实际服务器公网地址：

```dotenv
PUBLIC_BASE_URL=http://YOUR_PUBLIC_IPV4
```

保留 `HOST=127.0.0.1`、`PORT=8080`、`APP_MODE=local`。数据库和图片路径已设为 `/var/lib/campusbazaar`，不随源码版本变动。

再编辑 Agent 配置：

```bash
sudo nano /etc/campusbazaar/agent.env
```

填写 `MODEL_API_KEY` 为你们的 DeepSeek Key；其余默认使用真实模型和真实业务 API。配置保留项目当前的 `deepseek-chat` 模型名，部署时确认该模型在你们账户可用，并检查模型额度。参考 [DeepSeek 官方文档](https://api-docs.deepseek.com/)。

两枚令牌的关系已经由生成器设置好：

| API 配置 | Agent 配置 |
| --- | --- |
| `AGENT_SERVICE_TOKEN` | `SERVICE_AUTH_TOKEN` |
| `INTERNAL_AGENT_TOKEN` | `BUSINESS_BACKEND_TOKEN` |

配置文件只允许 root 读取，systemd 启动时将它们注入环境。不要把服务器 env 文件上传 Git、复制进 App 或发到群里。给测试同学分配各自邮箱、密码和 HTTPS API 地址。启动前按 [Demo 认证说明](../../docs/demo-auth.md) 在服务身份下导入账号；源码不携带账号凭据。

## 6. 启用 systemd 两个服务

**在服务器执行**：

```bash
sudo ln -s /srv/campusbazaar/releases/v1 /srv/campusbazaar/current
sudo install -m 0644 /srv/campusbazaar/current/deploy/ubuntu/campusbazaar-api.service /etc/systemd/system/campusbazaar-api.service
sudo install -m 0644 /srv/campusbazaar/current/deploy/ubuntu/campusbazaar-agent.service /etc/systemd/system/campusbazaar-agent.service
sudo systemd-analyze verify /etc/systemd/system/campusbazaar-api.service /etc/systemd/system/campusbazaar-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now campusbazaar-api.service
curl --fail --show-error http://127.0.0.1:8080/health/ready
sudo systemctl enable --now campusbazaar-agent.service
curl --fail --show-error http://127.0.0.1:3000/health
```

进程启动可能需要片刻；curl 如果立即失败，先查看状态，等待启动完成再检查。API 健康检查只检查自身数据库，不证明 DeepSeek 或整个 Agent 链路可用。

API 应返回 `status: ok`；Agent 应返回 `status: ok`、`modelMode: real`、`modelConfigured: true`、`backendMode: http`。这些字段也不能代替一次真实 AI 请求验证。

检查状态与日志：

```bash
sudo systemctl status campusbazaar-api.service campusbazaar-agent.service --no-pager
sudo journalctl -u campusbazaar-api.service -u campusbazaar-agent.service -n 100 --no-pager
sudo ss -lntp
```

8080、3000 应只监听 `127.0.0.1`。systemd 会在崩溃时尝试重启、开机启动，SSH 断开后继续运行。模板设置 API 768 MB、Agent 1536 MB 内存上限，作为初始保护值；出现 OOM 时查看原因并根据测量调整。

此部署直接由 systemd 运行 Node，并从 `/etc/campusbazaar` 读配置。不要照搬本机的 `npm start`：API 的 npm start 要求当前目录有 `.env`，这里故意将密钥放在源码目录以外。

## 7. 配置 Nginx 公网入口

**在服务器执行**：

```bash
sudo install -m 0644 /srv/campusbazaar/current/deploy/ubuntu/campusbazaar.nginx.conf /etc/nginx/sites-available/campusbazaar
sudo nano /etc/nginx/sites-available/campusbazaar
```

将 `server_name YOUR_PUBLIC_IPV4;` 改成实际公网 IP，例如 `server_name 203.0.113.10;`。这个示例 IP 不能用于你们服务器。

```bash
sudo ln -s /etc/nginx/sites-available/campusbazaar /etc/nginx/sites-enabled/campusbazaar
sudo nginx -t
```

只有 `nginx -t` 成功才重载：

```bash
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl --fail --show-error -H 'Host: YOUR_PUBLIC_IPV4' http://127.0.0.1/health/ready
```

模板按实际 Host 匹配，可以保留 Ubuntu 默认站点，不需要删除文件。内网 curl 必须使用上面的 Host 请求头；App 使用公网 IP 会自动发送正确的 Host。

模板包含：

- 外部 `/internal/` 返回 404，且清除外部传入的服务身份请求头；Agent 的回调直接走本机 8080，不经过 Nginx。
- `client_max_body_size 6m`，避免默认限制提前拒绝图片；业务 API 仍限制每张原始图片最多 5,000,000 字节。
- 代理读取超时 90 秒，覆盖业务 API 的 75 秒 Agent 请求超时；App 的 AI 请求目前也是 75 秒。
- 普通 API 按来源 IP 限速；登录每 IP 10 次/分钟，允许短时突发。
- AI 每个站点合计 20 次/分钟，最多 4 个同时处理的请求，超出返回 429。作为小组测试初值，可按额度与实测调整。
- 图片仍经过 API 签名/权限校验，不直接映射上传目录。访问日志省略签名 URL 的查询参数。

同学共用校园公网出口时，也会共用按 IP 的登录限速。AI 限速只控制请求频率，不能保证模型费用上限，另需设置账户预算和监控。

参考：[Nginx 代理与超时](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[请求限速](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)、[并发限制](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html)。

## 8. 修改 App 并完成联调

**在本地 DevEco 工程修改** `entry/src/main/ets/service/BackendRuntimeConfig.ets`：

```typescript
export const BUSINESS_API_BASE_URL: string = 'http://YOUR_PUBLIC_IPV4';
```

重新构建并安装 App，每位同学都使用该地址。只修改服务器不会改变已安装 App 中的局域网地址。App 地址与服务器 `PUBLIC_BASE_URL` 必须一致，否则接口正常但图片可能打不开。不要把 Agent 地址或任何服务密钥填进 App。

**在已获允许的成员电脑上检查**：

```bash
curl --fail --show-error http://YOUR_PUBLIC_IPV4/health/ready
curl -i http://YOUR_PUBLIC_IPV4/internal/listings/search
```

分别应为健康 JSON、HTTP 404。直接从公网访问 `:8080`、`:3000` 应失败。

用两个预置邮箱密码账号完成：

1. A 登录，发布包含图片的商品；B 登录，浏览、搜索、查看详情及图片。
2. B 通过 AI 搜索该商品并追问，确认 DeepSeek 实际请求成功，推荐使用云端商品数据。
3. B 创建交易、发消息；A 回复、接受、完成交易，B 刷新确认状态。
4. 在服务器重启 API，确认商品、图片、交易和消息仍存在。
5. 重启 Agent 后重新创建 AI 对话。当前 Agent 会话存在内存，旧 sessionId 可能返回 `SESSION_NOT_FOUND`，不能跨重启续聊。
6. 在维护时间重启服务器，重新检查服务、健康接口和 App。

## 9. 备份、更新与回滚

持久文件位于 `/var/lib/campusbazaar`，密钥位于 `/etc/campusbazaar`。不要把 SQLite、上传目录放进某个发布目录，也不要只备份 SQLite 主文件而忽略 WAL 与图片。

本项目适合先使用短暂暂停 API 的一致性备份。安排没有同学操作的时间，在服务器执行：

```bash
sudo bash /srv/campusbazaar/current/deploy/ubuntu/backup.sh
```

脚本暂停 API，将数据库、图片、配置打包到 `/var/backups/campusbazaar/`，退出时启动 API。Agent 不重启，但备份期间正在进行的 AI 查询可能失败。若备份失败，检查日志和 API 状态；不要使用不完整的压缩包恢复。

压缩包包含 DeepSeek Key 和服务密钥，按敏感文件管理。至少每日备份，并定期通过 SFTP 下载一份到独立设备，限制权限或加密保存；只留在同一台云服务器的备份不能防服务器/磁盘整体丢失。检查磁盘、备份恢复能力、Nginx logrotate 和 journald 占用。清理时逐个确认明确路径，手动一次处理一个文件，不进行批量删除。

更新流程：先备份；创建 `/srv/campusbazaar/releases/v2/backend` 与 `v2/deploy/ubuntu`；按第 4 节上传到 v2 并构建，保留现有 `/etc/campusbazaar`。构建成功后在维护窗口切换：

```bash
readlink -f /srv/campusbazaar/current
sudo systemctl stop campusbazaar-agent.service campusbazaar-api.service
sudo ln -s /srv/campusbazaar/releases/v2 /srv/campusbazaar/current.next
sudo mv -Tf /srv/campusbazaar/current.next /srv/campusbazaar/current
sudo systemctl start campusbazaar-api.service campusbazaar-agent.service
curl --fail --show-error http://127.0.0.1:8080/health/ready
curl --fail --show-error http://127.0.0.1:3000/health
```

`current.next` 应不存在；如果存在，先查明前一次更新状态。以上替换的只是一个明确的软链接，不清理历史目录。若修改了 systemd 或 Nginx 模板，还要重新安装对应配置，运行校验并重载；不要更新或重新生成密钥。

失败时将链接按同样流程切回上一发布目录。仅当数据库结构与上一版兼容时才能只回滚代码；涉及不兼容数据库迁移时，还须在维护窗口恢复迁移前备份。

恢复数据前停止两个服务，将当前数据目录移动到一个新的、明确的保留路径，再从完整备份恢复原目录，保留 `campusbazaar` 所有权。恢复与数据相匹配的 env 配置后再启动。不要直接把备份 SQLite 覆盖到仍含旧 WAL 的目录，也不要删除现有数据后才检查备份。

## 10. 常见故障

| 现象 | 检查顺序 |
| --- | --- |
| 公网健康接口超时 | 本机 API 健康 → Nginx 配置/Host → Ubuntu 防火墙 → 腾讯云入站规则 → 成员当前公网出口 IP |
| 公网显示 Nginx 默认欢迎页 | `server_name` 是否替换为公网 IP；站点软链接和 reload 是否成功 |
| 502 | `systemctl status`；8080 是否启动；env 必填项；数据库目录权限 |
| AI 报错但商品正常 | 本机 Agent 健康；两枚令牌；服务器到 DeepSeek 的 DNS/HTTPS；模型名、Key、余额；Agent 日志 |
| 413 | 图片是否超过业务 API 的 5,000,000 字节；Nginx 是否加载了 6m 限制 |
| 图片打不开 | `PUBLIC_BASE_URL` 是否为公网入口；成员访问权限；图片签名是否过期；uploads 是否存在 |
| 429 | 登录共享 IP 限速或全站 AI 频率/并发限制 |
| 更新后 AI 旧对话无法继续 | 内存会话丢失；在 App 新建会话，后续实现会话持久化 |
| 服务反复重启 | journalctl 查看启动错误/OOM，检查配置与内存；修复后必要时 `systemctl reset-failed` 再启动 |

原生 HarmonyOS App 不受浏览器 CORS 机制约束。后续若增加网页前端，再按明确的网页来源配置 CORS。

## 11. 正式上线前需要完成的工作

先完成以下实际功能和运维准备，再对不特定用户开放：

1. 实现邮箱验证、自助注册及找回密码。增加验证码时效、一次性消费、错误次数限制与滥用防护；校验学校归属，而非所有用户默认进入 `school_demo`。
2. 配置域名、DNS 和自动续期的 HTTPS，将 API `PUBLIC_BASE_URL` 与 App 地址一起改成 `https://...`，重新构建 App。HTTPS IP 证书是否适用需结合签发方及客户端支持评估，本指南采用域名方案。
3. 实现 Agent 会话持久化和过期会话清理，明确模型请求并发与预算限制；接入失败告警、磁盘告警、备份恢复演练。
4. 保持单个业务 API 实例、单个 Agent 实例。当前同步 SQLite 和内存会话不适合直接套用多进程负载均衡；并发写入成为瓶颈时再设计数据库与会话存储迁移。
5. 对图片上传增加用户配额、容量监控，完善内容管理与隐私处理；用实际目标人数进行压测，依据结果决定扩容。

如果服务器位于中国大陆，正式对外提供网站/APP 服务前核对腾讯云要求的域名/APP 备案与接入流程；不要将直接 IP 访问当作正式上线的备案替代方案。腾讯云对仅通过公网 IP 测试与正式服务有不同说明，需按你们服务类型确认：[是否需要备案](https://cloud.tencent.com/document/api/243/19630)、[首次备案](https://cloud.tencent.com/document/api/243/37402)。
