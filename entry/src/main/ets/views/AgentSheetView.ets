import { AgentRecommendation, Product } from '../model/Models';
import { AgentViewModel } from '../viewmodel/AgentViewModel';
import { ProductCard } from '../components/ProductCard';
import { COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, ROUTE_PRODUCT_DETAIL } from '../common/Constants';

@ComponentV2
export struct AgentSheetView {
  @Require @Param pathStack: NavPathStack;
  @Event onClose: () => void = (): void => {
  };
  @Local vm: AgentViewModel = new AgentViewModel();

  build() {
    Column({ space: 12 }) {
      Text('智能助手').fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY).width('100%')
        .margin({ top: 8 });
      Text('告诉我你想找什么，例如：想要一辆预算 200 以内的二手自行车')
        .fontSize(13).fontColor(COLOR_TEXT_SECONDARY).lineHeight(20).width('100%');
      Row({ space: 8 }) {
        TextInput({ placeholder: '输入你的商品需求', text: this.vm.query })
          .height(48).layoutWeight(1).fontSize(14).backgroundColor('#F1F3F5').borderRadius(10)
          .padding({ left: 12, right: 12 })
          .onChange((value: string) => {
            this.vm.query = value;
            this.vm.error = '';
          });
        Button(this.vm.loading ? '…' : '发送').enabled(!this.vm.loading).height(48).fontColor(Color.White)
          .backgroundColor(COLOR_PRIMARY).borderRadius(10)
          .onClick(() => this.vm.send());
      }
      .width('100%');
      if (this.vm.error !== '') {
        Text(this.vm.error).fontSize(12).fontColor('#E5484D').width('100%');
      }
      if (this.vm.loading) {
        Column({ space: 8 }) {
          LoadingProgress().width(30).height(30).color(COLOR_PRIMARY);
          Text('正在为你查找…').fontSize(13).fontColor(COLOR_TEXT_TERTIARY);
        }
        .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center);
      } else if (this.vm.result !== null) {
        Column({ space: 10 }) {
          Text(this.vm.result.replyText).fontSize(14).fontColor(COLOR_TEXT_SECONDARY).width('100%');
          if (this.vm.result.recommendations.length === 0) {
            if (this.vm.result.status === 'no_results') {
              Text('可以换个描述再试一次').fontSize(13).fontColor(COLOR_TEXT_TERTIARY)
                .width('100%').textAlign(TextAlign.Center).margin({ top: 20 });
            }
          } else {
            List({ space: 10 }) {
              ForEach(this.vm.result.recommendations, (item: AgentRecommendation) => {
                ListItem() {
                  if (item.product !== null) {
                    ProductCard({
                      product: item.product,
                      onCardClick: (product: Product): void => {
                        this.onClose();
                        this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, product.id);
                      }
                    });
                  } else {
                    Column({ space: 5 }) {
                      Text(`商品编号：${item.listingId}`).fontSize(14).fontWeight(FontWeight.Medium)
                        .fontColor(COLOR_TEXT_PRIMARY).width('100%');
                      ForEach(item.reasons, (reason: string) => {
                        Text(`· ${reason}`).fontSize(12).fontColor(COLOR_TEXT_SECONDARY).width('100%');
                      }, (reason: string, index: number): string => `${item.listingId}_${index}`);
                      Text('接入商品详情接口后可展示商品卡片').fontSize(11)
                        .fontColor(COLOR_TEXT_TERTIARY).width('100%');
                    }
                    .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12);
                  }
                }
              }, (item: AgentRecommendation): string => item.listingId);
            }
            .layoutWeight(1).width('100%').scrollBar(BarState.Off);
          }
        }
        .layoutWeight(1).width('100%');
      } else {
        Text('输入需求后，助手会推荐可能合适的商品').fontSize(14).fontColor(COLOR_TEXT_TERTIARY)
          .width('100%').textAlign(TextAlign.Center).margin({ top: 28 });
      }
    }
    .width('100%').height('100%').padding({ left: 16, right: 16, bottom: 20 });
  }
}
