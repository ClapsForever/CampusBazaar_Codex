import { ProductDetailViewModel } from '../viewmodel/ProductDetailViewModel';
import { StateView } from '../components/StateView';
import { formatCondition, formatPrice } from '../common/Utils';
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
                    Image(source).width('100%').aspectRatio(1).objectFit(ImageFit.Cover);
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
              Column({ space: 10 }) {
                Text(this.vm.detail.product.title).fontSize(21).fontWeight(FontWeight.Bold)
                  .fontColor(COLOR_TEXT_PRIMARY).width('100%');
                Text(formatPrice(this.vm.detail.product.price)).fontSize(26).fontWeight(FontWeight.Bold)
                  .fontColor(COLOR_PRICE).width('100%');
                Row({ space: 8 }) {
                  Text(this.vm.detail.product.status === 'SOLD' ? '已售出' : '在售')
                    .fontSize(11).fontColor('#2E9E5B')
                    .backgroundColor('#EAF6ED').borderRadius(12)
                    .padding({ left: 10, right: 10, top: 5, bottom: 5 });
                  Text('同校当面交易').fontSize(11).fontColor(COLOR_TEXT_SECONDARY)
                    .backgroundColor(COLOR_PAGE_BG).borderRadius(12)
                    .padding({ left: 10, right: 10, top: 5, bottom: 5 });
                }
              }
              .width('100%').alignItems(HorizontalAlign.Start)
              .padding(16).backgroundColor(Color.White)
              .margin({ top: 10 });
              Column({ space: 10 }) {
                if (this.vm.detail.product.category !== undefined) {
                  this.infoLine('品类', this.vm.detail.product.category);
                }
                if (formatCondition(this.vm.detail.product.condition) !== '') {
                  this.infoLine('成色', formatCondition(this.vm.detail.product.condition));
                }
                if (this.vm.detail.product.campus !== undefined) {
                  this.infoLine('地点', this.vm.detail.product.campus);
                }
              }
              .width('100%').padding(16).backgroundColor(Color.White).borderRadius(16)
              .margin({ left: 12, right: 12, top: 12 });
              Column({ space: 8 }) {
                Text('商品描述').fontSize(15).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY).width('100%');
                Text(this.vm.detail.product.description).fontSize(14).fontColor(COLOR_TEXT_PRIMARY)
                  .lineHeight(22).width('100%');
              }
              .width('100%').padding(16).backgroundColor(Color.White).borderRadius(16)
                .margin({ left: 12, right: 12, top: 12 });
              Row({ space: 10 }) {
                Image(this.vm.detail.seller.avatar).width(46).height(46).borderRadius(23);
                Column({ space: 2 }) {
                  Text(this.vm.detail.seller.nickname).fontSize(15).fontWeight(FontWeight.Medium)
                    .fontColor(COLOR_TEXT_PRIMARY);
                  Text('同校卖家').fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
                }
                .alignItems(HorizontalAlign.Start).layoutWeight(1);
              }
              .width('100%').padding(16).backgroundColor(Color.White).borderRadius(16)
                .margin({ left: 12, right: 12, top: 12 });
              Column({ space: 6 }) {
                Text('当面交易 · 线下付款').fontSize(13).fontWeight(FontWeight.Medium)
                  .fontColor(COLOR_TEXT_PRIMARY);
                Text('请在校内公共场所当面验货后付款。平台不提供在线支付和物流服务。')
                  .fontSize(12).lineHeight(18).fontColor(COLOR_TEXT_SECONDARY);
              }
              .width('100%').alignItems(HorizontalAlign.Start)
              .padding(14).backgroundColor('#FFF4EB').borderRadius(14)
              .margin({ left: 12, right: 12, top: 12, bottom: 20 });
            }
            .width('100%');
          }
          .layoutWeight(1).width('100%').scrollBar(BarState.Off);
          Row() {
            if (this.vm.isOwnProduct) {
              Button(OWN_PRODUCT_HINT).enabled(false).width('100%').height(48).fontSize(15)
                .fontColor(Color.White).backgroundColor('#C9CDD4').borderRadius(24);
            } else if (this.vm.detail.product.status === 'SOLD') {
              Button('已售出').enabled(false).width('100%').height(48).fontSize(15)
                .fontColor(Color.White).backgroundColor('#C9CDD4').borderRadius(24);
            } else {
              Button(this.vm.purchasing ? '提交中…' : '立即购买').enabled(!this.vm.purchasing)
                .width('100%').height(48).fontSize(16).fontColor(Color.White)
                .backgroundColor(COLOR_PRIMARY).borderRadius(24)
                .onClick(() => this.showPurchaseDialog());
            }
          }
          .width('100%').padding({ left: 16, right: 16, top: 10, bottom: 14 }).backgroundColor(Color.White);
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

  @Builder
  infoLine(label: string, value: string): void {
    Row({ space: 14 }) {
      Text(label).fontSize(13).fontColor(COLOR_TEXT_TERTIARY).width(38);
      Text(value).fontSize(13).fontColor(COLOR_TEXT_PRIMARY).layoutWeight(1);
    }
    .width('100%');
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
