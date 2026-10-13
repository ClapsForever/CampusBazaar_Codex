import { AppError } from "../errors/index.js";
import type { BusinessReadClient } from "./types.js";
import type {
  ListingDetail,
  ListingSummary,
  SearchListingsInput,
  SearchListingsResult,
  UserContext,
  UserPreferences,
} from "../contracts/index.js";
import { isListingId, isListingSummary } from "../contracts/index.js";

export interface HttpBusinessClientOptions {
  baseUrl: string;
  token?: string;
  searchPath: string;
  detailPath: string;
  preferencesPath: string;
  timeoutMs: number;
}

export class HttpBusinessClient implements BusinessReadClient {
  public readonly source = "business_backend" as const;

  constructor(private readonly options: HttpBusinessClientOptions) {}

  async searchListings(input: SearchListingsInput, user: UserContext, signal?: AbortSignal): Promise<SearchListingsResult> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) params.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
    return this.request<SearchListingsResult>(`${this.options.searchPath}?${params.toString()}`, user, signal, (body) => {
      if (!body || typeof body !== "object") throw new Error("searchListings 返回不是对象");
      const result = body as Partial<SearchListingsResult>;
      const listings = Array.isArray(result.listings) ? result.listings.map(normalizeListing) : [];
      if (!Array.isArray(result.listings) || listings.some((listing) => !listing)) throw new Error("商品摘要字段校验失败");
      if (!Number.isInteger(result.page) || !Number.isInteger(result.pageSize) || !Number.isInteger(result.total)) throw new Error("分页字段校验失败");
      return { ...result, listings: listings as ListingSummary[], source: "business_backend" } as SearchListingsResult;
    });
  }

  async getListingDetail(listingId: string, user: UserContext, signal?: AbortSignal): Promise<ListingDetail> {
    if (!isListingId(listingId)) throw new AppError("TOOL_INPUT_INVALID", "listingId 格式不合法");
    return this.request<ListingDetail>(this.options.detailPath.replace("{listingId}", encodeURIComponent(listingId)), user, signal, (body) => {
      const listing = normalizeListing(body);
      if (!listing || !isListingDetail(body)) throw new Error("商品详情字段校验失败");
      return { ...listing, sellerLabel: (body as { sellerLabel: string }).sellerLabel, publishedAt: (body as { publishedAt: string }).publishedAt, ...(typeof (body as { version?: unknown }).version === "string" ? { version: (body as { version: string }).version } : {}) };
    });
  }

  async getUserPreferences(user: UserContext, signal?: AbortSignal): Promise<UserPreferences> {
    return this.request<UserPreferences>(this.options.preferencesPath, user, signal, (body) => {
      if (!body || typeof body !== "object") throw new Error("用户偏好返回不是对象");
      const value = body as Partial<UserPreferences>;
      if (!Array.isArray(value.favoriteCategories) || !value.favoriteCategories.every((item) => typeof item === "string")) throw new Error("favoriteCategories 字段校验失败");
      if (!Array.isArray(value.preferredCampuses) || !value.preferredCampuses.every((item) => typeof item === "string")) throw new Error("preferredCampuses 字段校验失败");
      return { ...value, source: "business_backend" } as UserPreferences;
    });
  }

  private async request<T>(path: string, user: UserContext, signal: AbortSignal | undefined, validate: (body: unknown) => T): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(new URL(path, this.options.baseUrl), {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-user-id": user.userId,
          "x-school-id": user.schoolId,
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        signal: controller.signal,
      });
      if (response.status === 404 || response.status === 403) throw new AppError("LISTING_NOT_FOUND", "商品不存在、已下架或无权限");
      if (!response.ok) throw new AppError("BACKEND_UNAVAILABLE", `业务后端返回 HTTP ${response.status}`, { retryable: response.status >= 500 });
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new AppError("BACKEND_UNAVAILABLE", "业务后端返回了不可解析的 JSON", { cause: error });
      }
      try {
        return validate(body);
      } catch (error) {
        throw new AppError("BACKEND_UNAVAILABLE", error instanceof Error ? error.message : "业务后端响应校验失败", { cause: error });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) throw new AppError("BACKEND_TIMEOUT", "业务后端请求超时", { retryable: true, cause: error });
      throw new AppError("BACKEND_UNAVAILABLE", "业务后端不可用", { retryable: true, cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function isListingDetail(value: unknown): value is ListingDetail {
  if (!value || typeof value !== "object") return false;
  const listing = value as Partial<ListingDetail>;
  return typeof listing.sellerLabel === "string" && typeof listing.publishedAt === "string";
}

function normalizeListing(value: unknown): ListingSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  let priceCents: number | undefined;
  if (typeof raw.priceCents === "number" && Number.isFinite(raw.priceCents)) priceCents = Math.round(raw.priceCents);
  else if (typeof raw.priceCents === "string" && /^\d+(?:\.\d+)?$/u.test(raw.priceCents)) priceCents = Math.round(Number(raw.priceCents));
  else if (typeof raw.price === "number" && Number.isFinite(raw.price)) priceCents = Math.round(raw.price * 100);
  else if (typeof raw.price === "string" && /^\d+(?:\.\d+)?$/u.test(raw.price)) priceCents = Math.round(Number(raw.price) * 100);
  if (priceCents === undefined) return undefined;
  const normalized = { ...raw, priceCents };
  return isListingSummary(normalized) ? normalized : undefined;
}
