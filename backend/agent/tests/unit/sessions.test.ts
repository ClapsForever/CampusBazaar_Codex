import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRequest, AgentResponse } from "../../src/contracts/index.js";
import { MemorySessionStore } from "../../src/sessions/store.js";

const user = { userId: "user_001", schoolId: "school_demo" };
const request: AgentRequest = { requestId: "req_store", sessionId: null, message: "找键盘" };
const response: AgentResponse = { requestId: request.requestId, sessionId: "session_store", status: "completed",
  reply: "已查询", recommendations: [], relaxedConditions: [] };
afterEach(() => vi.useRealTimers());

describe("request identity and session expiry", () => {
  it("replays only the same question and session, and reserves a request until released", () => {
    const store = new MemorySessionStore(1000);
    expect(store.claimRequest(request, user)).toBeUndefined();
    expect(() => store.claimRequest(request, user)).toThrow(expect.objectContaining({ code: "SESSION_BUSY" }));
    expect(() => store.claimRequest({ ...request, message: "找耳机" }, user))
      .toThrow(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
    store.saveIdempotentResponse(request, user, response);
    store.releaseRequest(request.requestId);
    expect(store.claimRequest(request, user)).toEqual(response);
    expect(() => store.claimRequest({ ...request, sessionId: response.sessionId }, user))
      .toThrow(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
    expect(() => store.claimRequest(request, { ...user, userId: "user_other" }))
      .toThrow(expect.objectContaining({ code: "SESSION_FORBIDDEN" }));
  });

  it("allows a failed request to retry after releasing its reservation", () => {
    const store = new MemorySessionStore(1000);
    store.claimRequest(request, user);
    store.releaseRequest(request.requestId);
    expect(store.claimRequest(request, user)).toBeUndefined();
  });

  it("sweeps expired idle sessions and cached responses without looking them up", () => {
    vi.useFakeTimers();
    const store = new MemorySessionStore(1000);
    const idle = store.create(user), busy = store.create(user);
    store.claim(busy);
    store.claimRequest(request, user);
    store.saveIdempotentResponse(request, user, response);
    store.releaseRequest(request.requestId);
    vi.advanceTimersByTime(1001);
    store.create(user);
    // Check physical eviction, rather than merely an expired get() response.
    const internals = store as unknown as { sessions: Map<string, unknown>; responses: Map<string, unknown> };
    expect(internals.sessions.has(idle.sessionId)).toBe(false);
    expect(internals.responses.size).toBe(0);
    expect(store.get(busy.sessionId, user)).toBe(busy);
    expect(() => store.claim(busy)).toThrow(expect.objectContaining({ code: "SESSION_BUSY" }));
    store.release(busy);
    vi.advanceTimersByTime(1001);
    expect(() => store.get(busy.sessionId, user)).toThrow(expect.objectContaining({ code: "SESSION_NOT_FOUND" }));
    expect(store.claimRequest(request, user)).toBeUndefined();
  });
});
