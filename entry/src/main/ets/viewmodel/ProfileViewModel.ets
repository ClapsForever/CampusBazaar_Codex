import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { User } from '../model/Models';
import { authService } from '../service/AuthenticationService';
import { isValidSmsCode } from '../common/Utils';

@ObservedV2
export class ProfileViewModel {
  @Trace user: User | null = null;
  @Trace nickname: string = '';
  @Trace avatarUri: string = '';
  @Trace currentPassword: string = '';
  @Trace newPassword: string = '';
  @Trace confirmPassword: string = '';
  @Trace smsCode: string = '';
  @Trace loading: boolean = false;
  @Trace saving: boolean = false;
  @Trace profileError: string = '';
  @Trace passwordError: string = '';
  @Trace message: string = '';

  async load(): Promise<void> {
    this.profileError = '';
    this.user = authService.getCurrentUser();
    this.nickname = this.user === null ? '' : this.user.nickname;
    this.loading = true;
    try {
      this.user = await authService.refreshUser();
      this.nickname = this.user.nickname;
    } catch (error) {
      this.profileError = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  async chooseAvatar(): Promise<void> {
    if (this.saving || this.loading) return;
    try {
      const options: photoAccessHelper.PhotoSelectOptions = new photoAccessHelper.PhotoSelectOptions();
      options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
      options.maxSelectNumber = 1;
      const picker: photoAccessHelper.PhotoViewPicker = new photoAccessHelper.PhotoViewPicker();
      const result: photoAccessHelper.PhotoSelectResult = await picker.select(options);
      if (result.photoUris.length > 0) {
        this.avatarUri = result.photoUris[0];
        this.profileError = '';
        this.message = '';
      }
    } catch (_error) {
      this.profileError = '相册暂时不可用，请稍后重试';
    }
  }

  async saveProfile(): Promise<boolean> {
    if (this.saving || this.loading) return false;
    this.profileError = '';
    this.message = '';
    if (this.nickname.trim().length < 1 || this.nickname.trim().length > 24) {
      this.profileError = '昵称须为 1–24 个字符';
      return false;
    }
    this.saving = true;
    try {
      this.user = await authService.updateProfile(this.nickname, this.avatarUri);
      this.nickname = this.user.nickname;
      this.avatarUri = '';
      this.message = '个人资料已保存';
      return true;
    } catch (error) {
      this.profileError = (error as Error).message;
      return false;
    } finally {
      this.saving = false;
    }
  }

  async savePassword(): Promise<boolean> {
    if (this.saving || this.loading || this.user === null) return false;
    this.passwordError = '';
    this.message = '';
    if (this.newPassword.length < 8 || this.newPassword.length > 64 ||
      !/[a-zA-Z]/.test(this.newPassword) || !/[0-9]/.test(this.newPassword)) {
      this.passwordError = '密码须为 8–64 位，包含字母和数字';
    } else if (this.newPassword !== this.confirmPassword) {
      this.passwordError = '两次输入的密码不一致';
    } else if (this.user.hasPassword && this.currentPassword === '') {
      this.passwordError = '请输入当前密码';
    } else if (!this.user.hasPassword && !isValidSmsCode(this.smsCode)) {
      this.passwordError = '请输入 6 位数字验证码';
    }
    if (this.passwordError !== '') return false;
    this.saving = true;
    try {
      this.user = await authService.changePassword(this.currentPassword, this.newPassword, this.smsCode);
      this.clearPasswords();
      this.message = '密码已保存，可使用手机号和密码登录';
      return true;
    } catch (error) {
      this.passwordError = (error as Error).message;
      return false;
    } finally {
      this.saving = false;
    }
  }

  clearPasswords(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.smsCode = '';
  }
}
