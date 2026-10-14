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

          Text('邮箱登录').fontSize(20).fontWeight(FontWeight.Bold)
            .fontColor(COLOR_TEXT_PRIMARY).width('100%');
          Text('登录后发现同校同学发布的闲置好物')
            .fontSize(13).fontColor(COLOR_TEXT_TERTIARY).width('100%');

          Column({ space: 12 }) {
            this.loginForm();
            if (this.vm.formError !== '') {
              Text(this.vm.formError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
            }
          }
          .width('100%').padding(18).backgroundColor(Color.White).borderRadius(UI_RADIUS);
          Text('演示账号由项目组提供，忘记密码请联系管理员')
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
  loginForm(): void {
    Column({ space: 8 }) {
      TextInput({ placeholder: '请输入邮箱地址', text: this.vm.email })
        .type(InputType.Email).maxLength(254).height(48).fontSize(15)
        .enabled(!this.vm.loggingIn)
        .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS).padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.vm.email = value;
          this.vm.emailError = '';
          this.vm.formError = '';
        });
      if (this.vm.emailError !== '') {
        Text(this.vm.emailError).fontSize(12).fontColor(COLOR_ERROR);
      }
      TextInput({ placeholder: '请输入密码', text: this.vm.password }).type(InputType.Password).maxLength(64)
        .enabled(!this.vm.loggingIn)
        .height(48).width('100%').fontSize(15).backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
        .padding({ left: 14, right: 14 })
        .onChange((value: string) => { this.vm.password = value; this.vm.passwordError = ''; this.vm.formError = ''; });
      if (this.vm.passwordError !== '') {
        Text(this.vm.passwordError).fontSize(12).fontColor(COLOR_ERROR);
      }
    }
    .width('100%');
  }

}
