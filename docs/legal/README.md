# 同窗集法律文档

统一版本为 `2026-11-06`，更新日期为 2026-11-06，生效日期为 2026-11-01。

- [用户协议](user-agreement.md)介绍账号、交易、AI 找货和服务范围。
- [隐私政策](privacy-policy.md)说明个人信息处理、保存及权利行使方式。
- [社区与交易规则](community-rules.md)说明发布、禁售、沟通、交易、举报和申诉。
- [网页用户协议](web/user-agreement.html)和[网页隐私政策](web/privacy-policy.html)与 App 共用正文，托管见[网页说明](web/README.md)。

修改正文后，在仓库根目录运行 `node scripts/sync-legal-docs.cjs`，用 `node scripts/sync-legal-docs.cjs --check` 验证 App 离线文本和网页与源文件一致。更新用户协议或隐私政策的版本时，同步 App、API 及部署校验脚本。历史同意记录对应用户接受时展示的文本与版本。
