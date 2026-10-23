import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentRequest, AgentResponse, SearchFilters, UserContext } from "../contracts/index.js";
import { AppError } from "../errors/index.js";

export interface SessionRecord {
  sessionId: string;
  owner: UserContext;
  messages: AgentMessage[];
  filters: SearchFilters;
  displayedListingIds: string[];
  displayedProducts?: Array<{ listingId: string; title: string }>;
  searchPage: number;
  needs?: string[];
  createdAt: number;
  updatedAt: number;
  busy: boolean;
}

export interface SessionStore {
  create(user: UserContext): SessionRecord;
  get(sessionId: string, user: UserContext): SessionRecord;
  save(record: SessionRecord): void;
  claim(record: SessionRecord): void;
  release(record: SessionRecord): void;
  claimRequest(request: AgentRequest, user: UserContext): AgentResponse | undefined;
  releaseRequest(requestId: string): void;
  saveIdempotentResponse(request: AgentRequest, user: UserContext, response: AgentResponse): void;
}

function sameUser(a: UserContext, b: UserContext): boolean {
  return a.userId === b.userId && a.schoolId === b.schoolId;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly responses = new Map<string, { user: UserContext; request: AgentRequest; response: AgentResponse; createdAt: number }>();
  private readonly requests = new Map<string, { user: UserContext; request: AgentRequest }>();
  private lastSweep = -Infinity;

  constructor(private readonly ttlMs: number, private readonly idFactory: () => string = () => `session_${crypto.randomUUID()}`) {}

  create(user: UserContext): SessionRecord {
    this.sweep();
    const now = Date.now();
    const record: SessionRecord = {
      sessionId: this.idFactory(),
      owner: { ...user },
      messages: [],
      filters: {},
      displayedListingIds: [],
      searchPage: 1,
      createdAt: now,
      updatedAt: now,
      busy: false,
    };
    this.sessions.set(record.sessionId, record);
    return record;
  }

  get(sessionId: string, user: UserContext): SessionRecord {
    this.sweep();
    const record = this.sessions.get(sessionId);
    if (!record || (!record.busy && Date.now() - record.updatedAt >= this.ttlMs)) {
      this.sessions.delete(sessionId);
      throw new AppError("SESSION_NOT_FOUND", "会话不存在或已过期");
    }
    if (!sameUser(record.owner, user)) throw new AppError("SESSION_FORBIDDEN", "不能读取其他用户的会话");
    return record;
  }

  save(record: SessionRecord): void {
    record.updatedAt = Date.now();
    this.sessions.set(record.sessionId, record);
  }

  claim(record: SessionRecord): void {
    if (record.busy) throw new AppError("SESSION_BUSY", "同一会话已有请求正在处理", { retryable: true });
    record.busy = true;
    this.save(record);
  }

  release(record: SessionRecord): void {
    record.busy = false;
    this.save(record);
  }

  claimRequest(request: AgentRequest, user: UserContext): AgentResponse | undefined {
    this.sweep();
    let cached = this.responses.get(request.requestId);
    if (cached && Date.now() - cached.createdAt >= this.ttlMs) {
      this.responses.delete(request.requestId);
      cached = undefined;
    }
    const previous = cached ?? this.requests.get(request.requestId);
    if (previous) {
      if (!sameUser(previous.user, user)) throw new AppError("SESSION_FORBIDDEN", "requestId 已被其他用户使用");
      if (previous.request.message !== request.message || previous.request.sessionId !== request.sessionId) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "requestId 已用于其他问题或会话");
      }
      if (cached) return cached.response;
      throw new AppError("SESSION_BUSY", "该请求正在处理，请稍后重试", { retryable: true });
    }
    this.requests.set(request.requestId, { user: { ...user }, request: { ...request } });
    return undefined;
  }

  releaseRequest(requestId: string): void {
    this.requests.delete(requestId);
  }

  saveIdempotentResponse(request: AgentRequest, user: UserContext, response: AgentResponse): void {
    this.responses.set(request.requestId, { user: { ...user }, request: { ...request }, response, createdAt: Date.now() });
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < Math.min(this.ttlMs, 60_000)) return;
    this.lastSweep = now;
    for (const [id, session] of this.sessions) {
      if (!session.busy && now - session.updatedAt >= this.ttlMs) this.sessions.delete(id);
    }
    for (const [id, cached] of this.responses) {
      if (now - cached.createdAt >= this.ttlMs) this.responses.delete(id);
    }
  }
}
