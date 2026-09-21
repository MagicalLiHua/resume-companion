/** User-owned decisions are shared policy, never an employer's fill recipe. */
export type ManualReason = 'employer_relatives' | 'attachment' | 'consent' | 'irreversible_action' | 'credential' | 'privacy_setting';
export interface PolicyTarget {label:string;scope?:string|undefined;type?:string|undefined;policyContext?:string|undefined;}

export function manualReason(target:PolicyTarget):ManualReason|undefined {
  const label=target.label.normalize('NFKC').replace(/\s+/g,'');
  const scope=(target.scope??'').normalize('NFKC').replace(/\s+/g,'');
  const context=`${target.scope??''} ${target.policyContext??''}`.normalize('NFKC').replace(/\s+/g,'');
  const text=`${label} ${context}`;
  if(/^(保密|对这家公司隐藏我的信息|保密当前简历|开启智能推荐|默认投递简历)$/.test(label))return 'privacy_setting';
  if(target.type==='file'||/上传|upload/i.test(label))return 'attachment';
  if(/验证码|密码|verificationcode|password/i.test(label)||target.type==='password')return 'credential';
  if(/最终提交|提交申请|立即申请|确认投递|投递确认|删除|支付|submitapplication/i.test(label))return 'irreversible_action';
  if(/声明|承诺|授权|签署|是否同意|同意提供|同意条款|隐私(?:政策|协议)|接受.*条款|consent|declaration|privacyagreement/i.test(text))return 'consent';
  const relative=/亲属|亲戚|亲友|家属|配偶|近亲|直系血亲|relative|familymember|spouse/i;
  const employment=/受雇|任职|工作|就职|员工|雇员|聘用|employ|work/i;
  const employer=/本公司|本企业|本集团|本单位|本行|贵司|集团(?:系统)?|company|corporation|employer/i;
  // A question naming any employer is covered, not just companies in recipes.
  if(relative.test(text)&&(employment.test(text)&&/是否|有无|are|does|doany/i.test(text)||employer.test(text)))return 'employer_relatives';
  // Detail controls can have short labels under a corporate-relative heading.
  if(/亲属(?:任职|受雇|回避)|任职亲属|员工亲属|亲属员工|利益冲突|回避关系/.test(context))return 'employer_relatives';
  // Ordinary family member records remain fillable. Elsewhere a relative's
  // name/department is an unresolved employer detail and requires the user.
  if(relative.test(label)&&/姓名|部门|单位|关系|职务|电话|name|department/i.test(label)
    &&!/^(家庭关系|家庭成员|家庭成员信息)(?:\/第\d+条)?$/.test(scope))return 'employer_relatives';
  return undefined;
}

export function isManualTarget(label:string,scope?:string):boolean {
  return manualReason({label,scope})!==undefined;
}

export interface ManualTask {
  frame:number;scope:string;field:string;reason:ManualReason;
  required:boolean;state:'pending'|'already_present'|'verification_required';blocks_navigation:boolean;
}
/** Only metadata and presence states leave the policy layer; never answers. */
export function manualTasks(raw:{fields:Array<PolicyTarget&{frame:number;required:boolean;disabled:boolean;value:string;checked:boolean|null;invalid:boolean;choiceGroup?:{id:string;label:string;answered:boolean;required:boolean}}>;attachments?:Array<{frame:number;scope:string;field:string;required:boolean;state:'pending'|'selected_unverified'|'accepted_ui'}>;workflow?:{heading:string;manual?:string[]}}):ManualTask[] {
  const tasks:ManualTask[]=[];
  const groups=new Set<string>();
  for(const f of raw.fields){
    const reason=manualReason(f);if(!reason||f.disabled)continue;
    if(f.choiceGroup){const key=`${f.frame}:${f.choiceGroup.id}`;if(groups.has(key))continue;groups.add(key);}
    const present=(f.choiceGroup?f.choiceGroup.answered:f.checked===null?Boolean(f.value):f.checked)&&!f.invalid;
    const state=reason==='attachment'?'verification_required':present?'already_present':'pending';
    const required=f.choiceGroup?.required??f.required;
    tasks.push({frame:f.frame,scope:f.scope??'',field:f.choiceGroup?.label||f.label,reason,required,state,blocks_navigation:required&&state!=='already_present'});
  }
  for(const attachment of raw.attachments??[]){
    const state=attachment.state==='accepted_ui'?'already_present':attachment.state==='selected_unverified'?'verification_required':'pending';
    tasks.push({...attachment,reason:'attachment',state,blocks_navigation:attachment.required&&state!=='already_present'});
  }
  for(const label of raw.workflow?.manual??[]){
    const existing=tasks.find(t=>t.field===label);
    if(existing){existing.required=true;existing.blocks_navigation=true;existing.state='pending';}
    else tasks.push({frame:0,scope:raw.workflow!.heading,field:label,reason:manualReason({label})??'attachment',required:true,state:'pending',blocks_navigation:true});
  }
  return tasks;
}

export function fieldMissing(f:{required:boolean;disabled:boolean;pendingInput?:boolean;checked:boolean|null;value:string;choiceGroup?:{answered:boolean;required:boolean}}):boolean {
  return !f.disabled&&(f.choiceGroup?.required??f.required)&&Boolean(f.pendingInput||(f.choiceGroup?!f.choiceGroup.answered:f.checked===null?!f.value:!f.checked));
}
