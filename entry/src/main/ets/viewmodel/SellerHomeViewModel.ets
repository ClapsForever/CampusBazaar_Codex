import { Product, User } from '../model/Models';
import { productService } from '../service/ProductService';
import { authService } from '../service/AuthenticationService';
import { LoadState } from '../common/Constants';

@ObservedV2
export class SellerHomeViewModel {
  @Trace state: LoadState = LoadState.LOADING;
  @Trace products: Product[] = [];
  @Trace error: string = '';
  @Trace actionError: string = '';
  @Trace delistingId: string = '';
  private requestSeq: number = 0;

  async loadMyProducts(silent: boolean = false): Promise<void> {
    if (this.delistingId !== '') return;
    const seq: number = ++this.requestSeq;
    this.error = '';
    const current: User | null = authService.getCurrentUser();
    if (current === null) {
      this.state = LoadState.ERROR;
      return;
    }
    if (!silent && this.products.length === 0) {
      this.state = LoadState.LOADING;
    }
    try {
      const result: Product[] = await productService.getProductsBySeller(current.id);
      if (seq !== this.requestSeq || authService.getCurrentUser()?.id !== current.id) {
        return;
      }
      this.products = result;
      this.state = result.length > 0 ? LoadState.CONTENT : LoadState.EMPTY;
    } catch (_error) {
      if (seq === this.requestSeq) {
        this.error = '加载失败，请检查网络后重试';
        this.state = this.products.length > 0 ? LoadState.CONTENT : LoadState.ERROR;
      }
    }
  }

  async delist(productId: string): Promise<boolean> {
    const current: User | null = authService.getCurrentUser();
    const product: Product | undefined = this.products.find((item: Product): boolean => item.id === productId);
    if (this.delistingId !== '' || current === null || product === undefined ||
      product.sellerId !== current.id || product.status !== 'ACTIVE') {
      return false;
    }
    const seq: number = ++this.requestSeq;
    this.delistingId = productId;
    this.actionError = '';
    try {
      const updated: Product = await productService.delistProduct(productId);
      if (seq !== this.requestSeq || authService.getCurrentUser()?.id !== current.id) return false;
      this.products = this.products.map((item: Product): Product => item.id === productId ? updated : item);
      return true;
    } catch (error) {
      if (seq === this.requestSeq && authService.getCurrentUser()?.id === current.id) {
        this.actionError = (error as Error).message || '下架失败，请稍后重试';
      }
      return false;
    } finally {
      this.delistingId = '';
    }
  }
}
