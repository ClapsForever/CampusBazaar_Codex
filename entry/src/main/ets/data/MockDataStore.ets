import { Message, Product, PublishDraft, Transaction, TransactionStatus, User } from '../model/Models';

const MINUTE: number = 60 * 1000;
const HOUR: number = 60 * MINUTE;
const BASE_TIME: number = Date.now();

function user(id: string, nickname: string, avatar: string): User {
  return { id: id, nickname: nickname, avatar: avatar };
}

function product(id: string, title: string, description: string, price: number,
  image: string, publishTime: number, sellerId: string): Product {
  return {
    id: id,
    title: title,
    description: description,
    price: price,
    images: [image],
    publishTime: publishTime,
    sellerId: sellerId
  };
}

function transaction(id: string, productId: string, buyerId: string, sellerId: string,
  createTime: number, status: TransactionStatus): Transaction {
  return {
    id: id,
    productId: productId,
    buyerId: buyerId,
    sellerId: sellerId,
    createTime: createTime,
    status: status
  };
}

function message(id: string, transactionId: string, senderId: string, content: string,
  sendTime: number): Message {
  return {
    id: id,
    transactionId: transactionId,
    senderId: senderId,
    content: content,
    sendTime: sendTime
  };
}

class MockDataStore {
  private users: User[] = [];
  private products: Product[] = [];
  private transactions: Transaction[] = [];
  private messages: Message[] = [];
  private productSeq: number = 1;
  private transactionSeq: number = 1;
  private messageSeq: number = 1;
  currentUser: User | null = null;

  constructor() {
    this.users = [
      user('u_me', '小张', 'mock:avatar_me'),
      user('u_lily', '学姐 Lily', 'mock:avatar_lily'),
      user('u_wei', '学长阿伟', 'mock:avatar_wei'),
      user('u_ming', '同学小明', 'mock:avatar_ming')
    ];
    this.users[0].phone = '13800000001';
    this.users[0].studentId = '22307130001';
    this.products = [
      product('p_bike', '山地自行车', '九成新山地自行车，21 速变速，适合上学代步，支持校园面交。', 280, 'mock:bike', BASE_TIME - HOUR, 'u_wei'),
      product('p_book', '高等数学教材', '同济版高等数学第七版，笔记齐全，适合期末复习。', 25, 'mock:book', BASE_TIME - 2 * HOUR, 'u_lily'),
      product('p_lamp', '宿舍护眼台灯', '三档调光护眼台灯，几乎全新，含原装 USB 电源线。', 35, 'mock:lamp', BASE_TIME - 3 * HOUR, 'u_me'),
      product('p_earphone', '蓝牙降噪耳机', '主动降噪蓝牙耳机，音质出色，含充电线与耳塞。', 120, 'mock:earphone', BASE_TIME - 4 * HOUR, 'u_ming'),
      product('p_chair', '人体工学椅', '腰托完好、气压杆稳固，宿舍与工位都适用。', 199, 'mock:chair', BASE_TIME - 5 * HOUR, 'u_wei'),
      product('p_kettle', '电热水壶', '1.5L 电热水壶，自动断电，已清洗消毒。', 45, 'mock:kettle', BASE_TIME - 6 * HOUR, 'u_lily'),
      product('p_keyboard', '87 键机械键盘', '红轴机械键盘，手感顺滑，附赠键帽拔取器。', 150, 'mock:keyboard', BASE_TIME - 7 * HOUR, 'u_ming'),
      product('p_plant', '多肉盆栽', '好养活的多肉一盆，附赠小陶盆，适合宿舍。', 15, 'mock:plant', BASE_TIME - 8 * HOUR, 'u_me')
    ];
    this.transactions = [
      transaction('t_pending', 'p_lamp', 'u_lily', 'u_me', BASE_TIME - 30 * MINUTE, TransactionStatus.PENDING),
      transaction('t_accepted', 'p_bike', 'u_me', 'u_wei', BASE_TIME - 5 * HOUR, TransactionStatus.ACCEPTED),
      transaction('t_completed', 'p_book', 'u_me', 'u_lily', BASE_TIME - 26 * HOUR, TransactionStatus.COMPLETED)
    ];
    this.messages = [
      message('m_tp_1', 't_pending', 'u_lily', '你好，这盏台灯还在吗？想买～', BASE_TIME - 25 * MINUTE),
      message('m_ta_1', 't_accepted', 'u_me', '你好，自行车还在吗？可以约看车吗？', BASE_TIME - 4.8 * HOUR),
      message('m_ta_2', 't_accepted', 'u_wei', '在的在的，280 元，车况很好，随时可以看车。', BASE_TIME - 4.6 * HOUR),
      message('m_ta_3', 't_accepted', 'u_me', '明天中午十二点食堂门口面交可以吗？', BASE_TIME - 4.4 * HOUR),
      message('m_ta_4', 't_accepted', 'u_wei', '没问题，明天中午食堂门口见！', BASE_TIME - 4.2 * HOUR),
      message('m_tc_1', 't_completed', 'u_me', '你好，请问高等数学教材是第七版吗？', BASE_TIME - 25 * HOUR),
      message('m_tc_2', 't_completed', 'u_lily', '是的，第七版，用了一学期，八五成新。', BASE_TIME - 24.8 * HOUR),
      message('m_tc_3', 't_completed', 'u_me', '好的，我要了，图书馆门口交易吗？', BASE_TIME - 24.6 * HOUR),
      message('m_tc_4', 't_completed', 'u_lily', '好的，图书馆门口见，交易完成，谢谢！', BASE_TIME - 24.4 * HOUR)
    ];
  }

  getDefaultUser(): User {
    const found: User | undefined = this.findUserById('u_me');
    return found ?? { id: 'u_me', nickname: '小张', avatar: 'mock:avatar_me' };
  }

  setCurrentUser(value: User | null): void {
    this.currentUser = value;
  }

  findUserById(id: string): User | undefined {
    return this.users.find((item: User): boolean => item.id === id);
  }

  findProductById(id: string): Product | undefined {
    return this.products.find((item: Product): boolean => item.id === id);
  }

  allProductsSorted(): Product[] {
    const result: Product[] = [...this.products];
    result.sort((left: Product, right: Product): number => right.publishTime - left.publishTime);
    return result;
  }

  productsBySeller(sellerId: string): Product[] {
    const result: Product[] = this.products.filter((item: Product): boolean => item.sellerId === sellerId);
    result.sort((left: Product, right: Product): number => right.publishTime - left.publishTime);
    return result;
  }

  addProduct(draft: PublishDraft, sellerId: string): Product {
    const created: Product = {
      id: `p_custom_${this.productSeq}`,
      title: draft.title,
      description: draft.description,
      price: draft.price,
      images: [...draft.images],
      publishTime: Date.now(),
      sellerId: sellerId
    };
    this.productSeq += 1;
    this.products.push(created);
    return created;
  }

  findTransactionById(id: string): Transaction | undefined {
    return this.transactions.find((item: Transaction): boolean => item.id === id);
  }

  transactionsForUser(userId: string): Transaction[] {
    const result: Transaction[] = this.transactions.filter((item: Transaction): boolean =>
      item.buyerId === userId || item.sellerId === userId);
    result.sort((left: Transaction, right: Transaction): number => right.createTime - left.createTime);
    return result;
  }

  findInProgressTransaction(productId: string, buyerId: string): Transaction | undefined {
    return this.transactions.find((item: Transaction): boolean =>
      item.productId === productId && item.buyerId === buyerId &&
      (item.status === TransactionStatus.PENDING || item.status === TransactionStatus.ACCEPTED));
  }

  addTransaction(productId: string, buyerId: string, sellerId: string): Transaction {
    const created: Transaction = {
      id: `t_custom_${this.transactionSeq}`,
      productId: productId,
      buyerId: buyerId,
      sellerId: sellerId,
      createTime: Date.now(),
      status: TransactionStatus.PENDING
    };
    this.transactionSeq += 1;
    this.transactions.push(created);
    return created;
  }

  getMessagesByTransaction(transactionId: string): Message[] {
    const result: Message[] = this.messages.filter((item: Message): boolean => item.transactionId === transactionId);
    result.sort((left: Message, right: Message): number => left.sendTime - right.sendTime);
    return result;
  }

  addMessage(transactionId: string, senderId: string, content: string): Message {
    const created: Message = {
      id: `m_custom_${this.messageSeq}`,
      transactionId: transactionId,
      senderId: senderId,
      content: content,
      sendTime: Date.now()
    };
    this.messageSeq += 1;
    this.messages.push(created);
    return created;
  }
}

export const mockDataStore: MockDataStore = new MockDataStore();

/** Converts only mock resource keys at the rendering boundary. */
export function resolveMockImage(source: string): ResourceStr {
  switch (source) {
    case 'mock:bike': return $r('app.media.mock_bike');
    case 'mock:book': return $r('app.media.mock_book');
    case 'mock:lamp': return $r('app.media.mock_lamp');
    case 'mock:earphone': return $r('app.media.mock_earphone');
    case 'mock:chair': return $r('app.media.mock_chair');
    case 'mock:kettle': return $r('app.media.mock_kettle');
    case 'mock:keyboard': return $r('app.media.mock_keyboard');
    case 'mock:plant': return $r('app.media.mock_plant');
    case 'mock:avatar_me': return $r('app.media.avatar_me');
    case 'mock:avatar_lily': return $r('app.media.avatar_lily');
    case 'mock:avatar_wei': return $r('app.media.avatar_wei');
    case 'mock:avatar_ming': return $r('app.media.avatar_ming');
    default: return source;
  }
}
