# 三入口 UI 修改与验证记录

日期：2026-10-11。基线：PR #1 的 `57d75d02cb38dcb489cad5339b2a7cd498f19722`。

## 实现

- 保留橙色主题、双列 WaterFlow、方形封面和圆角商品卡片。首页、发布、我的是唯一三个底部入口；发布打开二级页面，返回后保留原入口。
- Main 持有首页商品 ViewModel：首次进入只初始化一次，Navigation 从二级页面恢复可见时刷新。从我的切回首页也刷新。响应序号防止旧结果覆盖；有商品时静默刷新，失败保留商品并提供重试。
- 分类选择不会复制或重新获取列表；保持当前分类。相同数据响应保留原数组和组件；商品数据改变时按仍存在的首个可见商品 ID 恢复位置，该交互仍需设备确认。
- `MarketOptions.ets` 集中定义具体品类、首页分组、四个校区与成色选项。兼容历史数码、生活、出行和单车别名，未知类别留在全部；不使用标题猜测分组。
- 发布强制选择具体品类和规范校区。见面地点仅作为前端表单状态，提交时追加到描述。未增加 API 字段或数据库迁移。
- 照片位于表单顶部，可拍照、相册选择、单张移除，最多三张且可不选。照片横向滚动。主按钮固定；字段错误就地显示，网络和服务错误显示在表单级并保留输入。提交中禁用重复发布。
- 商品卡片标题 14fp、价格 19fp、成色/校区 12fp。无图和图片加载失败使用同一占位。搜索、AI 推荐复用相同卡片；AI 推荐改为随内容增长的单列卡片，移除固定高度。
- 首页消息和我的交易打开同一个交易列表，展示真实 latestMessage；无消息显示状态。筛选和详情统一为待确认、待见面、已完成、已关闭。没有伪造未读标识。
- 商品操作统一为预约交易；自己的商品和已售出商品禁用，预约成功后本详情禁用重复操作，后端仍负责交易冲突校验。
- 退出时清空首页及 AI 状态、使进行中请求失效并清空导航，再进入登录页。主窗口使用系统安全区与键盘 RESIZE 布局。

## 实际验证

环境：macOS arm64；DevEco Studio 本机工具链；Node.js 26.8.2 用于自动化测试；内置 Node.js 18.20.1 用于 Hvigor。

| 项目 | 结果及边界 |
| --- | --- |
| ArkTS 编译、资源编译与 assembleHap | 通过。安装的 SDK 为 HarmonyOS 6.1.1 / API 24（6.1.1.125）；项目 targetSdkVersion 和 compatibleSdkVersion 保持 6.1.0(23)。不等同于 SDK 23 编译或运行验收。 |
| HAP | 生成 `entry/build/default/outputs/default/entry-default-unsigned.hap`。工程未配置调试签名，因此没有签名安装包。 |
| 前端真实 ViewModel 逻辑回归 | 9 项通过。执行源代码的逻辑，服务和 Kit 使用替身，不验证 ArkUI 组件布局。 |
| 业务 API 原有集成回归 | 通过。覆盖照片上传、登录、商品、交易、聊天、Agent 代理契约与重启持久化。Agent 返回由本机测试服务提供。 |
| UI API 契约回归 | 通过。实际 SQLite/HTTP 验证耳机、江湾校区精确查询；见面地点留在描述；预约移出列表、拒绝恢复；真实 latestMessage；买卖账号商品隔离。 |
| 差异检查 | `git diff --check` 通过。未修改 backend 源码、接口、迁移或用户主目录中已有后端工作。 |

### 复现逻辑与 API 回归

先提供 TypeScript 的本机安装路径（也可把 TypeScript 安装在正常 Node 模块搜索路径中）。测试使用 Node.js 24.21.0 或更新版本。

```sh
# macOS DevEco 内置 TypeScript，其他电脑请换成实际路径
export ARK_TYPESCRIPT=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript
node --test scripts/ui-regression.cjs
node scripts/ui-api-regression.cjs
```

API 回归在本机随机端口运行隔离服务；原有测试的递归清理仅在临时编译副本中移除，测试数据和临时编译输出均保留，路径会输出。没有执行批量删除。

## 尚未完成的设备验收

- 本机仅安装 API 24 SDK 和模拟器镜像；`hdc list targets` 返回空。SDK 23 兼容性、配置调试签名和模拟器/真机完整交易回归仍待完成。
- DevEco 界面捕获返回 ScreenCaptureKit -3811，未取得 UI 截图。320/360/390 宽度、大字号、三张照片、返回浏览位置、AI 推荐布局及软键盘搜索/发布/聊天尚未在设备验证。此记录不把代码检查当作截图验收。
- 未调用真实 DeepSeek；耳机找货的 Agent 完整模型场景待联调。已验证 Agent 使用的业务后端精确 category/campus 查询接口。
- 历史宽泛类别、未知自由填写类别与混合校区地点数据没有回写。显示映射不会修复旧数据的 AI 精确检索兼容性，需要单独评估。

## 本地主项目整合验证（2026-10-11）

UI 的两个提交已快进合并到 `CampusBazaar_Codex/main`。合并前对主项目中已有的 20 个修改文件记录 SHA-256；合并后逐一核对，内容全部保留。此次一并提交本地 Agent 的策略、模型工作流、会话状态及相应测试与文档。

- 在主项目目录重新执行 assembleHap：通过，生成未签名 HAP。仍使用本机 API 24 SDK，项目目标保持 API 23，设备验收边界同上。
- 前端 ViewModel 回归：9 项通过。
- Agent `npm test`：10 个测试文件、110 项测试全部通过，使用 Mock 或受控模型响应。
- Agent `npm run typecheck` 与 `npm run build`：通过。
- Agent 依赖按现有锁文件安装，package.json 和 package-lock.json 未改变。
