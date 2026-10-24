import { Product } from '../model/Models';
import { productService, ProductSearchQuery } from '../service/ProductService';
import { ProductCard } from '../components/ProductCard';
import { CAMPUS_OPTIONS, PRICE_RANGE_OPTIONS, PriceRangeOption, QUICK_CATEGORIES } from '../common/MarketOptions';
import {
  UI_RADIUS, COLOR_DIVIDER, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_STRONG, COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY,
  ROUTE_PRODUCT_DETAIL
} from '../common/Constants';

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
  @Local priceLabels: string[] = [];
  @Local categories: string[] = [];
  @Local campuses: string[] = [];
  private timerId: number = -1;
  private searchSeq: number = 0;

  aboutToDisappear(): void {
    this.searchSeq += 1;
    if (this.timerId >= 0) {
      clearTimeout(this.timerId);
    }
  }

  build() {
    Column({ space: 12 }) {
      Text('搜索商品').fontSize('20fp').fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
        .width('100%').margin({ top: 8 });
      TextInput({ placeholder: '搜索同学们发布的闲置物品', text: this.keyword })
        .height(50).fontSize('14fp').backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
        .padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.keyword = value;
          this.error = '';
          this.scheduleSearch();
        })
        .enterKeyType(EnterKeyType.Search)
        .onSubmit(() => this.scheduleSearch());
      this.priceFilters();
      this.categoryFilters();
      this.campusFilters();
      if (this.hasFilters()) {
        Row({ space: 8 }) {
          Text(this.filterSummary()).fontSize('11fp').fontColor(COLOR_TEXT_TERTIARY)
            .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis });
          Text('清除筛选').fontSize('12fp').fontColor(COLOR_PRIMARY).padding({ left: 8, right: 8, top: 6, bottom: 6 })
            .onClick(() => this.clearFilters());
        }
        .width('100%');
      }
      if (this.loading) {
        Row({ space: 8 }) {
          LoadingProgress().width(22).height(22).color(COLOR_PRIMARY);
          Text('搜索中…').fontSize('13fp').fontColor(COLOR_TEXT_TERTIARY);
        }
        .width('100%').justifyContent(FlexAlign.Center);
      } else if (!this.searched) {
        Text('输入商品名称或选择筛选条件开始搜索').fontSize('14fp').fontColor(COLOR_TEXT_TERTIARY)
          .width('100%').textAlign(TextAlign.Center).margin({ top: 26 });
      } else if (this.error !== '') {
        Text(this.error).fontSize('14fp').fontColor(COLOR_TEXT_SECONDARY).width('100%').textAlign(TextAlign.Center);
        Button('重试').type(ButtonType.Normal).height(44).fontColor(COLOR_PRIMARY).borderRadius(UI_RADIUS).onClick(() => this.scheduleSearch());
      } else if (this.results.length === 0) {
        Text('无匹配商品').fontSize('16fp').fontColor(COLOR_TEXT_SECONDARY).width('100%')
          .textAlign(TextAlign.Center).margin({ top: 26 });
        Text('换个关键词或筛选条件试试').fontSize('13fp').fontColor(COLOR_TEXT_TERTIARY).width('100%')
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

  @Builder
  priceFilters(): void {
    Row({ space: 8 }) {
      Text('价格').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY).width(32);
      Scroll() {
        Row({ space: 6 }) {
          ForEach(PRICE_RANGE_OPTIONS, (option: PriceRangeOption) => {
            Text(option.label).fontSize('12fp')
              .fontWeight(this.isSelected(this.priceLabels, option.label) ? FontWeight.Medium : FontWeight.Normal)
              .fontColor(this.isSelected(this.priceLabels, option.label) ? Color.White : COLOR_TEXT_SECONDARY)
              .padding({ left: 12, right: 12, top: 6, bottom: 6 })
              .backgroundColor(this.isSelected(this.priceLabels, option.label) ? COLOR_PRIMARY_STRONG : Color.White)
              .borderRadius(UI_RADIUS)
              .border({ width: this.isSelected(this.priceLabels, option.label) ? 0 : 1, color: COLOR_DIVIDER })
              .onClick(() => {
                this.priceLabels = this.toggle(this.priceLabels, option.label);
                this.scheduleSearch();
              });
          }, (option: PriceRangeOption): string => option.label);
        }
      }
      .scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).layoutWeight(1);
    }
    .width('100%');
  }

  @Builder
  categoryFilters(): void {
    Row({ space: 8 }) {
      Text('大类').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY).width(32);
      Scroll() {
        Row({ space: 6 }) {
          ForEach(QUICK_CATEGORIES, (item: string) => {
            Text(item).fontSize('12fp')
              .fontWeight(this.isSelected(this.categories, item) ? FontWeight.Medium : FontWeight.Normal)
              .fontColor(this.isSelected(this.categories, item) ? Color.White : COLOR_TEXT_SECONDARY)
              .padding({ left: 12, right: 12, top: 6, bottom: 6 })
              .backgroundColor(this.isSelected(this.categories, item) ? COLOR_PRIMARY_STRONG : Color.White)
              .borderRadius(UI_RADIUS)
              .border({ width: this.isSelected(this.categories, item) ? 0 : 1, color: COLOR_DIVIDER })
              .onClick(() => {
                this.categories = this.toggle(this.categories, item);
                this.scheduleSearch();
              });
          }, (item: string): string => item);
        }
      }
      .scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).layoutWeight(1);
    }
    .width('100%');
  }

  @Builder
  campusFilters(): void {
    Row({ space: 8 }) {
      Text('校区').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY).width(32);
      Scroll() {
        Row({ space: 6 }) {
          ForEach(CAMPUS_OPTIONS, (item: string) => {
            Text(item).fontSize('12fp')
              .fontWeight(this.isSelected(this.campuses, item) ? FontWeight.Medium : FontWeight.Normal)
              .fontColor(this.isSelected(this.campuses, item) ? Color.White : COLOR_TEXT_SECONDARY)
              .padding({ left: 12, right: 12, top: 6, bottom: 6 })
              .backgroundColor(this.isSelected(this.campuses, item) ? COLOR_PRIMARY_STRONG : Color.White)
              .borderRadius(UI_RADIUS)
              .border({ width: this.isSelected(this.campuses, item) ? 0 : 1, color: COLOR_DIVIDER })
              .onClick(() => {
                this.campuses = this.toggle(this.campuses, item);
                this.scheduleSearch();
              });
          }, (item: string): string => item);
        }
      }
      .scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).layoutWeight(1);
    }
    .width('100%');
  }

  private isSelected(values: string[], value: string): boolean {
    return values.indexOf(value) >= 0;
  }

  private toggle(values: string[], value: string): string[] {
    if (this.isSelected(values, value)) {
      return values.filter((item: string): boolean => item !== value);
    }
    return values.concat([value]);
  }

  private hasFilters(): boolean {
    return this.priceLabels.length > 0 || this.categories.length > 0 || this.campuses.length > 0;
  }

  private filterSummary(): string {
    const labels: string[] = this.priceLabels.concat(this.categories).concat(this.campuses);
    return labels.join(' · ');
  }

  private clearFilters(): void {
    this.priceLabels = [];
    this.categories = [];
    this.campuses = [];
    this.scheduleSearch();
  }

  private currentQuery(): ProductSearchQuery {
    const ranges: string[] = [];
    for (const label of this.priceLabels) {
      const option: PriceRangeOption | undefined = PRICE_RANGE_OPTIONS.find(
        (item: PriceRangeOption): boolean => item.label === label);
      if (option !== undefined) {
        ranges.push(option.value);
      }
    }
    return {
      keyword: this.keyword, categories: this.categories, campuses: this.campuses, priceRanges: ranges
    };
  }

  private scheduleSearch(): void {
    this.error = "";
    if (this.timerId >= 0) {
      clearTimeout(this.timerId);
    }
    this.searchSeq += 1;
    const seq: number = this.searchSeq;
    const query: ProductSearchQuery = this.currentQuery();
    if (query.keyword.trim() === '' && query.categories.length === 0 && query.campuses.length === 0 &&
      query.priceRanges.length === 0) {
      this.results = [];
      this.searched = false;
      this.loading = false;
      return;
    }
    this.loading = true;
    this.timerId = setTimeout(async () => {
      try {
        const result: Product[] = await productService.searchProducts(query);
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
