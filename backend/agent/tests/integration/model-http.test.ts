import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { MockBusinessClient } from "../../src/clients/mock.js";
import { emptyPlan } from "../../src/agent/policy.js";

const config = loadConfig({ NODE_ENV: "test", SERVICE_AUTH_TOKEN: "test-token", MODEL_MODE: "real", MODEL_API_KEY: "fake-test-key", MODEL_BASE_URL: "https://model.invalid", MOCK_BACKEND: "true", LOG_LEVEL: "silent" });
const headers = { "x-agent-service-token": "test-token", "x-user-id": "user_001", "x-school-id": "school_demo" };
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(apps.splice(0).map((app) => app.close())); });

function modelResponse(content: string, tool = false): Response {
  const base = { id: "test_response", object: "chat.completion.chunk", model: "deepseek-chat" };
  const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: "call_injected", type: "function", function: { name: "getListingDetail", arguments: '{"listingId":"listing_other_school_001"}' } }] } : { role: "assistant", content };
  const start = { ...base, choices: [{ index: 0, delta, finish_reason: null }] };
  const end = { ...base, choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }] };
  return new Response(`data: ${JSON.stringify(start)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
}
function fixture(responses: Response[]) {
  const bodies: any[] = [];
  const fetch = vi.fn(async (_input: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    if (!responses.length) throw new Error("Unexpected additional model request");
    return responses.shift()!;
  });
  vi.stubGlobal("fetch", fetch);
  const client = new MockBusinessClient();
  const search = vi.spyOn(client, "searchListings");
  const detail = vi.spyOn(client, "getListingDetail");
  const app = buildApp({ config, client });
  apps.push(app);
  const chat = () => app.inject({ method: "POST", url: "/internal/agent/chat", headers, payload: { requestId: "http_policy_test", sessionId: null, message: "想买键盘" } });
  return { bodies, fetch, search, detail, chat };
}
const searchPlan = JSON.stringify({ ...emptyPlan("search"), changes: { category: "键盘" } });

describe("real provider adapter with local SSE responses", () => {
  it("runs a model plan, a server query and a model reply without offering tools", async () => {
    const f = fixture([modelResponse(searchPlan), modelResponse("为你找到两件键盘。")]);
    const response = await f.chat();
    expect(response.statusCode).toBe(200);
    expect(response.json().reply).toBe("为你找到两件键盘。");
    expect(response.json().recommendations).toHaveLength(2);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.search).toHaveBeenCalledTimes(1);
    for (const body of f.bodies) expect(body.tools ?? []).toEqual([]);
    const first = JSON.parse(f.bodies[0].messages.at(-1).content);
    const second = JSON.parse(f.bodies[1].messages.at(-1).content);
    expect(first).not.toHaveProperty("results");
    expect(second).toHaveProperty("results");
    expect(second).not.toHaveProperty("message");
  });
  it("does not query for malformed plan text", async () => {
    const f = fixture([modelResponse("我猜你要找键盘")]);
    const response = await f.chat();
    expect(response.json().status).toBe("clarification");
    expect(response.json().recommendations).toEqual([]);
    expect(f.search).not.toHaveBeenCalled();
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("will not execute a tool request emitted by the planning model", async () => {
    const f = fixture([modelResponse("", true)]);
    const response = await f.chat();
    expect(response.json().status).toBe("clarification");
    expect(f.search).not.toHaveBeenCalled();
    expect(f.detail).not.toHaveBeenCalled();
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("uses a fixed reply when the wording model tries to call a tool", async () => {
    const f = fixture([modelResponse(searchPlan), modelResponse("", true)]);
    const response = await f.chat();
    expect(response.json().recommendations).toHaveLength(2);
    expect(response.json().reply).toContain("已查询到 2 条");
    expect(f.search).toHaveBeenCalledTimes(1);
    expect(f.detail).not.toHaveBeenCalled();
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
});
