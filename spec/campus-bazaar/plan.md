# Implementation Plan: CampusBazaar 校园二手商品交易平台

**Input**: Feature specification from `D:\Dev\DevEco_Repos\spec\campus-bazaar\spec.md` (Rev.3)

## Summary

构建完整可运行的 **HarmonyOS 手机应用** CampusBazaar（包名 `edu.fudan.campusbazaar`，HarmonyOS SDK 6.1.0，API 23，ArkTS + ArkUI）：以「router 登录页 + Navigation 主框架」承载 8 个业务界面，MVVM 分层（pages / views / components / viewmodel / model / service / data / common），State Management V2 驱动 UI；全部业务数据来自内存 `MockDataStore`，经 5 个异步 Service 接口（Authentication / Product / Transaction / Message / Agent）暴露，形成可直接替换为 REST API 的接缝。买家侧提供 WaterFlow 双列商品流、bindSheet 半模态搜索与智能助手面板；卖家侧提供商品发布（CameraPicker 拍照 + PhotoViewPicker 相册选图，最多 3 张，URI 保存）；登录页提供 Mock「获取验证码」流程；交易侧实现 PENDING/ACCEPTED/REJECTED/COMPLETED 状态机（**流转仅由卖家显式操作触发**，含重复购买请求防护）与基础聊天 UI（Mock 自动回复仅追加消息、不改状态；REJECTED/COMPLETED 终态聊天只读）。

## Technical Context

**Language/Version**: ArkTS（HarmonyOS SDK 6.1.0(23)；本机 DevEco 安装为 6.1.1(24)，工程创建脚本按 API 23 生成 `compatibleSdkVersion: 6.1.0(23)`）  
**Primary Dependencies**: ArkUI 声明式范式（Navigation/NavPathStack、bindSheet、WaterFlow、Swiper、List、TextArea 等）；State Management V2（@ObservedV2/@Trace/@Local/@Param/@Monitor）；HarmonyOS Kit 正常使用：@kit.CameraKit（cameraPicker）、@kit.MediaLibraryKit（photoAccessHelper.PhotoViewPicker）、@kit.CoreFileKit（fileUri/fileIo，仅 CameraPicker 沙箱 saveUri 场景）  
**State Management**: State Management V2（全新工程，官方推荐；ViewModel 与可变模型使用 @ObservedV2 + @Trace，页面组件使用 @Local + @Param）  
**Storage**: 内存 Mock（`data/MockDataStore.ets` 单例）；不持久化，应用重启恢复初始种子数据；商品照片以 URI 字符串保存（photo:// 或 file://），预置商品使用 `mock:` 前缀资源键  
**Testing**: `arkts_check` 静态检查全部 .ets 文件；`build_project` 编译生成 HAP；HarmonyOS 模拟器部署 + 核心流程 UI 验证（SDD Phase 5）  
**Target Platform**: **HarmonyOS 手机**（HarmonyOS SDK 6.1.0，API 23）；最终验收以 **HarmonyOS API 23 模拟器**能够成功编译、安装并运行为标准（Phase 5 检查已连接模拟器并部署启动）  
**Project Type**: mobile-app（单 entry 模块 HAP，无 feature 模块、无网络权限、无 requestPermissions）  
**Performance Goals**: 商品流/列表滚动流畅（Mock 数据 ≤ 50 条，WaterFlow/List 懒加载即可满足）；Service 异步返回模拟真实 API 延迟（≤ 300ms）  
**Constraints**: 离线可用（无任何网络调用）；不申请任何权限（Picker 方案）；任何页面状态不得白屏/闪退（loading/empty/error 全覆盖）；遵循 HarmonyOS HIG（安全区、返回手势、触控热区 ≥ 48vp）  
**Scale/Scope**: 约 30 个 ArkTS 文件；2 个 @Entry 页面（登录页、Navigation 宿主页）+ 6 个 NavDestination 业务视图 + 2 个 bindSheet 半模态视图；5 个 Service 接缝；1 个交易状态机 + 聊天域；对应 spec.md 的 9 个用户故事

## Project Structure

### Documentation (this feature)

```text
D:\Dev\DevEco_Repos\spec\campus-bazaar\
├── spec.md              # 需求规格（Rev.3，已确认）
├── plan.md              # 本文件（/spec-plan 输出，Rev.2）
└── tasks.md             # /spec-tasks 输出（Phase 3 生成）
```

### Source Code (repository root)

```text
D:\Dev\DevEco_Repos\CampusBazaar\                       # 工程根（Phase 4 由 deveco-create-project 脚本生成骨架）
├── build-profile.json5                                  # 脚手架生成（compatibleSdkVersion 6.1.0(23)）
├── oh-package.json5                                     # 脚手架生成
├── AppScope\
│   ├── app.json5                                        # bundleName=edu.fudan.campusbazaar
│   └── resources\base\element\string.json               # app_name = CampusBazaar
└── entry\src\main\
    ├── module.json5                                     # 无 requestPermissions；main_pages 见下
    ├── resources\base\
    │   ├── element\string.json                          # 模板字符串（应用名等）
    │   ├── media\                                        # 图标（模板）+ Mock 素材（本计划新增）
    │   │   ├── mock_bike.svg / mock_book.svg / mock_lamp.svg / mock_earphone.svg
    │   │   ├── mock_chair.svg / mock_kettle.svg / mock_keyboard.svg / mock_plant.svg
    │   │   └── avatar_me.svg / avatar_lily.svg / avatar_wei.svg / avatar_ming.svg
    │   └── profile\main_pages.json                      # ["pages/Index", "pages/Main"]
    └── ets\
        ├── entryability\EntryAbility.ets                # [脚手架] loadContent('pages/Index') 保持同步
        ├── pages\Index.ets                              # 登录页（@Entry）：手机号（含获取验证码）/ CAS 双入口
        ├── pages\Main.ets                               # Navigation 宿主（@Entry）：pageMap 路由表 + HomeView
        ├── views\
        │   ├── HomeView.ets                             # 主页：我是买家 / 我是卖家 / 交易提醒 三入口
        │   ├── BuyerHomeView.ets                        # 买家浏览：WaterFlow 双列卡片流 + 搜索/助手按钮
        │   ├── SellerHomeView.ets                       # 卖家：我的商品列表 + 新增商品按钮
        │   ├── PublishProductView.ets                   # 商品发布：名称/描述/价格/照片表单
        │   ├── ProductDetailView.ets                    # 商品详情：Swiper 多图 + 信息 + 购买
        │   ├── TradeListView.ets                        # 交易提醒：买卖双向记录列表（状态徽标）
        │   ├── TradeDetailView.ets                      # 交易详情：状态操作 + 基础聊天 UI
        │   ├── SearchSheetView.ets                      # 搜索半模态内容（bindSheet builder）
        │   └── AgentSheetView.ets                       # 智能助手半模态内容（bindSheet builder）
        ├── components\
        │   ├── ProductCard.ets                          # 通用商品卡片（流/搜索/助手结果复用）
        │   └── StateView.ets                            # loading / empty / error 三态组件（复用）
        ├── viewmodel\
        │   ├── AuthViewModel.ets                        # 登录表单状态、模式切换、获取验证码（Mock Toast）、Mock 登录
        │   ├── BuyerHomeViewModel.ets                   # 商品流加载 + 关键词搜索状态
        │   ├── AgentViewModel.ets                       # 智能助手输入/加载/结果状态
        │   ├── SellerHomeViewModel.ets                  # 我的商品列表加载
        │   ├── PublishViewModel.ets                     # 发布表单校验 + 拍照/选图编排 + 提交
        │   ├── ProductDetailViewModel.ets               # 详情加载 + 购买确认 + 创建交易（含重复购买防护提示）
        │   └── TradeViewModel.ets                       # 交易列表 + 详情 + 状态流转 + 聊天（单域聚合）
        ├── model\Models.ets                             # User/Product/Transaction/Message/TransactionStatus/DTO/表单模型（单文件聚合）
        ├── service\
        │   ├── AuthenticationService.ets                # 接口（含 sendSmsCode）+ MockAuthenticationService + 单例导出
        │   ├── ProductService.ets                       # 接口 + MockProductService + 单例导出
        │   ├── TransactionService.ets                   # 接口 + MockTransactionService（含重复购买防护）+ 单例导出
        │   ├── MessageService.ets                       # 接口 + MockMessageService（自动回复仅追加消息）+ 单例导出
        │   └── AgentService.ets                         # 接口 + MockAgentService（关键词匹配）+ 单例导出
        ├── data\MockDataStore.ets                       # 种子数据（用户/商品/交易/消息）+ 内存仓库 + 当前会话 + mock: 图片资源映射表
        └── common\
            ├── Constants.ets                            # 路由名、状态文案/配色、数量上限、延时参数
            └── Utils.ets                                # 时间格式化、价格格式化、手机号/验证码/价格校验
```

**Structure Decision**: 全新工程，选择 **MVVM 层级**（多页面、跨页状态、表单状态、交易状态机、Service 域逻辑均触发 MVVM 条件）。本应用是完整多故事应用（**9 个用户故事**、8 个界面 + 2 个半模态、5 个服务接缝、聊天与状态机域），计划约 30 个 ArkTS 文件，超过默认 6-12 文件目标的理由：**(a)** 用户明确要求 pages/components/models/services 分层且避免业务集中在单页面；**(b)** Service 层是用户点名的 REST 替换接缝，需按领域独立成文件（接口与 Mock 实现同文件聚合，不按概念再拆）；**(c)** 已按特性聚合压缩文件数（TradeViewModel 聚合列表+详情+聊天、Models.ets 单文件聚合全部领域类型、每个 service 文件=接口+实现+单例）。视图层目录 `views/` 承载业务视图（NavDestination/Sheet 内容），`pages/` 仅保留 @Entry 页面装配 —— 对应用户要求的 "pages" 概念。资源全部置于 `entry/src/main/resources/`（SVG 为文本可生成的受支持图源），不放入 `ets/`。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| ArkTS 文件数约 30（超过 MVVM 默认 6-12 目标） | 完整多页面应用：9 个用户故事、8 个界面 + 2 个 Sheet + 5 个服务接缝 + 交易状态机/聊天域；用户明确要求分层拆分且禁止业务集中单页 | 更少文件（如合并全部视图到 2-3 个巨型文件）会重蹈"业务集中"反模式，违背 FR-017，且 Service 接缝无法独立替换 |

## Research & Decisions

**RD-01 路由架构：router 登录页 + Navigation 业务主框架**  
- **Decision**: `pages/Index.ets` 为 @Entry 登录页（router 页面）；登录成功后 `router.replaceUrl('pages/Main')`（replace 保证返回不回登录页、直接退出应用）。`pages/Main.ets` 为 @Entry Navigation 宿主，主页内容即 HomeView，业务页全部为 NavDestination（views/ 下），经 navDestination pageMap 按路由名映射，参数经 `pushPathByName(name, param)` 传递。  
- **Rationale**: 官方《Navigation 加载启动页方案》方案三（Router 闪屏/登录页 + Navigation 主框架），规避平板分栏异常；登录是独立模态流程，与主框架生命周期隔离最干净。  
- **Alternatives considered**: 全 Navigation（方案一/二，登录作为 NavDestination 由拦截/销毁控制）—— 登录态切换与返回拦截复杂度高；全 router 跳转 —— 官方已不推荐，无 Navigation 工具栏/转场能力。

**RD-02 半模态面板：bindSheet（非 Panel 组件）**  
- **Decision**: 搜索面板与智能助手面板均用通用属性 `bindSheet` 实现（detents MEDIUM/LARGE），sheet 内容为 views/SearchSheetView.ets、views/AgentSheetView.ets。  
- **Rationale**: `Panel` 组件自 API 12 起官方停止维护，文档明确"推荐使用通用属性 bindSheet"；用户需求中的 "Panel" 指半模态面板形态，bindSheet 即官方当前标准实现。  
- **Alternatives considered**: Panel 组件 —— 已停止维护；全屏路由页 —— 不满足"打开 Panel"的半模态交互语义。

**RD-03 拍照/选图：CameraPicker + PhotoViewPicker（零权限方案）**  
- **Decision**: 拍照用 `@kit.CameraKit` cameraPicker.pick（系统相机界面，resultCode=0 时取 resultUri）；相册用 `@kit.MediaLibraryKit` PhotoViewPicker.select（PhotoSelectOptions.maxSelectNumber 按剩余可选数量动态设置）。两者均**无需权限申请**；取消（resultCode≠0 / 空结果）、失败路径统一兜底提示并保持表单已选状态。  
- **Rationale**: 官方文档明确"应用可调用 CameraPicker 拍摄照片，无需申请相机权限""PhotoViewPicker 此接口本身无需申请权限"；系统级 UI 保证 HIG 一致性，代码量与出错面最小。用户"正确处理权限申请、取消授权"的约束在本方案下收敛为"无需授权 + 全部取消/失败路径健壮处理"（空指针/异常不外溢）。  
- **Alternatives considered**: 自定义相机（Camera Kit 预览+拍照，需申请 ohos.permission.CAMERA 并处理授权拒绝）—— 开发量大、模拟器上自定义相机链路风险高；file.photoAccessHelper 旧 PhotoViewPicker 已废弃路径 —— 不采用。如需真实权限申请流程，后续接真机相机增强时再引入。

**RD-04 双列商品流：WaterFlow 瀑布流**  
- **Decision**: 买家浏览页用 WaterFlow（columnsTemplate 两列）+ FlowItem 包 ProductCard。  
- **Rationale**: 官方文档"瀑布流常用于展示图片信息，尤其在购物和资讯类应用中"；卡片高度随图片/标题自适应，最贴合"内容社区双列卡片"需求。  
- **Alternatives considered**: Grid —— 等高网格，长标题/多图卡片留白明显；List 双列 hack —— 需手动分列，维护差。

**RD-05 状态管理：State Management V2**  
- **Decision**: 全新工程采用 V2：ViewModel 类标注 @ObservedV2、可变状态属性标注 @Trace；页面用 @Local 持有 VM、@Param 传参；弹层/Sheet 状态用 @Local。  
- **Rationale**: 官方对 0-1 工程推荐 V2；@ObservedV2/@Trace 提供对象级深度观测，适配 Mock 数据集合（数组增删、状态机字段变更直接驱动 UI）。  
- **Alternatives considered**: V1（@State/@Observed/@ObjectLink）—— 官方定位为存量兼容。

**RD-06 Mock 商品图：文本生成 SVG 资源**  
- **Decision**: 预置商品/头像图片以简单 SVG（纯色背景 + 图形/文字，显式 width/height/viewBox）写入 `resources/base/media/`，Image 组件直接渲染；Product.images 统一为 string[]，预置商品使用 `mock:bike` 形式资源键，`MockDataStore` 内置"键 → $r 资源"静态映射表，ProductCard 渲染时区分 `mock:` 前缀（映射为 Resource）与普通字符串（按 URI 加载）。  
- **Rationale**: Image 官方支持 SVG 图源；SVG 为纯文本可由工具直接生成、体积小、色彩可控，满足"预置带本地图片的 Mock 商品，首次启动即完整展示商品流"（SC-002）；`mock:` 键本质是占位 URL scheme，未来切 REST 时服务端返回真实 URL，仅映射层退场，模型结构不变。  
- **Alternatives considered**: 二进制 PNG —— 无法以文本工具生成；全部复用模板 icon —— 商品流辨识度差，不满足"完整商品流"体验。

**RD-07 Service 层形态：接口 + Mock 实现 + 模块级单例（REST 直替接缝）**  
- **Decision**: 每个服务文件导出 interface、Mock 实现类与单例实例（如 `export const productService: ProductService = new MockProductService()`）；全部业务方法返回 Promise，DTO 形态对齐 REST 响应（ProductDetail 嵌套 seller、TransactionListItem 嵌套商品摘要与对手方、AgentResult 含 replyText+products）；Mock 内部用 200-300ms setTimeout 模拟网络延迟。页面/ViewModel 只依赖接口类型，替换真实 REST 仅改实现类内部（改单例导出指向或注入）。  
- **Rationale**: 用户核心约束"Service 接口设计应便于未来直接替换为 REST API"；异步+DTO 嵌套让页面层未来零改动。  
- **Alternatives considered**: 同步内存直读 —— 页面层会染上"本地数据"假设，替换 REST 需全量改造；Repository+DataSource 双层 —— 对 Mock 阶段过度设计。

**RD-08 会话与数据生命周期：内存单例，无持久化**  
- **Decision**: `MockDataStore` 为模块级单例（进程生命周期），持有种子数据与当前登录用户（AuthenticationService.login 成功时写入）；不做任何磁盘持久化，重启即回登录页与初始数据。  
- **Rationale**: spec 明确假设"内存 Mock、重启重置、每次启动从登录页开始"；单例保证买家页发布→卖家页/详情页数据即时一致。  
- **Alternatives considered**: AppStorage/PersistentStorage 持久化 —— 超出第一阶段范围。

**RD-09 图标与视觉：系统符号 + SVG 素材**  
- **Decision**: 界面图标优先用 SymbolGlyph 系统符号（sys.symbol.*）与少量 emoji；入口卡片/状态徽标用普通组件 + 主题色组合；不引入位图美术资产。配色遵循 HIG（主色 HarmonyOS 蓝 #0A59F7 系、状态色：PENDING 橙、ACCEPTED 绿、REJECTED 红、COMPLETED 灰蓝）。  
- **Rationale**: 零美术依赖即可达成 HIG 一致视觉；避免生成复杂位图。  
- **Alternatives considered**: 自绘 SVG 图标集 —— 收益低、工作量高。

**RD-10 购买确认与轻提示：UIContext 标准 API**  
- **Decision**: 购买确认用 `getUIContext().showAlertDialog`（确认/取消双按钮）；操作成功/失败轻提示用 `getUIContext().getPromptAction().showToast`；表单错误就地红字提示；业务错误（重复购买、非法状态操作等）由 Service Promise reject 携带错误信息，UI 层统一 Toast。  
- **Rationale**: 官方推荐经 UIContext 获取系统能力，避免 deprecated 全局方法。  
- **Alternatives considered**: CustomDialog —— 定制成本高，标准确认场景无需。

**RD-11 交易状态机归属 Service 层，流转仅由显式操作触发**  
- **Decision**: 状态流转规则完整内聚在 TransactionService（Mock 实现内置于 MockDataStore 之上）：PENDING → ACCEPTED/REJECTED 仅由卖家显式调用 acceptTransaction()/rejectTransaction() 触发，ACCEPTED → COMPLETED 仅由卖家显式调用 completeTransaction() 触发；REJECTED 与 COMPLETED 均为只读终态。Mock 自动回复（MessageService）**仅追加聊天消息，不触碰交易状态**——不存在任何自动流转路径。重复购买防护在 createTransaction 内校验：同一买家对同一商品已存在 PENDING/ACCEPTED 交易 → Promise reject（UI Toast「该商品已有进行中的交易」）；REJECTED/COMPLETED 历史不阻止新请求。  
- **Rationale**: 用户 Rev.3 修正要求状态机严格由卖家显式操作驱动、终态统一只读、重复购买防护；将规则内聚在 Service 层使页面层无法绕过约束，也与未来 REST 后端的业务校验位置一致。  
- **Alternatives considered**: 状态校验放在 ViewModel —— 页面层可绕过、多入口重复校验；自动流转（买家首条消息自动接受）—— 用户明确要求删除。

**RD-12 Mock 验证码流程归属 AuthenticationService 接口**  
- **Decision**: AuthenticationService 增加 `sendSmsCode(phone: string): Promise<void>`：Mock 实现校验 11 位手机号格式后延时 resolve，UI 层收到成功后 Toast「Mock 验证码已发送」；「获取验证码」按钮仅当手机号格式合法时可用。登录时仍独立校验手机号 + 6 位数字验证码格式（任意合法 6 位数字通过）。  
- **Rationale**: 真实短信发送是未来 REST 的标准端点，纳入接口使 Mock→真实切换零页面改动；按钮可用性由表单状态驱动，符合 HIG。  
- **Alternatives considered**: 纯 UI 层 Toast 不走 Service —— 破坏 Service 接缝完整性。

## Data Model

全部类型定义于 `entry/src/main/ets/model/Models.ets`（单文件聚合）。

### 实体（ID 全局唯一，string 类型）

| 实体 | 字段 | 说明 |
|---|---|---|
| **User** | id, nickname, avatar: string, phone?: string, studentId?: string | avatar 为 `mock:avatar_me` 资源键或 URI；当前用户 u_me |
| **Product** | id, title, description, price: number, images: string[], publishTime: number, sellerId: string | images 元素为 `mock:xxx` 资源键或 photo:///file:// URI，最多 3 张；价格单位元 |
| **Transaction** | id, productId, buyerId, sellerId, createTime: number, status: TransactionStatus | 一次购买请求；同一买家对同一商品最多存在一笔进行中（PENDING/ACCEPTED）交易 |
| **Message** | id, transactionId, senderId, content, sendTime: number | 交易内聊天消息 |

### 枚举与状态机

- **TransactionStatus**: `PENDING | ACCEPTED | REJECTED | COMPLETED`  
- 合法流转（**仅能由卖家显式操作触发**）：`PENDING --卖家接受--> ACCEPTED`；`PENDING --卖家拒绝--> REJECTED`；`ACCEPTED --卖家标记完成--> COMPLETED`  
- 终态：REJECTED 与 COMPLETED 均为终态，不可再流转，聊天只读（仅查看历史消息，输入禁用）  
- 聊天可用状态：PENDING 与 ACCEPTED 可发送消息；系统约束：Mock 自动回复仅追加聊天消息，**不修改交易状态**（无任何自动流转路径）  
- 非法操作防护：非卖家调用接受/拒绝/完成、终态再流转 → Service 返回业务错误（Promise reject 带错误信息，页面 Toast 提示）  
- 重复购买防护：同一买家对同一商品已存在 PENDING/ACCEPTED 交易时 createTransaction 拒绝（错误信息「该商品已有进行中的交易」）；REJECTED/COMPLETED 历史不阻止新请求  
- 非终态下买家视角：PENDING 交易展示「等待卖家确认」提示；买家发起的交易在其被卖家处理前保持 PENDING（Mock 对手方卖家不自动操作）

### 关联关系（ID 引用）

- Product.sellerId → User.id；Transaction.productId → Product.id；Transaction.buyerId/sellerId → User.id；Message.transactionId → Transaction.id；Message.senderId → User.id

### DTO（Service 层返回形态，对齐 REST 响应）

- **ProductDetail**: { product: Product, seller: User }  
- **TransactionListItem**: { transaction: Transaction, product: Product, counterparty: User, latestMessage?: Message }（列表页一次拿全，避免 N+1）  
- **TransactionDetail**: { transaction: Transaction, product: Product, buyer: User, seller: User }  
- **AgentResult**: { replyText: string, products: Product[] }  
- **PublishDraft**: { title: string, description: string, price: number, images: string[] }

### 表单状态（@ObservedV2 类，位于对应 ViewModel）

- **LoginForm**（AuthViewModel）: mode: 'phone' | 'cas'，phone、smsCode、studentId、password，字段级校验标记（手机号格式合法 → 「获取验证码」按钮可用；获取成功标记 smsCodeSent）  
- **PublishForm**（PublishViewModel）: title、description、priceText、images: string[]；校验规则：title 非空、description 非空、priceText 为 > 0 的合法数值（Utils 校验函数）、images ≤ 3（可为空，允许无图发布）

### 种子数据（data/MockDataStore.ets，确定性可验证）

- **用户 4 人**: u_me（当前用户·小张）、u_lily（学姐 Lily）、u_wei（学长阿伟）、u_ming（同学小明）  
- **商品 8 件**（发布时间依次递减，保证买家流顺序确定）:  
  1. p_bike 山地自行车（u_wei，¥280，mock:bike）  
  2. p_book 高等数学教材（u_lily，¥25，mock:book）  
  3. p_lamp 宿舍护眼台灯（u_me，¥35，mock:lamp）—— 当前用户自己的商品（买家流可见不可购买）  
  4. p_earphone 蓝牙降噪耳机（u_ming，¥120，mock:earphone）  
  5. p_chair 人体工学椅（u_wei，¥199，mock:chair）  
  6. p_kettle 电热水壶（u_lily，¥45，mock:kettle）  
  7. p_keyboard 87 键机械键盘（u_ming，¥150，mock:keyboard）  
  8. p_plant 多肉盆栽（u_me，¥15，mock:plant）—— 当前用户自己的商品  
- **预置交易 3 笔**（覆盖状态演示）:  
  1. t_pending: u_lily 买 p_lamp，状态 **PENDING**（当前用户为卖家 → 可验证接受/拒绝），预置 1 条买家消息  
  2. t_accepted: u_me 买 p_bike，状态 **ACCEPTED**（当前用户为买家，预置 4 条协商对话 → 可验证聊天与自动回复）  
  3. t_completed: u_me 买 p_book，状态 **COMPLETED**（预置 4 条完成交易对话 → 可验证终态只读）  
  注：买家新发起的购买在其被卖家处理前保持 PENDING（Mock 对手方不自动流转状态）；REJECTED 由用户对 t_pending 执行拒绝产生  
- **Mock 自动回复语料**: 若干条通用回复（"可以的""什么时候方便面交？"等），按发送轮次轮询；**自动回复仅追加消息，不修改交易状态**

## Contracts & Interfaces

Service 接口（全部异步，页面/ViewModel 仅依赖接口；Mock 实现内置于同文件并导出单例）。路由与 UI 契约如下。

### service/AuthenticationService.ets

```text
interface AuthenticationService {
  sendSmsCode(phone: string): Promise<void>                          // Mock：校验 11 位手机号，成功后 UI 层 Toast「Mock 验证码已发送」
  loginByPhone(phone: string, smsCode: string): Promise<User>        // 校验 11 位手机号 + 6 位数字验证码（任意合法输入通过）
  loginByCas(studentId: string, password: string): Promise<User>     // Mock：任意非空学号/密码通过
  getCurrentUser(): User | null                                       // 未登录为 null
  logout(): void
}
export const authService: AuthenticationService                       // MockAuthenticationService 单例
```

### service/ProductService.ets

```text
interface ProductService {
  getProductFeed(): Promise<Product[]>                                // 全部商品，publishTime 倒序
  searchByKeyword(keyword: string): Promise<Product[]>                // title 模糊包含匹配（不区分大小写）
  getProductsBySeller(sellerId: string): Promise<Product[]>           // 该卖家商品，publishTime 倒序
  getProductDetail(productId: string): Promise<ProductDetail | null>  // 含 seller；找不到返回 null
  publishProduct(draft: PublishDraft): Promise<Product>               // 校验后入库，publishTime=当前时间，新商品即出现在流顶
}
export const productService: ProductService
```

### service/TransactionService.ets

```text
interface TransactionService {
  getTransactionsForUser(userId: string): Promise<TransactionListItem[]>  // 买家∪卖家视角，createTime 倒序
  getTransactionDetail(transactionId: string): Promise<TransactionDetail | null>
  createTransaction(productId: string, buyerId: string): Promise<Transaction>
  // 恒创建 PENDING；以下情况 Promise reject 业务错误（UI 层 Toast）：
  //   a) 买家=卖家（不能购买自己发布的商品）
  //   b) 同一买家对该商品已存在 PENDING/ACCEPTED 交易（「该商品已有进行中的交易」）
  //   c) 商品不存在；REJECTED/COMPLETED 历史不阻止重新发起
  acceptTransaction(transactionId: string, operatorId: string): Promise<Transaction>   // 仅卖家+PENDING，否则 reject
  rejectTransaction(transactionId: string, operatorId: string): Promise<Transaction>   // 仅卖家+PENDING，否则 reject
  completeTransaction(transactionId: string, operatorId: string): Promise<Transaction> // 仅卖家+ACCEPTED，否则 reject
}
export const transactionService: TransactionService
```

### service/MessageService.ets

```text
interface MessageService {
  getMessages(transactionId: string): Promise<Message[]>              // sendTime 升序
  sendMessage(transactionId: string, senderId: string, content: string): Promise<Message>
  // Mock 行为（实现内部）：发送成功后延时 ~800ms 生成对手方自动回复；
  // 自动回复仅追加聊天消息，不修改交易状态（状态流转只能经 TransactionService 卖家显式操作）
}
export const messageService: MessageService
```

### service/AgentService.ets

```text
interface AgentService {
  queryByNaturalLanguage(query: string): Promise<AgentResult>
  // Mock 实现：提取输入关键词（同义词表：自行车→bike、书/教材→book 等）匹配商品 title/description，
  // 返回 replyText（预设话术）与命中商品（无命中返回空数组 + 引导话术）；延时 ~600ms 模拟推理
}
export const agentService: AgentService
```

### 路由契约（common/Constants.ets 路由名 + pages/Main.ets pageMap）

```text
pages/Index  → router 登录页；登录成功 router.replaceUrl('pages/Main')
pages/Main   → Navigation 宿主；主页即 HomeView
  pushPathByName 路由名（参数）:
  'BuyerHome'    ()                      → BuyerHomeView
  'SellerHome'   ()                      → SellerHomeView
  'PublishPage'  ()                      → PublishProductView
  'ProductDetail'(productId: string)     → ProductDetailView
  'TradeList'    ()                      → TradeListView
  'TradeDetail'  (transactionId: string) → TradeDetailView
返回栈：标准 pop；NavDestination onBackPressed 默认行为即可
```

### 页面-状态契约（loading/empty/error 全覆盖，对应 FR-019）

| 视图 | loading | empty | error/校验 |
|---|---|---|---|
| Index 登录页 | 登录按钮进行中态 | — | 手机号/验证码/学号/密码格式即时校验红字；获取验证码：手机号非法时按钮不可用，成功后 Toast「Mock 验证码已发送」 |
| BuyerHomeView | 首次加载 StateView.loading | 无商品引导空态 | Service reject → toast + 重试按钮 |
| SearchSheetView | 输入防抖后轻量加载 | 「无匹配商品」空态 | 空关键词不触发搜索 |
| AgentSheetView | 发送后 loading 态 | 无结果话术 + 引导 | 空输入不发送 |
| SellerHomeView | 加载态 | 「暂无在售商品，点击新增上架」+ 去发布按钮 | toast |
| PublishProductView | 提交按钮进行中态 | — | 三项必填逐项红字；照片超 3 张提示 |
| ProductDetailView | 加载态 | 商品不存在 → 错误态+返回 | 购买异常 toast（含「该商品已有进行中的交易」） |
| TradeListView | 加载态 | 「暂无交易记录」空态 | toast |
| TradeDetailView | 加载态 | 无消息「发送第一条消息开始沟通」空态 | REJECTED/COMPLETED 终态输入禁用仅查看历史；非法状态操作 toast |

## Changelog

- 2026-09-22 初版生成：依据 spec.md Rev.2 完成技术选型研究（RD-01 ~ RD-10，均经 devecocli docs 官方文档验证）、MVVM 结构设计、数据模型与 Service/路由契约定义。
- 2026-09-22 Rev.2（依据用户架构评审意见 + spec.md Rev.3）：**(1)** 删除"买家首条消息自动接受"逻辑，新增 RD-11（状态机归属 Service 层、流转仅由卖家显式操作触发、REJECTED/COMPLETED 统一只读终态）；**(2)** TransactionService.createTransaction 增加重复购买防护；**(3)** 新增 RD-12，AuthenticationService 增加 sendSmsCode 接口与「获取验证码」按钮可用性规则；**(4)** 目标平台全文档统一为「HarmonyOS 手机 / HarmonyOS SDK 6.1.0(23) / HarmonyOS API 23 模拟器」，移除 OpenHarmony 混用表述，明确允许正常使用 HarmonyOS Kit；**(5)** 用户故事数量统一为 9 个（spec.md 与本文件一致）；**(6)** MessageService 契约更新为自动回复仅追加消息不改状态。
