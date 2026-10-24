import { KeyboardAvoidMode } from '@kit.ArkUI';
import { AuthViewModel } from '../viewmodel/AuthViewModel';
import { PAGE_LEGAL } from '../common/LegalDocuments';
import {
  UI_RADIUS, COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_SOFT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY, PAGE_MAIN
} from '../common/Constants';

@Entry
@ComponentV2
struct Index {
  @Local vm: AuthViewModel = new AuthViewModel();
  private countdownTimer: number = -1;

  onPageShow(): void {
    // Use the page's UI context after it is attached to the UI instance.
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    this.stopCountdown();
    this.vm.refreshCooldown();
    this.countdownTimer = setInterval(() => this.vm.refreshCooldown(), 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== -1) clearInterval(this.countdownTimer);
    this.countdownTimer = -1;
  }

  onPageHide(): void {
    this.stopCountdown();
  }

  aboutToDisappear(): void {
    this.stopCountdown();
    this.vm.dispose();
  }

  build() {
    Column() {
      Scroll() {
        Column({ space: 16 }) {
          Column({ space: 12 }) {
            Text('集').fontSize(32).fontWeight(FontWeight.Bold).fontColor(Color.White)
              .width(72).height(72).textAlign(TextAlign.Center)
              .backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS);
            Text('校园集市').fontSize(27).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY);
            Text('同校好物 · 当面交易').fontSize(14).fontColor(COLOR_TEXT_SECONDARY);
          }
          .width('100%').margin({ top: this.vm.registering ? 24 : 48, bottom: 8 });

          Text(this.vm.registering ? '注册账号' : '邮箱登录')
            .fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY).width('100%');
          Text(this.vm.registering ? '验证邮箱并设置密码，开启闲置好物之旅' : '登录后发现同学发布的闲置好物')
            .fontSize(13).fontColor(COLOR_TEXT_TERTIARY).width('100%');

          Column({ space: 12 }) {
            this.loginForm();
            if (this.vm.registering) {
              this.registrationForm();
            }
            if (this.vm.formError !== '') {
              Text(this.vm.formError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
            }
          }
          .width('100%').padding(18).backgroundColor(Color.White).borderRadius(UI_RADIUS);
          Text(this.vm.registering ? '注册须验证邮箱，邮箱验证不代表学生身份认证。' :
            '忘记密码请联系项目组。没有账号可点击下方「立即注册」。')
            .fontSize(11).fontColor(COLOR_TEXT_TERTIARY).width('100%');
        }
        .width('100%').padding({ left: 24, right: 24, bottom: 24 });
      }
      .layoutWeight(1).width('100%').scrollBar(BarState.Off);

      Button(this.vm.loggingIn ? (this.vm.registering ? '注册中…' : '登录中…') :
        (this.vm.registering ? '注册并进入首页' : '登录')).type(ButtonType.Normal)
        .enabled(!this.vm.loggingIn && !this.vm.sendingCode)
        .width('86%').height(50).margin({ bottom: 6 })
        .fontSize(16).fontWeight(FontWeight.Bold).fontColor(Color.White)
        .backgroundColor(COLOR_PRIMARY).borderRadius(UI_RADIUS)
        .onClick(async () => {
          const success: boolean = this.vm.registering ? await this.vm.register() : await this.vm.login();
          if (success) {
            this.getUIContext().getPromptAction().showToast({
              message: this.vm.registering ? '注册成功，欢迎来到校园集市' : '登录成功', duration: 1500
            });
            this.getUIContext().getRouter().replaceUrl({ url: PAGE_MAIN });
          }
        });
      Button(this.vm.registering ? '已有账号？返回登录' : '没有账号？立即注册')
        .type(ButtonType.Normal).width('86%').height(44).margin({ bottom: 6 })
        .fontSize(14).fontWeight(FontWeight.Medium).fontColor(COLOR_PRIMARY)
        .backgroundColor(COLOR_PRIMARY_SOFT).borderRadius(UI_RADIUS)
        .enabled(!this.vm.loggingIn)
        .onClick(() => this.vm.setRegistering(!this.vm.registering));
      this.legalLinks();
      Text('测试版 · 文档为待完善草案')
        .fontSize(11).fontColor(COLOR_TEXT_TERTIARY).margin({ bottom: 20 });
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAGE_BG);
  }

  private openLegal(document: string): void {
    this.getUIContext().getRouter().pushUrl({ url: PAGE_LEGAL, params: { document: document } });
  }

  @Builder
  legalLinks(): void {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Center }) {
      Button('用户协议').type(ButtonType.Normal).height(36).fontSize(12).fontColor(COLOR_PRIMARY)
        .backgroundColor(Color.Transparent).borderRadius(UI_RADIUS).padding({ left: 8, right: 8 })
        .onClick(() => this.openLegal('user-agreement'));
      Button('隐私政策').type(ButtonType.Normal).height(36).fontSize(12).fontColor(COLOR_PRIMARY)
        .backgroundColor(Color.Transparent).borderRadius(UI_RADIUS).padding({ left: 8, right: 8 })
        .onClick(() => this.openLegal('privacy-policy'));
      Button('社区与交易规则').type(ButtonType.Normal).height(36).fontSize(12).fontColor(COLOR_PRIMARY)
        .backgroundColor(Color.Transparent).borderRadius(UI_RADIUS).padding({ left: 8, right: 8 })
        .onClick(() => this.openLegal('community-rules'));
    }
    .width('100%');
  }

  @Builder
  emailVerificationForm(): void {
    Row({ space: 8 }) {
      TextInput({ placeholder: '六位邮箱验证码', text: this.vm.emailCode })
        .type(InputType.Number).maxLength(6).height(48).layoutWeight(1).fontSize(15)
        .enabled(!this.vm.loggingIn && !this.vm.sendingCode)
        .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS).padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.vm.emailCode = value.replace(/[^0-9]/g, '').slice(0, 6);
          this.vm.verificationError = ''; this.vm.formError = '';
        });
      Button(this.vm.sendingCode ? '发送中…' :
        (this.vm.resendSeconds > 0 ? `${this.vm.resendSeconds}s后重发` : '获取验证码'))
        .type(ButtonType.Normal).width(126).height(48).fontSize(13)
        .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT).borderRadius(UI_RADIUS)
        .enabled(!this.vm.loggingIn && !this.vm.sendingCode && this.vm.resendSeconds === 0)
        .onClick(async () => { await this.vm.sendEmailCode(); });
    }
    .width('100%');
    if (this.vm.verificationError !== '') {
      Text(this.vm.verificationError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
    }
    if (this.vm.verificationMessage !== '') {
      Text(this.vm.verificationMessage).fontSize(11).fontColor(COLOR_TEXT_SECONDARY).width('100%');
    }
  }

  @Builder
  registrationForm(): void {
    Text('密码为 6–64 位，建议组合使用字母、数字和符号')
      .fontSize(11).fontColor(COLOR_TEXT_TERTIARY).width('100%');
    TextInput({ placeholder: '请再次输入密码', text: this.vm.confirmPassword })
      .type(InputType.Password).maxLength(64).height(48).width('100%').fontSize(15)
      .enabled(!this.vm.loggingIn).backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
      .padding({ left: 14, right: 14 }).onChange((value: string) => {
        this.vm.confirmPassword = value; this.vm.confirmPasswordError = ''; this.vm.formError = '';
      });
    if (this.vm.confirmPasswordError !== '') {
      Text(this.vm.confirmPasswordError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
    }
    Row({ space: 4 }) {
      Checkbox({ name: 'registration-consent' }).select(this.vm.acceptedTerms).selectedColor(COLOR_PRIMARY)
        .width(20).height(20).enabled(!this.vm.loggingIn)
        .accessibilityText('同意用户协议与隐私政策草案')
        .onChange((value: boolean) => { this.vm.acceptedTerms = value; this.vm.consentError = ''; });
      Text('我已阅读并同意下方用户协议与隐私政策草案')
        .fontSize(12).fontColor(COLOR_TEXT_SECONDARY).layoutWeight(1);
    }
    .width('100%').alignItems(VerticalAlign.Center);
    if (this.vm.consentError !== '') {
      Text(this.vm.consentError).fontSize(12).fontColor(COLOR_ERROR).width('100%');
    }
  }

  @Builder
  loginForm(): void {
    Column({ space: 8 }) {
      TextInput({ placeholder: '请输入邮箱地址', text: this.vm.email })
        .type(InputType.Email).maxLength(254).height(48).fontSize(15)
        .enabled(!this.vm.loggingIn)
        .backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS).padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.vm.setEmail(value);
        });
      if (this.vm.emailError !== '') {
        Text(this.vm.emailError).fontSize(12).fontColor(COLOR_ERROR);
      }
      if (this.vm.registering) {
        this.emailVerificationForm();
      }
      TextInput({ placeholder: this.vm.registering ? '设置登录密码（6–64 位）' : '请输入密码', text: this.vm.password })
        .type(InputType.Password).maxLength(64)
        .enabled(!this.vm.loggingIn)
        .height(48).width('100%').fontSize(15).backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
        .padding({ left: 14, right: 14 })
        .onChange((value: string) => {
          this.vm.password = value; this.vm.passwordError = ''; this.vm.confirmPasswordError = ''; this.vm.formError = '';
        });
      if (this.vm.passwordError !== '') {
        Text(this.vm.passwordError).fontSize(12).fontColor(COLOR_ERROR);
      }
    }
    .width('100%');
  }

}
