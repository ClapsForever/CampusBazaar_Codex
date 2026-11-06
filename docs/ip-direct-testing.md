# 同窗集 HTTPS 接入

App 默认使用 `https://api.campus-bazzar.work`。生产业务 API、Agent 和 Nginx 上游仅在本机回环监听，公网经 HTTPS 反向代理进入。旧直连安装包需要更新为使用生产域名的版本。

## 安装前核对

1. 确认 App 的 `BackendRuntimeConfig.ets` 与 API 的 `PUBLIC_BASE_URL` 使用同一个 HTTPS origin。
2. 执行 `curl --fail --show-error https://api.campus-bazzar.work/health/ready` 确认入口可用。
3. 在 DevEco Studio 构建、配置签名并安装。使用已有邮箱密码登录，或先同意协议再获取注册验证码。App 与生产 API 需使用同一协议版本。
4. 用两个账号验证商品发布、图片读取、搜索、AI 找货、预约和交易消息。

完整构建和上线步骤见[上架准备](legal/launch-checklist.md)。已有阿里云实例的服务路径及回滚信息见[后端更新记录](backend-rollout-2026-11-02.md)和[生产模板](../deploy/aliyun/licx-ip-test/)。
