import { Product } from '../model/Models';
import { SellerHomeViewModel } from '../viewmodel/SellerHomeViewModel';
import { StateView } from '../components/StateView';
import { formatPrice, formatTime } from '../common/Utils';
import {
  COLOR_PAGE_BG, COLOR_PRICE, COLOR_TEXT_PRIMARY, COLOR_TEXT_TERTIARY,
  LoadState, ROUTE_PRODUCT_DETAIL, ROUTE_PUBLISH_PAGE
} from '../common/Constants';

@ComponentV2
export struct SellerHomeView {
  @Local vm: SellerHomeViewModel = new SellerHomeViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  private firstShow: boolean = true;

  build() {
    NavDestination() {
      Column() {
        Button('＋ 新增商品').width('100%').height(48).margin({ left: 12, right: 12, top: 10 })
          .fontSize(15).fontColor(Color.White).backgroundColor('#00B8A9').borderRadius(22)
          .onClick(() => this.pathStack.pushPathByName(ROUTE_PUBLISH_PAGE, ''));
        if (this.vm.state === LoadState.CONTENT) {
          List({ space: 10 }) {
            ForEach(this.vm.products, (item: Product) => {
              ListItem() {
                Row({ space: 12 }) {
                  if (item.images.length > 0) {
                    Image(item.images[0]).width(64).height(64).borderRadius(10)
                      .objectFit(ImageFit.Cover);
                  } else {
                    Text('📷').fontSize(26).width(64).height(64).textAlign(TextAlign.Center)
                      .backgroundColor('#F2F3F5').borderRadius(10);
                  }
                  Column({ space: 6 }) {
                    Text(item.title).fontSize(15).fontColor(COLOR_TEXT_PRIMARY).maxLines(1)
                      .textOverflow({ overflow: TextOverflow.Ellipsis });
                    Row({ space: 8 }) {
                      Text(formatPrice(item.price)).fontSize(14).fontWeight(FontWeight.Bold).fontColor(COLOR_PRICE);
                      Text(formatTime(item.publishTime)).fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
                    }
                  }
                  .layoutWeight(1).alignItems(HorizontalAlign.Start);
                }
                .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12)
                .onClick(() => this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, item.id));
              }
            }, (item: Product): string => item.id);
          }
          .layoutWeight(1).width('100%').padding({ left: 12, right: 12, top: 10, bottom: 12 })
          .scrollBar(BarState.Off);
        } else {
          Column() {
            StateView({
              state: this.vm.state,
              emptyText: '还没有发布商品',
              emptyHint: '点击上方「新增商品」发布你的第一件闲置吧',
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
    .title('我是卖家')
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
