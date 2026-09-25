import { AgentResult } from '../model/Models';
import { agentService } from '../service/AgentService';

@ObservedV2
export class AgentViewModel {
  @Trace query: string = '';
  @Trace loading: boolean = false;
  @Trace result: AgentResult | null = null;
  @Trace error: string = '';
  @Trace sessionId: string | null = null;
  private requestSeq: number = 0;

  async send(): Promise<boolean> {
    if (this.query.trim() === '') {
      this.error = '输入不能为空';
      return false;
    }
    this.error = '';
    this.loading = true;
    this.requestSeq += 1;
    const currentSeq: number = this.requestSeq;
    try {
      const result: AgentResult = await agentService.queryByNaturalLanguage(this.query, this.sessionId);
      if (currentSeq === this.requestSeq) {
        this.result = result;
        this.sessionId = result.sessionId;
      }
      return true;
    } catch (error) {
      if (currentSeq === this.requestSeq) {
        this.error = (error as Error).message;
      }
      return false;
    } finally {
      if (currentSeq === this.requestSeq) {
        this.loading = false;
      }
    }
  }
}
