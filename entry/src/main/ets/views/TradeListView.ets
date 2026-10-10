import { TransactionListItem, TransactionStatus, User } from '../model/Models';
import { TradeViewModel } from '../viewmodel/TradeViewModel';
import { StateView } from '../components/StateView';
import { formatPrice, formatTime } from '../common/Utils';
import { authService } from '../service/AuthenticationService';
import {
  COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY,
  LoadState, ROUTE_TRADE_DETAIL, TradeStatusUI
} from '../common/Constants';

@ComponentV2
export struct TradeListView {
  @Local vm: TradeViewModel = new TradeViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  @Local filterIndex: number = 0;
  private filters: string[] = ['全部', '待确认', '待见面', '已完成', '已关闭'];
  private firstShow: boolean = true;

  build() {
    NavDestination() {
      Column() {
        Row({ space: 8 }) {
          ForEach(this.filters, (label: string, index: number) => {
            Text(label).fontSize(11).fontWeight(FontWeight.Medium)
              .fontColor(this.filterIndex === index ? Color.White : COLOR_TEXT_SECONDARY)
              .padding({ left: 11, right: 11, top: 8, bottom: 8 })
              .backgroundColor(this.filterIndex === index ? COLOR_PRIMARY : Color.White)
              .borderRadius(16).onClick(() => this.filterIndex = index);
          }, (label: string): string => label);
        }
        .width('100%').padding({ left: 12, right: 12, top: 14, bottom: 12 });
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
        Image(item.product.images[0]).width(76).height(76).borderRadius(12)
          .objectFit(ImageFit.Cover);
      } else {
        Text('📷').fontSize(24).width(76).height(76).textAlign(TextAlign.Center)
          .backgroundColor(COLOR_PAGE_BG).borderRadius(12);
      }
      Column({ space: 7 }) {
        Text(item.product.title).fontSize(15).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis });
        Text(this.counterpartyLabel(item)).fontSize(12).fontColor(COLOR_TEXT_SECONDARY);
        Row({ space: 8 }) {
          Text(TradeStatusUI.text(item.transaction.status)).fontSize(12)
            .fontColor(TradeStatusUI.textColor(item.transaction.status))
            .backgroundColor(TradeStatusUI.bgColor(item.transaction.status))
            .borderRadius(8).padding({ left: 8, right: 8, top: 3, bottom: 3 });
          Text(formatTime(item.transaction.createTime)).fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
        }
      }
      .layoutWeight(1).alignItems(HorizontalAlign.Start);
      Text(formatPrice(item.product.price)).fontSize(17).fontWeight(FontWeight.Bold).fontColor(COLOR_PRIMARY);
    }
    .width('100%').padding(12).backgroundColor(Color.White).borderRadius(16)
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
