# 同窗集蓝色 UI 改版记录

2026-11-02。用户确认保留“同窗集”名称和现有蓝色图标，以蓝色统一界面；全部启用页面均在范围内，布局可以调整，操作逻辑保持一致。

## 修改前备份

在首次修改源码之前，完整归档外层 OpenHarmony 工作目录，包括 CampusBazaar_Codex、内外层 Git 历史、未跟踪文件和本地配置。共 19,571 个文件；归档完成后逐文件读取校验，压缩包大小 58,738,412 字节。

- 本地路径：外层工程 `.project-backups/OpenHarmony-before-ui-20261102-192022.tar.gz`。
- SHA-256：`b75f782e96b617e5843143e8660b63b58267d68582d5cfb1dccdc032bae6ef22`。
- SHA 文件与压缩包同目录。备份包含本地环境配置，仅保存在本机，不上传 GitHub。
- 备份不包含服务器运行目录或线上数据库；本轮没有改动和部署后端。

备份文件名是本机备份时间，不作为程序版本标识。需要完整恢复时应解压到新的独立目录核对，不覆盖当前工作目录。

## 改动范围

当前启用目录仍为 `entry/src/main/ets/ui/editorial`，沿用现有路由。变化集中在展示层：

- 统一钴蓝主色、浅蓝选择态、冷白背景及深蓝灰文字；价格、AI、发布和主按钮使用同一蓝色系统。
- 标题采用原生系统字体，统一 24/20/18/16/14/12 fp 层级；取消可见界面的宋体刊头。
- 首页保留双列商品流，重做应用品牌、搜索区、分类选择、白色商品卡片和三入口底部导航。
- ProductCard 新增纯布局参数 compact，搜索和 AI 推荐复用横向卡片。点击仍进入相同商品详情；商品、成色、价格、校区和图片失败状态仍来自原逻辑。
- 登录/验证码注册、商品详情、发布、交易列表、聊天、个人设置与法律页使用统一视觉常量；系统返回、相册/相机操作、原生弹层和键盘处理沿用已有流程。
- 空状态和占位图改为独立 `tc_` SVG 资源，旧 `design_` 资源继续保留。
- 交易待确认改为蓝色；原状态文字和结束条件仍调用原业务 TradeStatusUI。成功/在售保留绿色语义，错误与明确破坏操作保留红色。

原版 pages/views/components/common、ViewModel、服务、模型、业务 API、Agent 和协议正文没有改动。原来的 UI 修改说明和旧截图保留为历史记录；当前规则以本文件和 DESIGN.md 为准。

## 切换与回退

`entry/src/main/ets/ui/UiVariant.ets`：

```ts
export const USE_EDITORIAL_UI: boolean = true;
```

- true：当前蓝色版；false：保留的原 UI。修改后在 DevEco 完整重新运行，热重载当前页面不足以切换入口。
- 回到改版前的校园刊物版：在独立工作副本检出提交 `2465490`，或使用上述完整备份。
- 两版继续共用 bundleName、账号和线上数据，切换 UI 不会回退交易数据，不需要卸载、清库或部署后端。

## 已完成验证

| 检查 | 结果与边界 |
| --- | --- |
| `node scripts/check-editorial-ui.cjs` | 36 个原文件哈希不变；15 组 UI 对照检查保留业务方法、事件、事实文案、输入约束、条件与路由。仅允许精确列举的装饰图标替换和展示颜色辅助方法变化。 |
| `node --test scripts/ui-regression.cjs` | 32 项已有 ViewModel 回归通过，使用本机 SDK 的 TypeScript。 |
| `assembleHap --no-daemon` | 正式工程成功；新旧 UI 均参与 ArkTS 编译，资源打包通过。保留既有异常处理警告。 |
| 正式 HAP 内容检查 | 无 Review 路由、预览夹具 ID、截图或日志；临时预览工程不进入正式包。 |
| 文字对比度 | 次要文字/输入底色 4.64:1，次要文字/页面 4.92:1，白字/主蓝 5.59:1，深蓝/浅蓝 6.54:1。 |

本机 SDK 为 HarmonyOS 6.1.1 / API 24，项目目标仍为 6.1.0 / API 23。本机未配置签名，输出 `entry/build/default/outputs/default/entry-default-unsigned.hap`；unsigned HAP 不代表已完成设备安装验收。

## 原生截图与夹具

截图由 DevEco 原生 Previewer 渲染实际 ArkUI 组件，位于源码之外的 `.impeccable/review`，不是 HTML 概念图。

| 范围 | 截图 |
| --- | --- |
| 首页窄屏、标准与较宽手机 | [320](../.impeccable/review/home-320.jpg) · [360](../.impeccable/review/home-360.jpg) · [390](../.impeccable/review/home-390.jpg) |
| 登录与验证码注册 | [登录 360](../.impeccable/review/login-360.jpg) · [注册 320](../.impeccable/review/register-320.jpg) |
| 我的、发布、设置 | [我的 360](../.impeccable/review/profile-360.jpg) · [发布 360](../.impeccable/review/publish-360.jpg) · [设置 360](../.impeccable/review/settings-360.jpg) |
| 搜索、AI 空对话及推荐 | [搜索 320](../.impeccable/review/search-320.jpg) · [AI 320](../.impeccable/review/agent-320.jpg) · [AI 推荐 320](../.impeccable/review/agent-conversation-320.jpg) |
| 商品、交易、发布管理 | [详情 360](../.impeccable/review/product-360.jpg) · [交易详情 360](../.impeccable/review/trade-360.jpg) · [卖家操作 320](../.impeccable/review/trade-seller-320.jpg) · [交易列表 320](../.impeccable/review/trades-320.jpg) · [我发布的 320](../.impeccable/review/seller-320.jpg) |
| 横向商品与长标题 | [卡片 320](../.impeccable/review/cards-320.jpg) |
| 空状态与错误恢复入口 | [空 320](../.impeccable/review/empty-320.jpg) · [错误 320](../.impeccable/review/error-320.jpg) |

预览使用系统临时目录中的独立工程。商品、卖家、交易和 AI 对话均为布局夹具，未写入正式 App 或后台。首页使用三件无图商品；横向卡片包含无图和无效图片地址，以检查图片失败占位及长标题截断。部分页面为未登录状态，设置页的“请先登录”来自原逻辑。追加的卖家操作截图在临时工程注入卖家身份，仅检查待确认角色按钮和本人消息布局，不是对服务器发起操作。无效图片在卖家列表等原有非 ProductCard 视图中的空白行为未借本轮 UI 修改改变。

空/错误截图已经逐张查看，像素内容有效；捕获脚本的 JPEG 大小阈值在这些简单页面超时，不能把脚本退出码当作布局失败，也不把它当作交互通过。

## 尚未覆盖

没有连接的可用设备；系统大字号、软键盘、拍照/相册、系统弹层、签名安装、真实联网注册、发布和完整交易仍需在目标 SDK 的模拟器或真机验收。静态截图没有验证返回滚动位置、异步刷新或账号隔离，这些继续由已有逻辑回归提供有限证据。注册表单和商品详情的首屏截图不代表全部滚动内容均已人工验收。

独立视觉评审给出一项在售标签对比度修正，现已统一为 5.12:1 的成功色。复审将该项判定为 resolved，disposition: ship；该结论仅限所列静态预览及修正项，不代表设备交互验收。追加卖家待确认截图确认三个操作标签在 320 vp 下完整，本人消息可换行。完整记录见 [评审报告](../.impeccable/review/finish-review.md)。
