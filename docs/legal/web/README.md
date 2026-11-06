# 上架协议网页

| 控制台字段 | 内容 |
| --- | --- |
| 用户协议链接 | `https://api.campus-bazzar.work/legal/user-agreement.html` |
| 隐私政策链接 | `https://api.campus-bazzar.work/legal/privacy-policy.html` |

[网页用户协议](user-agreement.html)和[网页隐私政策](privacy-policy.html)分别从同名 Markdown 生成。修改源文件后运行 `node scripts/sync-legal-docs.cjs`，同步网页与 App 离线正文。

生产模板为两个 HTML 提供匿名读取入口。部署时把文件复制到 `/var/www/tongchuangji/legal/`，核对 Nginx 可读并执行配置检查。通过 HTTPS 匿名访问两页并确认版本正确后，再填写控制台链接。

- [华为配置用户协议](https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-privacy-user-agreement-0000002282265450)
- [华为隐私政策托管说明](https://developer.huawei.com/consumer/cn/doc/doccenter-submission/agc-help-privacy-policy-faq-0000002342315628)
