import {
  UI_RADIUS, LoadState, COLOR_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY
} from '../common/Constants';

@ComponentV2
export struct StateView {
  @Require @Param state: LoadState;
  @Param emptyText: string = '暂无数据';
  @Param emptyHint: string = '';
  @Param errorText: string = '加载失败，请稍后重试';
  @Param loadingText: string = '加载中…';
  @Event onRetry: () => void = (): void => {
  };

  build() {
    if (this.state === LoadState.LOADING) {
      Column({ space: 12 }) {
        LoadingProgress().width(36).height(36).color(COLOR_PRIMARY);
        Text(this.loadingText).fontSize('14fp').fontColor(COLOR_TEXT_TERTIARY);
      }
      .width('100%').height('100%').justifyContent(FlexAlign.Center);
    } else if (this.state === LoadState.EMPTY) {
      Column({ space: 8 }) {
        Text('📭').fontSize('40fp');
        Text(this.emptyText).fontSize('15fp').fontColor(COLOR_TEXT_SECONDARY);
        if (this.emptyHint !== '') {
          Text(this.emptyHint).fontSize('13fp').fontColor(COLOR_TEXT_TERTIARY);
        }
      }
      .width('100%').height('100%').justifyContent(FlexAlign.Center);
    } else if (this.state === LoadState.ERROR) {
      Column({ space: 12 }) {
        Text('⚠️').fontSize('40fp');
        Text(this.errorText).fontSize('15fp').fontColor(COLOR_TEXT_SECONDARY);
        Button('重试').type(ButtonType.Normal)
          .height(48).fontSize('14fp').fontColor(Color.White).backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS)
          .padding({ left: 24, right: 24, top: 8, bottom: 8 })
          .onClick(() => this.onRetry());
      }
      .width('100%').height('100%').justifyContent(FlexAlign.Center);
    }
  }
}
