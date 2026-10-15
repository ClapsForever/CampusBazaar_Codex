import { TransactionListItem, TransactionStatus, User } from '../model/Models';
import { TradeViewModel } from '../viewmodel/TradeViewModel';
import { StateView } from '../components/StateView';
import { formatPrice, formatTime } from '../common/Utils';
import { authService } from '../service/AuthenticationService';
import {
  UI_RADIUS, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY,
  LoadState, ROUTE_TRADE_DETAIL, TradeStatusUI
} from '../common/Constants';

@ComponentV2
export struct TradeListView {
  @Local vm: TradeViewModel = new TradeViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  @Local filterIndex: number = 0;
  private filters: string[] = ['全部', TradeStatusUI.text(TransactionStatus.PENDING),
    TradeStatusUI.text(TransactionStatus.ACCEPTED), TradeStatusUI.text(TransactionStatus.COMPLETED),
    TradeStatusUI.text(TransactionStatus.REJECTED)];
  private firstShow: boolean = true;

  aboutToDisappear(): void {
    this.vm.dispose();
  }

  build() {
    NavDestination() {
      Column() {
        Text('消息来自交易沟通，点击交易查看聊天').fontSize('12fp').fontColor(COLOR_TEXT_SECONDARY)
          .width('100%').padding({ left: 16, right: 16, top: 8 });
        Scroll() {
          Row({ space: 8 }) {
            ForEach(this.filters, (label: string, index: number) => {
              Text(label).fontSize('14fp').constraintSize({ minHeight: 44 }).fontWeight(FontWeight.Medium)
                .fontColor(this.filterIndex === index ? Color.White : COLOR_TEXT_SECONDARY)
                .padding({ left: 11, right: 11, top: 8, bottom: 8 })
                .backgroundColor(this.filterIndex === index ? COLOR_PRIMARY : Color.White)
                .borderRadius(UI_RADIUS).onClick(() => this.filterIndex = index);
            }, (label: string): string => label);
          }
          .padding({ left: 16, right: 16 });
        }
        .scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%')
        .padding({ top: 8, bottom: 8 });
        if (this.vm.listState === LoadState.CONTENT) {
          if (this.filteredItems().length === 0) {
            StateView({ state: LoadState.EMPTY, emptyText: '这里还没有交易', emptyHint: '有新预约时会显示在这里' });
          } else {
            List({ space: 10 }) {
              ForEach(this.filteredItems(), (item: TransactionListItem) => {
                ListItem() {
                  this.tradeRow(item);
                }
              }, (item: TransactionListItem): string => item.transaction.id);
            }
            .layoutWeight(1).width('100%').padding({ left: 16, right: 16, top: 4, bottom: 12 })
            .scrollBar(BarState.Off);
          }
        } else {
          Column() {
            StateView({
              state: this.vm.listState,
              emptyText: '暂无交易记录',
              emptyHint: '完成购买或发布商品后，交易会显示在这里',
              errorText: this.vm.lastError || '加载交易记录失败',
              onRetry: (): void => {
                this.vm.loadList(false);
              }
            });
          }
          .layoutWeight(1).width('100%');
        }
      }
      .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
    }
    .title('我的交易')
    .onReady((context: NavDestinationContext) => {
      this.pathStack = context.pathStack;
      this.vm.loadList(false);
    })
    .onShown(() => {
      if (this.firstShow) {
        this.firstShow = false;
      } else {
        this.vm.loadList(true);
      }
    });
  }

  @Builder
  tradeRow(item: TransactionListItem): void {
    Row({ space: 12 }) {
      if (item.product.images.length > 0) {
        Image(item.product.images[0]).width(76).height(76).borderRadius(UI_RADIUS)
          .objectFit(ImageFit.Cover);
      } else {
        Text('📷').fontSize('24fp').width(76).height(76).textAlign(TextAlign.Center)
          .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS);
      }
      Column({ space: 7 }) {
        Text(item.product.title).fontSize('15fp').fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis });
        Text(this.counterpartyLabel(item)).fontSize('12fp').fontColor(COLOR_TEXT_SECONDARY);
        Text(item.latestMessage ? item.latestMessage.content : TradeStatusUI.text(item.transaction.status))
          .fontSize('12fp').fontColor(COLOR_TEXT_SECONDARY).maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%');
        Row({ space: 8 }) {
          Text(TradeStatusUI.text(item.transaction.status)).fontSize('12fp')
            .fontColor(TradeStatusUI.textColor(item.transaction.status))
            .backgroundColor(TradeStatusUI.bgColor(item.transaction.status))
            .borderRadius(UI_RADIUS).padding({ left: 8, right: 8, top: 3, bottom: 3 });
        }
        Text(formatPrice(item.product.price)).fontSize('18fp').fontWeight(FontWeight.Bold).fontColor(COLOR_PRIMARY);
        Text(formatTime(item.transaction.createTime)).fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
      }
      .layoutWeight(1).alignItems(HorizontalAlign.Start);
    }
    .width('100%').padding(12).backgroundColor(Color.White).borderRadius(UI_RADIUS)
    .onClick(() => this.pathStack.pushPathByName(ROUTE_TRADE_DETAIL, item.transaction.id));
  }

  private counterpartyLabel(item: TransactionListItem): string {
    const current: User | null = authService.getCurrentUser();
    return current !== null && item.transaction.buyerId === current.id ?
      `卖家：${item.counterparty.nickname}` : `买家：${item.counterparty.nickname}`;
  }

  private filteredItems(): TransactionListItem[] {
    if (this.filterIndex === 0) {
      return this.vm.items;
    }
    const status: TransactionStatus = this.filterIndex === 1 ? TransactionStatus.PENDING :
      this.filterIndex === 2 ? TransactionStatus.ACCEPTED :
      this.filterIndex === 3 ? TransactionStatus.COMPLETED : TransactionStatus.REJECTED;
    return this.vm.items.filter((item: TransactionListItem): boolean => item.transaction.status === status);
  }
}
