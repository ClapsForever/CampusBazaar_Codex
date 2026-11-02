# 2026-10-31：AI 找物召回修复上线

北京时间 15:02:21 完成 Agent 切换及实际商品检索验收。

## 运行版本与发布范围

- 服务：`campusbazaar-licx-agent.service`，回环端口 3300。
- 工作目录：`/home/licx/campusbazaar/releases/20261031-145522-agent-retrieval/backend/agent`。
- 覆盖配置：`/home/licx/.config/systemd/user/campusbazaar-licx-agent.service.d/20-agent-release.conf`。
- 基线：原实际运行目录 `releases/20261028-165055-agent-7dd371b/backend/agent`。在独立目录复制该版本，仅覆盖 `src/agent/service.ts`、`prompts.ts`、`reply.ts`，新增 `retrieval.ts`，并加入对应回归与评测文件。
- 补丁包 SHA-256：`8b3422c5615ca612589af33bb0f1afe5d2006625d75326bab7c1f714a046e48e`。

运行源码差异已核对为上述四个文件；工作区其他待发布改动未进入本次发布。业务 API 继续使用 `releases/email-ae19695/backend/api`，schema 仍为 v6。API、Nginx 进程号、三份私有 env 摘要和 `current` 链接均保持不变。

独立发布目录中的 `backend/api` 是现有邮件版 API 的链接，仅供隔离测试和评测导入，不是新的 API 发布。新旧源码、旧发布和持久数据分别保留。

## 验证

1. 发布前创建私有 SQLite 一致性备份并通过完整性检查，同时备份 8 个上传文件和原配置。备份中有 9 个账号、8 件商品；操作没有重置或导入账号。
2. 按原锁文件安装依赖，在服务器构建并执行完整 Agent 回归，191 项全部通过。本地 192 项的结果来自包含其他待发布会话改动的工作区；本次线上包严格使用线上基线。
3. 四份修复 JS 的 SHA-256 与本地构建一致。使用临时回环端口启动新版本，确认健康状态为真实模型、HTTP 业务后端。
4. 使用线上原有 `deepseek-chat` 配置、合成身份与隔离 SQLite 执行 7 项真实模型场景，全部通过，覆盖用户原话、六级目标、词汇子类、真题、预算与校区、旧会话两种补查，共 16 次模型请求。
5. 切换后通过实际 Agent 接口提交“我快要考六级了，想准备一下，你有什么推荐的资料吗”，成功返回平台中真实可见的“六级资料”，一次请求约 3 秒。此验证只读业务接口，未写入业务数据库中的账号、商品、交易或 AI 历史。
6. Agent、API 和正式 HTTPS `/health/ready` 均正常。Agent PID 从 118228 变为 130615，API PID 125834、Nginx PID 72699 保持原值。

首次构建因准备进程的 384 MB 堆上限失败，未切换服务。重试为构建进程设置 640 MB、单工作进程测试设置 512 MB 后通过；没有改变线上 Agent 原有的内存限制或配置。

App 无需因这次后端更新重新打包。Agent 重启后旧内存会话失效，需点击“新对话”开始；已保存的历史仍可回看。

## 运维证据与回退

服务器私有目录：`/home/licx/campusbazaar/ops/20261031-145522-agent-retrieval/`，包含发布包、清单、配置与数据备份、构建日志、隔离真实模型报告、临时进程检查、`live-verification.json` 和 `activation.json`。其中数据库及配置备份含私有数据，不纳入仓库。

脱敏验收报告另保存于本机 Git 忽略目录 `backend/api/.local-data/20261031-145522-agent-retrieval/`。本次切换脚本已设置自动回退，实际切换和验收成功，未触发回退。

如需回退，在服务器以 `licx` 身份恢复原 Agent 覆盖配置：

```sh
cp /home/licx/campusbazaar/ops/20261031-145522-agent-retrieval/config-backup/20-agent-release.conf /home/licx/.config/systemd/user/campusbazaar-licx-agent.service.d/20-agent-release.conf
systemctl --user daemon-reload
systemctl --user restart campusbazaar-licx-agent.service
curl -fsS http://127.0.0.1:3300/health
```

回退只恢复 Agent 程序，不恢复旧数据库或上传文件，不改动 API、Nginx、env 和入口链接。检索实现及剩余能力边界见 [修复说明](agent-retrieval-fix-2026-10-31.md)。
