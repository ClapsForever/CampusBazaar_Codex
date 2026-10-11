import { Product } from '../model/Models';
import { formatCondition, formatPrice } from '../common/Utils';
import { CARD_RADIUS, FONT_PRODUCT, FONT_PRICE, FONT_META, COLOR_PAGE_BG, COLOR_PRICE, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY } from '../common/Constants';

@ComponentV2
export struct ProductCard {
  @Require @Param product: Product;
  @Event onCardClick: (product: Product) => void = (_product: Product): void => {
  };

  @Local imageFailed: boolean = false;

  @Monitor('product')
  resetImage(): void {
    this.imageFailed = false;
  }

  build() {
    Column() {
      if (this.product.images.length > 0 && !this.imageFailed) {
        Image(this.product.images[0])
          .width('100%')
          .aspectRatio(1)
          .objectFit(ImageFit.Cover)
          .borderRadius({ topLeft: 16, topRight: 16 })
          .backgroundColor(COLOR_PAGE_BG)
          .onError(() => this.imageFailed = true);
      } else {
        Column({ space: 4 }) {
          Image($r('app.media.design_photo')).width(28).height(28);
          Text('暂无图片').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
        }
        .width('100%')
        .aspectRatio(1)
        .justifyContent(FlexAlign.Center)
        .backgroundColor(COLOR_PAGE_BG)
        .borderRadius({ topLeft: 16, topRight: 16 });
      }
      Column({ space: 8 }) {
        Text(this.product.title)
          .width('100%')
          .fontSize(FONT_PRODUCT)
          .fontColor(COLOR_TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis });
        Text(formatPrice(this.product.price))
          .width('100%')
          .fontSize(FONT_PRICE)
          .fontColor(COLOR_PRICE)
          .fontWeight(FontWeight.Bold);
        Text(formatCondition(this.product.condition)).fontSize(FONT_META)
          .fontColor(COLOR_TEXT_SECONDARY).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%');
        if (this.product.campus !== undefined && this.product.campus !== '') {
          Text(this.product.campus).fontSize(FONT_META).fontColor(COLOR_TEXT_TERTIARY)
            .width('100%').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis });
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding(12);
    }
    .width('100%').alignItems(HorizontalAlign.Start)
    .backgroundColor(Color.White)
    .borderRadius(CARD_RADIUS)
    .clip(true)
    .onClick(() => this.onCardClick(this.product));
  }
}
