# 同窗集蓝色 UI

Mode: Operate. Scope: currently enabled ui/editorial pages, views and shared components. Native ArkUI, code-first. User approved this direction on 2026-11-02; no concept lottery is required for the pinned direction.

## Direction contract

THESIS: 同学可以快速看清商品、找到 AI、完成发布和沟通。让商品照片和真实状态组织界面，取代刊物式标题和松散图注。

OWN-WORLD: 图标同源钴蓝主操作、浅蓝选中底色、冷白页面、深蓝灰文字。系统中文无衬线；12–16 vp 圆角、细线图标和清楚的字段组。

STORY: 首页先认识同窗集，随即搜索或 AI 找物，再筛选真实商品；发布是底部直接操作，我的管理个人信息与交易。所有路径沿用现有业务和返回行为。

FIRST VIEWPORT: 白色页头左侧蓝色应用图标与 24 fp 名称，右侧消息；下一行搜索和实心蓝色 AI。横向分类下方双列白色商品卡片，每张照片、标题、价格、成色与校区自成一组。底部三入口，蓝色圆角方形发布操作。签名细节是 AI 的蓝色快捷入口与同色发布操作在首屏形成清楚的操作轴。

FORM: User-pinned native marketplace composition, code-led; seed: none (user-pinned, no roll). Native navigation and controls retained. Light appearance follows daytime campus browsing and outdoor readability.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification boundary

Compile both variants, preserve original hashes, compare behavior contracts, run existing ViewModel tests, capture actual ArkUI at 320/360/390 vp and large text where supported. Preview fixtures remain outside the shipping project. No fabricated products or counters in production. Native keyboard, camera, signed installation and full online trading need a real device/emulator when available.
