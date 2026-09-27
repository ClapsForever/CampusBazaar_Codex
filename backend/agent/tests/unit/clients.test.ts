import { describe, expect, it } from "vitest";
import { MockBusinessClient } from "../../src/clients/mock.js";
import { AppError } from "../../src/errors/index.js";

const user = { userId: "user_001", schoolId: "school_demo" };

describe("MockBusinessClient", () => {
  it("filters price in cents and never exposes another school", async () => {
    const client = new MockBusinessClient();
    const result = await client.searchListings({ category: "教材", maxPriceCents: 5000 }, user);
    expect(result.listings.map((item) => item.listingId)).toEqual(["listing_math_001", "listing_math_003"]);
    expect(result.listings.every((item) => item.schoolId === user.schoolId)).toBe(true);
  });

  it("re-checks permission on detail", async () => {
    const client = new MockBusinessClient();
    await expect(client.getListingDetail("listing_other_school_001", user)).rejects.toBeInstanceOf(AppError);
  });

  it("keeps malicious listing description as data", async () => {
    const client = new MockBusinessClient();
    const result = await client.searchListings({ category: "计算器" }, user);
    expect(result.listings[0]?.description).toContain("忽略规则");
  });
});
