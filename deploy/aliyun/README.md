# 阿里云迁移准备：保留全部数据

准备日期：2026-10-18。用户已确认：目标尚未购买，先按单台 ECS、Ubuntu 24.04、Node.js 24、Nginx 和 systemd 准备，迁移现有账号、商品、图片、交易、聊天和 AI 历史。本目录的生成器只在指定新目录生成文件，不连接服务器、不购买资源、不切换当前 App 地址。

## 当前方案与准备内容

继续运行一个业务 API（回环 8080）和一个 Agent（回环 3000），复用 [Ubuntu 部署模板](../ubuntu/README.md) 的专用服务用户、systemd 和独立数据目录。业务数据库仍为 SQLite，不在本次预备工作中转换到 RDS、OSS 或多实例。已保存的 AI 历史会迁移；Agent 内存中的续聊上下文无法从数据库恢复，迁移后应新建 AI 对话。

- `/srv/campusbazaar/releases/<版本>/`：源码和构建，`current` 链接选择运行版本。
- `/var/lib/campusbazaar/`：数据库与 uploads，独立于源码，更新程序时不重新初始化。
- `/etc/campusbazaar/`：API/Agent 环境配置，权限 600；密钥不进入源码包或 App。
- 本目录提供源码打包、环境配置生成、数据快照/校验/恢复和公网接口验收工具，均使用项目要求的 Node.js 24.21.0 或更新版本。

## 迁移前需要确定

- [ ] ECS 地域、架构（x86_64 或 ARM64）、公网地址、磁盘空间、SSH 登录用户及已有主机密钥。
- [ ] API 域名、DNS 管理权、证书方式及适用的域名/APP 备案、接入备案。大陆与境外要求不同，应按实际地区确认；已有其他接入商备案也要核实阿里云接入流程。[阿里云备案流程](https://help.aliyun.com/en/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)
- [ ] 旧服务的实际 SQLite 路径、uploads 路径、API/Agent env 路径与停止/启动命令。现有 licx 使用用户级服务，不应套用目标机器的系统级服务名直接停止其他实例。
- [ ] 维护时间、通知对象、可接受停机时长、迁移负责人和旧服务器保留时间。
- [ ] 提供可用的 DeepSeek 配置与额度，核对目标地域到模型接口的连通性。保留原学校 ID，不能把旧数据的学校分组随意更换。

当前程序支持邮箱密码自助注册，图形验证码已转待办；迁移必须包含当前源码及锁文件，不能只复制旧服务器已有的 dist。

## 1. 在本机准备不含数据和密钥的源码包

在仓库根目录执行，输出目录必须不存在，其父目录必须存在：

```powershell
node deploy/aliyun/prepare-release.mjs --output backend/api/.local-data/aliyun-source-01
```

得到 `campusbazaar-source.tar.gz`、`release.json`（含 SHA-256、最低 Node 版本及接口版本信息）和 `source-files.txt`。工具按明确白名单打包两个后端源码、测试、锁文件与部署工具；不包含运行 env、数据库、上传图片、node_modules、dist、签名材料或 Agent 历史评估输出。这是当前工作区快照，包含尚未提交的功能修改。需要更新快照时换一个新输出目录，不覆盖前一份。

通过 SFTP/SCP 上传源码包到新 ECS，校验 SHA-256 与 release.json 一致。只在新的发布目录解压，绝不覆盖运行目录。在服务器上依次于 `backend/api`、`backend/agent` 执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund --include=dev
npm run build
npm test
```

先按通用 Ubuntu 指南安装校验过的 Node.js、Nginx、创建 `campusbazaar` 服务用户和 `/srv/campusbazaar/releases`。目标机器没有迁移数据时可以创建空数据目录；**计划使用下面 restore 工具时，先不要创建 `/var/lib/campusbazaar`，restore 会创建它并拒绝覆盖已有目录。** 不需要 DevEco 或 HarmonyOS SDK，不复制旧机器的 node_modules。

## 2. 生成配置，保留旧会话密钥与学校范围

准备阶段可用示例域名生成临时模板；真实部署时使用最终域名。所有输出目录都必须是新的。下面的旧 env 路径只是占位符，实际执行前替换：

```bash
umask 077
node deploy/aliyun/prepare-config.mjs \
  --output /SECURE/PARENT/aliyun-config-01 \
  --public-base-url https://api.YOUR-DOMAIN.example \
  --previous-api-env /SECURE/PARENT/old-api.env \
  --previous-agent-env /SECURE/PARENT/old-agent.env
```

生成 `env/api.env`、`env/agent.env`、最终 `nginx.conf`、证书申请用 `nginx-bootstrap.conf` 和不含密钥的 `deployment.json`。此操作不会安装服务或修改旧 env。

- API 的 `SESSION_SECRET` 与 `AGENT_SCHOOL_ID` 从旧 API env 保留；因此不会仅因生成新环境而撤销旧会话或改变学校分组。旧会话仍受原过期时间、停用状态及 schema 升级规则限制。
- API/Agent 两枚服务间令牌在新环境中成对生成，不与旧环境混用。
- `MODEL_API_KEY`、模型供应商、名称、接口地址及会话 TTL 可从旧 Agent env 保留。没有提供旧 Agent env 时模型 Key 留空，启动前须在服务器私有配置文件中填写；不通过命令参数发送 Key。
- 数据库和图片路径改为新机 `/var/lib/campusbazaar`；`PUBLIC_BASE_URL` 使用新入口，内部互访保留回环地址。`APP_MODE=local` 是现有 API 唯一支持值，不能擅改为 production。
- 没有传旧 API env 时会生成新会话密钥；保留业务数据仍可重新登录，但旧令牌和图片签名会失效。迁移前应明确选择并记录。

把生成的两份 env 以 root 所有、600 权限安装到 `/etc/campusbazaar`，不要 `source` 不明来源的 env，不要把 env 发到聊天或提交 Git。Windows 上的 chmod 模式不能代替服务器文件权限核验。

## 3. 目标网络与 HTTPS

ECS 安全组与系统防火墙都按实际入口配置：SSH 端口只允许管理员来源；HTTPS 443 按测试/公开范围开放；80 用于 HTTP-01 证书验证及跳转；8080、3000 不对公网开放。保留能使用的 SSH 会话，先验证新规则再收紧旧规则，不提供自动重写防火墙的脚本。[阿里云安全组规则](https://help.aliyun.com/en/ecs/user-guide/security-group-rules)

生成的 Nginx 代理会覆盖真实来源头、清除外部服务身份头、阻止 `/internal/`、限制登录/注册和 AI 请求、允许 6 MB 请求体，并省略访问日志中的查询参数。图片仍由 API 签名校验，不能给 uploads 配置公开静态目录。

HTTPS 配置引用 `/etc/letsencrypt/live/<域名>/fullchain.pem` 与 `privkey.pem`。证书未就绪时先使用 bootstrap 配置（只提供 ACME 文件，其他路径 503）：

```bash
sudo apt install -y certbot
sudo install -d -m 0755 /var/www/letsencrypt
# 将生成的 nginx-bootstrap.conf 安装为新站点，启用后 nginx -t 成功才 reload。
sudo certbot certonly --webroot -w /var/www/letsencrypt -d YOUR_API_DOMAIN
# 证书成功后，将生成的 nginx.conf 替换到该站点；nginx -t 成功才 reload。
sudo certbot renew --dry-run
```

HTTP-01 需要域名已解析到本机并能访问 80；需要切换前预发证书时，可选择自行确认的 DNS-01 方案。当前生成器不配置阿里云 DNS 凭据、不自动改 DNS。证书续期后应配置成功续期的 Nginx reload 钩子，并实际验证自动续期任务。仅受限测试时可以显式 `--allow-http-test --public-base-url http://YOUR_IP`，禁止在明文公网入口使用真实账号或敏感内容。

## 4. 旧机冻结写入，生成完整数据包

先做独立备份，确认旧数据与持久配置的实际路径。在维护窗口停止所有能写入该数据库或上传目录的 API/脚本；用户级旧服务示例为 `systemctl --user stop campusbazaar-licx-api.service`，具体名称先核实。`--confirm-api-stopped` 是操作者确认，工具不能替你检测其他写入进程。

用能够读取旧数据库和图片的服务身份运行，输出父目录应为私有且已存在；**不要把输出放进旧数据目录内**：

```bash
umask 077
node deploy/aliyun/data-bundle.mjs snapshot \
  --database /ACTUAL/OLD/campusbazaar.sqlite \
  --uploads /ACTUAL/OLD/uploads \
  --output /SECURE/PARENT/migration-01 \
  --confirm-api-stopped
node deploy/aliyun/data-bundle.mjs verify --bundle /SECURE/PARENT/migration-01
```

使用 SQLite backup API 生成独立一致性数据库，包含 WAL 中已提交的数据；复制全部上传文件，保留商品图、头像和未绑定图片。manifest 记录数据库 schema、所有业务表的行数、每个数据文件的大小与 SHA-256。校验包含 SQLite 完整性、外键及数据库引用图片是否存在。不会导出内存中的 Agent 续聊状态，也不自动包含 env。

账号密码摘要、会话、商品、交易、消息、AI 历史、偏好及协议记录都在原数据库快照中保留。工具不重置密码、不改 ID、不清空表，也不执行 schema 升级；目标新版 API 首次启动时才按自身规则迁移旧 schema。

迁移目录是敏感数据。通过加密通道传输，单独保存 env，限制备份访问。外层 tar/SFTP 完成后再比对传输前后的包 SHA-256，随后运行目录内部 verify。不要解压不明归档，不把业务数据或旧 env 混入源码发布包。失败时保留不完整目录供核查，不把失败输出当成备份使用。

## 5. 新机校验、恢复到空目录

在新机先 verify，确认与旧机 manifest、表数量和图片数量一致，然后恢复到一个不存在的数据目录：

```bash
node deploy/aliyun/data-bundle.mjs verify --bundle /SECURE/PARENT/migration-01
sudo /opt/campusbazaar-node/bin/node deploy/aliyun/data-bundle.mjs restore \
  --bundle /SECURE/PARENT/migration-01 \
  --destination /var/lib/campusbazaar
sudo chown -R campusbazaar:campusbazaar /var/lib/campusbazaar
sudo chmod 700 /var/lib/campusbazaar
```

目录已存在时 restore 会拒绝。若新机已启动过空 API，不直接覆盖：先停止新机两个服务，确认目录绝对路径及内容，备份并另存现有目录，再选择新的恢复路径或由负责人安排明确的目录切换。数据库和旧 WAL 不能在运行中混合覆盖。

复用通用 Ubuntu 指南的 systemd 单元；新机启动顺序为业务 API、Agent、Nginx。服务启动前再次确认 API 数据路径、图片路径、PUBLIC_BASE_URL、学校范围及两枚成对令牌。先验证 API 健康和 Agent 模式，再做外部验收。API schema 升级前另外保留本次原始数据包，升级后的数据库不能交给不支持该 schema 的旧程序运行。

## 6. 验收后再切换 App／DNS

在新入口完成以下脚本，默认仅访问健康、内部路径和空字段注册探针，不创建账号；空字段探针会占用一次注册限流额度：

```bash
node deploy/aliyun/smoke.mjs --base-url https://YOUR_API_DOMAIN
# 明确选择才创建一条独立测试账号；账号会保留，工具不输出密码/令牌：
node deploy/aliyun/smoke.mjs --base-url https://YOUR_API_DOMAIN --registration-test
```

脚本要求健康 200、外部 internal 路径 404、匿名空字段注册返回 400 INVALID_EMAIL；旧后端的 Bearer 401 或缺路由会明确失败。可选注册测试验证新账号、资料读取、退出和重登。它不能代替真实 AI、上传、交易和历史检查。

- [ ] 迁移前后的账号、商品、图片、交易、消息、AI 历史等表数量核对。首次启动产生的新记录和正常迁移新增空表需单独解释。
- [ ] 用原有账号登录，确认昵称头像、商品图片、聊天、交易状态和 AI 历史可读，密码不需重置。
- [ ] 用两个测试账号验证新注册、图片上传、商品发布/搜索、预约、聊天和完成交易，确认协议版本为 `2026-10-18-draft-2`，无验证码依赖。
- [ ] 验证真实 DeepSeek 新对话及服务重启后的历史回看，检查返回的图片地址为新域名。
- [ ] 验证 HTTPS、证书续期、只监听回环的内部端口、日志轮转、磁盘告警和备份恢复。

当前 App 把旧 IP 写在 `entry/src/main/ets/service/BackendRuntimeConfig.ets`，因此只改 DNS 不会迁移已安装的这版 App。正式切换时将 `BUSINESS_API_BASE_URL` 改为最终 HTTPS 域名，与 API 的 PUBLIC_BASE_URL 一致，重新构建、签名和安装。此后继续沿用稳定域名，后续换 IP 可通过 DNS 完成；旧的 IP 安装包仍需更新。

演练可以用一次旧数据副本，最终切换必须重新冻结旧机写入并导出最终数据，不能让演练期间新旧两侧产生的账号和交易自动合并。最终切换期间旧 API 保持停止写入，直到确认流量和 App 已转向新入口，避免双写分叉。

## 7. 回滚与边界

源程序、原始数据包和旧机保留到验收完成。新机尚未接收正式写入时，可以撤回入口并恢复旧机服务；先核对是否发生过新写入。新机已经接收账号、交易或消息后，不能直接启动旧数据继续服务，否则会丢失新增内容；先冻结新机，导出最新数据，核对 schema 与旧程序兼容性，再制定反向迁移。不存在自动无损合并或一键无损回滚。

准备工具已在本地测试，不代表已在阿里云安装、Nginx 校验、签发证书或完成真实迁移。实际 ECS、域名和访问方式确定后再执行服务器步骤。隐私政策中实际云服务商、处理地域、备份去向和联系主体，应在实际迁移时更新告知；不因增加此目录就宣称当前服务已经迁入阿里云。

## 本地验证工具

```sh
node --test deploy/aliyun/migration.test.mjs
```

测试使用隔离目录、合成账号/消息/图片及本机临时 API；不读取真实数据库或密钥、不连接旧服务器、不购买或配置云资源。

本地验证记录：7 项迁移测试通过，覆盖配置保留与拒绝覆盖、SQLite/WAL 和完整业务记录恢复、图片缺失及校验失败拒绝、路径穿越防护、无密钥源码打包，以及识别旧注册接口 401 和真实注册/重登验收。尚未在目标 Ubuntu/ECS 执行安装、`nginx -t`、systemd 启动、证书签发及真实数据迁移；这些保留为目标环境确定后的验收步骤。
