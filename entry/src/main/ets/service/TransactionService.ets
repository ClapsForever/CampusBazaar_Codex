import { Product, Transaction, TransactionDetail, TransactionListItem, TransactionStatus, User } from '../model/Models';
import { mockDataStore } from '../data/MockDataStore';
import { DUPLICATE_TRADE_ERROR, MOCK_DELAY_MS, OWN_PRODUCT_HINT } from '../common/Constants';
import { mockDelayVoid } from '../common/Utils';

export interface TransactionService {
  getTransactionsForUser(userId: string): Promise<TransactionListItem[]>;
  getTransactionDetail(transactionId: string): Promise<TransactionDetail | null>;
  createTransaction(productId: string, buyerId: string): Promise<Transaction>;
  acceptTransaction(transactionId: string, operatorId: string): Promise<Transaction>;
  rejectTransaction(transactionId: string, operatorId: string): Promise<Transaction>;
  completeTransaction(transactionId: string, operatorId: string): Promise<Transaction>;
}

export class MockTransactionService implements TransactionService {
  async getTransactionsForUser(userId: string): Promise<TransactionListItem[]> {
    const result: TransactionListItem[] = [];
    for (const item of mockDataStore.transactionsForUser(userId)) {
      const product: Product | undefined = mockDataStore.findProductById(item.productId);
      const otherId: string = item.buyerId === userId ? item.sellerId : item.buyerId;
      const counterparty: User | undefined = mockDataStore.findUserById(otherId);
      if (product === undefined || counterparty === undefined) {
        continue;
      }
      const messages = mockDataStore.getMessagesByTransaction(item.id);
      const listItem: TransactionListItem = {
        transaction: item,
        product: product,
        counterparty: counterparty
      };
      if (messages.length > 0) {
        listItem.latestMessage = messages[messages.length - 1];
      }
      result.push(listItem);
    }
    await mockDelayVoid();
    return result;
  }

  async getTransactionDetail(transactionId: string): Promise<TransactionDetail | null> {
    const item: Transaction | undefined = mockDataStore.findTransactionById(transactionId);
    if (item === undefined) {
      await mockDelayVoid();
      return null;
    }
    const product: Product | undefined = mockDataStore.findProductById(item.productId);
    const buyer: User | undefined = mockDataStore.findUserById(item.buyerId);
    const seller: User | undefined = mockDataStore.findUserById(item.sellerId);
    await mockDelayVoid();
    if (product === undefined || buyer === undefined || seller === undefined) {
      return null;
    }
    return { transaction: item, product: product, buyer: buyer, seller: seller };
  }

  async createTransaction(productId: string, buyerId: string): Promise<Transaction> {
    const product: Product | undefined = mockDataStore.findProductById(productId);
    if (product === undefined) {
      throw new Error('商品不存在或已下架');
    }
    if (product.sellerId === buyerId) {
      throw new Error(OWN_PRODUCT_HINT);
    }
    if (mockDataStore.findInProgressTransaction(productId, buyerId) !== undefined) {
      throw new Error(DUPLICATE_TRADE_ERROR);
    }
    const created: Transaction = mockDataStore.addTransaction(productId, buyerId, product.sellerId);
    await mockDelayVoid(MOCK_DELAY_MS);
    return created;
  }

  async acceptTransaction(transactionId: string, operatorId: string): Promise<Transaction> {
    return this.changeStatus(transactionId, operatorId, TransactionStatus.PENDING, TransactionStatus.ACCEPTED,
      '仅待处理的交易可以接受');
  }

  async rejectTransaction(transactionId: string, operatorId: string): Promise<Transaction> {
    return this.changeStatus(transactionId, operatorId, TransactionStatus.PENDING, TransactionStatus.REJECTED,
      '仅待处理的交易可以拒绝');
  }

  async completeTransaction(transactionId: string, operatorId: string): Promise<Transaction> {
    return this.changeStatus(transactionId, operatorId, TransactionStatus.ACCEPTED, TransactionStatus.COMPLETED,
      '仅已接受的交易可以标记完成');
  }

  private async changeStatus(transactionId: string, operatorId: string, expected: TransactionStatus,
    next: TransactionStatus, invalidMessage: string): Promise<Transaction> {
    const item: Transaction | undefined = mockDataStore.findTransactionById(transactionId);
    if (item === undefined) {
      throw new Error('交易不存在');
    }
    if (item.sellerId !== operatorId) {
      throw new Error('只有卖家可以执行此操作');
    }
    if (item.status !== expected) {
      throw new Error(invalidMessage);
    }
    item.status = next;
    await mockDelayVoid(MOCK_DELAY_MS);
    return item;
  }
}

export const transactionService: TransactionService = new MockTransactionService();
