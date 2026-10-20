# 邮箱密码 Demo（2026-10-14）

2026-10-20 当前接入更新：licx 后端及完整数据已迁入阿里云，测试入口为 `http://47.117.96.16:18080`，前端和 API 图片公网地址一致；原预置账号密码继续使用，最新 API 也支持自助注册。腾讯云旧地址临时转发到同一套阿里云后端。下文“保留白名单”和 HTTPS 地址属于历史记录，当前接入方式见 [IP 直连测试说明](ip-direct-testing.md)，迁移验证见[阿里云部署记录](aliyun-migration-2026-10-20.md)。

2026-10-18 源码更新：增加任意邮箱自助注册，填写邮箱、密码及确认密码，注册成功自动登录。图形验证码本轮暂时移除并列入[待办清单](legal/launch-checklist.md)，当前不获取或校验验证码，仍保留服务端注册限流；注册需主动同意版本为 `2026-10-18-draft-3` 的用户协议和隐私政策，API 保存用户、版本及同意时间。邮箱仍未验证归属，不代表学生身份。此变更尚需部署新版 API 并安装新版 App，以下历史部署记录不表示已上线注册。

管理员预置账号与密码登录继续可用；登录请求不会自动创建账号，必须通过独立注册表单提交。暂不提供邮件验证码和自助找回密码。运营主体、联系方式、注销与删除流程、数据保存期限尚未确定；当前文档为测试草案，详见[发布前待定清单](legal/launch-checklist.md)。

## 创建和管理账号

需要 Node.js 24.21.0 或更新版本。在 `backend/api` 安装依赖并构建，在 Git 忽略的 `.local-data/demo-accounts.json` 中保存账号数组；使用自己的密码替换示例值。Unix 上将凭据文件权限设为 600。

```json
[
  { "email": "seller@example.com", "password": "ReplaceThisPassword", "nickname": "演示卖家" },
  { "email": "buyer@example.com", "password": "ReplaceThisPassword", "nickname": "演示买家" }
]
```

```bash
npm run build
npm run accounts:import -- .local-data/demo-accounts.json
```

脚本默认读取当前目录 `.env`；只需要 `DATABASE_PATH`、`UPLOAD_DIR` 和可选的 `AGENT_SCHOOL_ID`。没有 `.env` 时默认使用当前目录 `.local-data/campusbazaar.sqlite`、`.local-data/uploads` 和 `school_demo`。执行前确认数据库路径，避免误写另一套实例。

账号导入使用 SQLite 事务，一批全部成功或全部回滚。重复邮箱会报错，不会覆盖已有账号。脚本只输出账号 ID、邮箱和昵称，不输出密码。脚本不启动服务器、不调用模型、不清理任何上传文件。

密码遗忘时由管理员在本机修改凭据文件，然后明确使用重置模式：

```bash
npm run accounts:import -- --reset .local-data/reset-account.json
```

重置文件同样是数组，只列出要重置的邮箱与新密码。此操作只重置已有账号，保留 ID、业务数据及停用状态，撤销该账号全部会话并清除邮箱登录失败限制；没有对应邮箱则整批失败。源码更新时不要再次导入或重置同一组初始密码。

## 认证规则

- 登录：`POST /api/v1/auth/password/sessions`，请求体为 `email,password`。成功返回 `user,token,expiresAt`。
- 邮箱统一去首尾空白、转小写；保留点和加号标签。邮箱在数据库中唯一，管理员导入不代表邮箱所有权已验证，`email_verified_at` 保持空。
- 测试版密码为 6–64 位且不能全部为空白，使用随机盐 scrypt 摘要存储。
- 每邮箱连续失败 5 次后限制 15 分钟；每来源 IP 的登录请求上限为 100 次/15 分钟。限制写入数据库，重启保留；邮箱大小写和空白变体共享限制。并行请求在哈希计算前占用尝试额度。
- API 只信任来自回环连接的 `X-Real-IP`；Nginx 必须覆盖该头，线上 API 保持本机监听。直接访问本机 API 的请求按连接来源限制。
- 旧 `/api/v1/auth/local/sessions` 对所有请求返回 404，旧 `DEV_LOGIN_CODE` 环境变量不再被读取。密码修改必须提供当前密码，不接受验证码替代验证。
- 当前用户接口返回邮箱；公开卖家、交易对方信息不返回邮箱。账号停用（`users.enabled=0`）后已有令牌也不能访问业务接口。
- 登录后的密码修改保留当前会话、撤销其他会话；管理员重置密码撤销全部会话。

## 数据库升级

启动 API 或首次运行账号脚本会把旧数据库升级到统一的 v5。此前 v3 迁移保留用户 ID、原手机号、密码摘要以及商品、图片、交易、消息、偏好和 AI 历史的引用；手机号改为可空，增加邮箱、验证时间、账号停用状态及登录尝试表，撤销 v3 之前签发的会话。v5 同时包含商品下架、交易取消、注册限流和协议同意记录，兼容旧 v3、商品管理 v4 与注册 v4，保留已有邮箱账号、会话和协议记录。当前注册已停用验证码，保留原验证码实现及兼容表；历史验证码行短期到期，并在后续注册请求中按现有清理逻辑清理，不代表当前仍获取或校验验证码。

原手机号账号不会自动分配邮箱。管理员确认原账号归属后，可在导入条目中指定 `existingUserId`，为尚未绑定邮箱的原账号设置邮箱与密码：

```json
[{ "email": "owner@example.com", "password": "ReplaceThisPassword", "existingUserId": "user_REPLACE_WITH_EXISTING_ID" }]
```

原昵称、用户 ID 与业务数据保留。不要根据展示昵称猜测账号归属，也不要用旧固定验证码作为认领证明。

升级前先停止自己的 API 并备份完整数据库和图片目录。旧 API 不支持 v5；回滚必须同时恢复升级前数据库。先用备份副本验证迁移，再更新实际实例。

本版启动不再自动清理过期的未发布图片，认证升级与服务重启不会删除上传文件；存储维护需单独检查明确路径后执行。

## licx 共享服务器部署顺序

1. 备份自己的数据库、图片、API env、Nginx 配置与当前发布路径；不改动队友服务。保留 Agent 实例及其配置。
2. 部署新版 API，停止自己的 API 后，用该实例原有 env（`/home/licx/campusbazaar/shared/env/api.env`）导入账号。服务身份使用 licx，密码文件保存在 Git 忽略且仅 licx 可读的目录。旧 env 中即便保留 `DEV_LOGIN_CODE`，新版也不读取它。
3. 启动自己的 API，使用现有受限 HTTPS 入口验证三个预置账号登录、错误密码拒绝、未预置邮箱拒绝、旧验证码接口 404、商品/图片/交易/消息/历史以及退出登录。登录账号应分别获得不同的用户 ID。
4. 将 Nginx 的旧验证码路径设为 `return 404`，为 `/api/v1/auth/password/sessions` 设置专门的登录限流。继续屏蔽 `/internal/`，保留现有 Agent 并发/频率限制、上传限制与真实来源头处理。
5. 本轮保留所有既有 IP 白名单、端口监听和云侧规则。Nginx 只关闭旧验证码路径并给密码登录路径增加限流；设备准入与不限网络测试方案留待后续决定。API 18081 和 Agent 3300 继续本机监听。
6. App 继续使用 `https://api.campusbazaar.cn`，重新构建、签名、安装。在已放行网络中确认邮箱登录；仅改服务器无法改变旧安装包的手机号登录表单。

服务器已于 2026-10-14 17:03（北京时间）完成本轮邮箱认证部署，IP 白名单保留。详见下方实际部署记录。授予老师演示权限时分配独立账号，演示结束可停用。后续邮件服务可复用邮箱与验证时间字段，增加一次性验证码表和注册/重置密码流程。

## 验证

业务 API 目录执行 `npm test`。项目根目录执行前端与 UI/API 契约回归（需能解析 TypeScript）：

```bash
ARK_TYPESCRIPT="$PWD/backend/api/node_modules/typescript" node --test scripts/ui-regression.cjs
ARK_TYPESCRIPT="$PWD/backend/api/node_modules/typescript" node scripts/ui-api-regression.cjs
```

回归使用独立临时数据库和模拟 Agent，不调用真实 DeepSeek；临时文件保留，不递归删除目录。通过 DevEco 编译安装后，还需要真机/模拟器验证邮箱键盘、个人设置、相册权限和完整交易路径。

## 本机准备记录

- 2026-10-14：业务 API 构建及 12 项测试、16 项前端逻辑测试、2 项 UI/API 业务契约测试通过，`git diff --check` 通过。
- 按用户指定的三个邮箱和密码在本机数据库创建账号，分别验证密码摘要匹配；凭据文件为 Git 忽略的 `backend/api/.local-data/demo-accounts.json`，权限 600，未写入源码或发布包。
- ArkTS 编译及 `assembleHap` 通过，生成 `entry/build/default/outputs/default/entry-default-unsigned.hap`。使用本机 API 24 SDK，项目目标和兼容版本保持 API 23；尚未配置签名或进行设备验收。
- 准备阶段只读核对了 licx 服务器：Node.js 24.21.0，API、Agent、Nginx 均 active，当时线上仍使用旧版认证及 IP 白名单；后续实际发布记录见下方。
- 本机发布包为 `backend/api/.local-data/deploy-email-demo/api-bundle.tar.gz`，SHA-256 为 `1e55bea5e20749d7982ff499a0d4b9a9c57307e6c705b412fc8b3db2b6c38c90`；包含新版 API 源码、编译产物与测试，不含账号文件、真实 env、数据库、图片或依赖目录。
- 先前曾基于实时读取的 licx Nginx 配置生成本机草稿 `backend/api/.local-data/deploy-email-demo/nginx.demo.conf`：18080 改为回环监听、取消此实例来源 IP 白名单、旧验证码路径返回 404、新密码路径使用登录限流，保留内部接口保护和 AI 限制。原配置副本为同目录 `nginx.before.conf`；此不限 IP 草稿未被采用，不能用于本轮部署。实际采用的 `nginx.login-only.conf` 完整保留白名单与监听规则，仅修改登录路由。

## 实际部署：保留白名单的邮箱登录

2026-10-14 17:03（北京时间）部署完成，当前发布为 `/home/licx/campusbazaar/releases/20261014-email-login-1e55bea5e207`。`current` 已指向此目录。用户明确要求保留白名单，本轮未采用设备证书，也未取消或新增 IP 放行规则。

- 先核对线上 API 与本地修改前的 8 个源码文件摘要一致，再用线上数据库的独立快照预演 v2→v3 迁移、创建三账号、业务数据与上传文件保留以及恢复 v2。服务器 Node.js 24.21.0 下 12 项回归测试与 Nginx 原生校验通过。
- 切换前短暂停止自己的 API，备份整个 `shared` 目录和 SQLite；只切换、启动自己的 API，并重载自己的 Nginx。执行脚本约 1.48 秒，无真实模型调用、商品发布或交易写入。
- 保留 4 个旧用户的全部原字段，新增 3 个指定邮箱账号。商品 3 条、图片记录 2 条、交易 1 条、消息 2 条、Agent 会话 3 条的内容摘要与迁移前相同；2 个上传文件的内容摘要也保持一致。旧手机号用户仍保留，但须后续明确绑定邮箱后才能登录；旧交易和历史不会自动归给新的测试账号。
- 三个账号均经服务器端真实域名 TLS 连接验证：登录 201，个人资料、商品、交易和历史接口 200，退出后旧令牌 401。错误密码与未预置邮箱 401；固定验证码入口 404；内部路径 404；匿名业务访问 401；模拟非成员来源访问仍为 403。现有商品的 1 张签名图片经 HTTPS 读取 200，大小 795371 字节。
- 全部原白名单及监听规则逐项一致：127.0.0.1、202.120.235.216、202.120.234.84、220.248.60.53、202.120.234.132、39.144.44.56、117.136.8.193，其他来源仍拒绝。Nginx 仅将旧验证码路由改为 404，并为密码登录路径增加专门限流。
- 自己的 API PID 从 1146154 变为 1424303，异常重启计数为 0。自己的 Agent 824145、Nginx master 410616、HTTPS 1142972，以及队友 API 1396612、Agent 1396645 的 PID、启动时间均与发布前一致，全部 active；自己的 Agent 与队友 80 端口健康检查通过。队友实际目录为 `/home/jinzh/campusbazaar/`，本轮未修改。
- 本机公网复核仍有网络限制：DNS 返回代理虚拟地址，普通请求和直连服务器 IP 的域名 TLS 请求都被重置；尚未完成当前 Mac 网络的外部联调。SSH 观察到当前出口为 39.144.107.148，不在原 Nginx 名单中。服务器端 TLS 校验和登录验证通过，云侧规则、DNS、代理配置与白名单均未改动；模拟器应先在已放行网络运行新版 App。

备份和服务端验证报告保存在私有目录 `/home/licx/campusbazaar/ops/20261014-email-login-1e55bea5e207/`，凭据文件权限 600，不写入源码。本机不含密码的报告为 `backend/api/.local-data/deploy-email-demo/deployed.login-only.json`，已被 Git 忽略。

回滚准备：`shared-before.tar.gz` 保存更新前完整共享数据，`rollback.sqlite` 保存停机时 v2 快照。回滚时先停止自己的 API，通过 SQLite backup API 恢复数据库，再切换到 `/home/licx/campusbazaar/releases/20261014-email-login-recovery-1e55bea5e207` 并恢复、校验、重载原 Nginx 配置，最后启动 API。恢复版本仅关闭了启动时的上传清理，避免回滚删除未发布图片；不需删除 WAL/SHM 文件。原发布目录保持完整。

App 地址仍为 `https://api.campusbazaar.cn`。在 DevEco Studio 打开并重新运行 `CampusBazaar_Codex`，按自己的配置签名安装，才能看到邮箱登录表单；`CampusBazaar_UI` 历史工程未改动。本轮没有模拟器或真机交互验收。
