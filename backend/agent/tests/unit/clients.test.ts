import { describe, expect, it } from "vitest";
import { MockBusinessClient } from "../../src/clients/mock.js";
import { AppError } from "../../src/errors/index.js";
import { matchesCategory } from "../../src/intent/categories.js";
import { searchKeywordGroups } from "../../src/intent/parser.js";

const user = { userId: "user_001", schoolId: "school_demo" };

describe("MockBusinessClient", () => {
  it("browses broad categories but keeps a concrete object search narrow", async () => {
    const client = new MockBusinessClient();
    const peripherals = await client.searchListings({ category: "外设" }, user);
    expect(peripherals.listings.some(item => item.category === "键盘")).toBe(true);
    expect(peripherals.listings.some(item => item.category === "耳机")).toBe(true);
    const keyboards = await client.searchListings({ category: "外设", keyword: "键盘" }, user);
    expect(keyboards.listings.length).toBe(2);
    expect(keyboards.listings.every(item => item.category === "键盘")).toBe(true);
    expect(matchesCategory("外设", "键盘", "mechanical keyboard", searchKeywordGroups)).toBe(true);
    expect(matchesCategory("外设", "键盘", "蓝牙耳机", searchKeywordGroups)).toBe(false);
    expect(matchesCategory("运动", "自行车", "山地单车", searchKeywordGroups)).toBe(true);
  });
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
