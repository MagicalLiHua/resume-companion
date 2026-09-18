export const bankcommSections = [
  '手动填写简历', '添加教育信息', '添加获奖情况', '添加工作、实习情况',
  '添加语言水平', '添加计算机证书', '添加职业资格证书', '添加家庭关系',
] as const;
export function openBankcommSection(label: string) {
  if (location.hostname !== 'job.bankcomm.com' || location.pathname !== '/index.do' || location.hash !== '#/personal/resume') throw new Error('此操作只适用于交通银行简历完善页');
  if (!(bankcommSections as readonly string[]).includes(label)) throw new Error('只允许打开已支持的简历编辑栏目');
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(button =>
    button.textContent?.replace(/\s+/g, '') === label.replace(/\s+/g, '') &&
    button.type !== 'submit' && !button.disabled && button.getClientRects().length > 0 &&
    !button.closest('[hidden],[inert],[aria-hidden="true"]'));
  if (buttons.length !== 1) throw new Error('没有找到唯一可用的栏目入口，请检查页面');
  buttons[0].click();
  return { opened: true, label, message: '已点击编辑入口，请重新扫描展开后的字段。未点击保存或提交。' };
}
