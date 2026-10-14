import { User } from '../model/Models';
import { isValidEmail } from '../common/Utils';
import { http } from '@kit.NetworkKit';
import { businessApiClient } from './BusinessApiClient';
import { readPhoto, UploadBytes } from './ImageUpload';

export interface AuthenticationService {
  loginByPassword(email: string, password: string): Promise<User>;
  refreshUser(): Promise<User>;
  updateProfile(nickname: string, avatarUri: string): Promise<User>;
  changePassword(currentPassword: string, newPassword: string): Promise<User>;
  getCurrentUser(): User | null;
  logout(): Promise<void>;
}

interface LoginResponse {
  user: User;
  token: string;
  expiresAt: number;
}

interface LogoutResponse {
  ok: boolean;
}

interface ProfileUpdateBody {
  nickname: string;
  avatarId?: string;
}

export class HttpAuthenticationService implements AuthenticationService {
  private current: User | null = null;
  private revision: number = 0;

  getCurrentUser(): User | null {
    return this.current;
  }

  async loginByPassword(email: string, password: string): Promise<User> {
    if (!isValidEmail(email) || password.length === 0 || password.length > 64) {
      throw new Error('请输入正确的邮箱和密码');
    }
    const response = await businessApiClient.request<LoginResponse>(http.RequestMethod.POST,
      '/api/v1/auth/password/sessions', JSON.stringify({ email: email.trim().toLowerCase(), password: password }), false);
    if (!response.user || !response.token) throw new Error('登录响应格式不正确');
    businessApiClient.setToken(response.token);
    this.revision += 1;
    this.current = response.user;
    return response.user;
  }

  private rememberUser(user: User, revision: number): User {
    if (revision !== this.revision || this.current === null || user.id !== this.current.id) {
      throw new Error('登录状态已改变，请重新进入设置');
    }
    this.current = user;
    return user;
  }

  async refreshUser(): Promise<User> {
    const revision: number = this.revision;
    return this.rememberUser(await businessApiClient.request<User>(http.RequestMethod.GET, '/api/v1/me'), revision);
  }

  async updateProfile(nickname: string, avatarUri: string): Promise<User> {
    const revision: number = this.revision;
    let avatarId: string = '';
    if (avatarUri !== '') {
      const image: UploadBytes = readPhoto(avatarUri);
      avatarId = await businessApiClient.uploadImage(image.bytes, image.mime);
    }
    if (revision !== this.revision || this.current === null) throw new Error('请重新登录');
    const body: ProfileUpdateBody = { nickname: nickname.trim() };
    if (avatarId !== '') body.avatarId = avatarId;
    return this.rememberUser(await businessApiClient.request<User>(http.RequestMethod.PUT,
      '/api/v1/me', JSON.stringify(body)), revision);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<User> {
    const revision: number = this.revision;
    return this.rememberUser(await businessApiClient.request<User>(http.RequestMethod.POST,
      '/api/v1/me/password', JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })), revision);
  }

  async logout(): Promise<void> {
    this.revision += 1;
    try {
      await businessApiClient.request<LogoutResponse>(http.RequestMethod.POST, '/api/v1/auth/logout');
    } finally {
      businessApiClient.clearToken();
      this.current = null;
    }
  }
}

export const authService: AuthenticationService = new HttpAuthenticationService();
