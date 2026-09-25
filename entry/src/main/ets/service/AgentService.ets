import { http } from '@kit.NetworkKit';
import {
  AgentChatRequest,
  AgentChatResponse,
  AgentErrorResponse,
  AgentListingRecommendation,
  AgentRecommendation,
  AgentResult,
  AgentStatus,
  Product
} from '../model/Models';
import { MOCK_DELAY_SLOW_MS } from '../common/Constants';
import { mockDataStore } from '../data/MockDataStore';
import { mockDelayVoid } from '../common/Utils';
import { AGENT_BACKEND_MODE, AGENT_GATEWAY_BASE_URL, AGENT_GATEWAY_DEV_TOKEN, AgentBackendMode } from './AgentRuntimeConfig';

export interface AgentService {
  queryByNaturalLanguage(query: string, sessionId: string | null): Promise<AgentResult>;
}

interface KeywordGroup {
  triggers: string[];
  terms: string[];
}

let requestSequence: number = 0;

function createRequestId(): string {
  requestSequence += 1;
  return `cb_${Date.now()}_${requestSequence}`;
}

function isAgentStatus(value: AgentStatus): boolean {
  return value === AgentStatus.COMPLETED || value === AgentStatus.CLARIFICATION || value === AgentStatus.NO_RESULTS;
}

function parseAgentError(raw: string, statusCode: number): string {
  try {
    const parsed: AgentErrorResponse = JSON.parse(raw) as AgentErrorResponse;
    if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
      return parsed.message;
    }
  } catch (_error) {
    // Use the status-specific fallback below when the response is not the gateway error contract.
  }
  if (statusCode === 409) {
    return '助手正在处理上一条请求，请稍后重试';
  }
  if (statusCode >= 500) {
    return '助手服务暂时不可用，请稍后重试';
  }
  return `助手请求失败（HTTP ${statusCode}）`;
}

function validateAgentResponse(response: AgentChatResponse): void {
  if (typeof response.requestId !== 'string' || response.requestId === '' ||
    typeof response.sessionId !== 'string' || response.sessionId === '' ||
    typeof response.reply !== 'string' || !isAgentStatus(response.status) ||
    !Array.isArray(response.recommendations) || !Array.isArray(response.relaxedConditions)) {
    throw new Error('助手服务返回的数据格式不正确');
  }
  for (const recommendation of response.recommendations) {
    if (typeof recommendation.listingId !== 'string' || recommendation.listingId === '' ||
      !Array.isArray(recommendation.reasons)) {
      throw new Error('助手服务返回的推荐数据格式不正确');
    }
    for (const reason of recommendation.reasons) {
      if (typeof reason !== 'string') {
        throw new Error('助手服务返回的推荐理由格式不正确');
      }
    }
  }
  for (const condition of response.relaxedConditions) {
    if (typeof condition !== 'string') {
      throw new Error('助手服务返回的条件说明格式不正确');
    }
  }
}

export class MockAgentService implements AgentService {
  private groups: KeywordGroup[] = [
    { triggers: ['自行车', '单车', '骑行', '代步', 'bike'], terms: ['自行车', '山地车'] },
    { triggers: ['书', '教材', '课本', '高数', '数学', '复习'], terms: ['教材', '数学'] },
    { triggers: ['灯', '台灯', '护眼', '照明'], terms: ['台灯', '灯'] },
    { triggers: ['耳机', '耳麦', '降噪', '蓝牙', '音乐'], terms: ['耳机'] },
    { triggers: ['椅', '工学椅', '座椅', '电脑椅'], terms: ['椅'] },
    { triggers: ['水壶', '热水', '烧水', '保温', '喝水'], terms: ['水壶'] },
    { triggers: ['键盘', '机械', '打字', '红轴'], terms: ['键盘'] },
    { triggers: ['盆栽', '多肉', '植物', '绿植', '治愈'], terms: ['盆栽', '多肉'] }
  ];

  async queryByNaturalLanguage(query: string, sessionId: string | null): Promise<AgentResult> {
    const input: string = query.trim().toLowerCase();
    if (input === '') {
      throw new Error('输入不能为空');
    }
    const terms: string[] = [];
    for (const group of this.groups) {
      let matched: boolean = false;
      for (const trigger of group.triggers) {
        if (input.indexOf(trigger.toLowerCase()) >= 0) {
          matched = true;
          break;
        }
      }
      if (matched) {
        for (const term of group.terms) {
          if (terms.indexOf(term) < 0) {
            terms.push(term);
          }
        }
      }
    }
    const products: Product[] = [];
    if (terms.length > 0) {
      for (const item of mockDataStore.allProductsSorted()) {
        const text: string = `${item.title} ${item.description}`.toLowerCase();
        if (terms.some((term: string): boolean => text.indexOf(term.toLowerCase()) >= 0)) {
          products.push(item);
        }
      }
    }
    await mockDelayVoid(MOCK_DELAY_SLOW_MS);
    const recommendations: AgentRecommendation[] = [];
    for (const product of products) {
      recommendations.push({
        listingId: product.id,
        reasons: ['商品名称或描述与需求匹配'],
        product: product
      });
    }
    return {
      requestId: createRequestId(),
      sessionId: sessionId ?? 'session_mock',
      status: products.length > 0 ? AgentStatus.COMPLETED : AgentStatus.NO_RESULTS,
      replyText: products.length > 0
        ? `为你找到 ${products.length} 件可能符合的商品，点击卡片查看详情～`
        : '暂时没有找到匹配的商品，可以试试「自行车」「教材」「台灯」这类关键词哦～',
      recommendations: recommendations
    };
  }
}

/** HTTP adapter for the CampusBazaar dev gateway; the Agent service token stays server-side. */
export class HttpAgentService implements AgentService {
  private baseUrl: string;
  private clientToken: string;

  constructor(baseUrl: string, clientToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.clientToken = clientToken;
  }

  async queryByNaturalLanguage(query: string, sessionId: string | null): Promise<AgentResult> {
    const message: string = query.trim();
    if (message === '') {
      throw new Error('输入不能为空');
    }
    if (message.length > 2000) {
      throw new Error('输入不能超过 2000 个字符');
    }

    const payload: AgentChatRequest = {
      requestId: createRequestId(),
      sessionId: sessionId,
      message: message
    };
    const request = http.createHttp();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (this.clientToken !== '') {
        headers['x-campusbazaar-dev-token'] = this.clientToken;
      }
      let response: http.HttpResponse;
      try {
        response = await request.request(`${this.baseUrl}/api/agent/chat`, {
          method: http.RequestMethod.POST,
          header: headers,
          extraData: JSON.stringify(payload),
          connectTimeout: 10000,
          readTimeout: 75000,
          expectDataType: http.HttpDataType.STRING
        });
      } catch (_error) {
        throw new Error('无法连接 Agent 网关，请检查服务地址和网络连接');
      }
      const raw: string = response.result as string;
      if (response.responseCode !== 200) {
        throw new Error(parseAgentError(raw, response.responseCode));
      }

      let apiResponse: AgentChatResponse;
      try {
        apiResponse = JSON.parse(raw) as AgentChatResponse;
      } catch (_error) {
        throw new Error('助手服务返回了无法解析的数据');
      }
      validateAgentResponse(apiResponse);

      const recommendations: AgentRecommendation[] = [];
      for (const recommendation of apiResponse.recommendations) {
        const remoteRecommendation: AgentListingRecommendation = recommendation;
        recommendations.push({
          listingId: remoteRecommendation.listingId,
          reasons: remoteRecommendation.reasons,
          product: null
        });
      }
      return {
        requestId: apiResponse.requestId,
        sessionId: apiResponse.sessionId,
        status: apiResponse.status,
        replyText: apiResponse.reply,
        recommendations: recommendations
      };
    } finally {
      request.destroy();
    }
  }
}

export const agentService: AgentService = AGENT_BACKEND_MODE === AgentBackendMode.REMOTE
  ? new HttpAgentService(AGENT_GATEWAY_BASE_URL, AGENT_GATEWAY_DEV_TOKEN)
  : new MockAgentService();
