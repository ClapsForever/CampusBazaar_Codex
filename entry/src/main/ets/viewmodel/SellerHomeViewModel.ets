import { Product, User } from '../model/Models';
import { productService } from '../service/ProductService';
import { authService } from '../service/AuthenticationService';
import { LoadState } from '../common/Constants';

@ObservedV2
export class SellerHomeViewModel {
  @Trace state: LoadState = LoadState.LOADING;
  @Trace products: Product[] = [];

  async loadMyProducts(silent: boolean = false): Promise<void> {
    const current: User | null = authService.getCurrentUser();
    if (current === null) {
      this.state = LoadState.ERROR;
      return;
    }
    if (!silent) {
      this.state = LoadState.LOADING;
    }
    try {
      const result: Product[] = await productService.getProductsBySeller(current.id);
      this.products = result;
      this.state = result.length > 0 ? LoadState.CONTENT : LoadState.EMPTY;
    } catch (_error) {
      this.state = LoadState.ERROR;
    }
  }
}
