import "dotenv/config";

import { AppError } from "../errors/index.js";

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: string;
  serviceAuthToken: string;
  mockBackend: boolean;
  modelMode: "mock" | "real";
  modelProvider: string;
  modelName: string;
  modelBaseUrl: string;
  modelApiKey?: string;
  businessBackendUrl: string;
  businessBackendToken?: string;
  businessSearchPath: string;
  businessDetailPath: string;
  businessPreferencesPath: string;
  maxMessageChars: number;
  maxResults: number;
  maxToolCalls: number;
  toolTimeoutMs: number;
  turnTimeoutMs: number;
  sessionTtlMs: number;
}

function text(env: NodeJS.ProcessEnv, name: string, fallback = ""): string {
  return env[name]?.trim() || fallback;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError("BAD_REQUEST", `配置 ${name} 必须是 ${min} 到 ${max} 之间的整数`, { statusCode: 500 });
  }
  return value;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = text(env, name, String(fallback)).toLowerCase();
  if (!["true", "false"].includes(value)) {
    throw new AppError("BAD_REQUEST", `配置 ${name} 必须是 true 或 false`, { statusCode: 500 });
  }
  return value === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = text(env, "NODE_ENV", "development");
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new AppError("BAD_REQUEST", "NODE_ENV 只能是 development、test 或 production", { statusCode: 500 });
  }

  const config: AppConfig = {
    nodeEnv,
    port: integer(env, "PORT", 3000, 1, 65535),
    logLevel: text(env, "LOG_LEVEL", "info"),
    serviceAuthToken: text(env, "SERVICE_AUTH_TOKEN", "dev-agent-token"),
    mockBackend: bool(env, "MOCK_BACKEND", nodeEnv !== "production"),
    modelMode: text(env, "MODEL_MODE", "mock") as AppConfig["modelMode"],
    modelProvider: text(env, "MODEL_PROVIDER", "openai-compatible"),
    modelName: text(env, "MODEL_NAME", "deepseek-chat"),
    modelBaseUrl: text(env, "MODEL_BASE_URL", "https://api.deepseek.com"),
    ...(text(env, "MODEL_API_KEY") ? { modelApiKey: text(env, "MODEL_API_KEY") } : {}),
    businessBackendUrl: text(env, "BUSINESS_BACKEND_URL", "http://localhost:8080"),
    ...(text(env, "BUSINESS_BACKEND_TOKEN") ? { businessBackendToken: text(env, "BUSINESS_BACKEND_TOKEN") } : {}),
    businessSearchPath: text(env, "BUSINESS_SEARCH_PATH", "/internal/listings/search"),
    businessDetailPath: text(env, "BUSINESS_DETAIL_PATH", "/internal/listings/{listingId}"),
    businessPreferencesPath: text(env, "BUSINESS_PREFERENCES_PATH", "/internal/users/preferences"),
    maxMessageChars: integer(env, "MAX_MESSAGE_CHARS", 2000, 100, 10000),
    maxResults: integer(env, "MAX_RESULTS", 10, 1, 10),
    maxToolCalls: integer(env, "MAX_TOOL_CALLS", 6, 1, 20),
    toolTimeoutMs: integer(env, "TOOL_TIMEOUT_MS", 10000, 100, 120000),
    turnTimeoutMs: integer(env, "TURN_TIMEOUT_MS", 60000, 1000, 300000),
    sessionTtlMs: integer(env, "SESSION_TTL_MS", 86400000, 1000, 604800000),
  };

  if (config.modelMode !== "mock" && config.modelMode !== "real") {
    throw new AppError("BAD_REQUEST", "MODEL_MODE 只能是 mock 或 real", { statusCode: 500 });
  }
  if (nodeEnv === "production" && (config.mockBackend || config.modelMode === "mock")) {
    throw new AppError("BAD_REQUEST", "production 环境禁止启用 Mock 后端或 Mock 模型", { statusCode: 500 });
  }
  return config;
}
