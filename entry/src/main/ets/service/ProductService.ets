import { Product, ProductDetail, PublishDraft } from '../model/Models';
import { MAX_PRODUCT_PHOTOS } from '../common/Constants';
import { readPhoto, UploadBytes } from './ImageUpload';
import { http } from '@kit.NetworkKit';
import { businessApiClient, BusinessApiError } from './BusinessApiClient';

export interface ProductService {
  getProductFeed(): Promise<Product[]>;
  searchByKeyword(keyword: string): Promise<Product[]>;
  getProductsBySeller(sellerId: string): Promise<Product[]>;
  getProductDetail(productId: string): Promise<ProductDetail | null>;
  publishProduct(draft: PublishDraft): Promise<Product>;
}

interface ProductListResponse {
  items: Product[];
  nextCursor: string | null;
}

export class HttpProductService implements ProductService {
  private async list(path: string): Promise<Product[]> {
    const result: Product[] = [];
    let cursor: string | null = null;
    for (let page: number = 0; page < 20; page += 1) {
      const response: ProductListResponse = await businessApiClient.request<ProductListResponse>(http.RequestMethod.GET,
        `${path}${path.indexOf('?') >= 0 ? '&' : '?'}limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`);
      for (const item of response.items) {
        result.push(item);
      }
      cursor = response.nextCursor;
      if (cursor === null) {
        break;
      }
    }
    return result;
  }

  async getProductFeed(): Promise<Product[]> {
    return this.list('/api/v1/products');
  }

  async searchByKeyword(keyword: string): Promise<Product[]> {
    if (keyword.trim() === '') {
      return [];
    }
    return this.list(`/api/v1/products?q=${encodeURIComponent(keyword.trim())}`);
  }

  async getProductsBySeller(_sellerId: string): Promise<Product[]> {
    return this.list('/api/v1/me/products');
  }

  async getProductDetail(productId: string): Promise<ProductDetail | null> {
    try {
      return await businessApiClient.request<ProductDetail>(http.RequestMethod.GET,
        `/api/v1/products/${encodeURIComponent(productId)}`);
    } catch (error) {
      if (error instanceof BusinessApiError && error.statusCode === 404) {
        return null;
      }
      throw new Error((error as Error).message);
    }
  }

  async publishProduct(draft: PublishDraft): Promise<Product> {
    const imageIds: string[] = [];
    for (const uri of draft.images.slice(0, MAX_PRODUCT_PHOTOS)) {
      const image: UploadBytes = readPhoto(uri);
      imageIds.push(await businessApiClient.uploadImage(image.bytes, image.mime));
    }
    return await businessApiClient.request<Product>(http.RequestMethod.POST, '/api/v1/products', JSON.stringify({
      title: draft.title.trim(), description: draft.description.trim(), price: draft.price,
      imageIds: imageIds, category: draft.category || '其他', condition: draft.condition || 'unknown',
      campus: draft.campus || '未填写校区'
    }));
  }
}

export const productService: ProductService = new HttpProductService();
