import { Product } from '../model/Models';
import { productService } from '../service/ProductService';
import { LoadState } from '../common/Constants';

@ObservedV2
export class BuyerHomeViewModel {
  @Trace feedState: LoadState = LoadState.LOADING;
  @Trace products: Product[] = [];
  @Trace searchKeyword: string = '';
  @Trace searchResults: Product[] = [];
  @Trace searching: boolean = false;
  @Trace searchDone: boolean = false;
  private searchSeq: number = 0;

  async loadFeed(silent: boolean = false): Promise<void> {
    if (!silent) {
      this.feedState = LoadState.LOADING;
    }
    try {
      const result: Product[] = await productService.getProductFeed();
      this.products = result;
      this.feedState = result.length > 0 ? LoadState.CONTENT : LoadState.EMPTY;
    } catch (_error) {
      this.feedState = LoadState.ERROR;
    }
  }

  async doSearch(keyword: string): Promise<void> {
    const value: string = keyword.trim();
    this.searchKeyword = value;
    this.searchSeq += 1;
    const currentSeq: number = this.searchSeq;
    if (value === '') {
      this.searchResults = [];
      this.searching = false;
      this.searchDone = false;
      return;
    }
    this.searching = true;
    try {
      const result: Product[] = await productService.searchByKeyword(value);
      if (currentSeq === this.searchSeq) {
        this.searchResults = result;
        this.searchDone = true;
      }
    } catch (_error) {
      if (currentSeq === this.searchSeq) {
        this.searchResults = [];
        this.searchDone = true;
      }
    } finally {
      if (currentSeq === this.searchSeq) {
        this.searching = false;
      }
    }
  }
}
