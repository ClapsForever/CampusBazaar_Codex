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
