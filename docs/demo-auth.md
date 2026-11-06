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
