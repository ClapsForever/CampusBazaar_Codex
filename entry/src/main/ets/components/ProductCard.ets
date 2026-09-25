import { Product } from '../model/Models';
import { resolveMockImage } from '../data/MockDataStore';
import { formatPrice } from '../common/Utils';
import { COLOR_PRICE, COLOR_TEXT_PRIMARY, COLOR_TEXT_TERTIARY } from '../common/Constants';

@ComponentV2
export struct ProductCard {
  @Require @Param product: Product;
  @Event onCardClick: (product: Product) => void = (_product: Product): void => {
  };

  build() {
    Column() {
      if (this.product.images.length > 0) {
        Image(resolveMockImage(this.product.images[0]))
          .width('100%')
          .aspectRatio(1)
          .objectFit(ImageFit.Cover)
          .borderRadius({ topLeft: 12, topRight: 12 })
          .backgroundColor('#F2F3F5');
      } else {
        Column({ space: 4 }) {
          Text('📷').fontSize(28);
          Text('暂无图片').fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
        }
        .width('100%')
        .aspectRatio(1)
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#F2F3F5')
        .borderRadius({ topLeft: 12, topRight: 12 });
      }
      Column({ space: 6 }) {
        Text(this.product.title)
          .fontSize(14)
          .fontColor(COLOR_TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis });
        Text(formatPrice(this.product.price))
          .fontSize(16)
          .fontColor(COLOR_PRICE)
          .fontWeight(FontWeight.Bold);
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding(10);
    }
    .backgroundColor(Color.White)
    .borderRadius(12)
    .clip(true)
    .onClick(() => this.onCardClick(this.product));
  }
}
