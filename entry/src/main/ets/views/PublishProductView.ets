import { common } from '@kit.AbilityKit';
import { PublishViewModel } from '../viewmodel/PublishViewModel';
import {
  COLOR_DIVIDER, COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, MAX_PRODUCT_PHOTOS
} from '../common/Constants';

@ComponentV2
export struct PublishProductView {
  @Local vm: PublishViewModel = new PublishViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();

  build() {
    NavDestination() {
      Column() {
        Scroll() {
          Column({ space: 16 }) {
            this.photoSection();
            this.fieldLabel('商品标题');
            TextInput({ placeholder: '写出品牌、型号和物品名称', text: this.vm.title })
              .height(50).fontSize(14).backgroundColor(Color.White).borderRadius(12)
              .padding({ left: 14, right: 14 })
              .onChange((value: string) => {
                this.vm.title = value;
                this.vm.titleError = '';
              });
            this.errorText(this.vm.titleError);

            this.fieldLabel('商品描述');
            TextArea({ placeholder: '介绍使用情况、功能、配件及已知瑕疵', text: this.vm.description })
              .height(118).fontSize(14).backgroundColor(Color.White).borderRadius(12)
              .padding(14)
              .onChange((value: string) => {
                this.vm.description = value;
                this.vm.descriptionError = '';
              });
            this.errorText(this.vm.descriptionError);

            this.fieldLabel('商品价格');
            TextInput({ placeholder: '输入价格（元）', text: this.vm.priceText })
              .type(InputType.Number).height(50).fontSize(15)
              .backgroundColor(Color.White).borderRadius(12)
              .padding({ left: 14, right: 14 })
              .onChange((value: string) => {
                this.vm.priceText = value;
                this.vm.priceError = '';
              });
            this.errorText(this.vm.priceError);
            Text('当面交易时付款').fontSize(12).fontColor(COLOR_TEXT_TERTIARY).width('100%');

            this.fieldLabel('品类');
            TextInput({ placeholder: '例如：教材、数码、生活、出行', text: this.vm.category })
              .height(50).fontSize(14).backgroundColor(Color.White).borderRadius(12)
              .padding({ left: 14, right: 14 })
              .onChange((value: string) => this.vm.category = value);

            this.fieldLabel('成色');
            Row({ space: 8 }) {
              this.conditionButton('全新', 'new');
              this.conditionButton('良好', 'good');
              this.conditionButton('一般', 'fair');
            }
            .width('100%');

            this.fieldLabel('校区 / 交易地点');
            TextInput({ placeholder: '例如：东校区图书馆门口', text: this.vm.campus })
              .height(50).fontSize(14).backgroundColor(Color.White).borderRadius(12)
              .padding({ left: 14, right: 14 })
              .onChange((value: string) => this.vm.campus = value);
            Text('当面交易 · 线下付款').fontSize(12).fontColor(COLOR_TEXT_SECONDARY)
              .width('100%').padding(14).backgroundColor('#FFF4EB').borderRadius(12)
              .margin({ bottom: 16 });
          }
          .width('100%').padding({ left: 16, right: 16, top: 16 });
        }
        .layoutWeight(1).width('100%').scrollBar(BarState.Off);
        Button(this.vm.submitting ? '发布中…' : '发布商品')
          .enabled(!this.vm.submitting).width('92%').height(50)
          .fontSize(16).fontWeight(FontWeight.Bold).fontColor(Color.White)
          .backgroundColor(COLOR_PRIMARY).borderRadius(25)
          .onClick(async () => {
            const success: boolean = await this.vm.submit();
            if (success) {
              this.getUIContext().getPromptAction().showToast({ message: '商品发布成功', duration: 1500 });
              this.pathStack.pop();
            }
          });
      }
      .width('100%').height('100%').padding({ bottom: 14 })
      .backgroundColor(COLOR_PAGE_BG);
    }
    .title('发布闲置')
    .onReady((context: NavDestinationContext) => {
      this.pathStack = context.pathStack;
    });
  }

  @Builder
  photoSection(): void {
    Column({ space: 10 }) {
      Row() {
        Text('商品照片').fontSize(15).fontWeight(FontWeight.Bold)
          .fontColor(COLOR_TEXT_PRIMARY).layoutWeight(1);
        Text(`最多 ${MAX_PRODUCT_PHOTOS} 张 · 第一张为封面`)
          .fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
      }
      .width('100%');
      Row({ space: 10 }) {
        ForEach(this.vm.images, (source: string, index: number) => {
          Stack() {
            Image(source).width(86).height(86).borderRadius(12).objectFit(ImageFit.Cover);
            Text('×').fontSize(18).fontColor(Color.White)
              .backgroundColor('#00000088').borderRadius(11)
              .width(22).height(22).textAlign(TextAlign.Center).align(Alignment.TopEnd)
              .onClick(() => this.vm.removeImage(index));
          }
        }, (source: string, index: number): string => `${source}_${index}`);
        if (this.vm.canAddPhoto) {
          Column({ space: 3 }) {
            Text('+').fontSize(28).fontColor(COLOR_PRIMARY);
            Text('添加照片').fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
          }
          .width(86).height(86).justifyContent(FlexAlign.Center)
          .border({ width: 1, color: COLOR_DIVIDER, style: BorderStyle.Dashed })
          .borderRadius(12).onClick(() => this.showPhotoActions());
        }
      }
      .width('100%');
      if (this.vm.photoError !== '') {
        Text(this.vm.photoError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start)
    .padding(14).backgroundColor(Color.White).borderRadius(16);
  }

  @Builder
  fieldLabel(label: string): void {
    Text(label).fontSize(14).fontWeight(FontWeight.Bold)
      .fontColor(COLOR_TEXT_PRIMARY).width('100%');
  }

  @Builder
  errorText(value: string): void {
    if (value !== '') {
      Text(value).fontSize(12).fontColor(COLOR_ERROR).width('100%');
    }
  }

  @Builder
  conditionButton(label: string, value: string): void {
    Button(label).layoutWeight(1).height(38).fontSize(12).borderRadius(19)
      .fontColor(this.vm.condition === value ? Color.White : COLOR_TEXT_SECONDARY)
      .backgroundColor(this.vm.condition === value ? COLOR_PRIMARY : Color.White)
      .onClick(() => this.vm.condition = value);
  }

  private showPhotoActions(): void {
    this.getUIContext().showActionSheet({
      title: '添加商品照片',
      message: '选择拍摄照片或从相册选择',
      sheets: [
        {
          title: '拍摄照片',
          action: (): void => {
            const context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
            this.vm.takePhoto(context);
          }
        },
        {
          title: '从相册选择',
          action: (): void => {
            this.vm.chooseFromAlbum();
          }
        }
      ]
    });
  }
}
