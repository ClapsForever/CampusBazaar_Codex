import { createModels, createProvider, fauxAssistantMessage, fauxProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AppConfig } from "../config/index.js";
import { AppError } from "../errors/index.js";
import { withTurnSignal } from "./deadline.js";

export interface AgentModelRuntime {
  model: Model<any>;
  streamFn: StreamFn;
  modelMode: AppConfig["modelMode"];
}

/** One model response with no tools or execution loop, for planning or wording only. */
export async function requestModelText(config: AppConfig, systemPrompt: string, prompt: string, signal: AbortSignal, mockText: string): Promise<string | undefined> {
  signal.throwIfAborted();
  let runtime: AgentModelRuntime;
  try { runtime = createAgentModelRuntime(config, mockText); }
  catch (error) {
    if (!config.modelApiKey && config.modelMode === "real") throw new AppError("MODEL_API_KEY_MISSING", "未配置真实模型密钥，请设置 MODEL_API_KEY");
    throw new AppError("MODEL_UNAVAILABLE", "模型初始化失败", { retryable: true, cause: error });
  }
  try {
    const stream = await withTurnSignal(Promise.resolve(runtime.streamFn(runtime.model, {
      systemPrompt,
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      tools: [],
    }, { signal, temperature: 0 })), signal);
    const result = await withTurnSignal(stream.result(), signal);
    signal.throwIfAborted();
    if (result.stopReason === "error" || result.stopReason === "aborted") throw new AppError("MODEL_UNAVAILABLE", "模型没有返回可用结果", { retryable: true });
    // Reject unexpected tool requests. They are never executed, even if the model emits one.
    if (result.stopReason !== "stop" || result.content.some((item) => item.type === "toolCall")) return undefined;
    return result.content.filter((item) => item.type === "text").map((item) => item.text).join("").trim() || undefined;
  } catch (error) {
    if (signal.aborted) throw new AppError("AGENT_TIMEOUT", "本轮查询超过时间限制", { retryable: true });
    if (error instanceof AppError) throw error;
    throw new AppError("MODEL_UNAVAILABLE", "模型请求失败", { retryable: true, cause: error });
  }
}

export function createAgentModelRuntime(config: AppConfig, mockText = ""): AgentModelRuntime {
  if (config.modelMode === "mock") {
    const faux = fauxProvider({ provider: "campus-mock", models: [{ id: "campus-mock", name: "Campus Mock Model", input: ["text"], reasoning: false }] });
    faux.setResponses([fauxAssistantMessage(mockText, { stopReason: "stop" })]);
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
