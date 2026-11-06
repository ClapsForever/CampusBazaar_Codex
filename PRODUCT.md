# 同窗集

<!-- impeccable:product-schema 1 -->

## Platform

HarmonyOS native — ArkTS / ArkUI ComponentV2. This platform is outside the skill's web/iOS/Android enum; preserve the actual native stack.

## Users

校园内发布、寻找闲置物品并约定当面交易的同学。

## Product Purpose

提供校园闲置商品浏览、发布、搜索、AI 找物和交易沟通，作为小组参加开源鸿蒙大赛的作品。用户确认前后端已验收并可正常使用。

## Capabilities and Constraints

- 已有邮箱登录与验证码注册、商品图片、组合搜索、多轮 AI 找物及历史、预约与交易聊天、个人资料和协议。
- 当面交易、线下付款；不提供在线支付或物流。邮箱验证不等于学生身份认证。
- 本轮覆盖当前启用 UI 的全部页面。用户确认布局可以调整，操作逻辑必须统一；保持业务、接口、状态规则及现有文案。
- 提交版仅注册蓝色 UI 页面。历史版本可通过 Git 提交或修改前的本机归档查阅。禁止批量删除文件或目录。
- 项目目标 HarmonyOS 6.1.0 / API 23；本地 SDK 为 API 24，编译通过不能替代目标设备验收。

## Brand Commitments

名称“同窗集”和现有蓝色应用图标保留。2026-11-02 用户确认以图标蓝色统一界面，替换橙蓝混用的视觉；字体、商品卡片与导航可重做。遇到新的方向性决定须先询问用户。

## Evidence on Hand

现有 ArkUI 源码、`.impeccable/review` 蓝色版原生截图和 ViewModel 回归。图片和商品数据来自现有服务。GitHub 交付仓库为 ClapsForever/CampusBazaar_Codex。

## Product Principles

1. 浏览、搜索和 AI 共用真实商品与相同的详情入口。
2. 主操作、返回、提交和错误恢复在全部页面保持一致。
3. 所有权、交易权限与账号隔离优先于视觉调整。
4. 用原生构建和预览记录验证结果，明确未覆盖的真机交互。
