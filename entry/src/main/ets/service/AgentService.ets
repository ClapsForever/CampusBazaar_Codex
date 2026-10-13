import { http } from '@kit.NetworkKit';
import {
  AgentChatResponse,
  AgentRecommendation,
  AgentResult,
  AgentStatus,
  AgentHistoryPage, AgentHistoryTurnPage,
  Product
} from '../model/Models';
import { businessApiClient } from './BusinessApiClient';
import { productService } from './ProductService';

export interface AgentService {
  queryByNaturalLanguage(query: string, sessionId: string | null): Promise<AgentResult>;
  getHistory(cursor: string | null): Promise<AgentHistoryPage>;
  getHistoryTurns(sessionId: string, cursor: string | null): Promise<AgentHistoryTurnPage>;
}

let requestSequence: number = 0;

function createRequestId(): string {
  requestSequence += 1;
  return `cb_${Date.now()}_${requestSequence}`;
}

function isAgentStatus(value: AgentStatus): boolean {
  return value === AgentStatus.COMPLETED || value === AgentStatus.CLARIFICATION || value === AgentStatus.NO_RESULTS;
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

export class BusinessAgentService implements AgentService {
  async getHistory(cursor: string | null): Promise<AgentHistoryPage> {
    return businessApiClient.request<AgentHistoryPage>(http.RequestMethod.GET,
      `/api/v1/agent/conversations?limit=20${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`);
  }

  async getHistoryTurns(sessionId: string, cursor: string | null): Promise<AgentHistoryTurnPage> {
    const page: AgentHistoryTurnPage = await businessApiClient.request<AgentHistoryTurnPage>(http.RequestMethod.GET,
      `/api/v1/agent/conversations/${encodeURIComponent(sessionId)}?limit=50${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`);
    for (const turn of page.items) validateAgentResponse(turn.response);
    return page;
  }

  async queryByNaturalLanguage(query: string, sessionId: string | null): Promise<AgentResult> {
    const message: string = query.trim();
    if (message.length < 1 || message.length > 2000) {
      throw new Error('请输入不超过 2000 字的需求');
    }
    const response = await businessApiClient.request<AgentChatResponse>(http.RequestMethod.POST,
      '/api/agent/chat', JSON.stringify({ requestId: createRequestId(), sessionId: sessionId, message: message }),
      true, 75000);
    validateAgentResponse(response);
    const recommendations: AgentRecommendation[] = [];
    for (const item of response.recommendations) {
      let product: Product | null = null;
      try {
        const detail = await productService.getProductDetail(item.listingId);
        product = detail === null ? null : detail.product;
      } catch (_error) {
      }
      recommendations.push({ listingId: item.listingId, reasons: item.reasons, product: product });
    }
    return {
      requestId: response.requestId,
      sessionId: response.sessionId,
      status: response.status,
      replyText: response.reply,
      recommendations: recommendations
    };
  }
}

export const agentService: AgentService = new BusinessAgentService();
