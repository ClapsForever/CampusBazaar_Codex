import { User } from '../model/Models';
import { authService } from '../service/AuthenticationService';
import {
  COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY,
  ROUTE_BUYER_HOME, ROUTE_SELLER_HOME, ROUTE_TRADE_LIST
} from '../common/Constants';

const SELLER_COLOR: string = '#00B8A9';

@ComponentV2
export struct HomeView {
  @Require @Param pathStack: NavPathStack;
  @Local user: User | null = null;

  aboutToAppear(): void {
    this.user = authService.getCurrentUser();
  }

  build() {
    Scroll() {
      Column({ space: 16 }) {
        Row({ space: 12 }) {
          if (this.user !== null) {
            Image(this.user.avatar).width(48).height(48).borderRadius(24);
          } else {
            Text('👤').fontSize(30);
          }
          Column({ space: 2 }) {
            Text(this.user === null ? '你好！' : `${this.user.nickname}，你好！`)
              .fontSize(18).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
            Text('欢迎来到校园二手集市').fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
          }
          .layoutWeight(1).alignItems(HorizontalAlign.Start);
          if (this.user !== null) {
            Button('退出').fontSize(12).fontColor(COLOR_TEXT_SECONDARY).backgroundColor(Color.White)
              .onClick(async () => {
                try {
                  await authService.logout();
                } catch (_error) {
                }
                this.user = null;
                this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' });
              });
          }
        }
        .width('100%').padding({ left: 20, right: 20, top: 24, bottom: 12 });

        Column({ space: 14 }) {
          this.entryCard('🛒', '我是买家', '浏览同学发布的商品，搜索心仪好物', COLOR_PRIMARY, Color.White, () => {
            this.pathStack.pushPathByName(ROUTE_BUYER_HOME, '');
          });
          this.entryCard('🏷️', '我是卖家', '发布闲置商品，管理出售中的宝贝', SELLER_COLOR, Color.White, () => {
            this.pathStack.pushPathByName(ROUTE_SELLER_HOME, '');
          });
          this.entryCard('🔔', '交易提醒', '查看买入/卖出的交易与聊天消息', Color.White, COLOR_TEXT_PRIMARY, () => {
            this.pathStack.pushPathByName(ROUTE_TRADE_LIST, '');
          }, COLOR_TEXT_SECONDARY);
        }
        .width('100%').padding({ left: 20, right: 20 });
        Text('同一账号同时拥有买家与卖家身份').fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
      }
      .width('100%').padding({ bottom: 24 });
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG).scrollBar(BarState.Off);
  }

  @Builder
  entryCard(icon: string, title: string, subtitle: string, background: ResourceColor,
    foreground: ResourceColor, action: () => void, secondary: ResourceColor = Color.White): void {
    Row({ space: 12 }) {
      Text(icon).fontSize(30);
      Column({ space: 4 }) {
        Text(title).fontSize(17).fontWeight(FontWeight.Bold).fontColor(foreground);
        Text(subtitle).fontSize(12).fontColor(foreground === Color.White ? '#FFFFFFCC' : secondary);
      }
      .layoutWeight(1).alignItems(HorizontalAlign.Start);
      Text('›').fontSize(24).fontColor(foreground === Color.White ? '#FFFFFFCC' : COLOR_TEXT_TERTIARY);
    }
    .width('100%').height(88).padding(18).borderRadius(14).backgroundColor(background)
    .onClick(action);
  }
}
