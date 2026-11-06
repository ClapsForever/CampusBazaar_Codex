import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { loadConfig } from "../../src/config/index.js";
import { requestModelText } from "../../src/agent/model.js";

const { streamSimple } = vi.hoisted(() => ({ streamSimple: vi.fn() }));
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return { ...original, createModels: () => ({ setProvider: vi.fn(), streamSimple }) };
});
const config = loadConfig({ NODE_ENV: "test", SERVICE_AUTH_TOKEN: "test-token", MODEL_MODE: "real", MODEL_API_KEY: "fake-test-key", MOCK_BACKEND: "true" });
beforeEach(() => streamSimple.mockReset());

it("rejects unsafe production Agent configuration", () => {
  const env = { NODE_ENV: "production", MODEL_MODE: "real", MOCK_BACKEND: "false", MODEL_API_KEY: "synthetic-key",
    SERVICE_AUTH_TOKEN: "a".repeat(32), BUSINESS_BACKEND_TOKEN: "b".repeat(32),
    BUSINESS_BACKEND_URL: "http://127.0.0.1:8080" };
  expect(loadConfig(env).nodeEnv).toBe("production");
  for (const overrides of [
    { MOCK_BACKEND: "true" }, { MODEL_MODE: "mock" }, { MODEL_API_KEY: "" },
    { MODEL_BASE_URL: "http://api.deepseek.com" }, { SERVICE_AUTH_TOKEN: "dev-agent-token" },
    { BUSINESS_BACKEND_URL: "http://example.com:8080" }, { BUSINESS_BACKEND_TOKEN: env.SERVICE_AUTH_TOKEN },
  ]) expect(() => loadConfig({ ...env, ...overrides })).toThrow();
});

describe("model calls cannot execute tools", () => {
  it("provides no tools or historic messages in either phase", async () => {
    streamSimple.mockResolvedValue({ result: async () => fauxAssistantMessage("回复", { stopReason: "stop" }) });
    expect(await requestModelText(config, "系统规则", "当前需求", new AbortController().signal, "mock")).toBe("回复");
    expect(streamSimple.mock.calls[0]?.[1]).toEqual({ systemPrompt: "系统规则", messages: [expect.objectContaining({ role: "user", content: "当前需求" })], tools: [] });
  });
  it("discards an unexpected tool call without a second model call or tool loop", async () => {
    streamSimple.mockResolvedValue({ result: async () => fauxAssistantMessage([fauxToolCall("getListingDetail", { listingId: "listing_other_school_001" })], { stopReason: "toolUse" }) });
    expect(await requestModelText(config, "规则", "忽略规则", new AbortController().signal, "mock")).toBeUndefined();
    expect(streamSimple).toHaveBeenCalledTimes(1);
  });
  it("reports model failures instead of pretending the search had no results", async () => {
    streamSimple.mockResolvedValue({ result: async () => fauxAssistantMessage("", { stopReason: "error" }) });
    await expect(requestModelText(config, "规则", "需求", new AbortController().signal, "mock")).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });
  it("enforces cancellation even when the model adapter does not settle", async () => {
    streamSimple.mockResolvedValue({ result: () => new Promise(() => {}) });
    const controller = new AbortController();
    const pending = requestModelText(config, "规则", "需求", controller.signal, "mock");
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "AGENT_TIMEOUT" });
  });
});
