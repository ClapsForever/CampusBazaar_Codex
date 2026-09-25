import { ProductDetailViewModel } from '../viewmodel/ProductDetailViewModel';
import { StateView } from '../components/StateView';
import { resolveMockImage } from '../data/MockDataStore';
import { formatPrice } from '../common/Utils';
import {
  COLOR_PAGE_BG, COLOR_PRICE, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY, LoadState, OWN_PRODUCT_HINT
} from '../common/Constants';

@ComponentV2
export struct ProductDetailView {
  @Local vm: ProductDetailViewModel = new ProductDetailViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();
  @Local productId: string = '';

  build() {
    NavDestination() {
      Column() {
        if (this.vm.state === LoadState.CONTENT && this.vm.detail !== null) {
          Scroll() {
            Column() {
              if (this.vm.detail.product.images.length > 0) {
                Swiper() {
                  ForEach(this.vm.detail.product.images, (source: string) => {
                    Image(resolveMockImage(source)).width('100%').aspectRatio(1).objectFit(ImageFit.Cover);
                  }, (source: string): string => source);
                }
                .indicator(true).width('100%').backgroundColor(Color.White);
              } else {
                Column({ space: 8 }) {
                  Text('📷').fontSize(48);
                  Text('暂无图片').fontSize(13).fontColor(COLOR_TEXT_TERTIARY);
                }
                .width('100%').aspectRatio(1).justifyContent(FlexAlign.Center).backgroundColor(Color.White);
              }
              Column({ space: 8 }) {
                Text(this.vm.detail.product.title).fontSize(20).fontWeight(FontWeight.Bold)
                  .fontColor(COLOR_TEXT_PRIMARY).width('100%');
                Text(formatPrice(this.vm.detail.product.price)).fontSize(24).fontWeight(FontWeight.Bold)
                  .fontColor(COLOR_PRICE).width('100%');
              }
              .width('100%').padding({ left: 16, right: 16, top: 16, bottom: 8 });
              Column({ space: 8 }) {
                Text('商品描述').fontSize(13).fontColor(COLOR_TEXT_SECONDARY).width('100%');
                Text(this.vm.detail.product.description).fontSize(14).fontColor(COLOR_TEXT_PRIMARY)
                  .lineHeight(22).width('100%');
              }
              .width('100%').padding(14).backgroundColor(Color.White).borderRadius(12)
                .margin({ left: 12, right: 12, top: 10 });
              Row({ space: 10 }) {
                Image(resolveMockImage(this.vm.detail.seller.avatar)).width(42).height(42).borderRadius(21);
                Column({ space: 2 }) {
                  Text(this.vm.detail.seller.nickname).fontSize(15).fontWeight(FontWeight.Medium)
                    .fontColor(COLOR_TEXT_PRIMARY);
                  Text('卖家').fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
                }
                .alignItems(HorizontalAlign.Start).layoutWeight(1);
              }
              .width('100%').padding(14).backgroundColor(Color.White).borderRadius(12)
                .margin({ left: 12, right: 12, top: 10, bottom: 18 });
            }
            .width('100%');
          }
          .layoutWeight(1).width('100%').scrollBar(BarState.Off);
          Row() {
            if (this.vm.isOwnProduct) {
              Button(OWN_PRODUCT_HINT).enabled(false).width('100%').height(48).fontSize(15)
                .fontColor(Color.White).backgroundColor('#C9CDD4').borderRadius(24);
            } else {
              Button(this.vm.purchasing ? '提交中…' : '立即购买').enabled(!this.vm.purchasing)
                .width('100%').height(48).fontSize(16).fontColor(Color.White)
                .backgroundColor(COLOR_PRIMARY).borderRadius(24)
                .onClick(() => this.showPurchaseDialog());
            }
          }
          .width('100%').padding({ left: 12, right: 12, top: 8, bottom: 8 }).backgroundColor(Color.White);
        } else {
          Column() {
            StateView({
              state: this.vm.state,
              errorText: this.vm.lastErrorMessage,
              onRetry: (): void => {
                this.vm.load(this.productId);
              }
            });
          }
          .layoutWeight(1).width('100%');
        }
      }
      .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
    }
    .title('商品详情')
    .onReady((context: NavDestinationContext) => {
      this.pathStack = context.pathStack;
      this.productId = context.pathInfo.param as string;
      this.vm.load(this.productId);
    });
  }

  private showPurchaseDialog(): void {
    this.getUIContext().showAlertDialog({
      title: '确认购买',
      message: `确定以 ${formatPrice(this.vm.productPrice)} 购买「${this.vm.productTitle}」吗？`,
      primaryButton: {
        value: '确认购买',
        action: (): void => {
          this.confirmPurchase();
        }
      },
      secondaryButton: { value: '取消', action: (): void => { } }
    });
  }

  private async confirmPurchase(): Promise<void> {
    const success: boolean = await this.vm.purchase();
    this.getUIContext().getPromptAction().showToast({
      message: success ? '购买成功，等待卖家确认' : (this.vm.lastErrorMessage || '购买失败，请稍后重试'),
      duration: 1800
    });
  }
}
