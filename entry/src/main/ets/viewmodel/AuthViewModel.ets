import { authService } from '../service/AuthenticationService';
import { BusinessApiError } from '../service/BusinessApiClient';
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
  @Trace emailCode: string = '';
  @Trace verificationError: string = '';
  @Trace verificationMessage: string = '';
  @Trace sendingCode: boolean = false;
  @Trace resendSeconds: number = 0;
  private verificationId: string = '';
  private verificationEmail: string = '';
  private verificationExpiresAt: number = 0;
  private resendAt: number = 0;
  private sendRevision: number = 0;

  refreshCooldown(): void {
    this.resendSeconds = Math.max(0, Math.ceil((this.resendAt - Date.now()) / 1000));
  }

  private clearVerification(): void {
    this.sendRevision += 1;
    this.sendingCode = false;
    this.verificationId = '';
    this.verificationEmail = '';
    this.verificationExpiresAt = 0;
    this.emailCode = '';
    this.verificationError = '';
    this.verificationMessage = '';
    this.resendAt = 0;
    this.resendSeconds = 0;
  }

  dispose(): void {
    this.clearVerification();
  }

  setEmail(value: string): void {
    if (this.loggingIn) return;
    if (value.trim().toLowerCase() !== this.email.trim().toLowerCase()) this.clearVerification();
    this.email = value;
    this.emailError = '';
    this.formError = '';
  }

  async sendEmailCode(): Promise<boolean> {
    this.refreshCooldown();
    if (!this.registering || this.loggingIn || this.sendingCode || this.resendSeconds > 0) return false;
    this.emailError = isValidEmail(this.email) ? '' : '请输入正确的邮箱地址';
    if (this.emailError !== '') return false;
    this.clearVerification();
    const revision: number = this.sendRevision;
    const email: string = this.email.trim().toLowerCase();
    this.formError = '';
    this.sendingCode = true;
    try {
      const response = await authService.sendRegistrationEmail(email);
      if (revision !== this.sendRevision || !this.registering || this.email.trim().toLowerCase() !== email) return false;
      this.verificationId = response.verificationId;
      this.verificationEmail = email;
      this.verificationExpiresAt = Date.now() + response.expiresIn * 1000;
      this.resendAt = Date.now() + response.resendAfter * 1000;
      this.refreshCooldown();
      this.verificationMessage = '验证码邮件已提交发送，请查看收件箱或垃圾邮件。';
      return true;
    } catch (error) {
      if (revision !== this.sendRevision || !this.registering || this.email.trim().toLowerCase() !== email) return false;
      const failure = error as BusinessApiError;
      this.verificationError = failure.message;
      if (failure.statusCode === 429) {
        const delay: number = Number.isFinite(failure.retryAfter) && failure.retryAfter > 0 ? failure.retryAfter : 60;
        this.resendAt = Date.now() + delay * 1000;
        this.refreshCooldown();
      }
      return false;
    } finally {
      if (revision === this.sendRevision) this.sendingCode = false;
    }
  }

  setRegistering(value: boolean): void {
    if (this.loggingIn || this.registering === value) return;
    this.registering = value;
    this.clearVerification();
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
    if (this.loggingIn || this.sendingCode) return false;
    this.formError = '';
    this.emailError = isValidEmail(this.email) ? '' : '请输入正确的邮箱地址';
    this.passwordError = this.password.length >= 6 && this.password.length <= 64 && this.password.trim() !== '' ?
      '' : '密码须为 6–64 位，不能全部为空白';
    this.confirmPasswordError = this.confirmPassword === this.password && this.confirmPassword !== '' ? '' : '两次输入的密码不一致';
    this.consentError = this.acceptedTerms ? '' : '请先阅读并勾选同意用户协议与隐私政策';
    this.verificationError = '';
    if (this.verificationId === '' || this.verificationEmail !== this.email.trim().toLowerCase()) {
      this.verificationError = '请先获取当前邮箱的验证码';
    } else if (this.verificationExpiresAt <= Date.now()) {
      this.verificationError = '验证码已过期，请重新获取';
    } else if (!/^\d{6}$/.test(this.emailCode)) {
      this.verificationError = '请输入六位邮箱验证码';
    }
    if (this.emailError || this.passwordError || this.confirmPasswordError || this.consentError || this.verificationError) return false;
    this.loggingIn = true;
    try {
      await authService.registerByPassword(this.email.trim().toLowerCase(), this.password, this.verificationId, this.emailCode);
      this.password = '';
      this.confirmPassword = '';
      this.clearVerification();
      return true;
    } catch (error) {
      const failure = error as BusinessApiError;
      if (failure.code === 'EMAIL_CODE_INVALID' || failure.code === 'EMAIL_VERIFICATION_REQUIRED') {
        this.verificationError = failure.message;
      } else {
        this.formError = failure.message;
      }
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
