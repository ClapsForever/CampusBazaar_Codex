import { Product } from '../model/Models';
import { productService } from '../service/ProductService';
import { ProductCard } from '../components/ProductCard';
import { COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, ROUTE_PRODUCT_DETAIL } from '../common/Constants';

@ComponentV2
export struct SearchSheetView {
  @Require @Param pathStack: NavPathStack;
  @Event onClose: () => void = (): void => {
  };
  @Local keyword: string = '';
  @Local results: Product[] = [];
  @Local loading: boolean = false;
  @Local searched: boolean = false;
  @Local error: string = '';
  private timerId: number = -1;
  private searchSeq: number = 0;

  build() {
    Column({ space: 12 }) {
      Text('搜索商品').fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
        .width('100%').margin({ top: 8 });
      TextInput({ placeholder: '按商品名称搜索', text: this.keyword })
        .height(48).fontSize(15).backgroundColor('#F1F3F5').borderRadius(10)
        .padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.keyword = value;
          this.error = '';
          this.scheduleSearch();
        });
      if (this.loading) {
        Row({ space: 8 }) {
          LoadingProgress().width(22).height(22).color(COLOR_PRIMARY);
          Text('搜索中…').fontSize(13).fontColor(COLOR_TEXT_TERTIARY);
        }
        .width('100%').justifyContent(FlexAlign.Center);
      } else if (!this.searched) {
        Text('输入商品名称开始搜索').fontSize(14).fontColor(COLOR_TEXT_TERTIARY)
          .width('100%').textAlign(TextAlign.Center).margin({ top: 26 });
      } else if (this.error !== '') {
        Text(this.error).fontSize(14).fontColor(COLOR_TEXT_SECONDARY).width('100%').textAlign(TextAlign.Center);
      } else if (this.results.length === 0) {
        Text('无匹配商品').fontSize(16).fontColor(COLOR_TEXT_SECONDARY).width('100%')
          .textAlign(TextAlign.Center).margin({ top: 26 });
        Text('换个关键词试试吧').fontSize(13).fontColor(COLOR_TEXT_TERTIARY).width('100%')
          .textAlign(TextAlign.Center);
      } else {
        List({ space: 10 }) {
          ForEach(this.results, (item: Product) => {
            ListItem() {
              ProductCard({
                product: item,
                onCardClick: (product: Product): void => {
                  this.onClose();
                  this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, product.id);
                }
              });
            }
          }, (item: Product): string => item.id);
        }
        .layoutWeight(1).width('100%').scrollBar(BarState.Off);
      }
    }
    .width('100%').height('100%').padding({ left: 16, right: 16, bottom: 20 });
  }

  private scheduleSearch(): void {
    if (this.timerId >= 0) {
      clearTimeout(this.timerId);
    }
    const value: string = this.keyword.trim();
    this.searchSeq += 1;
    const seq: number = this.searchSeq;
    if (value === '') {
      this.results = [];
      this.searched = false;
      this.loading = false;
      return;
    }
    this.loading = true;
    this.timerId = setTimeout(async () => {
      try {
        const result: Product[] = await productService.searchByKeyword(value);
        if (seq === this.searchSeq) {
          this.results = result;
          this.searched = true;
        }
      } catch (_error) {
        if (seq === this.searchSeq) {
          this.error = '搜索失败，请稍后重试';
          this.searched = true;
        }
      } finally {
        if (seq === this.searchSeq) {
          this.loading = false;
        }
      }
    }, 280);
  }
}
