import { TransactionStatus } from '../../../model/Models';
import { TradeStatusUI as BusinessTradeStatusUI } from '../../../common/Constants';
export {
  ROUTE_SELLER_HOME, ROUTE_PUBLISH_PAGE, ROUTE_PRODUCT_DETAIL, ROUTE_TRADE_LIST, ROUTE_TRADE_DETAIL,
  MAX_PRODUCT_PHOTOS, CHAT_REFRESH_DELAY_MS, OWN_PRODUCT_HINT, TRADE_EMPTY_CHAT_HINT, BUYER_PENDING_HINT,
  LoadState
} from '../../../common/Constants';
export { UI_MAIN_PAGE as PAGE_MAIN } from '../../UiVariant';

// 同窗集 · Blue. These presentation tokens never change the original UI.
export const COLOR_PRIMARY: string = '#2D55F7';
export const COLOR_PRIMARY_STRONG: string = '#2345CE';
export const COLOR_PRIMARY_SOFT: string = '#EAF0FF';
export const COLOR_PRICE: string = '#2345CE';
export const COLOR_TEXT_PRIMARY: string = '#17243C';
export const COLOR_TEXT_SECONDARY: string = '#52617A';
export const COLOR_TEXT_TERTIARY: string = '#5E6C83';
export const COLOR_ERROR: string = '#BD3548';
export const COLOR_SUCCESS: string = '#20734F';
export const COLOR_SUCCESS_BG: string = '#E7F4ED';
export const COLOR_PAGE_BG: string = '#F4F6FB';
export const COLOR_CARD_BG: string = '#FFFFFF';
export const COLOR_INPUT_BG: string = '#EAF0F8';
export const COLOR_DIVIDER: string = '#DCE3EF';
export const COLOR_DISABLED: string = '#DCE3EF';
export const PAGE_PADDING: number = 20;
export const UI_RADIUS: number = 14;
export const CIRCLE_RADIUS: string = '50%';
export const UI_CORNERS: BorderRadiuses = {
  topLeft: UI_RADIUS, topRight: UI_RADIUS, bottomLeft: UI_RADIUS, bottomRight: UI_RADIUS
};
export const CARD_RADIUS: number = UI_RADIUS;
export const CONTROL_RADIUS: number = UI_RADIUS;
export const SHEET_ACTION_HEIGHT: number = 44;
export const GRID_GAP: number = 12;
export const FONT_TITLE: string = '24fp';
export const FONT_PRODUCT: string = '14fp';
export const FONT_PRICE: string = '21fp';
export const FONT_META: string = '12fp';
// Retained only for the legacy font resource registration; UI uses the native sans.
export const FONT_EDITORIAL: string = 'CampusEditorialSerif';
export const STATUS_PENDING_TEXT_COLOR: string = COLOR_PRIMARY_STRONG;
export const STATUS_PENDING_BG_COLOR: string = COLOR_PRIMARY_SOFT;
export const STATUS_ACCEPTED_TEXT_COLOR: string = COLOR_SUCCESS;
export const STATUS_ACCEPTED_BG_COLOR: string = COLOR_SUCCESS_BG;
export const STATUS_REJECTED_TEXT_COLOR: string = COLOR_ERROR;
export const STATUS_REJECTED_BG_COLOR: string = '#FCECEF';
export const STATUS_COMPLETED_TEXT_COLOR: string = COLOR_TEXT_SECONDARY;
export const STATUS_COMPLETED_BG_COLOR: string = COLOR_INPUT_BG;
export const STATUS_CANCELLED_TEXT_COLOR: string = COLOR_TEXT_SECONDARY;
export const STATUS_CANCELLED_BG_COLOR: string = COLOR_INPUT_BG;

// Only visual presentation differs; status wording and terminal rules delegate.
export class TradeStatusUI {
  static text(status: TransactionStatus): string { return BusinessTradeStatusUI.text(status); }
  static isTerminal(status: TransactionStatus): boolean { return BusinessTradeStatusUI.isTerminal(status); }
  static textColor(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.PENDING: return STATUS_PENDING_TEXT_COLOR;
      case TransactionStatus.ACCEPTED: return STATUS_ACCEPTED_TEXT_COLOR;
      case TransactionStatus.REJECTED: return STATUS_REJECTED_TEXT_COLOR;
      case TransactionStatus.COMPLETED: return STATUS_COMPLETED_TEXT_COLOR;
      default: return STATUS_CANCELLED_TEXT_COLOR;
    }
  }
  static bgColor(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.PENDING: return STATUS_PENDING_BG_COLOR;
      case TransactionStatus.ACCEPTED: return STATUS_ACCEPTED_BG_COLOR;
      case TransactionStatus.REJECTED: return STATUS_REJECTED_BG_COLOR;
      case TransactionStatus.COMPLETED: return STATUS_COMPLETED_BG_COLOR;
      default: return STATUS_CANCELLED_BG_COLOR;
    }
  }
}
