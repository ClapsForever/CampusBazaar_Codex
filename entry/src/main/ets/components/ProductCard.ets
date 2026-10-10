import { Product } from '../model/Models';
import { formatCondition, formatPrice } from '../common/Utils';
import { COLOR_PAGE_BG, COLOR_PRICE, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY } from '../common/Constants';

@ComponentV2
export struct ProductCard {
  @Require @Param product: Product;
  @Event onCardClick: (product: Product) => void = (_product: Product): void => {
  };

  build() {
    Column() {
      if (this.product.images.length > 0) {
        Image(this.product.images[0])
          .width('100%')
          .aspectRatio(1)
          .objectFit(ImageFit.Cover)
          .borderRadius({ topLeft: 16, topRight: 16 })
          .backgroundColor(COLOR_PAGE_BG);
      } else {
        Column({ space: 4 }) {
          Text('📷').fontSize(28);
          Text('暂无图片').fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
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
          .fontSize(13)
          .fontColor(COLOR_TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis });
        Text(formatPrice(this.product.price))
          .width('100%')
          .fontSize(18)
          .fontColor(COLOR_PRICE)
          .fontWeight(FontWeight.Bold);
        if (this.product.category !== undefined || formatCondition(this.product.condition) !== '') {
          Row({ space: 5 }) {
            if (formatCondition(this.product.condition) !== '') {
              Text(formatCondition(this.product.condition)).fontSize(10)
                .fontColor(COLOR_TEXT_SECONDARY).backgroundColor(COLOR_PAGE_BG)
                .borderRadius(8).padding({ left: 6, right: 6, top: 3, bottom: 3 });
            }
            if (this.product.category !== undefined) {
              Text(this.product.category).fontSize(10).fontColor(COLOR_TEXT_SECONDARY)
                .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
                .backgroundColor(COLOR_PAGE_BG).borderRadius(8)
                .padding({ left: 6, right: 6, top: 3, bottom: 3 });
            }
          }
          .width('100%');
        }
        if (this.product.campus !== undefined && this.product.campus !== '') {
          Text(this.product.campus).fontSize(10).fontColor(COLOR_TEXT_TERTIARY)
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis });
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding(12);
    }
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(Color.White)
    .borderRadius(16)
    .clip(true)
    .onClick(() => this.onCardClick(this.product));
  }
}
