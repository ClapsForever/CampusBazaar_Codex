import { Product, User } from '../model/Models';
import { authService } from '../service/AuthenticationService';
import { BuyerHomeViewModel } from '../viewmodel/BuyerHomeViewModel';
import { AgentViewModel } from '../viewmodel/AgentViewModel';
import { ProductCard } from '../components/ProductCard';
import { StateView } from '../components/StateView';
import { SearchSheetView } from './SearchSheetView';
import { AgentSheetView } from './AgentSheetView';
import {
  COLOR_DIVIDER, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_SOFT,
  COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY,
  LoadState, ROUTE_PRODUCT_DETAIL, ROUTE_PUBLISH_PAGE, ROUTE_SELLER_HOME, ROUTE_TRADE_LIST
} from '../common/Constants';

@ComponentV2
export struct HomeView {
  @Require @Param pathStack: NavPathStack;
  @Require @Param agentVm: AgentViewModel;
  @Local vm: BuyerHomeViewModel = new BuyerHomeViewModel();
  @Local user: User | null = null;
  @Local selectedTab: number = 0;
  @Local category: string = '全部';
  @Local searchSheetVisible: boolean = false;
  @Local agentSheetVisible: boolean = false;
  private categories: string[] = ['全部', '教材', '数码', '生活', '出行'];

  aboutToAppear(): void {
    this.user = authService.getCurrentUser();
    this.vm.loadFeed(false);
  }

  build() {
    Column() {
      if (this.selectedTab === 0) {
        this.marketHeader();
        this.categoryBar();
        this.productFeed();
      } else {
        this.profilePage();
      }
      this.bottomBar();
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
  }

  @Builder
  marketHeader(): void {
    Column({ space: 14 }) {
      Row() {
        Column({ space: 2 }) {
          Text('校园二手集市').fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
          Text('同校好物 · 当面交易').fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
        }
        .layoutWeight(1).alignItems(HorizontalAlign.Start);
        Row() {
          Image($r('app.media.design_bell')).width(20).height(20);
        }
        .width(40).height(40).justifyContent(FlexAlign.Center)
        .backgroundColor(COLOR_PAGE_BG).borderRadius(20)
        .onClick(() => this.pathStack.pushPathByName(ROUTE_TRADE_LIST, ''));
      }
      .width('100%');
      Row({ space: 10 }) {
        Row({ space: 8 }) {
          Image($r('app.media.design_search')).width(18).height(18);
          Text('搜索教材、数码、生活用品').fontSize(13).fontColor(COLOR_TEXT_TERTIARY);
        }
        .layoutWeight(1).height(52).padding({ left: 16, right: 12 })
        .backgroundColor('#EDECEA').borderRadius(26)
        .onClick(() => this.searchSheetVisible = true)
        .bindSheet($$this.searchSheetVisible, this.searchSheetContent(), {
          detents: [SheetSize.MEDIUM, SheetSize.LARGE]
        });
        Column({ space: 1 }) {
          Image($r('app.media.design_sparkles')).width(18).height(18);
          Text('AI 找物').fontSize(9).fontWeight(FontWeight.Bold).fontColor(Color.White);
        }
        .width(52).height(52).justifyContent(FlexAlign.Center)
        .backgroundColor(COLOR_PRIMARY).borderRadius(26)
        .onClick(() => this.agentSheetVisible = true)
        .bindSheet($$this.agentSheetVisible, this.agentSheetContent(), {
          detents: [SheetSize.LARGE]
        });
      }
      .width('100%');
    }
    .width('100%').padding({ left: 16, right: 16, top: 12, bottom: 16 })
    .backgroundColor(Color.White);
  }

  @Builder
  categoryBar(): void {
    Row({ space: 8 }) {
      ForEach(this.categories, (item: string) => {
        Text(item).fontSize(12).fontWeight(FontWeight.Medium)
          .fontColor(this.category === item ? Color.White : COLOR_TEXT_SECONDARY)
          .padding({ left: 17, right: 17, top: 8, bottom: 8 })
          .backgroundColor(this.category === item ? COLOR_PRIMARY : Color.White)
          .borderRadius(18)
          .border({ width: this.category === item ? 0 : 1, color: COLOR_DIVIDER })
          .onClick(() => {
            this.category = item;
            if (item === '全部') {
              this.vm.loadFeed(true);
            }
          });
      }, (item: string): string => item);
    }
    .width('100%').padding({ left: 16, right: 16, top: 12, bottom: 12 });
  }

  @Builder
  productFeed(): void {
    Column({ space: 12 }) {
      Row() {
        Text(this.category === '全部' ? '为你推荐' : `${this.category}好物`)
          .fontSize(16).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
          .layoutWeight(1);
        Text('AI 找物帮你筛').fontSize(11).fontColor(COLOR_PRIMARY)
          .onClick(() => this.agentSheetVisible = true);
      }
      .width('100%');
      if (this.vm.feedState === LoadState.CONTENT) {
        if (this.filteredProducts().length > 0) {
          this.productGrid(this.filteredProducts());
        } else {
          Column() {
            StateView({ state: LoadState.EMPTY, emptyText: '暂时没有相关商品', emptyHint: '试试其他分类，或用 AI 找物描述需求' });
          }
          .layoutWeight(1).width('100%');
        }
      } else {
        Column() {
          StateView({
            state: this.vm.feedState,
            emptyText: '暂无在售商品',
            emptyHint: '同学还没有发布商品，稍后再来看看吧',
            onRetry: (): void => {
              this.vm.loadFeed(false);
            }
          });
        }
        .layoutWeight(1).width('100%');
      }
    }
    .layoutWeight(1).width('100%').padding({ left: 16, right: 16, top: 8, bottom: 8 });
  }

  private filteredProducts(): Product[] {
    if (this.category === '全部') {
      return this.vm.products;
    }
    return this.vm.products.filter((item: Product): boolean =>
      (item.category !== undefined && item.category.indexOf(this.category) >= 0) ||
      item.title.indexOf(this.category) >= 0);
  }

  @Builder
  productGrid(items: Product[]): void {
    WaterFlow() {
      ForEach(items, (item: Product) => {
        FlowItem() {
          ProductCard({
            product: item,
            onCardClick: (product: Product): void => {
              this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, product.id);
            }
          });
        }
      }, (item: Product): string => item.id);
    }
    .columnsTemplate('1fr 1fr').columnsGap(10).rowsGap(10)
    .layoutWeight(1).width('100%').scrollBar(BarState.Off);
  }

  @Builder
  profilePage(): void {
    Scroll() {
      Column({ space: 16 }) {
        Text('我的').fontSize(22).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
          .width('100%').margin({ top: 16 });
        Row({ space: 14 }) {
          if (this.user !== null && this.user.avatar !== '') {
            Image(this.user.avatar).width(56).height(56).borderRadius(28);
          } else {
            Text('我').fontSize(22).fontColor(COLOR_PRIMARY).width(56).height(56)
              .textAlign(TextAlign.Center).backgroundColor(COLOR_PRIMARY_SOFT).borderRadius(28);
          }
          Column({ space: 6 }) {
            Text(this.user === null ? '校园同学' : this.user.nickname)
              .fontSize(18).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
            Text('欢迎来到校园二手集市').fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
          }
          .alignItems(HorizontalAlign.Start);
        }
        .width('100%').padding(18).backgroundColor(Color.White).borderRadius(16);
        Text('我的闲置').fontSize(15).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
          .width('100%').margin({ top: 8 });
        this.profileLink('我发布的', '管理在售商品', ROUTE_SELLER_HOME);
        this.profileLink('我的交易', '查看预约与聊天消息', ROUTE_TRADE_LIST);
        Button('退出登录').width('100%').height(46).margin({ top: 12 })
          .fontSize(14).fontColor(COLOR_TEXT_SECONDARY).backgroundColor(Color.White)
          .borderRadius(12).onClick(async () => {
            try {
              await authService.logout();
            } catch (_error) {
            }
            this.user = null;
            this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' });
          });
      }
      .width('100%').padding({ left: 16, right: 16, bottom: 24 });
    }
    .layoutWeight(1).width('100%').scrollBar(BarState.Off);
  }

  @Builder
  profileLink(title: string, hint: string, route: string): void {
    Row() {
      Column({ space: 5 }) {
        Text(title).fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY);
        Text(hint).fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
      }
      .layoutWeight(1).alignItems(HorizontalAlign.Start);
      Text('›').fontSize(24).fontColor(COLOR_TEXT_TERTIARY);
    }
    .width('100%').padding(18).backgroundColor(Color.White).borderRadius(14)
    .onClick(() => this.pathStack.pushPathByName(route, ''));
  }

  @Builder
  bottomBar(): void {
    Row() {
      this.tabItem(0, $r('app.media.design_house'), '首页');
      Column({ space: 4 }) {
        Text('+').fontSize(28).fontColor(Color.White).height(48).width(48)
          .textAlign(TextAlign.Center).backgroundColor(COLOR_PRIMARY).borderRadius(24);
        Text('发布').fontSize(10).fontWeight(FontWeight.Bold).fontColor(COLOR_PRIMARY);
      }
      .width(72).onClick(() => this.pathStack.pushPathByName(ROUTE_PUBLISH_PAGE, ''));
      this.tabItem(1, $r('app.media.design_user'), '我的');
    }
    .width('100%').justifyContent(FlexAlign.SpaceAround)
    .padding({ top: 8, bottom: 16 })
    .backgroundColor(Color.White)
    .border({ width: { top: 1 }, color: COLOR_DIVIDER });
  }

  @Builder
  tabItem(index: number, icon: Resource, label: string): void {
    Column({ space: 4 }) {
      Image(icon).width(22).height(22).opacity(this.selectedTab === index ? 1 : 0.55);
      Text(label).fontSize(10).fontWeight(FontWeight.Bold)
        .fontColor(this.selectedTab === index ? COLOR_PRIMARY : COLOR_TEXT_TERTIARY);
    }
    .width(72).onClick(() => {
      this.selectedTab = index;
      if (index === 0) {
        this.vm.loadFeed(true);
      } else {
        this.user = authService.getCurrentUser();
      }
    });
  }

  @Builder
  searchSheetContent(): void {
    SearchSheetView({
      pathStack: this.pathStack,
      onClose: (): void => {
        this.searchSheetVisible = false;
      }
    });
  }

  @Builder
  agentSheetContent(): void {
    AgentSheetView({
      pathStack: this.pathStack,
      vm: this.agentVm,
      onClose: (): void => {
        this.agentSheetVisible = false;
      }
    });
  }
}
