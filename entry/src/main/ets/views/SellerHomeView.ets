import { Product } from '../model/Models';
import { SellerHomeViewModel } from '../viewmodel/SellerHomeViewModel';
import { StateView } from '../components/StateView';
import { formatPrice, formatTime } from '../common/Utils';
import {
  UI_RADIUS, COLOR_PAGE_BG, COLOR_PRICE, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_TERTIARY, LoadState,
  COLOR_TEXT_SECONDARY, ROUTE_PRODUCT_DETAIL, ROUTE_PUBLISH_PAGE
} from '../common/Constants';

@ComponentV2
export struct SellerHomeView {
  @Local vm: SellerHomeViewModel = new SellerHomeViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  private firstShow: boolean = true;

  build() {
    NavDestination() {
      Column() {
        if (this.vm.error !== '') {
          Button(`${this.vm.error} · 重试`).type(ButtonType.Normal).fontSize('12fp').height(44).borderRadius(UI_RADIUS)
            .onClick(() => this.vm.loadMyProducts(true));
        }
        Row() {
          Column({ space: 4 }) {
            Text('我发布的').fontSize('20fp').fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
            Text('管理你的校园闲置好物').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
          }
          .layoutWeight(1).alignItems(HorizontalAlign.Start);
          Text(`${this.vm.products.length} 件`).fontSize('13fp').fontColor(COLOR_PRIMARY);
        }
        .width('100%').padding(16).backgroundColor(Color.White);
        Button('＋ 发布一件闲置').type(ButtonType.Normal).width('90%').height(48)
          .margin({ top: 14, bottom: 6 })
          .fontSize('15fp').fontColor(Color.White).backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS)
          .onClick(() => this.pathStack.pushPathByName(ROUTE_PUBLISH_PAGE, ''));
        if (this.vm.state === LoadState.CONTENT) {
          List({ space: 10 }) {
            ForEach(this.vm.products, (item: Product) => {
              ListItem() {
                Row({ space: 10 }) {
                  Row({ space: 12 }) {
                    if (item.images.length > 0) {
                      Image(item.images[0]).width(72).height(72).borderRadius(UI_RADIUS)
                        .objectFit(ImageFit.Cover);
                    } else {
                      Text('📷').fontSize('26fp').width(72).height(72).textAlign(TextAlign.Center)
                        .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS);
                    }
                    Column({ space: 5 }) {
                      Text(item.title).fontSize('15fp').fontWeight(FontWeight.Medium)
                        .fontColor(COLOR_TEXT_PRIMARY).maxLines(1)
                        .textOverflow({ overflow: TextOverflow.Ellipsis });
                      Text(this.statusText(item)).fontSize('11fp')
                        .fontColor(this.statusColor(item)).backgroundColor(this.statusBackground(item))
                        .borderRadius(UI_RADIUS).padding({ left: 7, right: 7, top: 2, bottom: 2 });
                      Column({ space: 4 }) {
                        Text(formatPrice(item.price)).fontSize('17fp').fontWeight(FontWeight.Bold).fontColor(COLOR_PRICE);
                        Text(formatTime(item.publishTime)).fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
                      }
                      .alignItems(HorizontalAlign.Start);
                    }
                    .layoutWeight(1).alignItems(HorizontalAlign.Start);
                  }
                  .layoutWeight(1)
                  .onClick(() => this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, item.id));
                  if (item.status === 'ACTIVE') {
                    Button(this.vm.delistingId === item.id ? '…' : '下架').type(ButtonType.Normal)
                      .height(38).fontSize('13fp').fontColor(COLOR_TEXT_SECONDARY)
                      .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
                      .enabled(this.vm.delistingId === '')
                      .onClick(() => this.showDelistDialog(item));
                  }
                }
                .width('100%').padding(12).backgroundColor(Color.White).borderRadius(UI_RADIUS)
                .alignItems(VerticalAlign.Center);
              }
            }, (item: Product): string => item.id);
          }
          .layoutWeight(1).width('100%').padding({ left: 16, right: 16, top: 10, bottom: 12 })
          .scrollBar(BarState.Off);
        } else {
          Column() {
            StateView({
              state: this.vm.state,
              emptyText: '还没有发布商品',
              emptyHint: '点击上方「发布一件闲置」发布你的第一件闲置吧',
              onRetry: (): void => {
                this.vm.loadMyProducts(false);
              }
            });
          }
          .layoutWeight(1).width('100%');
        }
      }
      .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
    }
    .title('我发布的')
    .onReady((context: NavDestinationContext) => {
      this.pathStack = context.pathStack;
      this.vm.loadMyProducts(false);
    })
    .onShown(() => {
      if (this.firstShow) {
        this.firstShow = false;
      } else {
        this.vm.loadMyProducts(true);
      }
    });
  }

  private statusText(item: Product): string {
    if (item.status === 'DELISTED') return '已下架';
    if (item.status === 'SOLD') return '已售出';
    return '在售';
  }

  private statusColor(item: Product): string {
    return item.status === 'ACTIVE' ? '#2E9E5B' : COLOR_TEXT_TERTIARY;
  }

  private statusBackground(item: Product): string {
    return item.status === 'ACTIVE' ? '#EAF6ED' : COLOR_PAGE_BG;
  }

  private showDelistDialog(item: Product): void {
    this.getUIContext().showAlertDialog({
      title: '下架商品',
      cornerRadius: UI_RADIUS,
      message: `确定下架「${item.title}」吗？下架后不会出现在商品列表中。`,
      primaryButton: {
        value: '确认下架',
        action: (): void => {
          this.confirmDelist(item);
        }
      },
      secondaryButton: { value: '取消', action: (): void => { } }
    });
  }

  private async confirmDelist(item: Product): Promise<void> {
    const success: boolean = await this.vm.delist(item.id);
    this.getUIContext().getPromptAction().showToast({
      message: success ? '商品已下架' : (this.vm.actionError || '下架失败，请稍后重试'),
      duration: 1600
    });
  }
}
