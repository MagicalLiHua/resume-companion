// Lever application labels, observed on its public application page on 2026-09-11.
// Missing or ambiguous structure falls back to the generic scanner.
export const leverAdapterVersion = 1;
const isBankcommResume = () => location.hostname === 'job.bankcomm.com' && location.pathname === '/index.do' && location.hash === '#/personal/resume';
export function siteGroup(node: HTMLElement) {
  if (!isBankcommResume()) return null;
  const form = node.closest<HTMLFormElement>('form.ant-form');
  if (form && ['school','major','startDate','endDate'].every(id=>form.querySelector(`input#${id}`))) return { root:form, label:'教育信息', section:'education' as const };
  return null;
}
export function siteField(node: HTMLElement, readLabel: (el: Element) => string): {label: string; blocked?: string} | null {
  if (siteGroup(node)) {
    if (node.id==='gpa') return {label:'平均绩点（GPA）'};
    if (node.id==='gpaTotal') return {label:'绩点满分'};
  }
  if (location.hostname === 'job.bankcomm.com' && location.pathname === '/index.do' && location.hash === '#/personal/resume' && node.closest('#isAgreeStandard')) return { label: '是否愿意按照交行应聘职位标准执行', blocked: '应聘标准承诺项，请手动处理' };
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
