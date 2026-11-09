# 管理员导入账号

生产用户通过 App 完成邮箱验证码注册。需要提供独立的应用审核账号或处理已确认身份的密码重置时，可使用服务器本机的账号工具。审核账号凭据通过审核后台单独提供。

## 创建和管理账号

需要 Node.js 24.21.0 或更新版本。在 `backend/api` 安装依赖并构建，在 Git 忽略的 `.local-data/review-accounts.json` 中保存账号数组；使用自己的密码替换示例值。Unix 上将凭据文件权限设为 600。

```json
[
  { "email": "seller@example.com", "password": "ReplaceThisPassword", "nickname": "审核卖家" },
  { "email": "buyer@example.com", "password": "ReplaceThisPassword", "nickname": "审核买家" }
]
```

```bash
npm run build
npm run accounts:import -- .local-data/review-accounts.json
```

脚本默认读取当前目录 `.env`；只需要 `DATABASE_PATH`、`UPLOAD_DIR` 和可选的 `AGENT_SCHOOL_ID`。没有 `.env` 时默认使用当前目录 `.local-data/campusbazaar.sqlite`、`.local-data/uploads` 和 `school_demo`。执行前确认数据库路径，避免误写另一套实例。

账号导入使用 SQLite 事务，一批全部成功或全部回滚。重复邮箱会报错，不会覆盖已有账号。脚本只输出账号 ID、邮箱和昵称，不输出密码。脚本不启动服务器、不调用模型、不清理任何上传文件。

密码遗忘时由管理员在本机修改凭据文件，然后明确使用重置模式：

```bash
npm run accounts:import -- --reset .local-data/reset-account.json
```

重置文件同样是数组，只列出要重置的邮箱与新密码。此操作只重置已有账号，保留 ID、业务数据及停用状态，撤销该账号全部会话并清除邮箱登录失败限制；没有对应邮箱则整批失败。源码更新时不要再次导入或重置同一组初始密码。

## 邮件申请与账号注销

由运营人员通过公开邮箱受理，按申请事项核验账号控制权。忘记密码时通过注册邮箱联系，并在核验后使用上面的重置工具。不要向申请人索取密码、验证码或无关证明。注销应在收到申请后 7 日内首次回复，并在 15 个工作日内完成处理。[华为账号注销说明](https://developer.huawei.com/consumer/cn/doc/app/faq-11/)

注销前确认已核验的账号、适用的留存义务及处理范围。使用生产 API 实际配置的 `DATABASE_PATH`，将该账号的邮箱写入仅运营人员可读的 JSON 文件，内容为单个 JSON 字符串，如 `"account@example.com"`。先在测试账号上演练，再预览目标账号的影响范围。预览会回滚数据库变更。

```bash
npm run build
npm run accounts:close -- .local-data/closure-email.json
# 核对预览输出的 userId，确认后将下方 USER_ID 替换为该值。
npm run accounts:close -- .local-data/closure-email.json --apply USER_ID
```

执行后旧会话即失效。工具清除账号登录和资料信息、本人发送的消息、AI 历史及名下商品公开内容，取消进行中的交易，并将图片加入后台清理队列。交易对方仍可查看已有交易快照和自己发送的消息。确认后台清理已处理相关图片，并按适用政策处理备份、供应商记录、交易快照中的个人信息和其他需保留的数据。记录处理结果并邮件告知申请人。
