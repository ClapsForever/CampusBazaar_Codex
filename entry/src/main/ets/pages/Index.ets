import { AuthViewModel } from '../viewmodel/AuthViewModel';
import {
  COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_SOFT, COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, PAGE_MAIN
} from '../common/Constants';

@Entry
@ComponentV2
struct Index {
  @Local vm: AuthViewModel = new AuthViewModel();

  build() {
    Column() {
      Scroll() {
        Column({ space: 18 }) {
          Column({ space: 8 }) {
            Text('🛍️').fontSize(52);
            Text('CampusBazaar').fontSize(28).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
            Text('校园二手商品交易平台').fontSize(14).fontColor(COLOR_TEXT_SECONDARY);
          }
          .width('100%').margin({ top: 52 });

          Row({ space: 6 }) {
            Text('ℹ️').fontSize(14);
            Text('本机联调：填写后端 .env 的开发验证码；暂不支持学校统一认证')
              .fontSize(12).fontColor(COLOR_TEXT_SECONDARY).lineHeight(18);
          }
          .width('100%').padding(10).backgroundColor(COLOR_PRIMARY_SOFT).borderRadius(8);

          Text('手机号登录').fontSize(14).fontWeight(FontWeight.Bold).fontColor(COLOR_PRIMARY)
            .backgroundColor(COLOR_PRIMARY_SOFT).borderRadius(18)
            .height(48).padding({ left: 16, right: 16, top: 9, bottom: 9 });

          Column({ space: 12 }) {
            this.phoneForm();
            if (this.vm.formError !== '') {
              Text(this.vm.formError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
            }
          }
          .width('100%');
        }
        .width('100%').padding({ left: 24, right: 24, bottom: 24 });
      }
      .layoutWeight(1).width('100%').scrollBar(BarState.Off);

      Button(this.vm.loggingIn ? '登录中…' : '登录')
        .enabled(!this.vm.loggingIn)
        .width('86%').height(48).margin({ bottom: 18 })
        .fontSize(16).fontColor(Color.White).backgroundColor(COLOR_PRIMARY).borderRadius(24)
        .onClick(async () => {
          const success: boolean = await this.vm.login();
          if (success) {
            this.getUIContext().getPromptAction().showToast({ message: '登录成功', duration: 1500 });
            this.getUIContext().getRouter().replaceUrl({ url: PAGE_MAIN });
          }
        });
      Text('登录即代表同意用户协议与隐私政策（演示）')
        .fontSize(11).fontColor(COLOR_TEXT_TERTIARY).margin({ bottom: 28 });
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
  }

  @Builder
  phoneForm(): void {
    Column({ space: 8 }) {
      TextInput({ placeholder: '请输入 11 位手机号', text: this.vm.phone })
        .type(InputType.PhoneNumber).maxLength(11).height(48).fontSize(15)
        .backgroundColor(Color.White).borderRadius(10).padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.vm.phone = value;
          this.vm.phoneError = '';
        });
      if (this.vm.phoneError !== '') {
        Text(this.vm.phoneError).fontSize(12).fontColor(COLOR_ERROR);
      }
      Row({ space: 10 }) {
        TextInput({ placeholder: '请输入 6 位数字验证码', text: this.vm.smsCode })
          .type(InputType.Number).maxLength(6).height(48).layoutWeight(1).fontSize(15)
          .backgroundColor(Color.White).borderRadius(10).padding({ left: 14, right: 14 })
          .onChange((value: string) => {
            this.vm.smsCode = value;
            this.vm.smsCodeError = '';
          });
      }
      .width('100%');
      if (this.vm.smsCodeError !== '') {
        Text(this.vm.smsCodeError).fontSize(12).fontColor(COLOR_ERROR);
      }
    }
    .width('100%');
  }

}
