import { authService } from '../service/AuthenticationService';
import { isValidEmail } from '../common/Utils';

@ObservedV2
export class AuthViewModel {
  @Trace email: string = '';
  @Trace emailError: string = '';
  @Trace formError: string = '';
  @Trace loggingIn: boolean = false;
  @Trace password: string = '';
  @Trace passwordError: string = '';
  @Trace registering: boolean = false;
  @Trace confirmPassword: string = '';
  @Trace confirmPasswordError: string = '';
  @Trace acceptedTerms: boolean = false;
  @Trace consentError: string = '';

  setRegistering(value: boolean): void {
    if (this.loggingIn || this.registering === value) return;
    this.registering = value;
    this.password = '';
    this.confirmPassword = '';
    this.emailError = '';
    this.passwordError = '';
    this.confirmPasswordError = '';
    this.formError = '';
    this.acceptedTerms = false;
    this.consentError = '';
  }

  async register(): Promise<boolean> {
    if (this.loggingIn) return false;
    this.formError = '';
    this.emailError = isValidEmail(this.email) ? '' : '请输入正确的邮箱地址';
    this.passwordError = this.password.length >= 6 && this.password.length <= 64 && this.password.trim() !== '' ?
      '' : '密码须为 6–64 位，不能全部为空白';
    this.confirmPasswordError = this.confirmPassword === this.password && this.confirmPassword !== '' ? '' : '两次输入的密码不一致';
    this.consentError = this.acceptedTerms ? '' : '请先阅读并勾选同意用户协议与隐私政策';
    if (this.emailError || this.passwordError || this.confirmPasswordError || this.consentError) return false;
    this.loggingIn = true;
    try {
      await authService.registerByPassword(this.email.trim().toLowerCase(), this.password);
      this.password = '';
      this.confirmPassword = '';
      return true;
    } catch (error) {
      this.formError = (error as Error).message;
    } finally {
      this.loggingIn = false;
    }
    return false;
  }

  async login(): Promise<boolean> {
    if (this.loggingIn) return false;
    this.formError = '';
    this.emailError = isValidEmail(this.email) ? '' : '请输入正确的邮箱地址';
    this.passwordError = this.password.length > 0 && this.password.length <= 64 ? '' : '请输入密码';
    if (this.emailError !== '' || this.passwordError !== '') {
      return false;
    }
    this.loggingIn = true;
    try {
      await authService.loginByPassword(this.email.trim().toLowerCase(), this.password);
      this.password = '';
      return true;
    } catch (error) {
      this.formError = (error as Error).message;
      return false;
    } finally {
      this.loggingIn = false;
    }
  }
}
