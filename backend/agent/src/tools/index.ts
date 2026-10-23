import { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "@earendil-works/pi-ai";
import { Check } from "typebox/value";
import { allowedToolNames, type BusinessAction } from "../agent/policy.js";
import type { BusinessReadClient } from "../clients/types.js";
import { AppError } from "../errors/index.js";
import {
  isListingId,
  listingToModelView,
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
  type SearchListingsInput,
  type SearchFilters,
  type UserContext,
} from "../contracts/index.js";

const SearchListingsParameters = Type.Object({
  keyword: Type.Optional(Type.String({ maxLength: 120, description: "商品关键词，不要包含身份字段" })),
  queryTerms: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80, pattern: "\\S" }), { minItems: 1, maxItems: 12, uniqueItems: true })),
  category: Type.Optional(Type.String({ maxLength: 40, description: "商品类别" })),
  minPriceCents: Type.Optional(Type.Integer({ minimum: PRICE_MIN_CENTS, maximum: PRICE_MAX_CENTS })),
  maxPriceCents: Type.Optional(Type.Integer({ minimum: PRICE_MIN_CENTS, maximum: PRICE_MAX_CENTS })),
  campus: Type.Optional(Type.String({ maxLength: 40, description: "必须满足的取货校区" })),
  preferredCampus: Type.Optional(Type.String({ maxLength: 40, description: "用户偏好的取货校区，不能擅自当成硬条件" })),
  condition: Type.Optional(Type.Union([
    Type.Literal("new"),
    Type.Literal("like_new"),
    Type.Literal("good"),
    Type.Literal("fair"),
    Type.Literal("unknown"),
  ])),
  version: Type.Optional(Type.String({ maxLength: 80 })),
  sort: Type.Optional(Type.Union([Type.Literal("price_asc"), Type.Literal("price_desc"), Type.Literal("published_desc")])),
  resultLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  excludeKeywords: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { maxItems: 5 })),
  page: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
}, { additionalProperties: false });

const ListingDetailParameters = Type.Object({
  listingId: Type.String({ pattern: "^listing_[a-z0-9_-]{1,64}$" }),
}, { additionalProperties: false });

type SearchParams = Static<typeof SearchListingsParameters>;
type DetailParams = Static<typeof ListingDetailParameters>;

export interface ToolRuntimeContext {
  client: BusinessReadClient;
  user: UserContext;
  maxResults: number;
  allowedListingIds: Set<string>;
  action: BusinessAction;
  filters: SearchFilters;
  onSearchResult?: (listingIds: string[]) => void;
}

function ensureSearchInput(params: SearchParams, runtime: ToolRuntimeContext): SearchListingsInput {
  if (!Check(SearchListingsParameters, params)) throw new AppError("TOOL_INPUT_INVALID", "搜索参数格式不合法");
  const input = { ...runtime.filters, page: params.page ?? 1, pageSize: Math.min(params.pageSize ?? runtime.maxResults, runtime.maxResults, runtime.filters.resultLimit ?? runtime.maxResults) };
  if (!Check(SearchListingsParameters, input)) throw new AppError("TOOL_INPUT_INVALID", "服务端筛选条件格式不合法");
  if (input.minPriceCents !== undefined && input.maxPriceCents !== undefined && input.minPriceCents > input.maxPriceCents) {
    throw new AppError("TOOL_INPUT_INVALID", "最低价不能高于最高价");
  }
  return input;
}

function jsonContent(value: unknown): { type: "text"; text: string }[] {
  return [{ type: "text", text: JSON.stringify(value) }];
}

export function createAgentTools(runtime: ToolRuntimeContext): AgentTool[] {
  const allowed = allowedToolNames(runtime.action);
  const authorize = (name: string) => {
    if (!allowed.includes(name)) throw new AppError("TOOL_INPUT_INVALID", "当前业务意图不允许调用此工具");
  };
  const searchListings: AgentTool<typeof SearchListingsParameters> = {
    name: "searchListings",
    label: "搜索校园商品",
    description: "只读查询当前用户所在学校可见的二手商品。身份、学校和权限由服务端注入，调用参数不能包含 userId 或 schoolId。",
    parameters: SearchListingsParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      authorize("searchListings");
      const input = ensureSearchInput(params, runtime);
      const result = await runtime.client.searchListings(input, runtime.user, signal);
      const listings = result.listings.slice(0, runtime.maxResults);
      runtime.onSearchResult?.(listings.map((listing) => listing.listingId));
      for (const listing of listings) runtime.allowedListingIds.add(listing.listingId);
      return {
        content: jsonContent({
          listings: listings.map(listingToModelView),
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          hasMore: result.hasMore,
          appliedConditions: result.appliedConditions,
          source: result.source,
        }),
        details: { kind: "searchListings", result: { ...result, listings } },
      };
    },
  };

  const getListingDetail: AgentTool<typeof ListingDetailParameters> = {
    name: "getListingDetail",
    label: "读取商品详情",
    description: "读取当前会话已展示或已验证的商品详情；每次调用都会重新经过后端权限检查。",
    parameters: ListingDetailParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      authorize("getListingDetail");
      if (!Check(ListingDetailParameters, params)) throw new AppError("TOOL_INPUT_INVALID", "详情参数格式不合法");
      if (!isListingId(params.listingId)) throw new AppError("TOOL_INPUT_INVALID", "listingId 格式不合法");
      if (!runtime.allowedListingIds.has(params.listingId)) throw new AppError("LISTING_NOT_FOUND", "只能查看当前会话已展示的商品");
      const listing = await runtime.client.getListingDetail(params.listingId, runtime.user, signal);
      return {
        content: jsonContent({ listing: listingToModelView(listing), sellerLabel: listing.sellerLabel, publishedAt: listing.publishedAt }),
        details: { kind: "getListingDetail", listing },
      };
    },
  };

  const getUserPreferences: AgentTool<{}> = {
    name: "getUserPreferences",
    label: "读取用户偏好",
    description: "只读读取当前可信用户上下文对应的兴趣偏好，不接受身份参数。",
    parameters: Type.Object({}, { additionalProperties: false }),
    executionMode: "sequential",
    execute: async (_toolCallId, _params, signal) => {
      authorize("getUserPreferences");
      if (!Check(Type.Object({}, { additionalProperties: false }), _params)) throw new AppError("TOOL_INPUT_INVALID", "偏好查询不能包含身份参数");
      const preferences = await runtime.client.getUserPreferences(runtime.user, signal);
      return { content: jsonContent(preferences), details: { kind: "getUserPreferences", preferences } };
    },
  };

  return [searchListings, getListingDetail, getUserPreferences].filter((tool) => allowed.includes(tool.name));
}

export type SearchListingsToolParams = SearchParams;
export type ListingDetailToolParams = DetailParams;
