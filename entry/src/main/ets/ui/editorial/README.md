# 同窗集当前 UI（蓝色版）

2026-11-02：按用户确认的方向，将当前启用版从“校园生活刊”的宋体、暖灰和橙色改为与现有应用图标一致的蓝色。目录名 editorial 保留，避免不必要的路由和导入迁移。

- 首页：应用图标和系统无衬线标题、白色搜索区、蓝色 AI 快捷入口、浅蓝选中分类、双列白色商品卡片。
- 商品组件：浏览流为竖向；搜索与 AI 推荐采用横向紧凑布局，使用同一份真实商品、成色、价格、校区及图片失败占位。
- 导航：保留“首页、发布、我的”；发布是操作而非新的页签。二级页面继续使用系统 Navigation 返回，搜索和 AI 继续使用原生大弹层。
- 登录、验证码注册、发布、详情、交易、聊天、个人设置、协议共用蓝色视觉常量。红色仅用于错误/破坏操作，绿色表示在售/交易进行状态，待确认采用蓝色。
- 空状态和图片占位采用独立 tc_ SVG；design_ 资源继续服务原 UI。原 UI、ViewModel、服务、模型和协议正文保持不变。

## 切换与回退

`entry/src/main/ets/ui/UiVariant.ets` 的 `USE_EDITORIAL_UI = true` 启用当前蓝色版；设为 false 并完整重新运行 App，即可启用保留的原 UI。两个版本共用 bundleName 和真实业务数据。切换不需要卸载、清库或部署后端。

如需回到改版前的“校园生活刊”，可在独立工作副本检出提交 `2465490`；修改前完整工作目录还保存在工程外层 `.project-backups`。详细备份与校验信息见 [改版记录](../../../../../../docs/ui-blue-redesign-2026-11-02.md)。

## 构建与运行

在 DevEco Studio 打开包含 build-profile.json5 的工程根目录，选择 entry 与已有模拟器/设备运行。项目目标为 HarmonyOS 6.1.0 / API 23；本次本机使用 HarmonyOS 6.1.1 / API 24 SDK 构建。编译检查：

```sh
node scripts/check-editorial-ui.cjs
ARK_TYPESCRIPT=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript node --test scripts/ui-regression.cjs
```

macOS 构建：

```sh
env JAVA_HOME=/Applications/DevEco-Studio.app/Contents/jbr/Contents/Home \
  DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk \
  NODE_HOME=/Applications/DevEco-Studio.app/Contents/tools/node \
  /Applications/DevEco-Studio.app/Contents/tools/node/bin/node \
  /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js \
  --mode module -p product=default -p module=entry@default \
  -p buildMode=debug assembleHap --no-daemon
```

输出为 `entry/build/default/outputs/default/entry-default-unsigned.hap`。未配置调试签名，unsigned HAP 需要在 DevEco 配置签名后才能直接部署。默认后端地址仍为 https://api.campus-bazzar.work。

## 验证边界

36 个原文件哈希及 15 组 UI 行为对照检查通过；32 项 ViewModel 回归通过；新旧 UI 同时编译通过。`.impeccable/review` 保存本轮原生 Previewer 截图，全部位于应用源码之外。旧 design/editorial-a/review 截图作为历史记录保留。

静态预览不能代替真机交互。系统大字号、输入法、相机/相册、签名安装和完整联网交易仍需设备验收；不把预览夹具当作真实商品和账户。
