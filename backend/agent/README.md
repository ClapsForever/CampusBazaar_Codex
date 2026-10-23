# CampusBazaar Pi Agent

这里是 CampusBazaar 的找货 Agent，源码整合自 [`ClapsForever/pi-campus-market-agent`](https://github.com/ClapsForever/pi-campus-market-agent) 的 `3a10cab` 提交。它使用开源 Pi Agent SDK，经 DeepSeek 解析用户需求，并通过业务 API 的受保护接口查询真实商品。该服务与 `backend/api` 同仓库、分进程运行。

## 本机启动

完整的双服务配置见[仓库根目录 README](../../README.md)。在本目录执行：

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# 编辑 .env：填写 DeepSeek Key，并与业务 API 对齐两枚服务令牌
npm run build
npm start
```

`.env` 至少应设置 `MODEL_MODE=real`、`MODEL_PROVIDER=deepseek`、`MODEL_NAME=deepseek-chat`、`MODEL_BASE_URL=https://api.deepseek.com`、`MODEL_API_KEY`、`MOCK_BACKEND=false`、`SERVICE_AUTH_TOKEN`、`BUSINESS_BACKEND_URL=http://127.0.0.1:8080`、`BUSINESS_BACKEND_TOKEN`。服务只监听 `127.0.0.1:3000`，由本机业务 API 调用；App 不直接访问 Agent。

在另一个终端运行 `Invoke-RestMethod http://127.0.0.1:3000/health`，检查 `modelMode: real`、`modelConfigured: true`、`backendMode: http`。内部聊天接口与三个只读工具的契约见 [docs/api.md](docs/api.md)。

## 找货执行流程

每轮采用“需求计划 → 服务端查询 → 结果表述”的受控流程。计划模型只能输出经过 schema 校验的业务意图和筛选条件增量；服务端按意图调用搜索、详情或偏好工具。表述模型接收本轮问题、有效条件与查询结果。两个模型阶段都没有工具调用权限，商品描述不能参与下一步工具选择。

会话独立保存有效筛选条件、上一次展示的商品顺序和搜索页码。用户明确修改或取消条件后才更新；切换品类清除旧品类条件。详情和比较按最近一次展示顺序解析并重新查询后端，推荐卡片只来自本轮有效结果。业务接口或模型故障时不提交本轮状态。

找货是通用的自然语言入口：用户可以说用途、目标、困扰、特征或口语简称，不需要先知道商品名称和分类。模型先输出可能需要的物品方向 `needs`，再生成主题 `keyword` 和相关检索词 `queryTerms`，覆盖同义名称及目标需要的不同物品。具体商品需求补全同义词，目标需求展开多个相关方向，信息确实不足时才追问。正式模型路径不执行 Mock 规则，也没有学科、考试或用途词表白名单。

`queryTerms` 各项取并集，每项内部空格分词取交集；业务 API 在同一次查询中统一执行学校权限、在售状态、预算、校区、成色、版本和排除条件，再去重、排序、分页。每页最多 `MAX_RESULTS` 件，有更多结果时提示说“继续”。会话保存物品方向，支持“不占地方的”“只要其中收纳的”等模糊追问；补充预算和翻页保留方向与检索词，切换主题替换或清除旧内容。回复展示可能需要的物品方向与真实结果。实现与验收说明见[需求理解与语义检索](../../docs/agent-semantic-search-2026-10-23.md)。

金额支持元、块、yuan、RMB 和中文数字，按原文校验；已知上限支持明确减额。“多少钱都行”“新旧都可以”“哪个校区都行”等可取消对应条件。校区简称规范化并区分要求与偏好；成色表示最低等级，九成新以上包含全新；版本从商品关键词中单独提取。

支持“继续／还有其他的吗／第二页”翻页、价格升降序、最便宜一件及明确排除关键词。排序和排除由业务 API 在全体匹配商品上执行后分页。商品名称追问仅依据最新展示的标题和顺序，规划模型不读取商品描述。用途和目标可用于推断相关物品，不能把推断写成用户的预算、校区或版本要求，也不能据此编造商品属性。

交易操作和无关请求返回固定说明及空推荐，保持当前找货条件。意图无法解析或商品指代不明确时先追问。支持教材、键盘、自行车以外的实际商品品类。详细规则及验证场景见 [docs/policy.md](docs/policy.md)。

## 测试与限制

```powershell
npm test
```

测试使用模拟模型或受控模型响应，不消耗 DeepSeek API。语义检索集成测试会在随机回环端口启动真实业务 HTTP 接口，使用隔离的内存 SQLite，检查完整检索链路。Mock 计划器使用有限的确定性规则；真实模式使用模型理解自然语言，再执行相同的服务端策略。实际模型的意图准确率和表述质量仍需单独联调。真实模式通常每轮需要一次计划调用和一次表述调用，无结果、拒绝和澄清使用固定回复。整个流程共用 `TURN_TIMEOUT_MS`，`MAX_TOOL_CALLS` 限制每轮后端读取次数。会话保存在内存；重启 Agent 后需要新建对话。不要提交 `.env` 或 DeepSeek Key。

真实模型改写评测使用 [`evals/paraphrase-cases.json`](evals/paraphrase-cases.json) 中的 53 个场景，另有 7 个前置对话。商品与账号全部为合成数据，业务 API 使用独立内存 SQLite，仅监听随机回环端口；不读写线上业务库，不重启服务。评测核对实际工具输入、商品 ID、会话条件和页码，并保存计划模型的输出。48 个场景检查已有能力，5 个场景探测排序、排除关键词、用途找物和按商品名称追问等扩展需求。

先分别构建 `backend/api` 和 `backend/agent`，再在本目录执行：

```bash
node --env-file=.env scripts/evaluate-paraphrases.mjs --real --output /tmp/campusbazaar-paraphrases.json
```

`--real` 会使用已配置的模型 API；默认最多并发两轮。需要针对性复核时加 `--only search-02,cancel-price-02,page-04`。`--mock` 只适合评测脚本自检，不能用于判断真实模型准确率。失败场景返回非零退出码；完整结果仍写入文件。2026-10-12 的实际结果与问题分析见[改写评测报告](../../docs/agent-paraphrase-evaluation-2026-10-12.md)。

修复后 53 个主场景、[`paraphrase-holdout-cases.json`](evals/paraphrase-holdout-cases.json) 的 20 个独立改写和 6 个诊断场景全部通过，144 项 Agent 回归及 8 项 API 回归通过。上线与代码指纹见[修复验收报告](../../docs/agent-paraphrase-fix-2026-10-12.md)。

通用模糊需求新增 [`evals/fuzzy-needs-cases.json`](evals/fuzzy-needs-cases.json)，覆盖夜间阅读、通勤、线材整理、外出充电、运动准备、宿舍降温、编程资料、网课和衣物收纳。评测只给模型用户原话和历史需求，不提供预设检索词或计划。配置好 `.env` 并构建两个后端后运行 `npm run eval:fuzzy`；结果中的真实商品 ID 与人工期望集合比较。该评测会消耗真实模型 API。本次仅完成自动回归及评测链路自检，没有可用密钥，尚未执行这组在线模型评测。
