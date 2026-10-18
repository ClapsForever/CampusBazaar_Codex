export const LEGAL_VERSION: string = '2026-10-18-draft-3';
export const PAGE_LEGAL: string = 'pages/LegalDocument';

export interface LegalDocumentParams {
  document: string;
}

export function legalTitle(document: string): string {
  if (document === 'privacy-policy') return '隐私政策（草案）';
  if (document === 'community-rules') return '社区与交易规则（草案）';
  return '用户协议（草案）';
}

export function legalFile(document: string): string {
  if (document === 'privacy-policy') return 'legal/privacy-policy.txt';
  if (document === 'community-rules') return 'legal/community-rules.txt';
  return 'legal/user-agreement.txt';
}
