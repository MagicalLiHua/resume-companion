import type { Effect } from '../../../../plugins/resume-companion/protocol';
import { antSelect } from '../ant-controls';
import { editable, kindOf, nameOf, plainText, popupOwner, scrollable, topDialog, visible } from './dom';
const blockedLabel = (text: string) => /密码|验证码|校验码|身份证|证件号|护照|银行卡|信用卡|银行账户|承诺|声明|同意|隐私|协议|授权|调剂|password|passcode|one.?time|otp|captcha|passport|credit.?card|bank.?account|consent|agreement/i.test(text);
export function policy(el: HTMLElement) {
  const kind = kindOf(el), name = nameOf(el);
  const scope = el.closest('dialog,[role="dialog"],.ant-modal,form,section,fieldset') ?? document.body;
  const context = `${nameOf(scope as HTMLElement)} ${el.getAttribute('aria-description') ?? ''} ${(el.getAttribute('aria-describedby') ?? '').split(/\s+/).map(id => plainText(document.getElementById(id))).join(' ')}`;
  const safety = [name, el.id, el.getAttribute('name'), el.getAttribute('autocomplete'), el.getAttribute('title')].join(' ');
  const final = /提交(?:申请|简历|报名)|确认(?:申请|投递|报名)|立即(?:投递|申请)|完成(?:申请|报名)|投递简历|正式提交|submit|apply\s*now|finish\s*application|send\s*application/i;
  const forbidden = /删除|移除记录|清空(?:所有|资料)|支付|购买|登录|注册|登出|上传|附件|注销|delete|remove\s*(record|all)|payment|purchase|sign\s*in|log\s*in|upload|logout|reset/i;
  let effect: Effect = 'interaction', blocked: string | null = null;
  const dialog = topDialog(), owner = popupOwner(el);
  const nativeOption = el instanceof HTMLOptionElement && el.closest('select');
  const shown = nativeOption ? visible(nativeOption) : visible(el);
  const enabled = !el.matches(':disabled,[aria-disabled="true"],.ant-select-item-option-disabled,.ant-cascader-menu-item-disabled') && !el.closest('.ant-select-disabled,.ant-picker-cell-disabled,fieldset[disabled],optgroup[disabled]');
  const readonly = el.getAttribute('aria-readonly') === 'true' || editable(el) && 'readOnly' in el && el.readOnly && !antSelect(el) && !el.closest('.ant-picker');
  if (blockedLabel(safety) || /^(password|file|hidden)$/i.test(kind) || /cc-|one-time-code/i.test(safety)) blocked = 'restricted: 敏感信息、声明、验证或上传请手动处理';
  if (/^(button|link|tab|option|treeitem|date_option)$/.test(kind)) {
    if (final.test(safety) || /^(?:下一步|继续|确认|完成|next|continue)$/i.test(name) && /最终|提交申请|确认投递|final\s*(review|step)/i.test(context)) effect = 'final_submit';
    else if (/保存.*(?:草稿|简历)|暂存|save\s*draft/i.test(name)) effect = 'save_draft';
    else if (/保存|save\s*(record|education|experience)?$/i.test(name)) effect = 'save_record';
    else if (/^(?:下一步|下一页|继续填写|继续|next|continue)(?:\s*[→›>])?$/i.test(name)) effect = 'advance_step';
    else if (el.matches('.ant-picker-header button,.ant-picker-header-view button,.ant-picker-cell-inner,.ant-cascader-menu-item,.ant-select-item-option') || /^(option|treeitem|tab)$/.test(kind) || /新增|添加|编辑|修改|展开|收起|关闭|取消|上一步|返回|打开|选择|基本|教育|经历|项目|技能|add|edit|expand|collapse|close|cancel|back|previous|open|select/i.test(name)) effect = 'interaction';
    else effect = 'unknown';
    if (effect === 'final_submit') blocked = 'final_submit: 最终申请提交由用户完成';
    else if (forbidden.test(safety) || blockedLabel(`${name} ${el.getAttribute('aria-description') ?? ''}`)) blocked = 'restricted: 此动作需用户手动处理';
    else if (effect === 'unknown') blocked = 'unknown_effect: 无法确认该按钮用途';
    if (el instanceof HTMLAnchorElement && effect === 'interaction' && new URL(el.href, location.href).origin !== location.origin) blocked = 'external_navigation: 不直接打开其他来源';
  }
  if (/作为我的|新增自定义|create\s*new|add\s*new\s*option/i.test(name) && /^(option|treeitem)$/.test(kind)) blocked = 'unsupported: 不创建自定义候选';
  if (!shown) blocked = 'hidden: 目标当前不可见';
  else if (!enabled) blocked = 'disabled: 目标不可操作';
  else if (readonly) blocked = 'readonly: 字段只读';
  else if (dialog && !dialog.contains(el) && el !== dialog && !(owner && dialog.contains(owner))) blocked = 'obscured: 目标位于当前弹窗后方';
  const actions: string[] = [];
  if (!blocked) {
    if ((['text','email','tel','url','number','search','textarea','date','month'].includes(kind) || kind === 'combobox' && el instanceof HTMLInputElement) && !(el instanceof HTMLInputElement && el.readOnly)) actions.push('set_value');
    if (['checkbox','radio'].includes(kind)) actions.push('set_checked');
    if (['select','combobox','cascader'].includes(kind)) actions.push('select_option');
    if (['button','link','tab','option','treeitem','date_option','combobox','cascader'].includes(kind) || el.closest('.ant-picker') && el instanceof HTMLInputElement) actions.push('click');
    if (['combobox','cascader','text','search','date','month'].includes(kind) || el.closest('.ant-picker')) actions.push('press_key');
    if (el === document.body || scrollable(el)) actions.push('scroll');
    if (!actions.length && editable(el)) blocked = 'unsupported: 暂不支持该控件';
  }
  return { kind, effect_kind: effect, visible: Boolean(shown), enabled: Boolean(enabled), readonly: Boolean(readonly), blocked_reason: blocked, allowed_actions: blocked ? [] : actions };
}
