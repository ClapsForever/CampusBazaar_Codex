import { Product, ProductDetail, User } from '../model/Models';
import { productService } from '../service/ProductService';
import { transactionService } from '../service/TransactionService';
import { authService } from '../service/AuthenticationService';
import { LoadState } from '../common/Constants';

@ObservedV2
export class ProductDetailViewModel {
  @Trace detail: ProductDetail | null = null;
  @Trace state: LoadState = LoadState.LOADING;
  @Trace purchasing: boolean = false;
  @Trace reserved: boolean = false;
  @Trace delisting: boolean = false;
  @Trace lastErrorMessage: string = '';

  get productTitle(): string {
    return this.detail === null ? '' : this.detail.product.title;
  }

  get productPrice(): number {
    return this.detail === null ? 0 : this.detail.product.price;
  }

  get isOwnProduct(): boolean {
    const current: User | null = authService.getCurrentUser();
    return current !== null && this.detail !== null && current.id === this.detail.product.sellerId;
  }

  async load(productId: string): Promise<void> {
    this.state = LoadState.LOADING;
    this.lastErrorMessage = '';
    try {
      const result: ProductDetail | null = await productService.getProductDetail(productId);
      if (result === null) {
        this.state = LoadState.ERROR;
        this.lastErrorMessage = '商品不存在或已下架';
      } else {
        this.detail = result;
        this.state = LoadState.CONTENT;
      }
    } catch (_error) {
      this.state = LoadState.ERROR;
      this.lastErrorMessage = '加载失败，请稍后重试';
    }
  }

  async purchase(): Promise<boolean> {
    if (this.detail === null || this.purchasing || this.reserved || this.isOwnProduct ||
      this.detail.product.status !== 'ACTIVE') {
      return false;
    }
    const current: User | null = authService.getCurrentUser();
    if (current === null) {
      this.lastErrorMessage = '请先登录';
      return false;
    }
    this.purchasing = true;
    try {
      await transactionService.createTransaction(this.detail.product.id, current.id);
      this.reserved = true;
      return true;
    } catch (error) {
      this.lastErrorMessage = (error as Error).message;
      return false;
    } finally {
      this.purchasing = false;
    }
  }

  async delist(): Promise<boolean> {
    if (this.detail === null || this.delisting || !this.isOwnProduct ||
      this.detail.product.status !== 'ACTIVE') {
      return false;
    }
    this.delisting = true;
    this.lastErrorMessage = '';
    try {
      const updated: Product = await productService.delistProduct(this.detail.product.id);
      this.detail = { product: updated, seller: this.detail.seller };
      return true;
    } catch (error) {
      this.lastErrorMessage = (error as Error).message;
      return false;
    } finally {
      this.delisting = false;
    }
  }
}
