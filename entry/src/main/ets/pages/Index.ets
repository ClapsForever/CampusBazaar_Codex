import { AuthViewModel } from '../viewmodel/AuthViewModel';
import {
  UI_RADIUS, COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY, PAGE_MAIN
} from '../common/Constants';

@Entry
@ComponentV2
struct Index {
  @Local vm: AuthViewModel = new AuthViewModel();

  build() {
    Column() {
      Scroll() {
        Column({ space: 18 }) {
          Column({ space: 12 }) {
            Text('集').fontSize(32).fontWeight(FontWeight.Bold).fontColor(Color.White)
              .width(72).height(72).textAlign(TextAlign.Center)
              .backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS);
            Text('校园集市').fontSize(27).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
            Text('同校好物 · 当面交易').fontSize(14).fontColor(COLOR_TEXT_SECONDARY);
          }
          .width('100%').margin({ top: 64, bottom: 22 });

          Text(this.vm.passwordMode ? '密码登录' : '验证码登录').fontSize(20).fontWeight(FontWeight.Bold)
            .fontColor(COLOR_TEXT_PRIMARY).width('100%');
          Text('登录后发现同校同学发布的闲置好物')
            .fontSize(13).fontColor(COLOR_TEXT_TERTIARY).width('100%');

          Column({ space: 12 }) {
            this.phoneForm();
            if (this.vm.formError !== '') {
              Text(this.vm.formError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
            }
          }
          .width('100%').padding(18).backgroundColor(Color.White).borderRadius(UI_RADIUS);
          Button(this.vm.passwordMode ? '切换到验证码登录' : '切换到密码登录').type(ButtonType.Normal)
            .height(44).fontColor(COLOR_PRIMARY).backgroundColor(Color.White).borderRadius(UI_RADIUS)
            .enabled(!this.vm.loggingIn).onClick(() => this.vm.switchMode());
          Text(this.vm.passwordMode ? '首次登录请使用验证码，在个人设置中设置密码' : '当前测试环境请使用项目配置的验证码')
            .fontSize(11).fontColor(COLOR_TEXT_TERTIARY).width('100%');
        }
        .width('100%').padding({ left: 24, right: 24, bottom: 24 });
      }
      .layoutWeight(1).width('100%').scrollBar(BarState.Off);

      Button(this.vm.loggingIn ? '登录中…' : '登录').type(ButtonType.Normal)
        .enabled(!this.vm.loggingIn)
        .width('86%').height(50).margin({ bottom: 18 })
        .fontSize(16).fontWeight(FontWeight.Bold).fontColor(Color.White)
        .backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS)
        .onClick(async () => {
          const success: boolean = await this.vm.login();
          if (success) {
            this.getUIContext().getPromptAction().showToast({ message: '登录成功', duration: 1500 });
            this.getUIContext().getRouter().replaceUrl({ url: PAGE_MAIN });
          }
        });
      Text('登录即代表同意用户协议与隐私政策')
        .fontSize(11).fontColor(COLOR_TEXT_TERTIARY).margin({ bottom: 28 });
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
  }

  @Builder
  phoneForm(): void {
    Column({ space: 8 }) {
      TextInput({ placeholder: '请输入 11 位手机号', text: this.vm.phone })
        .type(InputType.PhoneNumber).maxLength(11).height(48).fontSize(15)
        .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS).padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.vm.phone = value;
          this.vm.phoneError = '';
        });
      if (this.vm.phoneError !== '') {
        Text(this.vm.phoneError).fontSize(12).fontColor(COLOR_ERROR);
      }
      if (this.vm.passwordMode) {
        TextInput({ placeholder: '请输入密码', text: this.vm.password }).type(InputType.Password).maxLength(64)
          .height(48).width('100%').fontSize(15).backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
          .padding({ left: 14, right: 14 })
          .onChange((value: string) => { this.vm.password = value; this.vm.passwordError = ''; });
        if (this.vm.passwordError !== '') {
          Text(this.vm.passwordError).fontSize(12).fontColor(COLOR_ERROR);
        }
      } else {
        Row({ space: 10 }) {
          TextInput({ placeholder: '请输入 6 位数字验证码', text: this.vm.smsCode })
            .type(InputType.Number).maxLength(6).height(48).layoutWeight(1).fontSize(15)
            .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS).padding({ left: 14, right: 14 })
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
    }
    .width('100%');
  }

}
