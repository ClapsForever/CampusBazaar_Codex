import { authService } from '../service/AuthenticationService';
import { isValidPhone, isValidSmsCode } from '../common/Utils';

@ObservedV2
export class AuthViewModel {
  @Trace phone: string = '';
  @Trace smsCode: string = '';
  @Trace phoneError: string = '';
  @Trace smsCodeError: string = '';
  @Trace formError: string = '';
  @Trace loggingIn: boolean = false;
  @Trace passwordMode: boolean = false;
  @Trace password: string = '';
  @Trace passwordError: string = '';

  switchMode(): void {
    if (this.loggingIn) return;
    this.passwordMode = !this.passwordMode;
    this.smsCode = '';
    this.password = '';
    this.smsCodeError = '';
    this.passwordError = '';
    this.formError = '';
  }

  validatePhone(): void {
    this.phoneError = isValidPhone(this.phone) ? '' : '请输入正确的 11 位手机号';
  }

  validateSmsCode(): void {
    this.smsCodeError = isValidSmsCode(this.smsCode) ? '' : '请输入 6 位数字验证码';
  }

  async login(): Promise<boolean> {
    if (this.loggingIn) return false;
    this.formError = '';
    this.validatePhone();
    if (this.passwordMode) {
      this.passwordError = this.password.length > 0 && this.password.length <= 64 ? '' : '请输入密码';
    } else {
      this.validateSmsCode();
    }
    if (this.phoneError !== '' || (this.passwordMode ? this.passwordError !== '' : this.smsCodeError !== '')) {
      return false;
    }
    this.loggingIn = true;
    try {
      if (this.passwordMode) await authService.loginByPassword(this.phone, this.password);
      else await authService.loginByPhone(this.phone, this.smsCode);
      this.password = '';
      this.smsCode = '';
      return true;
    } catch (error) {
      this.formError = (error as Error).message;
      return false;
    } finally {
      this.loggingIn = false;
    }
  }
}
