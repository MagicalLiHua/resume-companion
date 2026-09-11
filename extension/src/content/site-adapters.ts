// Lever application labels, observed on its public application page on 2026-09-11.
// Missing or ambiguous structure falls back to the generic scanner.
export const leverAdapterVersion = 1;
export function siteField(node: HTMLElement, readLabel: (el: Element) => string): {label: string; blocked?: string} | null {
  if (location.hostname !== 'jobs.lever.co' || !/^\/[^/]+\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/apply\/?$/i.test(location.pathname)) return null;
  const form = node.closest('form#application-form');
  const question = node.closest('.application-question');
  if (!form || !question || question.closest('form') !== form || !node.closest('.application-field')) return null;
  const labels = Array.from(question.querySelectorAll('.application-label')).filter(label => label.closest('.application-question') === question);
  if (labels.length !== 1) return null;
  const label = readLabel(labels[0]).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!label) return null;
  return {label, ...(node.matches('input#location-input[name="location"]') ? {blocked: '位置需要从网站搜索结果中选择，请手动处理'} : {})};
}
