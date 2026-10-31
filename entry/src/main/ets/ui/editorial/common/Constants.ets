// Behaviour, routes and status rules come from the original implementation.
export {
  ROUTE_SELLER_HOME, ROUTE_PUBLISH_PAGE, ROUTE_PRODUCT_DETAIL, ROUTE_TRADE_LIST, ROUTE_TRADE_DETAIL,
  MAX_PRODUCT_PHOTOS, CHAT_REFRESH_DELAY_MS, OWN_PRODUCT_HINT, TRADE_EMPTY_CHAT_HINT, BUYER_PENDING_HINT,
  STATUS_PENDING_TEXT_COLOR, STATUS_PENDING_BG_COLOR, STATUS_ACCEPTED_TEXT_COLOR, STATUS_ACCEPTED_BG_COLOR,
  STATUS_REJECTED_TEXT_COLOR, STATUS_REJECTED_BG_COLOR, STATUS_COMPLETED_TEXT_COLOR, STATUS_COMPLETED_BG_COLOR,
  STATUS_CANCELLED_TEXT_COLOR, STATUS_CANCELLED_BG_COLOR, LoadState, TradeStatusUI
} from '../../../common/Constants';
export { UI_MAIN_PAGE as PAGE_MAIN } from '../../UiVariant';

// A · 校园生活刊. UI tokens are intentionally independent of the original UI.
export const COLOR_PRIMARY: string = '#E06620';
export const COLOR_PRIMARY_STRONG: string = '#B7470F';
export const COLOR_PRIMARY_SOFT: string = '#FFF0E5';
export const COLOR_PRICE: string = '#B7470F';
export const COLOR_TEXT_PRIMARY: string = '#1A1918';
export const COLOR_TEXT_SECONDARY: string = '#625F5A';
export const COLOR_TEXT_TERTIARY: string = '#716D66';
export const COLOR_ERROR: string = '#B83232';
export const COLOR_PAGE_BG: string = '#F5F4F1';
export const COLOR_CARD_BG: string = '#FFFFFF';
export const COLOR_INPUT_BG: string = '#EEECE6';
export const COLOR_DIVIDER: string = '#D7D3CC';
export const PAGE_PADDING: number = 20;
export const UI_RADIUS: number = 16;
export const CIRCLE_RADIUS: string = '50%';
export const UI_CORNERS: BorderRadiuses = {
  topLeft: UI_RADIUS, topRight: UI_RADIUS, bottomLeft: UI_RADIUS, bottomRight: UI_RADIUS
};
export const CARD_RADIUS: number = UI_RADIUS;
export const CONTROL_RADIUS: number = UI_RADIUS;
export const SHEET_ACTION_HEIGHT: number = 44;
export const GRID_GAP: number = 16;
export const FONT_TITLE: string = '28fp';
export const FONT_PRODUCT: string = '14fp';
export const FONT_PRICE: string = '21fp';
export const FONT_META: string = '12fp';
export const FONT_EDITORIAL: string = 'CampusEditorialSerif';
