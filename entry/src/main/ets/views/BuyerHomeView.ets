import { Product } from '../model/Models';
import { BuyerHomeViewModel } from '../viewmodel/BuyerHomeViewModel';
import { ProductCard } from '../components/ProductCard';
import { StateView } from '../components/StateView';
import { SearchSheetView } from './SearchSheetView';
import { AgentSheetView } from './AgentSheetView';
import { AgentViewModel } from '../viewmodel/AgentViewModel';
import { CONTROL_RADIUS, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, LoadState, ROUTE_PRODUCT_DETAIL } from '../common/Constants';

@ComponentV2
export struct BuyerHomeView {
  @Require @Param agentVm: AgentViewModel;
  @Local vm: BuyerHomeViewModel = new BuyerHomeViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  @Local searchSheetVisible: boolean = false;
  @Local agentSheetVisible: boolean = false;
  private firstShow: boolean = true;

  build() {
    NavDestination() {
      Column() {
        Row({ space: 10 }) {
          Button('🔍 搜索').layoutWeight(1).height(48).fontSize(14)
            .backgroundColor(Color.White).fontColor(COLOR_TEXT_PRIMARY).borderRadius(CONTROL_RADIUS)
            .onClick(() => this.searchSheetVisible = true)
            .bindSheet($$this.searchSheetVisible, this.searchSheetContent(), {
              detents: [SheetSize.MEDIUM, SheetSize.LARGE]
            });
          Button('🤖 智能助手').layoutWeight(1).height(48).fontSize(14)
            .backgroundColor(COLOR_PRIMARY).fontColor(Color.White).borderRadius(CONTROL_RADIUS)
            .onClick(() => this.agentSheetVisible = true)
            .bindSheet($$this.agentSheetVisible, this.agentSheetContent(), {
              detents: [SheetSize.LARGE], showClose: false
            });
        }
        .width('100%').padding({ left: 12, right: 12, top: 8, bottom: 8 });
        if (this.vm.feedState === LoadState.CONTENT) {
          WaterFlow() {
            ForEach(this.vm.products, (item: Product) => {
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
          .padding({ left: 12, right: 12, top: 4, bottom: 12 }).layoutWeight(1).width('100%');
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
      .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
    }
    .title('我是买家')
    .onReady((context: NavDestinationContext) => {
      this.pathStack = context.pathStack;
      this.vm.loadFeed(false);
    })
    .onShown(() => {
      if (this.firstShow) {
        this.firstShow = false;
      } else {
        this.vm.loadFeed(true);
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
