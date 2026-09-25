import { TransactionListItem, User } from '../model/Models';
import { TradeViewModel } from '../viewmodel/TradeViewModel';
import { StateView } from '../components/StateView';
import { resolveMockImage } from '../data/MockDataStore';
import { formatPrice, formatTime } from '../common/Utils';
import { authService } from '../service/AuthenticationService';
import {
  COLOR_PAGE_BG, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY,
  LoadState, ROUTE_TRADE_DETAIL, TradeStatusUI
} from '../common/Constants';

@ComponentV2
export struct TradeListView {
  @Local vm: TradeViewModel = new TradeViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  private firstShow: boolean = true;

  build() {
    NavDestination() {
      Column() {
        if (this.vm.listState === LoadState.CONTENT) {
          List({ space: 10 }) {
            ForEach(this.vm.items, (item: TransactionListItem) => {
              ListItem() {
                this.tradeRow(item);
              }
            }, (item: TransactionListItem): string => item.transaction.id);
          }
          .layoutWeight(1).width('100%').padding({ left: 12, right: 12, top: 12, bottom: 12 })
          .scrollBar(BarState.Off);
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
    .title('交易提醒')
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
        Image(resolveMockImage(item.product.images[0])).width(70).height(70).borderRadius(10)
          .objectFit(ImageFit.Cover);
      } else {
        Text('📷').fontSize(24).width(70).height(70).textAlign(TextAlign.Center)
          .backgroundColor('#F2F3F5').borderRadius(10);
      }
      Column({ space: 7 }) {
        Text(item.product.title).fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY)
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
      Text(formatPrice(item.product.price)).fontSize(14).fontColor(COLOR_TEXT_SECONDARY);
    }
    .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12)
    .onClick(() => this.pathStack.pushPathByName(ROUTE_TRADE_DETAIL, item.transaction.id));
  }

  private counterpartyLabel(item: TransactionListItem): string {
    const current: User | null = authService.getCurrentUser();
    return current !== null && item.transaction.buyerId === current.id ?
      `卖家：${item.counterparty.nickname}` : `买家：${item.counterparty.nickname}`;
  }
}
