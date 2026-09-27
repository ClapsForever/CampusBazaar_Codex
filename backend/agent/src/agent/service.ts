import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { AppConfig } from "../config/index.js";
import type { BusinessReadClient } from "../clients/types.js";
import { AppError, asAppError } from "../errors/index.js";
import type { AgentResponse, ListingSummary, Recommendation, UserContext } from "../contracts/index.js";
import { priceText } from "../contracts/index.js";
import type { SessionRecord } from "../sessions/store.js";
import { createAgentModelRuntime } from "./model.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { normalizeReply } from "./reply.js";
import { createAgentTools } from "../tools/index.js";
import { parseIntent } from "../intent/parser.js";

interface SearchDetails {
  kind: "searchListings";
  result: {
    listings: ListingSummary[];
    appliedConditions: { hard: Record<string, unknown>; soft: Record<string, unknown> };
  };
}

interface DetailDetails {
  kind: "getListingDetail";
  listing: ListingSummary & { version?: string };
}

function isSearchDetails(value: unknown): value is SearchDetails {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SearchDetails>;
  return item.kind === "searchListings" && Boolean(item.result && Array.isArray(item.result.listings));
}

function isDetailDetails(value: unknown): value is DetailDetails {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DetailDetails>;
  return item.kind === "getListingDetail" && Boolean(item.listing && typeof item.listing.listingId === "string");
}

function assistantText(messages: AgentMessage[]): string {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!assistant || assistant.role !== "assistant") return "";
  return assistant.content.filter((item) => item.type === "text").map((item) => item.text).join("").trim();
}

function searchResults(messages: AgentMessage[]): SearchDetails[] {
  return messages.flatMap((message) => {
    if (message.role !== "toolResult" || !isSearchDetails(message.details)) return [];
    return [message.details];
  });
}

function detailResults(messages: AgentMessage[]): DetailDetails[] {
  return messages.flatMap((message) => {
    if (message.role !== "toolResult" || !isDetailDetails(message.details)) return [];
    return [message.details];
  });
}

function reasonFor(listing: ListingSummary, search: SearchDetails): string[] {
  const reasons: string[] = [];
  const hard = search.result.appliedConditions.hard;
  const soft = search.result.appliedConditions.soft;
  if (typeof hard.maxPriceCents === "number") reasons.push(`售价 ${priceText(listing.priceCents)}，符合 ${priceText(hard.maxPriceCents)} 以内预算`);
  else if (typeof hard.minPriceCents === "number") reasons.push(`售价 ${priceText(listing.priceCents)}，达到 ${priceText(hard.minPriceCents)} 的最低预算`);
  else reasons.push(`售价 ${priceText(listing.priceCents)}`);
  if (hard.category) reasons.push(`类别为 ${String(hard.category)}`);
  if (hard.condition) reasons.push(`成色达到 ${String(hard.condition)}`);
  if (typeof soft.preferredCampus === "string") {
    reasons.push(listing.campus === soft.preferredCampus ? `取货地点为偏好的${soft.preferredCampus}` : `取货地点为${listing.campus}，未完全匹配偏好的${soft.preferredCampus}`);
  }
  return reasons;
}

function recommendationsFrom(messages: AgentMessage[]): Recommendation[] {
  const latestSearch = searchResults(messages).at(-1);
  if (latestSearch) return latestSearch.result.listings.map((listing) => ({ listingId: listing.listingId, reasons: reasonFor(listing, latestSearch) }));
  return detailResults(messages).map((detail) => ({ listingId: detail.listing.listingId, reasons: [`已通过只读详情接口重新验证，售价 ${priceText(detail.listing.priceCents)}`] }));
}

export interface ChatServiceOptions {
  config: AppConfig;
  client: BusinessReadClient;
  session: SessionRecord;
  user: UserContext;
  requestId: string;
  log: (event: string, payload: Record<string, unknown>) => void;
}

export async function runAgentTurn(message: string, options: ChatServiceOptions): Promise<{ response: AgentResponse; messages: AgentMessage[]; lastListingIds: string[] }> {
  let runtime;
  try {
    runtime = createAgentModelRuntime(options.config);
  } catch (error) {
    if (error instanceof Error && error.message.includes("MODEL_API_KEY")) {
      throw new AppError("MODEL_API_KEY_MISSING", "未配置真实模型密钥，请设置 MODEL_API_KEY，或在 development 使用 MODEL_MODE=mock");
    }
    throw new AppError("MODEL_UNAVAILABLE", "模型初始化失败", { retryable: true, cause: error });
  }

  const allowedListingIds = new Set(options.session.lastListingIds);
  const tools = createAgentTools({
    client: options.client,
    user: options.user,
    maxResults: options.config.maxResults,
    allowedListingIds,
  });
  let toolCalls = 0;
  let latestToolName: string | undefined;
  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: runtime.model,
      tools,
      messages: options.session.messages,
      thinkingLevel: "off",
    },
    streamFn: runtime.streamFn,
    toolExecution: "sequential",
    convertToLlm: (messages) => messages.filter((item) => item.role === "user" || item.role === "assistant" || item.role === "toolResult"),
    beforeToolCall: async ({ toolCall }) => {
      toolCalls += 1;
      latestToolName = toolCall.name;
      options.log("tool_start", { requestId: options.requestId, toolName: toolCall.name, toolCallCount: toolCalls });
      if (toolCalls > options.config.maxToolCalls) {
        return { block: true, reason: "已达到本轮工具调用上限，请缩小查询范围后重试", terminate: true };
      }
      return undefined;
    },
  });

  const startedAt = Date.now();
  const unsubscribe = agent.subscribe(async (event: AgentEvent) => {
    if (event.type === "tool_execution_end") {
      options.log("tool_end", { requestId: options.requestId, toolName: event.toolName, elapsedMs: Date.now() - startedAt, isError: event.isError });
    }
  });

  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    agent.abort();
  }, options.config.turnTimeoutMs);
  try {
    await agent.prompt(message);
  } catch (error) {
    const mapped = asAppError(error);
    if (didTimeout || agent.state.errorMessage?.toLowerCase().includes("abort")) throw new AppError("AGENT_TIMEOUT", "本轮查询超过时间限制", { retryable: true, cause: error });
    throw mapped.code === "INTERNAL_ERROR" ? new AppError("MODEL_UNAVAILABLE", "模型请求失败", { retryable: true, cause: error }) : mapped;
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }

  if (didTimeout) throw new AppError("AGENT_TIMEOUT", "本轮查询超过时间限制", { retryable: true });

  const messages = agent.state.messages;
  const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  if (lastAssistant?.role === "assistant" && (lastAssistant.stopReason === "error" || lastAssistant.stopReason === "aborted")) {
    throw new AppError("MODEL_UNAVAILABLE", lastAssistant.errorMessage ?? "模型没有返回可用结果", { retryable: true });
  }

  const searches = searchResults(messages);
  const details = detailResults(messages);
  const latestSearch = searches.at(-1);
  const reply = normalizeReply(assistantText(messages) || "我暂时没有生成可展示的结果，请换一种说法再试。");
  const intent = parseIntent(messages);
  const response: AgentResponse = {
    requestId: options.requestId,
    sessionId: options.session.sessionId,
    status: latestSearch ? latestSearch.result.listings.length > 0 ? "completed" : "no_results" : latestToolName === "getListingDetail" || details.length > 0 ? "completed" : intent.needsClarification ? "clarification" : "completed",
    reply,
    recommendations: recommendationsFrom(messages),
    relaxedConditions: [],
  };
  const latestIds = latestSearch?.result.listings.map((listing) => listing.listingId) ?? [...allowedListingIds];
  return { response, messages, lastListingIds: latestIds };
}
