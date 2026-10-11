import { describe, expect, it, vi } from "vitest";
import { createAgentTools } from "../../src/tools/index.js";
import { MockBusinessClient } from "../../src/clients/mock.js";

describe("policy-bound tools", () => {
  it("uses server filters even if proposed parameters remove or enlarge the budget", async () => {
    const client = new MockBusinessClient();
    const search = vi.spyOn(client, "searchListings");
    const tools = createAgentTools({ client, user: { userId: "user_001", schoolId: "school_demo" }, maxResults: 5,
      allowedListingIds: new Set(), action: "search", filters: { category: "教材", keyword: "高数", maxPriceCents: 5000 },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["searchListings"]);
    await tools[0]!.execute("test", { category: "耳机", maxPriceCents: 9000, page: 1 });
    expect(search.mock.calls[0]?.[0]).toEqual({ category: "教材", keyword: "高数", maxPriceCents: 5000, page: 1, pageSize: 5 });
    await expect(tools[0]!.execute("test", { schoolId: "other" })).rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    expect(search).toHaveBeenCalledTimes(1);
  });
  it("will not read an unselected product or accept extra detail parameters", async () => {
    const client = new MockBusinessClient();
    const detail = vi.spyOn(client, "getListingDetail");
    const tools = createAgentTools({ client, user: { userId: "user_001", schoolId: "school_demo" }, maxResults: 5,
      allowedListingIds: new Set(["listing_keyboard_002"]), action: "detail", filters: {},
    });
    await expect(tools[0]!.execute("test", { listingId: "listing_keyboard_001" })).rejects.toMatchObject({ code: "LISTING_NOT_FOUND" });
    await expect(tools[0]!.execute("test", { listingId: "listing_keyboard_002", userId: "other" })).rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
    expect(detail).not.toHaveBeenCalled();
  });
});
