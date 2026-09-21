const steps=['基本信息','教育经历','自我评价'];
const stage=Number(sessionStorage.getItem('job51-stage')||0);
const fields=[['姓名'],['毕业学校'],['自我评价']][stage];
const state=JSON.parse(sessionStorage.getItem('job51-values')||'{}');
const root=document.getElementById('root');
root.innerHTML=`<ul>${steps.map((s,i)=>`<li class="${stage===i?'leftli2':'leftli1'}" title="${s}"><span class="lispan">${s}</span></li>`).join('')}</ul><div class="cornercol1"><h1>${steps[stage]}</h1><div class="ci">${fields.map(label=>`<dl><dt>${label} *</dt><dd><input aria-label="${label}"></dd></dl>`).join('')}</div>${stage<steps.length-1?'<input id="imgbtnNext" title="Next" type="submit" value="下一步">':'<input id="imgbtnSubmit" title="Submit" type="submit" value="提交">'}<input id="imgbtnSave" title="Save" type="button" value="保存"></div>`;
for(const input of root.querySelectorAll('dd input')){
 input.value=state[input.getAttribute('aria-label')]||'';
 input.addEventListener('input',()=>{state[input.getAttribute('aria-label')]=input.value;sessionStorage.setItem('job51-values',JSON.stringify(state));});
}
root.querySelector('#imgbtnNext')?.addEventListener('click',()=>{sessionStorage.setItem('job51-stage',String(stage+1));location.reload();});
root.querySelector('#imgbtnSubmit')?.addEventListener('click',()=>sessionStorage.setItem('job51-submitted','yes'));
window.fixtureOracle=()=>({ready:true,stage,state,submitted:sessionStorage.getItem('job51-submitted')==='yes'});
