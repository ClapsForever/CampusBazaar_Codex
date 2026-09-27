# CampusBazaar 当前后端任务清单

本清单记录单仓库本机完整链路。部署步骤见[根目录 README](../../README.md)，模拟器逐步验收见 [`e2e-test.md`](e2e-test.md)。

## 已实现

- [x] `backend/api`：本机手机号登录、可撤销会话、权限校验、健康检查。
- [x] SQLite 商品、图片、交易、消息和幂等记录；数据保存在 Git 忽略的 `.local-data/`。
- [x] Agent 代理接口与受令牌保护的三个只读商品/偏好接口。
- [x] `backend/agent`：Pi Agent、DeepSeek 模型适配、HTTP 商品客户端、多轮会话和推荐契约。
- [x] HarmonyOS App 通过业务 API 完成登录、商品、照片、交易、聊天与 Agent 推荐。
- [x] Agent 源码整合进单仓库；移除旧开发网关及前端离线 Mock 运行分支。
- [x] 两服务各自的 `.env.example`、`package-lock.json`、单仓库部署说明和 Git 忽略规则。

## 发布前核验

- [x] 在整合后的 `backend/api`、`backend/agent` 分别运行构建与自动化测试。
- [x] 编译并打包 HarmonyOS App。
- [ ] 在模拟器跑两用户全链路。
- [ ] 检查真实 DeepSeek 找货、推荐卡片及多轮追问。
- [ ] 检查 API 重启后的商品、图片、交易与消息持久化。
- [ ] 暂存后核对文件列表，确认没有密钥、数据库、依赖或构建产物。

## 已知边界

Agent 会话在内存中，重启 Agent 或 App 后需新建对话。学校统一认证、真实短信与公网部署未纳入本机版。
