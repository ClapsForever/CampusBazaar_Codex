import {
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type AssistantMessage,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { AppConfig } from "../config/index.js";
import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import { intentToToolInput, parseIntent, userTexts } from "../intent/parser.js";

export interface AgentModelRuntime {
  model: Model<any>;
  streamFn: StreamFn;
  modelMode: AppConfig["modelMode"];
}

function lastUserText(messages: Context["messages"]): string {
  return userTexts(messages as AgentMessage[]).at(-1) ?? "";
}

function toolResultDetails(message: Context["messages"][number]): unknown {
  if (message.role !== "toolResult") return undefined;
  return message.details;
}

function previousListingIds(messages: Context["messages"]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    const details = toolResultDetails(message);
    if (!details || typeof details !== "object") continue;
    const value = details as { kind?: string; result?: { listings?: Array<{ listingId?: string }> }; listing?: { listingId?: string } };
    if (value.kind === "searchListings") {
      for (const listing of value.result?.listings ?? []) if (listing.listingId) ids.push(listing.listingId);
    }
    if (value.kind === "getListingDetail" && value.listing?.listingId) ids.push(value.listing.listingId);
  }
  return [...new Set(ids)];
}

function latestToolName(messages: Context["messages"]): string | undefined {
  const last = messages.at(-1);
  return last?.role === "toolResult" ? last.toolName : undefined;
}

function modelResponse(context: Context): AssistantMessage {
  const latestUser = lastUserText(context.messages);
  const intent = parseIntent(context.messages as AgentMessage[]);
  const latestTool = latestToolName(context.messages);

  if (latestTool === "searchListings") {
    const last = context.messages.at(-1);
    const count = last?.role === "toolResult" && last.details && typeof last.details === "object"
      ? ((last.details as { result?: { listings?: unknown[] } }).result?.listings?.length ?? 0)
      : 0;
    return fauxAssistantMessage(count > 0 ? `已查询到 ${count} 条符合明确条件的商品，商品卡片中的信息均来自平台查询结果。` : "没有找到同时满足明确条件的商品。你可以选择放宽成色或取货地点偏好，但我不会擅自提高预算。", { stopReason: "stop" });
  }

  if (latestTool === "getListingDetail") {
    return fauxAssistantMessage(intent.kind === "compare" ? "我已读取指定商品详情。可以从价格、成色、取货校区和详情字段进行比较；缺失字段会标为未知。" : "这是当前会话中已验证商品的详情，未提供的版本或属性会标为未知。", { stopReason: "stop" });
  }

  if (latestTool === "getUserPreferences") {
    return fauxAssistantMessage("我已读取当前用户的兴趣偏好，只会把它作为辅助排序信号，不会改变学校权限范围。", { stopReason: "stop" });
  }

  if (/直接买|买下来|下单|付款|预约|联系卖家/u.test(latestUser)) {
    return fauxAssistantMessage("我不能执行购买、付款、预约或联系卖家。你可以让我继续查询商品，再通过平台正式业务流程完成交易。", { stopReason: "stop" });
  }

  if (intent.kind === "preference") {
    return fauxAssistantMessage([fauxToolCall("getUserPreferences", {})], { stopReason: "toolUse" });
  }

  if (intent.kind === "compare" || intent.kind === "detail") {
    const ids = previousListingIds(context.messages);
    const positions = intent.referencedPositions.length > 0 ? intent.referencedPositions : [1];
    const calls = positions.map((position) => ids[position - 1]).filter((id): id is string => Boolean(id));
    if (calls.length > 0) {
      return fauxAssistantMessage(calls.map((listingId) => fauxToolCall("getListingDetail", { listingId })), { stopReason: "toolUse" });
    }
    return fauxAssistantMessage("我需要先看到本会话中实际展示的商品，才能解析“第二个/第三个”等指代。请先告诉我想找什么商品。", { stopReason: "stop" });
  }

  if (intent.needsClarification) {
    return fauxAssistantMessage("你想找哪一类商品或哪门课的教材？有预算、成色或取货校区偏好也可以一起告诉我。", { stopReason: "stop" });
  }

  return fauxAssistantMessage([fauxToolCall("searchListings", intentToToolInput(intent))], { stopReason: "toolUse" });
}

export function createAgentModelRuntime(config: AppConfig): AgentModelRuntime {
  if (config.modelMode === "mock") {
    const faux = fauxProvider({ provider: "campus-mock", models: [{ id: "campus-mock", name: "Campus Mock Model", input: ["text"], reasoning: false }] });
    const responses = Array.from({ length: 20 }, () => modelResponse as (context: Context) => AssistantMessage);
    faux.setResponses(responses);
    const models = createModels();
    models.setProvider(faux.provider);
    return { model: faux.getModel(), streamFn: models.streamSimple.bind(models), modelMode: "mock" };
  }

  if (!config.modelApiKey) {
    throw new Error("MODEL_API_KEY 未配置，无法使用真实模型");
  }

  const model: Model<"openai-completions"> = {
    id: config.modelName,
    name: config.modelName,
    api: "openai-completions",
    provider: "campus-model",
    baseUrl: config.modelBaseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
  const provider = createProvider({
    id: "campus-model",
    name: config.modelProvider,
    baseUrl: config.modelBaseUrl,
    auth: {
      apiKey: {
        name: "MODEL_API_KEY",
        resolve: async ({ signal }) => {
          signal.throwIfAborted();
          if (!config.modelApiKey) return undefined;
          return { auth: { apiKey: config.modelApiKey } };
        },
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  return { model, streamFn: models.streamSimple.bind(models), modelMode: "real" };
}
