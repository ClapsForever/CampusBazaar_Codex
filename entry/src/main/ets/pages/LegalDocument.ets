import { util } from '@kit.ArkTS';
import { legalFile, legalTitle, LegalDocumentParams } from '../common/LegalDocuments';
import {
  COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_SOFT, COLOR_TEXT_PRIMARY, UI_RADIUS
} from '../common/Constants';

@Entry
@ComponentV2
struct LegalDocument {
  @Local title: string = '';
  @Local content: string = '';
  @Local loadError: boolean = false;

  aboutToAppear(): void {
    const params = this.getUIContext().getRouter().getParams() as LegalDocumentParams;
    const document: string = params?.document || 'user-agreement';
    this.title = legalTitle(document);
    try {
      const bytes = this.getUIContext().getHostContext()!.resourceManager.getRawFileContentSync(legalFile(document));
      this.content = util.TextDecoder.create('utf-8').decodeToString(bytes);
    } catch (_error) {
      this.loadError = true;
    }
  }

  build() {
    Column({ space: 12 }) {
      Row({ space: 12 }) {
        Button('返回').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
          .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT)
          .onClick(() => this.getUIContext().getRouter().back());
        Text(this.title).fontSize(19).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY).layoutWeight(1);
      }
      .width('100%');
      if (this.loadError) {
        Text('文档加载失败，请返回后重试').fontSize(15).fontColor(COLOR_ERROR).width('100%');
      } else {
        Scroll() {
          Text(this.content).fontSize(15).lineHeight(26).fontColor(COLOR_TEXT_PRIMARY)
            .copyOption(CopyOptions.LocalDevice).width('100%').padding({ bottom: 24 });
        }
        .width('100%').layoutWeight(1).scrollBar(BarState.Auto);
      }
    }
    .width('100%').height('100%').padding(16).backgroundColor(COLOR_PAGE_BG);
  }
}
