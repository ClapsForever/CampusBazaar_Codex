---
name: 同窗集 · Blue
description: 图标同源蓝、冷白界面与原生无衬线构成的 HarmonyOS 校园闲置交易界面。
colors:
  primary: "#2D55F7"
  primary-strong: "#2345CE"
  primary-soft: "#EAF0FF"
  error: "#BD3548"
  success: "#20734F"
  success-bg: "#E7F4ED"
  rejected-bg: "#FCECEF"
  text-primary: "#17243C"
  text-secondary: "#52617A"
  text-tertiary: "#5E6C83"
  page-bg: "#F4F6FB"
  card-bg: "#FFFFFF"
  input-bg: "#EAF0F8"
  divider-disabled: "#DCE3EF"
typography:
  brand:
    fontSize: "30fp"
    fontWeight: 700
  title:
    fontSize: "24fp"
    fontWeight: 700
  section:
    fontSize: "20fp"
    fontWeight: 500
  feed-heading:
    fontSize: "18fp"
    fontWeight: 700
  body:
    fontSize: "14fp"
    fontWeight: 400
  product:
    fontSize: "14fp"
    fontWeight: 500
  price:
    fontSize: "21fp"
    fontWeight: 700
  action:
    fontSize: "16fp"
    fontWeight: 500
  meta:
    fontSize: "12fp"
    fontWeight: 400
rounded:
  ui: "14vp"
  category: "12vp"
  avatar: "50%"
spacing:
  micro: "4vp"
  tight: "8vp"
  grid: "12vp"
  inset: "14vp"
  group: "16vp"
  row: "18vp"
  page: "20vp"
  auth: "24vp"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card-bg}"
    typography: "{typography.action}"
    rounded: "{rounded.ui}"
    height: "50vp"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.ui}"
    height: "44vp"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.ui}"
    height: "44vp"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.card-bg}"
    rounded: "{rounded.ui}"
    height: "48vp"
  input:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.ui}"
    height: "48vp"
  chip-category-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    rounded: "{rounded.category}"
    padding: "10vp 13vp"
  chip-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    rounded: "{rounded.ui}"
  card-product:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.ui}"
  card-product-compact:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.ui}"
    padding: "12vp"
  nav-bottom:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-tertiary}"
    padding: "10vp 0vp"
---

# Design System: 同窗集 · Blue

## Overview

**Creative North Star: "图标同源的校园蓝"**

冷白页面、白色内容面、钴蓝操作与深蓝灰文字服务快速浏览、发布和沟通。商品照片与真实状态构成内容层级，文字使用 HarmonyOS 系统默认无衬线。现有名称与蓝色应用图标是确认保留的品牌资产；方向依据见 `design/blue-ui-brief.md`。

本系统记录当前启用的 `entry/src/main/ets/ui/editorial`，以该目录 `common/Constants.ets` 及真实组件为依据。提交版仅注册这里记录的蓝色 UI 页面。布局数值使用原生 vp，字号使用 fp；前置 token 中保留真实单位。`.impeccable/design.json` 的 HTML/CSS 仅为设计面板的视觉近似，不是原生组件、运行实现或交互验收。

**Key Characteristics:**

- 图标同源蓝统一主操作、AI 入口、选中导航和价格。
- 冷白底与白色内容面以色阶、留白和细分隔线形成层次。
- 原生无衬线、明确的字段组、双列与紧凑横排商品卡片。
- 原生 Navigation、Sheet、输入与对话框承载交互。

## Colors

前置 token 是颜色值的文档索引，代码常量是运行来源；同值角色共用一项，状态语义保持区分。

### Primary

- **同窗钴蓝**（`primary`）：登录、发布、预约、发送、AI 入口、选中导航。
- **深钴蓝**（`primary-strong`）：价格、待确认状态文字、浅蓝底的选中分类文字。对应 `COLOR_PRICE` 与 `COLOR_PRIMARY_STRONG`。
- **浅蓝选中面**（`primary-soft`）：选中分类、次操作、提示与个人信息面。

### Neutral

- **深蓝灰正文**（`text-primary`）：标题、正文和商品名称。
- **蓝灰辅助文字**（`text-secondary`）：成色、次操作与说明。
- **蓝灰元信息**（`text-tertiary`）：校区、时间、占位提示与未选中导航标签。
- **冷白页面**（`page-bg`）与**纯白内容面**（`card-bg`）：页面和卡片、页头、底部操作区。
- **浅蓝灰输入面**（`input-bg`）：输入、图片占位与中性状态。
- **细分隔灰**（`divider-disabled`）：分隔线、边界及部分禁用容器，对应 `COLOR_DIVIDER`、`COLOR_DISABLED`。

### Semantic status roles

| 角色 | 文字 / 底色 token | 使用规则 |
| --- | --- | --- |
| 待确认 | `primary-strong` / `primary-soft` | 等待卖家确认，不表示成功 |
| 已接受、在售 | `success` / `success-bg` | 已接受交易；卖家列表与商品详情统一的在售状态 |
| 已拒绝、字段错误 | `error` / `rejected-bg` | 拒绝标签用配对底色；字段错误以错误色文字贴近字段 |
| 已完成、已取消 | `text-secondary` / `input-bg` | 终态采用中性标签；不得改变交易权限 |
| 已下架、已售出 | `text-tertiary` / `page-bg` | 商品终态，与交易终态各按原模型呈现 |

**The 同源蓝 Rule.** 主操作和选中态沿用同一蓝色家族；错误与成功色只表达语义，不充当第二套品牌色。

**The 状态配对 Rule.** 状态文字、底色和明确标签同时出现；标签与终态规则由既有业务常量提供，视觉代码只改变呈现。

## Typography

可见文字使用 HarmonyOS 原生默认无衬线，不设置另一套显示字体。`FONT_EDITORIAL` 及旧字体资源注册保留用于兼容，不是可见 UI 的字体来源。原生字体度量与默认行高由系统负责；没有统一的自定义字距或行高 token。

前置层级记录实际常用角色：登录品牌标题（`brand`）、首页与个人页标题（`title`）、页面分组（`section`）、商品区标题（`feed-heading`）、正文（`body`）、卡片商品标题（`product`）、卡片价格（`price`）、主提交文字（`action`）与元信息（`meta`）。表单常用中等字号（14–15 fp），帮助说明（12–13 fp）；详情价格单独放大（28 fp），不套用卡片价格字号。

**The 原生文字 Rule.** 保留 fp 与系统文字行为；长商品标题在卡片中最多两行并省略，成色和校区各一行。详情与会话正文按内容换行。

## Layout

页面常用左右内边距见 `page`，认证页面使用更宽的 `auth`。组内以 `tight`、`grid` 分隔，分组用 `group`、`row`。不要把局部百分比容器当成全局断点。

首页商品区使用原生 WaterFlow 双列，横纵间距采用 `grid`。卡片宽度从容器实际可用宽度计算：减去一条列间距后平分，支持窗口尺寸变化；没有额外的平板列数规范。搜索和 AI 结果使用同一商品模型与详情入口，紧凑卡片适合纵向结果列表。

页头、分类与底部导航分工清楚；滚动内容使用剩余高度。登录、发布、详情与聊天的主操作处于底部独立操作区。主要按钮与分类入口采用明确的触摸高度（通常至少 44 vp）；表单输入常用（48–50 vp），首页搜索与 AI 入口（52 vp）。这些是观察到的常用值，不代表所有旧链接都已满足统一最小尺寸。

## Elevation & Depth

当前实现不使用自定义阴影。白色内容面、浅蓝灰输入面、冷白底与细分隔线形成静态层次；Sheet 和对话框的遮罩及过渡交给原生系统。没有可复用的自定义动画或阴影 token。

**The 色阶层次 Rule.** 卡片静止时以背景与留白分层；原生浮层沿用平台行为。

## Shapes

`ui` 是卡片、输入、按钮、图片和 Sheet 的共享圆角。分类选中底使用更紧凑的 `category`；头像采用 `avatar`。商品图使用方形覆盖裁切，卡片裁切内部内容，缺图时维持相同尺寸与圆角。

`tc_*.svg` 是项目自有几何线性图标：圆端点、圆连接，常用线宽（1.8）；导航图标常用（22 vp），操作图标约（17–24 vp）。用对应的选中、闲置或白色资源匹配背景。底部发布保留蓝色圆角矩形中的白色加号；原生返回箭头由 Navigation 提供。

## Components

### Buttons

主提交采用实心钴蓝与白字，认证和发布常用前置 `button-primary`，详情和交易操作常用较短高度（48 vp）。次操作采用浅蓝底蓝字；切换登录、协议等采用透明底文字按钮。取消和下架通常为中性面与辅助文字；明确拒绝使用错误色实心按钮。

提交、发送和保存状态沿用 ViewModel：禁用重复触发，并显示原有“提交中…”等文案。禁用不是新业务状态。现有部分终态按钮仍使用局部硬编码灰色，它们不扩展为一套新色阶。点击、焦点、键盘和默认禁用反馈使用 ArkUI 能力，不定义桌面悬停交互。

### Chips

首页分类：未选中为透明底辅助文字，选中为浅蓝底深钴蓝字；保持横向滚动与明确触摸区域。搜索多选筛选：选中使用深钴蓝底白字，未选中白底辅助文字。状态标签依 Colors 中的语义配对，始终保留状态文字。

### Cards / Containers

默认 `ProductCard` 为双列白卡：方形首图、两行标题、价格、成色、可选校区。图文间距与内边距来自现有组件；标题和元信息按 Typography 的截断规则处理。图片失败和无图均使用 `tc_photo`、明确缺图提示和 `input-bg`，不加入演示照片。

紧凑模式沿用同一组件和点击事件：外内边距采用 `grid`，左侧方形图（104 vp），右侧文字占剩余宽度并增加左内边距（12 vp）。搜索与 AI 推荐共用它，避免独立卡片实现导致价格、成色或详情入口漂移。

### Inputs / Fields

登录与设置主要使用浅蓝灰输入面；发布表单在冷白底上使用白色字段。所有字段沿用原生 TextInput、TextArea、Select 与 Checkbox，保留邮箱、密码、数值键盘类型、长度限制和勾选状态。错误文字就近出现，编辑时按既有规则清除对应错误；输入区光标和选择强调沿用主蓝。键盘避让采用原生 RESIZE，长表单可滚动。

### Navigation

首页底部“首页 / 发布 / 我的”使用白底、顶部细分隔线、图标和标签。首页与我的以蓝色选中图标和文字标记状态；发布是直接进入发布页的操作。入口只改变视觉，不改为新的业务路由。详情、交易、发布等由 `NavigationMode.Stack` 与 `NavDestination` 承担返回；搜索、AI、设置通过原生大尺寸 Sheet 呈现。

### States / Conversation

`StateView` 统一加载、空内容和加载失败：蓝色 LoadingProgress、资源图标、具体说明及可用时的“重试”。已有数据刷新失败时保留内容并提供就地重试。AI 和交易会话中，本人消息为蓝底白字，对方或回复为白底正文；终态聊天只读规则及卖家、买家操作权限保持原状。

## Do's and Don'ts

### Do:

- **Do** 从启用 UI 的 `Constants.ets` 读取颜色、圆角、间距和常用字号，保留原生 vp / fp。
- **Do** 让浏览、搜索和 AI 共用商品卡片、格式化方法、真实状态与详情入口。
- **Do** 保持返回、原生输入、键盘避让、Sheet 和对话框的 HarmonyOS 行为。
- **Do** 把 API 24 Previewer 的 320 / 360 / 390 vp 截图作为布局证据；合成数据只留在预览夹具中，截图不进入应用资源包。

### Don't:

- **Don't** 将橙色操作、暖纸底或衬线显示文字重新引入已确认的蓝色活动 UI。
- **Don't** 修改原 UI 的独立 token、`design_` 资源或既有业务、权限和交易终态规则来匹配新外观。
- **Don't** 将 API 24 编译、预览或 HTML/CSS 面板近似展示称为目标 HarmonyOS 6.1.0 / API 23 真机交互验收；键盘、摄像头、签名安装、系统字体放大和完整在线交易仍需目标环境验证。
- **Don't** 把既有 `app_icon.png` 当成本轮新生成资产：它是保留的用户原有图；本轮新增可见图标为 `tc_` SVG，没有新增或替换交付用栅格图。
