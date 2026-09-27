import { common } from '@kit.AbilityKit';
import { PublishViewModel } from '../viewmodel/PublishViewModel';
import { COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY, MAX_PRODUCT_PHOTOS } from '../common/Constants';

@ComponentV2
export struct PublishProductView {
  @Local vm: PublishViewModel = new PublishViewModel();
  @Local pathStack: NavPathStack = new NavPathStack();

  build() {
    NavDestination() {
      Scroll() {
        Column({ space: 14 }) {
          this.fieldLabel('商品名称');
          TextInput({ placeholder: '例如：九成新自行车', text: this.vm.title })
            .height(48).fontSize(15).backgroundColor(Color.White).borderRadius(10)
            .padding({ left: 14, right: 14 })
            .onChange((value: string) => {
              this.vm.title = value;
              this.vm.titleError = '';
            });
          this.errorText(this.vm.titleError);

          this.fieldLabel('商品描述');
          TextArea({ placeholder: '介绍成色、功能和交易方式', text: this.vm.description })
            .height(110).fontSize(15).backgroundColor(Color.White).borderRadius(10)
            .padding(14)
            .onChange((value: string) => {
              this.vm.description = value;
              this.vm.descriptionError = '';
            });
          this.errorText(this.vm.descriptionError);

          this.fieldLabel('价格（元）');
          TextInput({ placeholder: '请输入价格', text: this.vm.priceText })
            .type(InputType.Number).height(48).fontSize(15).backgroundColor(Color.White).borderRadius(10)
            .padding({ left: 14, right: 14 })
            .onChange((value: string) => {
              this.vm.priceText = value;
              this.vm.priceError = '';
            });
          this.errorText(this.vm.priceError);

          this.fieldLabel('类别');
          TextInput({ placeholder: '例如：教材、自行车、耳机', text: this.vm.category })
            .height(48).fontSize(15).backgroundColor(Color.White).borderRadius(10)
            .padding({ left: 14, right: 14 })
            .onChange((value: string) => this.vm.category = value);
          this.fieldLabel('所在校区');
          TextInput({ placeholder: '例如：江湾校区', text: this.vm.campus })
            .height(48).fontSize(15).backgroundColor(Color.White).borderRadius(10)
            .padding({ left: 14, right: 14 })
            .onChange((value: string) => this.vm.campus = value);
          this.fieldLabel('商品成色');
          Row({ space: 8 }) {
            this.conditionButton('全新', 'new');
            this.conditionButton('良好', 'good');
            this.conditionButton('一般', 'fair');
          }
          .width('100%');

          Row() {
            Text('商品照片').fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY);
            Text(`（最多 ${MAX_PRODUCT_PHOTOS} 张，可不选）`).fontSize(12).fontColor(COLOR_TEXT_TERTIARY);
          }
          .width('100%');
          Row({ space: 10 }) {
            ForEach(this.vm.images, (source: string, index: number) => {
              Stack() {
                Image(source).width(86).height(86).borderRadius(10).objectFit(ImageFit.Cover);
                Text('×').fontSize(18).fontColor(Color.White).backgroundColor('#00000088').borderRadius(10)
                  .width(22).height(22).textAlign(TextAlign.Center).align(Alignment.TopEnd)
                  .onClick(() => this.vm.removeImage(index));
              }
            }, (source: string, index: number): string => `${source}_${index}`);
            if (this.vm.canAddPhoto) {
              Column() {
                Text('+').fontSize(28).fontColor(COLOR_TEXT_TERTIARY);
                Text('添加照片').fontSize(11).fontColor(COLOR_TEXT_TERTIARY);
              }
              .width(86).height(86).justifyContent(FlexAlign.Center)
              .border({ width: 1, color: '#C9CDD4', style: BorderStyle.Dashed }).borderRadius(10)
              .onClick(() => this.showPhotoActions());
            }
          }
          .width('100%');
          if (this.vm.photoError !== '') {
            Text(this.vm.photoError).fontSize(12).fontColor(COLOR_ERROR);
          }
          Text('发布时会先上传照片到电脑上的业务 API').fontSize(12).fontColor(COLOR_TEXT_TERTIARY);

          Button(this.vm.submitting ? '发布中…' : '发布商品')
            .enabled(!this.vm.submitting).width('100%').height(48).margin({ top: 10, bottom: 24 })
            .fontSize(16).fontColor(Color.White).backgroundColor(COLOR_PRIMARY).borderRadius(24)
            .onClick(async () => {
              const success: boolean = await this.vm.submit();
              if (success) {
                this.getUIContext().getPromptAction().showToast({ message: '商品发布成功', duration: 1500 });
                this.pathStack.pop();
              }
            });
        }
        .width('100%').padding({ left: 16, right: 16, top: 16 });
      }
      .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG).scrollBar(BarState.Off);
    }
    .title('发布商品')
    .onReady((context: NavDestinationContext) => {
      this.pathStack = context.pathStack;
    });
  }

  @Builder
  fieldLabel(label: string): void {
    Text(label).fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY).width('100%');
  }

  @Builder
  errorText(value: string): void {
    if (value !== '') {
      Text(value).fontSize(12).fontColor(COLOR_ERROR).width('100%');
    }
  }

  @Builder
  conditionButton(label: string, value: string): void {
    Button(label).layoutWeight(1).height(38).fontSize(12)
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
