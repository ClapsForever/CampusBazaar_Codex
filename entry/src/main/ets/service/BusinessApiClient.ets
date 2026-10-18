import { http } from '@kit.NetworkKit';
import { BUSINESS_API_BASE_URL } from './BackendRuntimeConfig';

interface ErrorBody {
  message?: string;
  code?: string;
}

interface UploadResponse {
  id: string;
}

export class BusinessApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class BusinessApiClient {
  private token: string = '';
  private baseUrl: string = BUSINESS_API_BASE_URL.replace(/\/$/, '');

  setToken(value: string): void {
    this.token = value;
  }

  clearToken(): void {
    this.token = '';
  }

  async request<T>(method: http.RequestMethod, path: string, body: string | null = null,
    authorized: boolean = true, timeoutMs: number = 15000,
    extraHeaders: Record<string, string> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
    }
    if (authorized) {
      if (this.token === '') {
        throw new Error('请先登录');
      }
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    for (const key of Object.keys(extraHeaders)) {
      headers[key] = extraHeaders[key];
    }
    const client = http.createHttp();
    try {
      let response: http.HttpResponse;
      try {
        const options: http.HttpRequestOptions = {
          method: method,
          header: headers,
          connectTimeout: 10000,
          readTimeout: timeoutMs,
          expectDataType: http.HttpDataType.STRING
        };
        if (body !== null) {
          options.extraData = body;
        }
        response = await client.request(`${this.baseUrl}${path}`, options);
      } catch (_error) {
        throw new Error('无法连接后端服务，请检查服务器地址和网络');
      }
      const raw: string = response.result as string;
      if (response.responseCode < 200 || response.responseCode >= 300) {
        let message: string = `请求失败（HTTP ${response.responseCode}）`;
        try {
          const errorBody: ErrorBody = JSON.parse(raw) as ErrorBody;
          if (typeof errorBody.message === 'string' && errorBody.message !== '') {
            message = errorBody.message;
          }
        } catch (_error) {
        }
        throw new BusinessApiError(response.responseCode, message);
      }
      try {
        return JSON.parse(raw) as T;
      } catch (_error) {
        throw new Error('业务 API 返回的数据无法解析');
      }
    } finally {
      client.destroy();
    }
  }

  async uploadImage(bytes: ArrayBuffer, mime: string): Promise<string> {
    if (this.token === '') {
      throw new Error('请先登录');
    }
    const client = http.createHttp();
    try {
      let response: http.HttpResponse;
      try {
        response = await client.request(`${this.baseUrl}/api/v1/uploads`, {
          method: http.RequestMethod.POST,
          header: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': mime, 'Accept': 'application/json' },
          extraData: bytes,
          connectTimeout: 10000,
          readTimeout: 30000,
          expectDataType: http.HttpDataType.STRING
        });
      } catch (_error) {
        throw new Error('图片上传失败，请检查后端服务连接和网络');
      }
      const raw: string = response.result as string;
      if (response.responseCode !== 201) {
        let message: string = `图片上传失败（HTTP ${response.responseCode}）`;
        try {
          const errorBody: ErrorBody = JSON.parse(raw) as ErrorBody;
          if (typeof errorBody.message === 'string') {
            message = errorBody.message;
          }
        } catch (_error) {
        }
        throw new BusinessApiError(response.responseCode, message);
      }
      const result: UploadResponse = JSON.parse(raw) as UploadResponse;
      if (typeof result.id !== 'string') {
        throw new Error('图片上传响应缺少图片 ID');
      }
      return result.id;
    } finally {
      client.destroy();
    }
  }
}

export const businessApiClient: BusinessApiClient = new BusinessApiClient();
