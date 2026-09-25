import { authService } from '../service/AuthenticationService';
import { isValidPhone, isValidSmsCode } from '../common/Utils';

export enum LoginMode {
  PHONE = 'phone',
  CAS = 'cas'
}

@ObservedV2
export class AuthViewModel {
  @Trace mode: LoginMode = LoginMode.PHONE;
  @Trace phone: string = '';
  @Trace smsCode: string = '';
  @Trace studentId: string = '';
  @Trace password: string = '';
  @Trace phoneError: string = '';
  @Trace smsCodeError: string = '';
  @Trace studentIdError: string = '';
  @Trace passwordError: string = '';
  @Trace formError: string = '';
  @Trace smsCodeSent: boolean = false;
  @Trace sendingCode: boolean = false;
  @Trace loggingIn: boolean = false;

  get canSendCode(): boolean {
    return !this.sendingCode && isValidPhone(this.phone);
  }

  switchMode(mode: LoginMode): void {
    this.mode = mode;
    this.formError = '';
  }

  validatePhone(): void {
    this.phoneError = isValidPhone(this.phone) ? '' : '请输入正确的 11 位手机号';
  }

  validateSmsCode(): void {
    this.smsCodeError = isValidSmsCode(this.smsCode) ? '' : '请输入 6 位数字验证码';
  }

  async sendCode(): Promise<boolean> {
    this.validatePhone();
    if (this.phoneError !== '') {
      return false;
    }
    this.sendingCode = true;
    try {
      await authService.sendSmsCode(this.phone);
      this.smsCodeSent = true;
      return true;
    } catch (error) {
      this.phoneError = (error as Error).message;
      return false;
    } finally {
      this.sendingCode = false;
    }
  }

  async login(): Promise<boolean> {
    let valid: boolean = true;
    this.formError = '';
    if (this.mode === LoginMode.PHONE) {
      this.validatePhone();
      this.validateSmsCode();
      valid = this.phoneError === '' && this.smsCodeError === '';
    } else {
      this.studentIdError = this.studentId.trim() === '' ? '请输入学号' : '';
      this.passwordError = this.password.trim() === '' ? '请输入密码' : '';
      valid = this.studentIdError === '' && this.passwordError === '';
    }
    if (!valid) {
      return false;
    }
    this.loggingIn = true;
    try {
      if (this.mode === LoginMode.PHONE) {
        await authService.loginByPhone(this.phone, this.smsCode);
      } else {
        await authService.loginByCas(this.studentId, this.password);
      }
      return true;
    } catch (error) {
      this.formError = (error as Error).message;
      return false;
    } finally {
      this.loggingIn = false;
    }
  }
}
