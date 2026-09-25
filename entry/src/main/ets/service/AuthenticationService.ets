import { User } from '../model/Models';
import { mockDataStore } from '../data/MockDataStore';
import { isValidPhone, isValidSmsCode, mockDelayVoid } from '../common/Utils';

export interface AuthenticationService {
  sendSmsCode(phone: string): Promise<void>;
  loginByPhone(phone: string, smsCode: string): Promise<User>;
  loginByCas(studentId: string, password: string): Promise<User>;
  getCurrentUser(): User | null;
  logout(): void;
}

export class MockAuthenticationService implements AuthenticationService {
  async sendSmsCode(phone: string): Promise<void> {
    if (!isValidPhone(phone)) {
      throw new Error('请输入正确的 11 位手机号');
    }
    await mockDelayVoid();
  }

  async loginByPhone(phone: string, smsCode: string): Promise<User> {
    if (!isValidPhone(phone)) {
      throw new Error('请输入正确的 11 位手机号');
    }
    if (!isValidSmsCode(smsCode)) {
      throw new Error('请输入 6 位数字验证码');
    }
    await mockDelayVoid();
    const current: User = mockDataStore.getDefaultUser();
    mockDataStore.setCurrentUser(current);
    return current;
  }

  async loginByCas(studentId: string, password: string): Promise<User> {
    if (studentId.trim() === '') {
      throw new Error('请输入学号');
    }
    if (password.trim() === '') {
      throw new Error('请输入密码');
    }
    await mockDelayVoid();
    const current: User = mockDataStore.getDefaultUser();
    mockDataStore.setCurrentUser(current);
    return current;
  }

  getCurrentUser(): User | null {
    return mockDataStore.currentUser;
  }

  logout(): void {
    mockDataStore.setCurrentUser(null);
  }
}

export const authService: AuthenticationService = new MockAuthenticationService();
