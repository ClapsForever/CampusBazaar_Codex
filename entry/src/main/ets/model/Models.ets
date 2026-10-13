/** CampusBazaar domain entities and service DTOs. */
export enum TransactionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED'
}

export interface User {
  id: string;
  nickname: string;
  avatar: string;
  phone?: string;
  studentId?: string;
  hasPassword?: boolean;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  publishTime: number;
  sellerId: string;
  category?: string;
  condition?: string;
  campus?: string;
  status?: string;
  version?: string | null;
}

export interface Transaction {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  createTime: number;
  status: TransactionStatus;
}

export interface Message {
  id: string;
  transactionId: string;
  senderId: string;
  content: string;
  sendTime: number;
}

export interface ProductDetail {
  product: Product;
  seller: User;
}

export interface TransactionListItem {
  transaction: Transaction;
  product: Product;
  counterparty: User;
  latestMessage?: Message;
}

export interface TransactionDetail {
  transaction: Transaction;
  product: Product;
  buyer: User;
  seller: User;
}

export interface AgentResult {
  requestId: string;
  sessionId: string;
  status: AgentStatus;
  replyText: string;
  recommendations: AgentRecommendation[];
}

export enum AgentStatus {
  COMPLETED = 'completed',
  CLARIFICATION = 'clarification',
  NO_RESULTS = 'no_results'
}

export interface AgentRecommendation {
  listingId: string;
  reasons: string[];
  /** Loaded from the business API when the recommended listing is still visible. */
  product: Product | null;
}

/** Matches the response returned by the business API Agent proxy. */
export interface AgentChatResponse {
  requestId: string;
  sessionId: string;
  status: AgentStatus;
  reply: string;
  recommendations: AgentListingRecommendation[];
  relaxedConditions: string[];
}

export interface AgentListingRecommendation {
  listingId: string;
  reasons: string[];
}

export interface AgentConversationSummary {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turnCount: number;
}

export interface AgentHistoryTurn {
  question: string;
  createdAt: number;
  response: AgentChatResponse;
}

export interface AgentHistoryPage {
  items: AgentConversationSummary[];
  nextCursor: string | null;
}

export interface AgentHistoryTurnPage {
  items: AgentHistoryTurn[];
  nextCursor: string | null;
}

export interface PublishDraft {
  title: string;
  description: string;
  price: number;
  images: string[];
  category?: string;
  condition?: string;
  campus?: string;
}

export interface ProductDetailParams {
  productId: string;
}

export interface TradeDetailParams {
  transactionId: string;
}
