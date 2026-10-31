import { Product } from '../../../model/Models';
import { GRID_GAP } from '../common/Constants';
import { ProductCard } from './ProductCard';

@ComponentV2
export struct ProductGrid {
  @Require @Param products: Product[];
  @Param scroller: Scroller = new Scroller();
  @Event onCardClick: (product: Product) => void = (_product: Product): void => {
  };
  @Event onScrollIndex: (first: number, last: number) => void = (_first: number, _last: number): void => {
  };
  @Local itemWidth: number = 0;

  build() {
    WaterFlow({ scroller: this.scroller }) {
      // Measure the viewport before creating cards so their percentage sizes
      // cannot resolve against the full WaterFlow width instead of one lane.
      if (this.itemWidth > 0) {
        ForEach(this.products, (item: Product) => {
          FlowItem() {
            ProductCard({
              product: item,
              cardWidth: this.itemWidth,
              onCardClick: (product: Product): void => this.onCardClick(product)
            });
          }
          .width(this.itemWidth).clip(true);
        }, (item: Product): string => item.id);
      }
    }
    .columnsTemplate('1fr 1fr').columnsGap(GRID_GAP).rowsGap(GRID_GAP)
    .width('100%').height('100%').scrollBar(BarState.Off)
    .onSizeChange((_oldSize: SizeOptions, newSize: SizeOptions) => {
      // Use this container's available width, including split-screen/resizes.
      this.itemWidth = Math.max(0, (Number(newSize.width) - GRID_GAP) / 2);
    })
    .onScrollIndex((first: number, last: number) => this.onScrollIndex(first, last));
  }
}
