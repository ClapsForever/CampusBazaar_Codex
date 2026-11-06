export const LEGAL_VERSION: string = '2026-11-06';
export const PAGE_LEGAL: string = 'ui/editorial/pages/LegalDocument';

export interface LegalDocumentParams {
  document: string;
}

export function legalTitle(document: string): string {
  if (document === 'privacy-policy') return '隐私政策';
  if (document === 'community-rules') return '社区与交易规则';
  return '用户协议';
}

export function legalFile(document: string): string {
  if (document === 'privacy-policy') return 'legal/privacy-policy.txt';
  if (document === 'community-rules') return 'legal/community-rules.txt';
  return 'legal/user-agreement.txt';
}
