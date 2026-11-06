# 同窗集上架准备

首个公开版本为 `1.0.0`（版本码 `1000001`，包名 `edu.fudan.campusbazaar`）。App 默认使用 `https://api.campus-bazzar.work`，注册发码与注册提交使用协议版本 `2026-11-06`。

## 构建 App Pack

1. 从项目根目录执行 `node scripts/sync-legal-docs.cjs --check`，确认 App 离线协议与发布网页一致。
2. 在 DevEco Studio 选择 `release` 构建模式，执行 **Build APP(s)**。命令行等价任务为 `hvigorw --mode project -p product=default -p buildMode=release assembleApp --no-daemon`。
3. 用开发者中心中已关联该包名的发布签名签名。支持上传时云签名的 DevEco Studio 可按向导操作；手动签名在本机配置发布证书、Profile 和密钥。使用签名包完成目标设备安装验收。[华为发布应用文档](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-publish-app/)

## 切换后端与协议网页

1. 先保留现有数据库、图片、私有 env、Nginx 配置及两项服务的实际工作目录。参考[阿里云迁移指南](../../deploy/aliyun/README.md)做一致性备份和预演。
2. 生产 API 配置 `APP_MODE=production`，生产 Agent 配置 `NODE_ENV=production`。使用当前两个服务的源码和锁文件构建。保留原会话密钥与数据路径，核对 DirectMail、真实 DeepSeek、配对服务令牌及内部回环地址。[现有实例的生产模板](../../deploy/aliyun/licx-ip-test/)
3. 部署[用户协议与隐私政策网页](web/README.md)，再切换 HTTPS 入口。确认旧明文 IP 入口关闭，并检查现有 systemd drop-in 没有把 API 或 Agent 指回旧发布。
4. 运行 `node deploy/aliyun/smoke.mjs --base-url https://api.campus-bazzar.work --legal-pages --registration-test`。用真实收件邮箱从 App 注册，另用两个审核账号验证商品、图片、AI 找货、预约、聊天及注销申请入口。[审核账号准备](../demo-auth.md)

## 提交前确认

- 在开发者中心核对包名、版本码、发布签名、应用备案、分类及适用资质。匿名打开两份协议页后再填控制台链接。[华为提交指引](https://developer.huawei.com/consumer/cn/app/submit/)
- 账号注销及隐私申请由周墨通过公开邮箱受理。上架前走通邮件申请、身份核验、实际注销及结果反馈。[华为账号注销说明](https://developer.huawei.com/consumer/cn/doc/app/faq-11/)
- 按实际部署核对备份清理和 DeepSeek 数据处理安排。当前业务清理以 365 天为到期标准；若适用《电子商务法》第三十一条，应在公开运行前核对商品、服务和交易信息的留存策略。[电子商务法](https://www.samr.gov.cn/wljys/gzzd/art/2023/art_3e75434c954b4cb9bd14867dacff26d1.html)
