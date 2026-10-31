# 2026-10-28：阿里云 Agent 更新

以下时间均为北京时间。16:59:21 重启 Agent，16:59:23 完成切换验收。

## 当前运行版本

- Agent 服务：`campusbazaar-licx-agent.service`，监听 `127.0.0.1:3300`。
- 源码基准：`7dd371b1a05536cf8d694bdef4fe1e5686bd71ca`。Agent 语义检索改动来自该版本已包含的 `7768bb4`；没有追加应用源码修改。
- 实际工作目录：`/home/licx/campusbazaar/releases/20261028-165055-agent-7dd371b/backend/agent`。
- 覆盖配置：`/home/licx/.config/systemd/user/campusbazaar-licx-agent.service.d/20-agent-release.conf`，内容如下：

```ini
[Service]
WorkingDirectory=/home/licx/campusbazaar/releases/20261028-165055-agent-7dd371b/backend/agent
```

Agent 沿用原私有环境文件、服务间认证、DeepSeek 配置及内存限制。业务 API 继续运行邮件版 `/home/licx/campusbazaar/releases/email-ae19695/backend/api`。API、Nginx 进程号保持不变，数据库及图片目录未参与本次更新；`current` 仍保留 10 月 20 日的历史发布。以后只修改 `current` 不会切换现有 API 或 Agent，必须核对各自覆盖配置。

新发布目录下 `backend/api` 是指向现有邮件版 API 的链接，仅供隔离集成测试和评测导入配套代码，不是 API 服务的新发布。

## 构建与验证

1. 从干净工作区的指定 Git 提交归档 54 个 Agent 跟踪文件，不包含运行环境文件、数据库、图片、依赖目录或旧编译产物。
2. 在服务器新目录按锁文件安装依赖，执行 TypeScript 类型检查、构建和完整 Agent 回归，176 项测试全部通过。语义检索集成测试使用随机回环端口及内存 SQLite。
3. 切换前逐文件核对 54 个归档文件和 19 个编译 JS 摘要；编译文件与本地相同 TypeScript 版本生成的结果完全一致。
4. 使用已有真实模型配置及独立的合成商品库检查六级目标、预算和校区追问、线代简称、夜间阅读需求。部署链路验收确认四轮均返回非空且相关的商品，价格和校区硬条件正确，追问保留需求方向及检索词。该轮使用 8 次真实模型请求，未向正式业务数据库写入账号、商品或 AI 历史。
5. 切换后通过新进程的已认证助手说明接口确认运行新版代码；Agent 为 `modelMode=real`、`backendMode=http`，正式 HTTPS 健康检查返回 200。确认 API 与 Nginx 进程、三个私有环境文件摘要和 `current` 链接保持不变。

本机类型检查通过；最初本机完整测试中 162 项通过，14 项 HTTP 集成测试受沙箱 `listen EPERM` 限制，随后已在服务器独立目录执行全部 176 项并通过。

## 真实模型召回限制

不能把本次部署验收解释为完整召回率通过。首次严格测试要求返回全部预设相关商品：六级目标返回 4 件中的 3 件，阅读照明返回 2 件中的 1 件；线代场景通过。六级前置场景未达到该严格条件，因此首次预算追问用例未执行。

随后单独验证部署链路的非空结果、候选相关性、硬条件及会话继承，并保留原严格测试报告。在该轮中，六级目标返回 4 件中的 1 件，预算与校区追问返回 2 件中的 1 件；线代返回 2 件，阅读照明返回 2 件中的 1 件。该轮没有发现无关候选或硬条件失效，但候选覆盖有波动。

观察到模型生成的 `六级真题` 无法逐字匹配标题 `六级历年真题试卷`，`护眼台灯` 等词也可能漏掉仅含 `小台灯` 的商品。当前数据库仍按生成的词组做文本匹配，未引入向量检索。后续如要提高覆盖率，应另行改进检索词生成或匹配方式并做真实模型评测。本次按用户要求更新现有 Agent，没有借部署追加功能修改。

录制 Demo 前应使用实际演示商品预演；旧内存会话因 Agent 重启失效，需要点击“新对话”，已保存的历史记录仍可回看。

## 运维证据与回退

服务器私有目录：`/home/licx/campusbazaar/ops/20261028-165055-agent-7dd371b/`。其中保存源码包与清单、原服务配置、切换前状态、依赖安装及构建日志、176 项测试 JSON、严格召回报告、部署链路验收报告和 `activation.json`。完整报告留在服务器私有目录，不提交运行密钥或生产数据。

原 Agent 发布完整保留于 `/home/licx/campusbazaar/releases/20261020-aliyun-c3301aa/backend/agent`。需要回退时，将上面的 Agent 覆盖配置的 `WorkingDirectory` 改回该目录，运行 `systemctl --user daemon-reload`，再运行 `systemctl --user restart campusbazaar-licx-agent.service` 并核对健康状态。回退只处理 Agent，保留邮件版 API 及其 v6 数据，不覆盖数据库、环境文件或 `current` 链接。

切换脚本在重启、健康检查或版本核对失败时会恢复原覆盖配置并重启旧 Agent。本次切换成功，未触发回退；没有删除历史发布或批量删除文件。
