import { User } from '../model/Models';
import { isValidPhone, isValidSmsCode } from '../common/Utils';
import { http } from '@kit.NetworkKit';
import { businessApiClient } from './BusinessApiClient';

export interface AuthenticationService {
  loginByPhone(phone: string, smsCode: string): Promise<User>;
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

export class HttpAuthenticationService implements AuthenticationService {
  private current: User | null = null;

  async loginByPhone(phone: string, smsCode: string): Promise<User> {
    if (!isValidPhone(phone) || !isValidSmsCode(smsCode)) {
      throw new Error('请输入正确的手机号和六位验证码');
    }
    const response = await businessApiClient.request<LoginResponse>(http.RequestMethod.POST,
      '/api/v1/auth/local/sessions', JSON.stringify({ phone: phone, smsCode: smsCode }), false);
    if (!response.user || !response.token) {
      throw new Error('登录响应格式不正确');
    }
    businessApiClient.setToken(response.token);
    this.current = response.user;
    return response.user;
  }

  getCurrentUser(): User | null {
    return this.current;
  }

  async logout(): Promise<void> {
    try {
      await businessApiClient.request<LogoutResponse>(http.RequestMethod.POST, '/api/v1/auth/logout');
    } finally {
      businessApiClient.clearToken();
      this.current = null;
    }
  }
}

export const authService: AuthenticationService = new HttpAuthenticationService();
