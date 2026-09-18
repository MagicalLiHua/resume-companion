import type { Effect } from '../protocol.js';

export type SafetyInput = { name: string; role: string; effect?: Effect; description?: string; context?: string };
export type SafetyDecision = { blocked: boolean; reason?: string; effect: Effect };

const normalize = (value: string): string => value.replace(/\s+/g, '').toLocaleLowerCase();
const matches = (value: string, patterns: RegExp[]): boolean => patterns.some(pattern => pattern.test(value));

const finalSubmitPatterns = [
  /确认.*提交/, /最终.*提交/, /提交.*申请/, /立即.*申请/, /立即.*投递/, /确认.*投递/,
  /applynow/, /submitapplication/, /completeapplication/,
];
const finalStagePatterns = [/最终.*核对/, /最终.*确认/, /核对.*申请/, /确认.*申请信息/, /application.*review/i, /review.*application/i];
const forwardActionPatterns = [/下一步/, /继续/, /完成/, /确认/, /提交/, /申请/, /next/i, /continue/i, /finish/i, /submit/i, /apply/i];
const declarationPatterns = [/声明/, /承诺/, /本人确认/, /同意.*协议/, /同意.*条款/, /授权/, /电子签名/, /certif/i, /consent/i, /agree.*terms/i];
const verificationPatterns = [/验证码/, /动态码/, /短信码/, /otp/i, /captcha/i, /人机验证/, /安全验证/];
const passwordPatterns = [/密码/, /password/i, /passcode/i, /口令/];
const uploadPatterns = [/上传/, /附件/, /选择文件/, /添加简历/, /upload/i, /attach/i];
const deletionPatterns = [/删除/, /移除/, /注销/, /清空/, /delete/i, /remove/i];

export function inferEffect(name: string, declared: Effect = 'unknown'): Effect {
  const value = normalize(name);
  if (declared === 'final_submit' || matches(value, finalSubmitPatterns)) return 'final_submit';
  if (/保存.*草稿|暂存|savedraft/i.test(value)) return 'save_draft';
  if (/保存|添加.*完成|确认添加|saverecord/i.test(value)) return 'save_record';
  if (/下一步|继续|下一页|next|continue/i.test(value)) return 'advance_step';
  return declared === 'unknown' ? 'interaction' : declared;
}

export function evaluateSafety(input: SafetyInput): SafetyDecision {
  const name = normalize(`${input.name} ${input.description ?? ''}`);
  const context = normalize(input.context ?? '');
  const effect = inferEffect(name, input.effect);
  if (effect === 'final_submit') return { blocked: true, reason: 'restricted:final_submit 最终申请提交必须由用户完成', effect };
  if (['button', 'link'].includes(input.role) && matches(context, finalStagePatterns) && matches(name, forwardActionPatterns)) {
    return { blocked: true, reason: 'restricted:final_submit 最终核对页的前进操作必须由用户完成', effect: 'final_submit' };
  }
  if (matches(name, verificationPatterns)) return { blocked: true, reason: 'restricted:verification 验证码和身份验证必须由用户完成', effect };
  if (matches(name, passwordPatterns)) return { blocked: true, reason: 'restricted:password 密码字段必须由用户完成', effect };
  if (matches(name, uploadPatterns)) return { blocked: true, reason: 'restricted:upload 文件上传必须由用户完成', effect };
  if (matches(name, deletionPatterns)) return { blocked: true, reason: 'restricted:deletion 删除操作必须由用户完成', effect };
  if (['checkbox', 'radio', 'switch'].includes(input.role) && matches(name, declarationPatterns)) {
    return { blocked: true, reason: 'restricted:declaration 声明、同意和授权必须由用户完成', effect };
  }
  return { blocked: false, effect };
}
