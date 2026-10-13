import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { AgentRequest, ErrorResponse, UserContext } from "./contracts/index.js";
import { AppError, asAppError } from "./errors/index.js";
import type { AppConfig } from "./config/index.js";
import { loadConfig } from "./config/index.js";
import { MockBusinessClient } from "./clients/mock.js";
import { HttpBusinessClient } from "./clients/http.js";
import type { BusinessReadClient } from "./clients/types.js";
import { MemorySessionStore, type SessionStore } from "./sessions/store.js";
import { runAgentTurn } from "./agent/service.js";

interface ChatBody {
  requestId?: unknown;
  sessionId?: unknown;
  message?: unknown;
}

export interface BuildAppOptions {
  config?: AppConfig;
  client?: BusinessReadClient;
  sessionStore?: SessionStore;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function trustedUser(request: FastifyRequest, config: AppConfig): UserContext {
  const serviceToken = header(request, "x-agent-service-token") ?? header(request, "authorization")?.replace(/^Bearer\s+/iu, "");
  if (serviceToken !== config.serviceAuthToken) throw new AppError("UNAUTHORIZED", "缺少或不正确的服务间认证凭证");
  const userId = header(request, "x-user-id");
  const schoolId = header(request, "x-school-id");
  if (!userId || !schoolId || userId.length > 100 || schoolId.length > 100) throw new AppError("UNAUTHORIZED", "可信用户上下文缺少 userId 或 schoolId");
  return { userId, schoolId };
}

function parseChatBody(body: unknown, maxMessageChars: number): AgentRequest {
  if (!body || typeof body !== "object") throw new AppError("BAD_REQUEST", "请求体必须是 JSON 对象");
  const value = body as ChatBody;
  if (typeof value.requestId !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/u.test(value.requestId)) throw new AppError("BAD_REQUEST", "requestId 必须是 1 到 128 位安全字符");
  if (value.sessionId !== null && value.sessionId !== undefined && (typeof value.sessionId !== "string" || !/^session_[a-zA-Z0-9_-]{1,100}$/u.test(value.sessionId))) throw new AppError("BAD_REQUEST", "sessionId 格式不合法");
  if (typeof value.message !== "string" || value.message.trim().length === 0) throw new AppError("BAD_REQUEST", "message 不能为空");
  if (value.message.length > maxMessageChars) throw new AppError("BAD_REQUEST", `message 不能超过 ${maxMessageChars} 个字符`);
  return { requestId: value.requestId, sessionId: value.sessionId ?? null, message: value.message.trim() };
}

function errorResponse(requestId: string, error: unknown): { statusCode: number; body: ErrorResponse } {
  const appError = asAppError(error);
  return { statusCode: appError.statusCode, body: { requestId, code: appError.code, message: appError.message, retryable: appError.retryable } };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const client = options.client ?? (config.mockBackend
    ? new MockBusinessClient()
    : new HttpBusinessClient({
        baseUrl: config.businessBackendUrl,
        ...(config.businessBackendToken ? { token: config.businessBackendToken } : {}),
        searchPath: config.businessSearchPath,
        detailPath: config.businessDetailPath,
        preferencesPath: config.businessPreferencesPath,
        timeoutMs: config.toolTimeoutMs,
      }));
  const sessionStore = options.sessionStore ?? new MemorySessionStore(config.sessionTtlMs);
  const app = Fastify({ logger: { level: config.logLevel }, bodyLimit: Math.max(64 * 1024, config.maxMessageChars * 4) });

  app.get("/health", async () => ({
    status: "ok",
    service: "pi-campus-market-agent",
    modelMode: config.modelMode,
    modelConfigured: config.modelMode === "mock" || Boolean(config.modelApiKey),
    backendMode: config.mockBackend ? "mock" : "http",
  }));

  app.post("/internal/agent/chat", async (request, reply) => {
    const body = parseChatBody(request.body, config.maxMessageChars);
    const user = trustedUser(request, config);
    const cached = sessionStore.readIdempotentResponse(body.requestId, user);
    if (cached) return reply.code(200).send(cached);

    const session = body.sessionId ? sessionStore.get(body.sessionId, user) : sessionStore.create(user);
    sessionStore.claim(session);
    try {
      const result = await runAgentTurn(body.message, {
        config,
        client,
        session,
        user,
        requestId: body.requestId,
        log: (event, payload) => app.log.info({ event, ...payload }, "agent event"),
      });
      session.messages = result.messages;
      session.filters = result.filters;
      session.displayedListingIds = result.displayedListingIds;
      session.displayedProducts = result.displayedProducts;
      session.searchPage = result.searchPage;
      sessionStore.save(session);
      sessionStore.saveIdempotentResponse(body.requestId, user, result.response);
      return reply.code(200).send(result.response);
    } finally {
      sessionStore.release(session);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body as ChatBody : undefined;
    const requestId = typeof body?.requestId === "string" ? body.requestId : request.id;
    const result = errorResponse(requestId, error);
    if (result.statusCode >= 500) app.log.error({ err: error, requestId }, "agent request failed");
    return reply.code(result.statusCode).send(result.body);
  });
  return app;
}

export { MemorySessionStore };
