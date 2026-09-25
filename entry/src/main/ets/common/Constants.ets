import { TransactionStatus } from '../model/Models';

export const ROUTE_BUYER_HOME: string = 'BuyerHome';
export const ROUTE_SELLER_HOME: string = 'SellerHome';
export const ROUTE_PUBLISH_PAGE: string = 'PublishPage';
export const ROUTE_PRODUCT_DETAIL: string = 'ProductDetail';
export const ROUTE_TRADE_LIST: string = 'TradeList';
export const ROUTE_TRADE_DETAIL: string = 'TradeDetail';
export const PAGE_MAIN: string = 'pages/Main';

export const MAX_PRODUCT_PHOTOS: number = 3;
export const MOCK_DELAY_MS: number = 250;
export const MOCK_DELAY_SLOW_MS: number = 600;
export const AUTO_REPLY_DELAY_MS: number = 800;
export const CHAT_REFRESH_DELAY_MS: number = 1000;

export const SMS_SENT_TOAST: string = 'Mock 验证码已发送';
export const DUPLICATE_TRADE_ERROR: string = '该商品已有进行中的交易';
export const OWN_PRODUCT_HINT: string = '不能购买自己发布的商品';
export const TRADE_EMPTY_CHAT_HINT: string = '发送第一条消息开始沟通';
export const BUYER_PENDING_HINT: string = '等待卖家确认';

export const COLOR_PRIMARY: string = '#0A59F7';
export const COLOR_PRIMARY_SOFT: string = '#0A59F71A';
export const COLOR_PRICE: string = '#E8622D';
export const COLOR_TEXT_PRIMARY: string = '#182431';
export const COLOR_TEXT_SECONDARY: string = '#4E5969';
export const COLOR_TEXT_TERTIARY: string = '#86909C';
export const COLOR_ERROR: string = '#E5484D';
export const COLOR_PAGE_BG: string = '#F1F3F5';
export const COLOR_CARD_BG: string = '#FFFFFF';
export const COLOR_DIVIDER: string = '#E5E8EC';

export const STATUS_PENDING_TEXT_COLOR: string = '#E8830C';
export const STATUS_PENDING_BG_COLOR: string = '#E8830C1F';
export const STATUS_ACCEPTED_TEXT_COLOR: string = '#2E9E5B';
export const STATUS_ACCEPTED_BG_COLOR: string = '#2E9E5B1F';
export const STATUS_REJECTED_TEXT_COLOR: string = '#E5484D';
export const STATUS_REJECTED_BG_COLOR: string = '#E5484D1F';
export const STATUS_COMPLETED_TEXT_COLOR: string = '#5B7A9D';
export const STATUS_COMPLETED_BG_COLOR: string = '#5B7A9D1F';

export enum LoadState {
  LOADING = 0,
  CONTENT = 1,
  EMPTY = 2,
  ERROR = 3
}

export class TradeStatusUI {
  static text(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.PENDING:
        return '待处理';
      case TransactionStatus.ACCEPTED:
        return '已接受';
      case TransactionStatus.REJECTED:
        return '已拒绝';
      case TransactionStatus.COMPLETED:
        return '已完成';
      default:
        return '未知';
    }
  }

  static textColor(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.PENDING:
        return STATUS_PENDING_TEXT_COLOR;
      case TransactionStatus.ACCEPTED:
        return STATUS_ACCEPTED_TEXT_COLOR;
      case TransactionStatus.REJECTED:
        return STATUS_REJECTED_TEXT_COLOR;
      case TransactionStatus.COMPLETED:
        return STATUS_COMPLETED_TEXT_COLOR;
      default:
        return COLOR_TEXT_SECONDARY;
    }
  }

  static bgColor(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.PENDING:
        return STATUS_PENDING_BG_COLOR;
      case TransactionStatus.ACCEPTED:
        return STATUS_ACCEPTED_BG_COLOR;
      case TransactionStatus.REJECTED:
        return STATUS_REJECTED_BG_COLOR;
      case TransactionStatus.COMPLETED:
        return STATUS_COMPLETED_BG_COLOR;
      default:
        return COLOR_DIVIDER;
    }
  }

  static isTerminal(status: TransactionStatus): boolean {
    return status === TransactionStatus.REJECTED || status === TransactionStatus.COMPLETED;
  }
}
