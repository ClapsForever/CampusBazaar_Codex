# 2026-10-20：腾讯云后端迁入阿里云

当前入口：**`http://47.117.96.16:18080`**。业务 API、Pi Agent、SQLite 和图片均由阿里云承载。App 源码已改为新入口，更新后需在 DevEco Studio 重新构建、签名和安装。

腾讯云 `http://101.35.53.59:18080` 暂时通过原 Nginx 转发至阿里云，供旧安装包继续使用；原 API/Agent 已停止并取消自启，旧 Nginx 对 API 的启动依赖也已移除。两种地址最终访问同一个阿里云数据库。腾讯云其他账号的实例未参与迁移，其 80 端口健康检查仍正常。

## 环境与目录

| 项目 | 实际配置 |
| --- | --- |
| 目标 | 阿里云 `47.117.96.16`，Ubuntu 24.04.2、x86_64、约 1.6 GB 内存 |
| SSH / 服务身份 | `licx`；使用 `systemctl --user`，已确认 `Linger=yes` |
| 基础目录 | `/home/licx/campusbazaar` |
| 发布入口 | `/home/licx/campusbazaar/current`，链接到 `releases/` 中的发布目录 |
| 持久数据 | `shared/data/campusbazaar.sqlite`、`shared/data/uploads/` |
| 私有环境 | `shared/env/api.env`、`shared/env/agent.env`，权限 600，父目录 700 |
| Node / Nginx | `runtime/nodejs/bin/node`（24.21.0）、`runtime/nginx/usr/sbin/nginx`（Ubuntu 1.24.0） |
| 端口 | Nginx 公网 18080；API 回环 18081；Agent 回环 3300 |
| 服务模板 | [`deploy/aliyun/licx-ip-test`](../deploy/aliyun/licx-ip-test/) |

保留用户目录部署方式，无需将应用安装为 root。Node/Nginx 从旧机复制，并在目标验证归档及二进制摘要、动态库与实际运行；两个后端都从 npm 官方源按当前锁文件执行 `npm ci --ignore-scripts --no-audit --no-fund --include=dev` 后重新构建，没有复制旧 node_modules。

三个用户服务都已启用。内存上限为 API 256 MB、Agent 640 MB、Nginx 96 MB，整个专用 slice 上限 1100 MB。安全组 TCP 18080 已由用户放行，8080/18081、3000/3300 不作为公网入口。当前沿用 HTTP 小组测试方式，未在此次迁移中签发或迁移 HTTPS 证书。

## 数据迁移与保留

北京时间 **17:17:43** 冻结旧 API/Agent，**17:19:15** 完成新服务启动和旧入口转发，维护约 **92 秒**。原源码是 `4d5dad3`，逐文件核对与该 Git 提交一致；目标运行的后端源码来自最新 `main` 的 `44524e4`，并保留迁移工具在本次提交中的修复。

旧库 schema v3 通过 SQLite backup API 导出，包含已提交 WAL，再迁入阿里云并由最新 API 升级到 v5。升级后、写入验收数据前，对旧库每张表的全部原有列逐行比较，内容完全一致；SQLite 完整性和外键检查通过，三张图片的大小、SHA-256 与源文件一致。

| 原有记录 | 保留数量 |
| --- | ---: |
| 用户 | 7 |
| 商品 | 4 |
| 图片记录及上传文件 | 3 |
| 交易 | 2 |
| 消息 | 4 |
| AI 会话归属 | 8 |
| AI 历史轮次 | 6 |
| 登录会话 | 33 |
| 幂等记录 | 3 |

原账号 ID、密码摘要、学校范围、会话记录及签名密钥保留，没有重置密码。两枚内部服务令牌在阿里云成对重新生成；DeepSeek 配置和 Key 保留。Agent 运行内存中的续聊上下文不属于数据库备份，用户应在“新对话”中继续找货，原历史仍可回看。

目标在网络预检时生成的空数据库已逐表确认无记录，停止服务后另存于 `ops/20261020-aliyun-migration/empty-data-before-restore`，未覆盖或混用旧 WAL。

## 验证结果

- 阿里云实际执行：API 26 项、Agent 150 项、初始迁移工具 8 项全部通过，两套 TypeScript 构建通过，Nginx `-t` 成功。
- 本机公网、腾讯云到阿里云的健康检查均为 200；旧入口转发后健康检查为 200。未登录资料返回 401，公网内部接口和旧验证码登录入口返回 404，匿名空字段注册为 400 `INVALID_EMAIL`。
- 迁入的三个可登录旧账号分别通过临时验收会话读取资料、商品、本人商品、交易和 AI 历史，五段历史详情可读；这些临时会话已移除，不修改旧密码。
- 三张签名图片完整下载并逐字节比较成功，总计 1,231,992 字节。
- 创建一条独立迁移验收账号，完成注册、资料读取、退出、密码重登和一次真实 DeepSeek 找货。AI 返回正常的 `no_results`，新历史保存并可回看；这不代表现有商品一定满足该次查询。
- 验收账号和它产生的新会话、协议记录、AI 历史保留，解释了验收后的总表数增加；凭据只在目标私有运维文件中保存，不输出到聊天或 Git。
- 本次修复了迁移 CLI 经 `current` 目录链接调用时静默跳过的问题，补充回归后迁移工具 9 项测试通过；前端 32 项逻辑回归通过。
- HarmonyOS `assembleHap` 构建成功，产物为未签名 debug HAP；安装前仍需在 DevEco Studio 配置本机签名。

上述验证不代替每位组员在模拟器或真机中的安装验收。

## 备份与运维

两台机器的私有迁移运维目录均为 `/home/licx/campusbazaar/ops/20261020-aliyun-migration/`，权限 700，敏感文件 600。

- 腾讯云保留原发布、原始共享目录、`shared-before.tar.gz`、最终 `final-data/`、`final-data.tar.gz`、原 Nginx 配置及服务配置。
- 阿里云保留最终原始 v3 数据包、恢复后的 v5 数据库、配置与脱敏验收报告：`data-preservation.json`、`configuration-report.json`、`live-verification.json`。
- 最终迁移数据归档 SHA-256：`da3e3c3ab84b36e31b262bfb6ce06fd69b75ded96a5068af37a3ecdb26d4f897`；腾讯云完整共享目录备份：`d19533f6d374296602bc37f527b7d3e1795613e6524ca85463283c9567f80ecd`。
- 这些归档含真实数据或私有配置，不属于源码发布包。数据库、图片、env、SSH 私钥及验收凭据均不提交 GitHub。

阿里云以 `licx` 登录后管理服务：

```bash
systemctl --user status campusbazaar-licx-api.service campusbazaar-licx-agent.service campusbazaar-licx-nginx.service --no-pager
journalctl --user -u campusbazaar-licx-api.service -u campusbazaar-licx-agent.service -n 80 --no-pager
curl -fsS http://127.0.0.1:18080/health/ready
```

发布更新前先保存当前数据库和图片的一致性备份，在新的发布目录安装锁定依赖并构建验证；通过 `current` 链接选择版本，仅重启自己的 API/Agent。迁移 CLI 现已支持经链接目录调用。

阿里云已接收新写入，**不能直接恢复腾讯云旧备份或重启旧 v3 API**。回退必须先冻结阿里云写入，导出最新数据库和图片，在支持 v5 的程序中验证恢复，再切换入口。腾讯云旧入口的转发目前依赖原服务器保留；组员更新安装包后再决定何时停止转发和清理旧备份。
