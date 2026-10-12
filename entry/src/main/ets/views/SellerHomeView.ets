import { Product } from '../model/Models';
import { SellerHomeViewModel } from '../viewmodel/SellerHomeViewModel';
import { StateView } from '../components/StateView';
import { formatPrice, formatTime } from '../common/Utils';
import {
  UI_RADIUS, COLOR_PAGE_BG, COLOR_PRICE, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_TERTIARY, LoadState,
  ROUTE_PRODUCT_DETAIL, ROUTE_PUBLISH_PAGE
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
                Row({ space: 12 }) {
                  if (item.images.length > 0) {
                    Image(item.images[0]).width(72).height(72).borderRadius(UI_RADIUS)
                      .objectFit(ImageFit.Cover);
                  } else {
                    Text('📷').fontSize('26fp').width(72).height(72).textAlign(TextAlign.Center)
                      .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS);
                  }
                  Column({ space: 6 }) {
                    Text(item.title).fontSize('15fp').fontWeight(FontWeight.Medium)
                      .fontColor(COLOR_TEXT_PRIMARY).maxLines(1)
                      .textOverflow({ overflow: TextOverflow.Ellipsis });
                    Column({ space: 4 }) {
                      Text(formatPrice(item.price)).fontSize('17fp').fontWeight(FontWeight.Bold).fontColor(COLOR_PRICE);
                      Text(formatTime(item.publishTime)).fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
                    }
                    .alignItems(HorizontalAlign.Start);
                  }
                  .layoutWeight(1).alignItems(HorizontalAlign.Start);
                }
                .width('100%').padding(12).backgroundColor(Color.White).borderRadius(UI_RADIUS)
                .onClick(() => this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, item.id));
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
}
