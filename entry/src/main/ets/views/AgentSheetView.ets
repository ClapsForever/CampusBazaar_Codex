import { AgentRecommendation, Product } from '../model/Models';
import { AgentConversationTurn, AgentViewModel } from '../viewmodel/AgentViewModel';
import { ProductCard } from '../components/ProductCard';
import { COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_SOFT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, ROUTE_PRODUCT_DETAIL } from '../common/Constants';

@ComponentV2
export struct AgentSheetView {
  @Require @Param pathStack: NavPathStack;
  @Require @Param vm: AgentViewModel;
  @Event onClose: () => void = (): void => {
  };
  private chatScroller: Scroller = new Scroller();
  private inputController: TextInputController = new TextInputController();

  build() {
    Column({ space: 10 }) {
      Row() {
        Text('AI 找物').fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY)
          .layoutWeight(1);
        if (this.vm.turns.length > 0) {
          Button('新对话').fontSize(12).fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT)
            .borderRadius(16).height(32).enabled(!this.vm.loading)
            .onClick(() => this.vm.resetConversation());
        }
      }
      .width('100%').padding({ right: 50 }).margin({ top: 8 });
      Text('只推荐同校在售商品，支持继续补充条件').fontSize(12)
        .fontColor(COLOR_TEXT_SECONDARY).width('100%');

      if (this.vm.turns.length === 0 && !this.vm.loading) {
        Column({ space: 8 }) {
          Text('试试这样问').fontSize(16).fontWeight(FontWeight.Medium)
            .fontColor(COLOR_TEXT_PRIMARY);
          this.suggestion('帮我找 80 元以内的高等数学教材');
          this.suggestion('想买可以当面交易的二手台灯');
          this.suggestion('预算 200 元，有什么成色较好的耳机？');
        }
        .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center);
      } else {
        List({ space: 14, scroller: this.chatScroller }) {
          ForEach(this.vm.turns, (turn: AgentConversationTurn) => {
            ListItem() {
              this.turnContent(turn);
            }
          }, (turn: AgentConversationTurn): string => turn.id);
          if (this.vm.loading) {
            ListItem() {
              Column({ space: 10 }) {
                Row() {
                  Text(this.vm.query).fontSize(14).fontColor(Color.White).lineHeight(20)
                    .width('82%').padding(12).backgroundColor(COLOR_PRIMARY).borderRadius(12);
                }
                .width('100%').justifyContent(FlexAlign.End);
                Row({ space: 8 }) {
                  LoadingProgress().width(20).height(20).color(COLOR_PRIMARY);
                  Text('正在为你查找…').fontSize(13).fontColor(COLOR_TEXT_TERTIARY);
                }
                .width('100%');
              }
              .width('100%');
            }
          }
        }
        .layoutWeight(1).width('100%').scrollBar(BarState.Off)
        .onAppear(() => this.scrollToLatest());
      }

      if (this.vm.error !== '') {
        Text(this.vm.error).fontSize(12).fontColor(COLOR_ERROR).width('100%');
      }
      Row({ space: 8 }) {
        TextInput({ placeholder: '继续提问或补充条件', text: this.vm.query, controller: this.inputController })
          .height(48).layoutWeight(1).fontSize(14).backgroundColor(COLOR_PAGE_BG).borderRadius(24)
          .padding({ left: 12, right: 12 })
          .onChange((value: string) => {
            this.vm.query = value;
            this.vm.error = '';
          });
        Button(this.vm.loading ? '…' : '发送').enabled(!this.vm.loading).height(48).fontColor(Color.White)
          .backgroundColor(COLOR_PRIMARY).borderRadius(24)
          .onClick(() => this.sendMessage());
      }
      .width('100%');
    }
    .width('100%').height('100%').padding({ left: 16, right: 16, bottom: 20 });
  }

  @Builder
  suggestion(prompt: string): void {
    Text(prompt).fontSize(13).fontColor(COLOR_TEXT_SECONDARY)
      .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12)
      .onClick(() => {
        this.vm.query = prompt;
        this.sendMessage();
      });
  }

  @Builder
  turnContent(turn: AgentConversationTurn): void {
    Column({ space: 10 }) {
      Row() {
        Text(turn.question).fontSize(14).lineHeight(20).fontColor(Color.White)
          .width('82%').padding(12).backgroundColor(COLOR_PRIMARY).borderRadius(12);
      }
      .width('100%').justifyContent(FlexAlign.End);
      Text(turn.replyLead).fontSize(14).lineHeight(21).fontColor(COLOR_TEXT_PRIMARY)
        .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12);
      if (turn.recommendations.length > 0) {
        Text(`推荐商品 · ${turn.recommendations.length} 件`).fontSize(14)
          .fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY).width('100%');
        WaterFlow() {
          ForEach(turn.recommendations, (item: AgentRecommendation) => {
            FlowItem() {
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
                  Text('商品信息暂时无法加载').fontSize(14).fontWeight(FontWeight.Medium)
                    .fontColor(COLOR_TEXT_PRIMARY);
                  Text('点击查看详情').fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
                }
                .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12)
                .onClick(() => {
                  this.onClose();
                  this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, item.listingId);
                });
              }
            }
          }, (item: AgentRecommendation): string => item.listingId);
        }
        .columnsTemplate('1fr 1fr').columnsGap(10).rowsGap(10)
        .height(Math.ceil(turn.recommendations.length / 2) * 260).width('100%').scrollBar(BarState.Off);
      }
      if (turn.replyDetail !== '') {
        Text(turn.replyDetail).fontSize(13).lineHeight(20).fontColor(COLOR_TEXT_SECONDARY)
          .width('100%').padding(12).backgroundColor(Color.White).borderRadius(12);
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start);
  }

  private async sendMessage(): Promise<void> {
    if (this.vm.query.trim() !== '') {
      this.inputController.stopEditing();
    }
    const success: boolean = await this.vm.send();
    if (success) {
      this.scrollToLatest();
    }
  }

  private scrollToLatest(): void {
    setTimeout(() => {
      if (this.vm.turns.length > 0) {
        this.chatScroller.scrollToIndex(this.vm.turns.length - 1, true, ScrollAlign.START);
      }
    }, 80);
  }
}
