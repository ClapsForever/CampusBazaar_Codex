import { AgentRecommendation, AgentConversationSummary, Product } from '../../../model/Models';
import { AgentConversationTurn, AgentViewModel } from '../../../viewmodel/AgentViewModel';
import { ProductCard } from '../components/ProductCard';
import {
  UI_RADIUS, COLOR_ERROR, COLOR_PAGE_BG, COLOR_INPUT_BG, COLOR_PRIMARY, COLOR_PRIMARY_STRONG, COLOR_PRIMARY_SOFT, COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, SHEET_ACTION_HEIGHT, ROUTE_PRODUCT_DETAIL
} from '../common/Constants';

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
      Row({ space: 8 }) {
        Text(this.vm.historyVisible ? '历史记录' : 'AI 找物').fontSize('24fp').fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY)
          .layoutWeight(1);
        Button({ type: ButtonType.Normal }) {
          Image($r('app.media.design_close')).width(20).height(20);
        }
        .width(SHEET_ACTION_HEIGHT).height(SHEET_ACTION_HEIGHT)
        .backgroundColor('#E5E4E1').borderRadius(UI_RADIUS)
        .accessibilityText('关闭 AI 找物').onClick(() => this.onClose());
      }
      .width('100%').alignItems(VerticalAlign.Center).margin({ top: 8 });
      Row({ space: 8 }) {
        Button('新对话', { type: ButtonType.Normal }).fontSize('14fp').fontWeight(FontWeight.Medium)
            .fontColor(Color.White).backgroundColor(COLOR_PRIMARY_STRONG)
            .height(SHEET_ACTION_HEIGHT).padding({ left: 10, right: 10 }).borderRadius(UI_RADIUS)
            .enabled(!this.vm.loading)
            .onClick(() => this.vm.resetConversation());
        Button(this.vm.historyVisible ? '返回对话' : '历史记录', { type: ButtonType.Normal })
          .fontSize('13fp').fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT)
          .height(SHEET_ACTION_HEIGHT).padding({ left: 10, right: 10 }).borderRadius(UI_RADIUS)
          .onClick(() => {
            if (this.vm.historyVisible) this.vm.closeHistory();
            else this.vm.openHistory();
          });
      }
      .width('100%').alignItems(VerticalAlign.Center);
      if (this.vm.historyVisible) {
        this.historyContent();
      } else {
        Text('描述商品、预算或校区，支持继续补充条件').fontSize('12fp')
          .fontColor(COLOR_TEXT_SECONDARY).width('100%');

        if (this.vm.turns.length === 0 && !this.vm.loading) {
          Column({ space: 8 }) {
            Text('试试这样问').fontSize('16fp').fontWeight(FontWeight.Medium)
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
                    Text(this.vm.query).fontSize('14fp').fontColor(Color.White).lineHeight('20fp')
                      .width('82%').padding(12).backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS);
                  }
                  .width('100%').justifyContent(FlexAlign.End);
                  Row({ space: 8 }) {
                    LoadingProgress().width(20).height(20).color(COLOR_PRIMARY);
                    Text('正在为你查找…').fontSize('13fp').fontColor(COLOR_TEXT_TERTIARY);
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
          Text(this.vm.error).fontSize('12fp').fontColor(COLOR_ERROR).width('100%');
        }
        Row({ space: 8 }) {
          TextInput({ placeholder: '继续提问或补充条件', text: this.vm.query, controller: this.inputController })
            .height(48).layoutWeight(1).fontSize('14fp').backgroundColor(COLOR_INPUT_BG).borderRadius(UI_RADIUS)
            .padding({ left: 12, right: 12 })
            .onChange((value: string) => {
              this.vm.query = value;
              this.vm.error = '';
            });
          Button(this.vm.loading ? '…' : '发送').type(ButtonType.Normal).enabled(!this.vm.loading).height(48).fontColor(Color.White)
            .backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS)
            .onClick(() => this.sendMessage());
        }
        .width('100%');
      }
    }
    .width('100%').height('100%').padding({ left: 20, right: 20, bottom: 20 })
    .backgroundColor(COLOR_PAGE_BG);
  }

  @Builder
  suggestion(prompt: string): void {
    Text(prompt).fontSize('13fp').fontColor(COLOR_TEXT_SECONDARY)
      .width('100%').padding({ top: 16, bottom: 16 })
      .onClick(() => {
        this.vm.query = prompt;
        this.sendMessage();
      });
  }

  @Builder
  turnContent(turn: AgentConversationTurn): void {
    Column({ space: 10 }) {
      if (turn.createdAt !== undefined) {
        Text(this.historyTime(turn.createdAt)).fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY).width('100%');
      }
      Row() {
        Text(turn.question).fontSize('14fp').lineHeight('20fp').fontColor(Color.White)
          .width('82%').padding(12).backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS);
      }
      .width('100%').justifyContent(FlexAlign.End);
      Text(turn.replyLead).fontSize('14fp').lineHeight('24fp').fontColor(COLOR_TEXT_PRIMARY)
        .width('100%').padding({ top: 12, bottom: 12 });
      if (turn.recommendations.length > 0) {
        Text(`推荐商品 · ${turn.recommendations.length} 件`).fontSize('14fp')
          .fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY).width('100%');
        Column({ space: 10 }) {
          ForEach(turn.recommendations, (item: AgentRecommendation) => {
            Row() {
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
                  Text(this.vm.historyVisible ? '查看当时推荐的商品' : '商品信息暂时无法加载').fontSize('14fp').fontWeight(FontWeight.Medium)
                    .fontColor(COLOR_TEXT_PRIMARY);
                  Text('点击查看详情').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
                }
                .width('100%').padding(12).backgroundColor(Color.White).borderRadius(UI_RADIUS)
                .onClick(() => {
                  this.onClose();
                  this.pathStack.pushPathByName(ROUTE_PRODUCT_DETAIL, item.listingId);
                });
              }
            }
          }, (item: AgentRecommendation): string => item.listingId);
        }
        .width('100%');
      }
      if (turn.replyDetail !== '') {
        Text(turn.replyDetail).fontSize('13fp').lineHeight('22fp').fontColor(COLOR_TEXT_SECONDARY)
          .width('100%').padding({ top: 12, bottom: 12 });
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start);
  }

  @Builder
  historyContent(): void {
    if (this.vm.selectedHistory === null) {
      Row() {
        Text('最近的对话在前 · 可手动删除记录').fontSize('12fp').fontColor(COLOR_TEXT_SECONDARY).layoutWeight(1);
        Text(`已加载 ${this.vm.history.length} 条`).fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY);
      }
      .width('100%');
      List({ space: 10 }) {
        ForEach(this.vm.history, (item: AgentConversationSummary) => {
          ListItem() {
            Row({ space: 10 }) {
              Column({ space: 8 }) {
                Text(item.title).fontSize('15fp').fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY)
                  .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%');
                Text(`${this.historyTime(item.createdAt)} · ${item.turnCount} 轮对话`)
                  .fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY).width('100%');
              }
              .layoutWeight(1).alignItems(HorizontalAlign.Start)
              .onClick(() => this.vm.viewHistory(item));
              Button(this.vm.deletingHistoryId === item.sessionId ? '…' : '删除')
                .type(ButtonType.Normal).height(36).fontSize('12fp')
                .fontColor(COLOR_ERROR).backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
                .enabled(this.vm.deletingHistoryId === '' && !this.vm.historyLoading)
                .onClick(() => this.showDeleteHistoryDialog(item));
            }
            .width('100%').padding(14).backgroundColor(Color.White).borderRadius(UI_RADIUS)
            .alignItems(VerticalAlign.Center);
          }
        }, (item: AgentConversationSummary): string => item.sessionId);
        if (!this.vm.historyLoading && this.vm.history.length === 0 && this.vm.historyError === '') {
          ListItem() {
            Text('还没有历史对话，开始找物后会自动保存').fontSize('14fp').fontColor(COLOR_TEXT_SECONDARY)
              .padding({ top: 36, bottom: 36 });
          }
        }
      }
      .layoutWeight(1).width('100%').scrollBar(BarState.Off);
      if (this.vm.historyCursor !== null && !this.vm.historyLoading && this.vm.historyError === '') {
        Button('加载更多记录').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
          .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT).onClick(() => this.vm.openHistory(true));
      }
    } else {
      Row({ space: 8 }) {
        Button('返回列表').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
          .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT).onClick(() => this.vm.openHistory());
        Text(this.vm.selectedHistory.title).fontSize('13fp').fontColor(COLOR_TEXT_SECONDARY)
          .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis });
        Button(this.vm.deletingHistoryId === this.selectedSessionId() ? '…' : '删除')
          .type(ButtonType.Normal).height(40).fontSize('12fp')
          .fontColor(COLOR_ERROR).backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
          .enabled(this.vm.deletingHistoryId === '' && !this.vm.historyLoading)
          .onClick(() => this.deleteSelectedHistory());
      }
      .width('100%');
      List({ space: 14 }) {
        ForEach(this.vm.historyTurns, (turn: AgentConversationTurn) => {
          ListItem() { this.turnContent(turn); }
        }, (turn: AgentConversationTurn): string => turn.id);
      }
      .layoutWeight(1).width('100%').scrollBar(BarState.Off);
      if (this.vm.historyTurnCursor !== null && !this.vm.historyLoading && this.vm.historyError === '') {
        Button('加载后续对话').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
          .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT).onClick(() => {
            if (this.vm.selectedHistory !== null) this.vm.viewHistory(this.vm.selectedHistory, true);
          });
      }
      Text('历史对话按时间展示，可点击推荐商品查看详情').fontSize('12fp')
        .fontColor(COLOR_TEXT_TERTIARY).width('100%');
    }
    if (this.vm.historyLoading) {
      LoadingProgress().width(28).height(28).color(COLOR_PRIMARY);
    }
    if (this.vm.historyError !== '') {
      Text(this.vm.historyError).fontSize('12fp').fontColor(COLOR_ERROR).width('100%');
      Button('重试').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
        .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT).onClick(() => {
          if (this.vm.selectedHistory === null) this.vm.openHistory(this.vm.historyCursor !== null);
          else this.vm.viewHistory(this.vm.selectedHistory, this.vm.historyTurnCursor !== null);
        });
    }
  }

  private historyTime(value: number): string {
    const date: Date = new Date(value);
    return `${date.getFullYear()}-${this.twoDigits(date.getMonth() + 1)}-${this.twoDigits(date.getDate())} ` +
      `${this.twoDigits(date.getHours())}:${this.twoDigits(date.getMinutes())}`;
  }

  private twoDigits(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  private selectedSessionId(): string {
    return this.vm.selectedHistory === null ? '' : this.vm.selectedHistory.sessionId;
  }

  private deleteSelectedHistory(): void {
    if (this.vm.selectedHistory !== null) {
      this.showDeleteHistoryDialog(this.vm.selectedHistory);
    }
  }

  private showDeleteHistoryDialog(item: AgentConversationSummary): void {
    this.getUIContext().showAlertDialog({
      title: '删除对话记录',
      cornerRadius: UI_RADIUS,
      message: `确定删除「${item.title}」吗？删除后无法恢复。`,
      primaryButton: {
        value: '删除',
        action: (): void => {
          this.confirmDeleteHistory(item);
        }
      },
      secondaryButton: { value: '取消', action: (): void => { } }
    });
  }

  private async confirmDeleteHistory(item: AgentConversationSummary): Promise<void> {
    const success: boolean = await this.vm.deleteHistory(item);
    this.getUIContext().getPromptAction().showToast({
      message: success ? '对话记录已删除' : (this.vm.historyError || '删除失败，请稍后重试'),
      duration: 1600
    });
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
