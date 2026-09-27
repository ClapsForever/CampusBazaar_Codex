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

  validatePhone(): void {
    this.phoneError = isValidPhone(this.phone) ? '' : '请输入正确的 11 位手机号';
  }

  validateSmsCode(): void {
    this.smsCodeError = isValidSmsCode(this.smsCode) ? '' : '请输入 6 位数字验证码';
  }

  async login(): Promise<boolean> {
    this.formError = '';
    this.validatePhone();
    this.validateSmsCode();
    if (this.phoneError !== '' || this.smsCodeError !== '') {
      return false;
    }
    this.loggingIn = true;
    try {
      await authService.loginByPhone(this.phone, this.smsCode);
      return true;
    } catch (error) {
      this.formError = (error as Error).message;
      return false;
    } finally {
      this.loggingIn = false;
    }
  }
}
