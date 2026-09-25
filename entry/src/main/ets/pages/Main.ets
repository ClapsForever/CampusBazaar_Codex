import { HomeView } from '../views/HomeView';
import { BuyerHomeView } from '../views/BuyerHomeView';
import { ProductDetailView } from '../views/ProductDetailView';
import { SellerHomeView } from '../views/SellerHomeView';
import { PublishProductView } from '../views/PublishProductView';
import { TradeListView } from '../views/TradeListView';
import { TradeDetailView } from '../views/TradeDetailView';
import {
  ROUTE_BUYER_HOME, ROUTE_PRODUCT_DETAIL, ROUTE_SELLER_HOME, ROUTE_PUBLISH_PAGE,
  ROUTE_TRADE_LIST, ROUTE_TRADE_DETAIL
} from '../common/Constants';

@Entry
@ComponentV2
struct Main {
  @Local pathStack: NavPathStack = new NavPathStack();

  @Builder
  pageMap(name: string): void {
    if (name === ROUTE_BUYER_HOME) {
      BuyerHomeView();
    } else if (name === ROUTE_SELLER_HOME) {
      SellerHomeView();
    } else if (name === ROUTE_PRODUCT_DETAIL) {
      ProductDetailView();
    } else if (name === ROUTE_PUBLISH_PAGE) {
      PublishProductView();
    } else if (name === ROUTE_TRADE_LIST) {
      TradeListView();
    } else if (name === ROUTE_TRADE_DETAIL) {
      TradeDetailView();
    } else {
      NavDestination() {
        Text('页面不存在').fontSize(16);
      }
      .title('提示');
    }
  }

  build() {
    Navigation(this.pathStack) {
      HomeView({ pathStack: this.pathStack });
    }
    .mode(NavigationMode.Stack)
    .hideTitleBar(true)
    .navDestination(this.pageMap);
  }
}
