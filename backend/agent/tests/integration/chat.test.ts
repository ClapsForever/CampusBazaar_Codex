import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";

const config = loadConfig({
  NODE_ENV: "test",
  PORT: "3000",
  SERVICE_AUTH_TOKEN: "test-token",
  MOCK_BACKEND: "true",
  MODEL_MODE: "mock",
  MAX_MESSAGE_CHARS: "2000",
});

function headers() {
  return { "x-agent-service-token": "test-token", "x-user-id": "user_001", "x-school-id": "school_demo" };
}

describe("POST /internal/agent/chat", () => {
  it("runs a mock Pi tool loop and returns trusted recommendations", async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload: { requestId: "req_001", sessionId: null, message: "50 元以内的高数教材" } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("completed");
    expect(body.recommendations.map((item: { listingId: string }) => item.listingId)).toEqual(["listing_math_001", "listing_math_003"]);
    expect(body.recommendations[0].reasons[0]).toContain("45 元");
    await app.close();
  });

  it("inherits and replaces conditions across turns", async () => {
    const app = buildApp({ config });
    const first = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload: { requestId: "req_101", sessionId: null, message: "高数教材，50 元以内" } });
    const sessionId = first.json().sessionId;
    const second = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload: { requestId: "req_102", sessionId, message: "预算改成 80，最好九成新" } });
    expect(second.statusCode).toBe(200);
    expect(second.json().recommendations.map((item: { listingId: string }) => item.listingId)).toEqual(["listing_math_002"]);
    await app.close();
  });

  it("rejects a forged user context and does not use client body identities", async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: { ...headers(), "x-school-id": "school_other" }, payload: { requestId: "req_201", sessionId: null, message: "找商品", userId: "user_other", schoolId: "school_other" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().recommendations).toEqual([]);
    await app.close();
  });

  it("makes transaction requests read-only", async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload: { requestId: "req_301", sessionId: null, message: "帮我直接买下来" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().reply).toContain("不能执行购买");
    await app.close();
  });

  it("supports idempotency for a repeated requestId", async () => {
    const app = buildApp({ config });
    const payload = { requestId: "req_401", sessionId: null, message: "找键盘" };
    const first = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload });
    const second = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload });
    expect(second.json()).toEqual(first.json());
    await app.close();
  });

  it("rejects a sessionId belonging to another user", async () => {
    const app = buildApp({ config });
    const first = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload: { requestId: "req_501", sessionId: null, message: "找键盘" } });
    const response = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: { ...headers(), "x-user-id": "user_other" }, payload: { requestId: "req_502", sessionId: first.json().sessionId, message: "继续" } });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SESSION_FORBIDDEN");
    await app.close();
  });

  it("reports a missing real-model key instead of pretending there are no results", async () => {
    const realConfig = loadConfig({ NODE_ENV: "test", SERVICE_AUTH_TOKEN: "test-token", MOCK_BACKEND: "true", MODEL_MODE: "real", MODEL_NAME: "demo", MODEL_BASE_URL: "https://example.invalid" });
    const app = buildApp({ config: realConfig });
    const response = await app.inject({ method: "POST", url: "/internal/agent/chat", headers: headers(), payload: { requestId: "req_601", sessionId: null, message: "找键盘" } });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("MODEL_API_KEY_MISSING");
    await app.close();
  });
});
