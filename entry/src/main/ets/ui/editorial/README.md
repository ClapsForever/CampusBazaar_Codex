# A 方案：校园生活刊

此目录包含独立的新 UI。原 `ets/pages`、`ets/views`、`ets/components`、`ets/common`、ViewModel、服务和模型的布局与业务逻辑保持原样。新旧 UI 共用原业务层，不复制后台、接口或数据。

2026-10-30 名称统一：按用户要求，新旧首页的应用标题与欢迎语同步使用“同窗集”，桌面/能力名称和随包协议也已统一。原 UI 仅额外修改这两处品牌文案，布局与业务逻辑不变；哈希基线仅更新 `views/HomeView.ets` 对应记录。注册验证码邮件的本地源码、默认发件别名及部署模板同时改名，线上业务 API 与实际 `ALIYUN_DM_SENDER_NAME` 配置也已更新生效，记录见工程 `docs/mail-brand-rollout-2026-10-30.md`。

## 已实现的视觉方向

- 首页：宋体刊头、暖灰纸色、描边 AI 入口、文字分类与选中下划线。分类与“最新闲置”之间仅一条分隔线；双列商品采用图片与图注直接排版，价格、成色、校区保留。
- 商品详情：较大的名称与价格，属性、描述、卖家按章节分隔，原图片轮播及交易操作保留。
- 发布：照片区与表单通过留白和字段标题组织，保留全部字段、照片操作、校验和固定发布按钮。
- 我的与个人设置：账户信息和目录式入口，减少重复白色卡片，输入区域有独立底色。
- 搜索：保留原多选筛选与搜索触发方式；搜索结果复用新商品组件。采用大尺寸弹层，给 44 vp 筛选触控区域和结果留出空间。
- AI：保留新对话、历史、删除记录与输入行为；标题和关闭按钮一行，新对话与历史按钮另起一行，适配窄屏。
- 我发布的、交易列表与交易详情：统一行式分隔、文字层级与间距，保留所有状态和操作。
- 登录、注册及协议页：沿用现有文案、输入与协议流程，统一字号与版式。

## 文件组织

```text
ets/ui/
├── UiVariant.ets                 # 新旧 UI 的唯一开关
└── editorial/
    ├── pages/                   # 登录、主导航、法律文档
    ├── views/                   # 九个业务界面的新 UI
    ├── components/              # 商品卡片、商品流、加载/空/错误状态
    ├── common/                  # 独立视觉 token、共享业务常量及法律路由桥接
    ├── original-files.sha256.json
    └── README.md
```

字体与许可位于 `entry/src/main/resources/rawfile/editorial/`。标题使用内置的 Noto Serif CJK SC 字形子集（约 206 KiB），重命名为 Campus Editorial Serif，遵循 OFL 1.1；无需运行时下载。商品标题、昵称及正文使用系统字体。

接入新 UI 对原目录仅有两处必要改动：

1. `ets/entryability/EntryAbility.ets` 通过 `UI_INDEX_PAGE` 加载选中的入口。
2. `resources/base/profile/main_pages.json` 同时注册新旧三个页面。

原 UI 的三个页面及所有原组件没有替换。新 UI 登录成功、退出和协议跳转均留在所选 UI；NavPathStack 的业务路由名和参数保持不变。

## 切换、对比与回退

打开 `entry/src/main/ets/ui/UiVariant.ets`：

```ts
export const USE_EDITORIAL_UI: boolean = true;
```

- `true`：A 方案，新 UI，默认值。
- `false`：原 UI。

修改后重新运行 App。使用 DevEco 的 **Run** 完整启动，便于确认入口切换；仅热重载当前页面不足以重新选择入口。无需还原文件、卸载应用、删除数据库或重启后端。

两个版本保留相同 bundleName `edu.fudan.campusbazaar`，用于轮流运行对比；不会同时安装成两个 App。切换 UI 不会回退服务端数据，测试时仍使用原有账号及真实业务服务。

## 在鸿蒙模拟器运行

1. 在 DevEco Studio 打开本仓库的 **CampusBazaar_Codex 工程根目录**，包含 `build-profile.json5` 与 `hvigorfile.ts` 的目录；不要把 `ui/editorial` 当作独立工程打开。
2. 等待工程同步。工程 target/compatible 为 HarmonyOS `6.1.0(23)`；本次编译使用本机已有 `6.1.1 / API 24` SDK。模拟器可选已安装的 HarmonyOS 6.1.1 / API 24 手机镜像，或与项目兼容的更新镜像。
3. 打开 **Tools → Device Manager**，创建或启动本地手机模拟器，等待设备启动完成。
4. 顶部运行配置选择 **entry**，设备选择该模拟器。
5. 确认 `USE_EDITORIAL_UI = true`，点击 **Run ▶**。DevEco 会构建并部署 App。
6. 若运行提示需要签名，在 **File → Project Structure → Project → Signing Configs** 中按 IDE 提示配置调试签名／自动签名，再运行。本仓库目前没有提交签名配置、证书或密钥；本次生成的是 **unsigned HAP**。
7. 登录后检查首页；通过原有入口进入发布、详情、AI 和个人页。默认后端地址仍为 `https://api.campus-bazzar.work`。UI 更新不需要部署后端；模拟器需能访问该地址。

官方运行说明：<https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-run-emulator>。

### 已有可安装的签名 HAP 时

以下是 macOS 本机 SDK 的路径示例；Windows 可在 SDK 的 toolchains 目录使用对应 `hdc.exe`。先启动模拟器，并使用 DevEco 的调试签名生成 signed HAP。

```sh
/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc list targets
```

如果有多个设备，在命令中使用 `-t <设备标识>` 指定目标：

```sh
hdc -t <设备标识> install -r <签名HAP的绝对路径>
hdc -t <设备标识> shell aa start -a EntryAbility -b edu.fudan.campusbazaar
```

未配置 PATH 时，将示例中的 `hdc` 换成第一条命令里的完整路径。未签名 HAP 不作为可直接安装包交付。

## 构建与逻辑检查

在工程根目录执行：

```sh
node scripts/check-editorial-ui.cjs
node --test scripts/ui-regression.cjs
```

第一条检查本次迁移基线的 36 个原文件没有变化，并对 15 份新旧 UI 检查方法、事件绑定、显示文案、输入约束、业务条件、相对导入、页面注册和首页唯一分隔线。它是静态契约检查，不替代运行时测试；未来有意修改原业务文件时，需要审查并更新基线。

第二条运行原有 ViewModel 逻辑回归。若未安装业务 API 的 TypeScript 开发依赖，可按本机 SDK 路径设置：

```sh
ARK_TYPESCRIPT=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript node --test scripts/ui-regression.cjs
```

本次使用的 macOS 构建命令：

```sh
env JAVA_HOME=/Applications/DevEco-Studio.app/Contents/jbr/Contents/Home \
  DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk \
  NODE_HOME=/Applications/DevEco-Studio.app/Contents/tools/node \
  /Applications/DevEco-Studio.app/Contents/tools/node/bin/node \
  /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js \
  --mode module -p product=default -p module=entry@default \
  -p buildMode=debug assembleHap --no-daemon
```

构建输出：`entry/build/default/outputs/default/entry-default-unsigned.hap`。不需要运行 clean 或批量删除任何文件。

## 验证边界

2026-10-30：新旧 UI 同时参与 ArkTS 与资源编译，`assembleHap` 成功；32 项现有前端逻辑回归通过，UI 对照检查通过。保留了构建器的原有异常处理警告，未借 UI 修改调整业务层。

已用原生 Previewer 自查首页 320/360 vp、我的 360 vp、发布 360 vp、AI 320 vp、搜索 320 vp、登录 360 vp。截图及夹具边界记录在工程的 `design/editorial-a/review/README.md`；证据放在应用源码目录之外，避免打包进 HAP。

设备部署、软键盘、系统大字号、相册/拍照与完整真实交易流程仍需在模拟器或真机验收。测试时重点检查分类滚动、商品返回后的列表位置、筛选组合、发布字段错误、AI 历史、买卖双方的状态操作和退出后的入口。
