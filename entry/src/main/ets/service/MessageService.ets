import { Message, TransactionStatus } from '../model/Models';
import { AUTO_REPLY_DELAY_MS } from '../common/Constants';
import { mockDataStore } from '../data/MockDataStore';
import { mockDelayVoid } from '../common/Utils';

export interface MessageService {
  getMessages(transactionId: string): Promise<Message[]>;
  sendMessage(transactionId: string, senderId: string, content: string): Promise<Message>;
}

export class MockMessageService implements MessageService {
  private replies: string[] = ['可以的', '什么时候方便面交？', '好的，没问题～', '收到，我这边随时都可以'];
  private replyIndex: number = 0;

  async getMessages(transactionId: string): Promise<Message[]> {
    const result: Message[] = mockDataStore.getMessagesByTransaction(transactionId);
    await mockDelayVoid();
    return result;
  }

  async sendMessage(transactionId: string, senderId: string, content: string): Promise<Message> {
    const item = mockDataStore.findTransactionById(transactionId);
    if (item === undefined) {
      throw new Error('交易不存在');
    }
    if (senderId !== item.buyerId && senderId !== item.sellerId) {
      throw new Error('你不是该交易参与者');
    }
    if (item.status === TransactionStatus.REJECTED || item.status === TransactionStatus.COMPLETED) {
      throw new Error('交易已结束，仅可查看历史消息');
    }
    const text: string = content.trim();
    if (text === '') {
      throw new Error('消息内容不能为空');
    }
    const sent: Message = mockDataStore.addMessage(transactionId, senderId, text);
    const counterpartyId: string = senderId === item.buyerId ? item.sellerId : item.buyerId;
    const reply: string = this.replies[this.replyIndex % this.replies.length];
    this.replyIndex += 1;
    setTimeout(() => {
      mockDataStore.addMessage(transactionId, counterpartyId, reply);
    }, AUTO_REPLY_DELAY_MS);
    return sent;
  }
}

export const messageService: MessageService = new MockMessageService();
