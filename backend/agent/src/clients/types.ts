import type {
  ListingDetail,
  SearchListingsInput,
  SearchListingsResult,
  UserContext,
  UserPreferences,
} from "../contracts/index.js";

export interface ListingReadClient {
  searchListings(input: SearchListingsInput, user: UserContext, signal?: AbortSignal): Promise<SearchListingsResult>;
  getListingDetail(listingId: string, user: UserContext, signal?: AbortSignal): Promise<ListingDetail>;
}

export interface UserPreferenceReadClient {
  getUserPreferences(user: UserContext, signal?: AbortSignal): Promise<UserPreferences>;
}

export interface BusinessReadClient extends ListingReadClient, UserPreferenceReadClient {}
