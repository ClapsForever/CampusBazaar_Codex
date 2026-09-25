import { Product, ProductDetail, PublishDraft, User } from '../model/Models';
import { mockDataStore } from '../data/MockDataStore';
import { mockDelayVoid, isValidPrice } from '../common/Utils';
import { MAX_PRODUCT_PHOTOS } from '../common/Constants';

export interface ProductService {
  getProductFeed(): Promise<Product[]>;
  searchByKeyword(keyword: string): Promise<Product[]>;
  getProductsBySeller(sellerId: string): Promise<Product[]>;
  getProductDetail(productId: string): Promise<ProductDetail | null>;
  publishProduct(draft: PublishDraft): Promise<Product>;
}

export class MockProductService implements ProductService {
  async getProductFeed(): Promise<Product[]> {
    const list: Product[] = mockDataStore.allProductsSorted();
    await mockDelayVoid();
    return list;
  }

  async searchByKeyword(keyword: string): Promise<Product[]> {
    const normalized: string = keyword.trim().toLowerCase();
    if (normalized === '') {
      return [];
    }
    const result: Product[] = mockDataStore.allProductsSorted().filter((item: Product): boolean =>
      item.title.toLowerCase().indexOf(normalized) >= 0);
    await mockDelayVoid();
    return result;
  }

  async getProductsBySeller(sellerId: string): Promise<Product[]> {
    const list: Product[] = mockDataStore.productsBySeller(sellerId);
    await mockDelayVoid();
    return list;
  }

  async getProductDetail(productId: string): Promise<ProductDetail | null> {
    const product: Product | undefined = mockDataStore.findProductById(productId);
    const seller: User | undefined = product === undefined ? undefined : mockDataStore.findUserById(product.sellerId);
    await mockDelayVoid();
    if (product === undefined || seller === undefined) {
      return null;
    }
    return { product: product, seller: seller };
  }

  async publishProduct(draft: PublishDraft): Promise<Product> {
    if (draft.title.trim() === '') {
      throw new Error('请输入商品名称');
    }
    if (draft.description.trim() === '') {
      throw new Error('请输入商品描述');
    }
    if (!isValidPrice(`${draft.price}`)) {
      throw new Error('请输入大于 0 的合法价格');
    }
    const current: User | null = mockDataStore.currentUser;
    if (current === null) {
      throw new Error('请先登录');
    }
    const images: string[] = draft.images.slice(0, MAX_PRODUCT_PHOTOS);
    const created: Product = mockDataStore.addProduct({
      title: draft.title.trim(),
      description: draft.description.trim(),
      price: draft.price,
      images: images
    }, current.id);
    await mockDelayVoid();
    return created;
  }
}

export const productService: ProductService = new MockProductService();
