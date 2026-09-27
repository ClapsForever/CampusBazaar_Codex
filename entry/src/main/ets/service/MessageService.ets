import { Message } from '../model/Models';
import { http } from '@kit.NetworkKit';
import { businessApiClient } from './BusinessApiClient';

export interface MessageService {
  getMessages(transactionId: string): Promise<Message[]>;
  sendMessage(transactionId: string, senderId: string, content: string): Promise<Message>;
}

interface MessageListResponse {
  items: Message[];
  nextCursor: string | null;
}

let messageRequestSequence: number = 0;

export class HttpMessageService implements MessageService {
  async getMessages(transactionId: string): Promise<Message[]> {
    const items: Message[] = [];
    let cursor: string | null = null;
    for (let page: number = 0; page < 20; page += 1) {
      const result: MessageListResponse = await businessApiClient.request<MessageListResponse>(http.RequestMethod.GET,
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/messages?limit=100` +
        (cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`));
      for (const item of result.items) {
        items.push(item);
      }
      cursor = result.nextCursor;
      if (cursor === null) {
        break;
      }
    }
    return items;
  }

  async sendMessage(transactionId: string, _senderId: string, content: string): Promise<Message> {
    messageRequestSequence += 1;
    return await businessApiClient.request<Message>(http.RequestMethod.POST,
      `/api/v1/transactions/${encodeURIComponent(transactionId)}/messages`,
      JSON.stringify({ content: content }), true, 15000,
      { 'Idempotency-Key': `message_${Date.now()}_${messageRequestSequence}` });
  }
}

export const messageService: MessageService = new HttpMessageService();
