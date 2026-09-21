// Original behavioral fixture running real React. These DOM shapes are based
// on the captured UD controls; this is NOT the original UD component package.
import React, {useState, useLayoutEffect, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
const oracle={ready:false,values:[],changes:0};
window.fixtureOracle=()=>JSON.parse(JSON.stringify(oracle));
const style=document.createElement('style');
style.textContent=`.apply-form-array-card__contract{padding:18px;border:1px solid #ddd;margin:18px}.ud-formily-item{margin:14px}.ud-formily-item-label{margin-bottom:7px}.ud__select__selector,input{border:1px solid #aaa;padding:8px;min-width:200px}.ud__select input{border:0;width:20px;min-width:20px}.throne-biz-date-range-picker-wrapper{display:flex;gap:12px}.ud__select__dropdown,.ud__picker-date-panel{position:fixed;left:350px;top:100px;background:white;border:1px solid #777;padding:12px;z-index:100;min-width:250px}.ud__select__list__item{padding:9px;cursor:pointer}.ud__picker-panel-body{display:grid;grid-template-columns:repeat(3,1fr)}.ud__picker__cell{padding:12px;cursor:pointer}.ud__picker__cell-selected{background:#aee}.ud__picker-panel-header-inner{display:flex;justify-content:space-between}.ud__picker__cell-disabled{color:#aaa}`;
document.head.append(style);
const keys=['学历类型','学历','回滚学历','歧义学历','渐隐学历','渐隐回滚学历','关闭等级'];
export function Field({label,children}) {
  return <div className="ud-formily-item" id={`formily-item-${label}`} data-form-field-i18n-name={label}>
    <div className="ud-formily-item-label"><div className="ud-formily-item-label-content"><label>{label}</label></div></div>
    <div className="ud-formily-item-control">{children}</div>
  </div>;
}
export function Select({label,value,onChange,choices}) {
  const [open,setOpen]=useState(false);
  const [leaving,setLeaving]=useState(false);
  const animated=label.startsWith('渐隐');
  useEffect(()=>{if(label!=='关闭等级'||!open)return;const close=e=>{if(e.target.closest('.ud-formily-item-label'))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[open,label]);
  const select=option=>{
    onChange(option);setOpen(false);
    if(animated){
      setLeaving(true);
      if(label==='渐隐回滚学历')setTimeout(()=>onChange(''),240);
      setTimeout(()=>setLeaving(false),350);
    }
  };
  const options=choices??(label==='学历类型'?['统招全日制','非全日制']:label==='歧义学历'?['本科','本科']:['本科','硕士']);
  return <Field label={label}><div className={`ud__select ${open?'ud__select-open':''}`}>
    <div className="ud__select__selector" onMouseDown={e=>e.preventDefault()} onClick={e=>{e.currentTarget.querySelector('input').focus();setOpen(true);}}>
      <span className="ud__select__selector__selectItem">{value||''}</span>
      <input role="combobox" readOnly value="" aria-expanded={animated?undefined:open} onBlur={()=>{if(label==='回滚学历')onChange('');}} onKeyDown={e=>{if(e.key==='Escape'&&label!=='关闭等级')setOpen(false);}}/>
    </div>
    {(open||leaving)&&createPortal(<div className="ud__select__dropdown"><div className="rc-virtual-list-holder">{options.map((option,index)=><div key={index} className={`ud__select__list__item ${option===value?'ud__select__list__item-selected':''}`} onMouseDown={e=>e.preventDefault()} onClick={()=>select(option)}><span className="ud__select__list__item__content">{option}</span></div>)}</div></div>,document.body)}
  </div></Field>;
}
export function Range({label,value=label==='已有时间'?['2020-09','2024-06']:['',''],onChange}) {
  const [endpoint,setEndpoint]=useState(null),[year,setYear]=useState(2024),[mode,setMode]=useState(label==='已有时间'?'year':'month');
  const [panelTop,setPanelTop]=useState(0),anchored=label==='已有时间';
  function open(index,event){if(endpoint===index){setEndpoint(null);return;}setPanelTop(event.currentTarget.getBoundingClientRect().bottom+window.scrollY);setEndpoint(index);setYear(Number(value[index]?.slice(0,4))||2024);if(label!=='已有时间')setMode('month');}
  return <Field label={label}><div className="throne-biz-date-range-picker-wrapper">{[0,1].map(index=><div className="throne-biz-date-range-picker-input" key={index}><input value={value[index]} onChange={()=>{}} onClick={event=>open(index,event)} onKeyDown={e=>{if(e.key==='Escape')setEndpoint(null);}}/></div>)}</div>
    {endpoint!==null&&anchored&&createPortal(<div style={{position:'fixed',bottom:0,left:0,right:0,height:200,zIndex:200,background:'#eee'}}>固定保存栏</div>,document.body)}
    {endpoint!==null&&createPortal(<div className="ud__picker-date-panel" style={anchored?{position:'absolute',top:panelTop}:undefined} onMouseDown={e=>e.preventDefault()}>
      <div className="ud__picker-panel-header"><div className="ud__picker-panel-header-inner">
        <span className="ud__picker-panel-header-btn" onClick={()=>setMode('year')}>{year}年</span>
        <button className="ud__picker-panel-header-icon" onClick={()=>setYear(y=>y-(mode==='year'?(anchored?20:12):1))}>‹</button>
        <button className="ud__picker-panel-header-icon" onClick={()=>setYear(y=>y+(mode==='year'?(anchored?20:12):1))}>›</button>
      </div></div>
      <div className={`ud__picker-panel-body ud__picker-${mode}-panel`} style={anchored&&mode==='year'?{gridTemplateColumns:'repeat(4,1fr)'}:undefined}>{Array.from({length:anchored&&mode==='year'?20:12},(_,i)=>{
        const cell=mode==='year'?(anchored?Math.floor(year/20)*20:year-4)+i:i+1;
        const iso=`${year}-${String(cell).padStart(2,'0')}`;
        const selected=mode==='year'?Number(value[endpoint]?.slice(0,4))===cell:value[endpoint]===iso;
        const disabled=mode==='month'&&label==='受限时间'&&cell===2;
        return <div key={i} className={`ud__picker__cell ud__picker-${mode}-panel-cell ${selected?'ud__picker__cell-selected':''} ${disabled?'ud__picker__cell-disabled':''}`} onClick={()=>{if(disabled)return;if(mode==='year'){setYear(cell);setMode('month');return;}const next=[...value];next[endpoint]=iso;if(label!=='回滚时间')onChange(next);setEndpoint(null);}}><div className="ud__picker__cell-interactive-area">{cell}{mode==='month'?'月':''}</div></div>;
      })}</div>
    </div>,document.body)}
  </Field>;
}
export function Cities({value=[],onChange}) {
  const [open,setOpen]=useState(false);
  return <Field label="期望工作地点"><div className={`ud__select ${open?'ud__select-open':''}`}>
    <div className="ud__select__selector ud__select__selector-multiple" onClick={e=>{e.currentTarget.querySelector('input').focus();setOpen(true);}}>
      {value.map(v=><span className="ud__select__selector__tag" key={v}><span className="ud__tag__content">{v}</span></span>)}
      <input role="combobox" value="" readOnly aria-expanded={open} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}/>
    </div>
    {open&&createPortal(<div className="ud__select__dropdown"><div className="ud__tree">{['杭州','上海','禁用城市'].map(city=><div className="ud__tree__node" key={city}>
      <label className="ud__checkbox__wrapper"><span className="ud__checkbox"><input type="checkbox" disabled={city==='禁用城市'} checked={value.includes(city)} onChange={()=>onChange(value.includes(city)?value.filter(v=>v!==city):[...value,city])}/></span></label>
      <span className="ud__tree__node__label">{city}</span>
    </div>)}</div></div>,document.body)}
  </div></Field>;
}
function App(){
  const [records,setRecords]=useState([{},{}]),[revision,setRevision]=useState(0);
  useLayoutEffect(()=>{oracle.ready=true;oracle.values=records;oracle.revision=revision;},[records,revision]);
  const put=(index,key,value)=>{oracle.changes++;setRecords(previous=>previous.map((r,i)=>i===index?{...r,[key]:value}:r));};
  return <><button onClick={()=>setRevision(v=>v+1)}>重新渲染</button><div className="applyFormModuleWrapper__contract">
    <div className="applyFormModuleWrapper-title">教育经历</div>
    {records.map((r,index)=><div className="apply-form-array-card__contract" key={r.替换记录?`replaced-${index}`:index}>
      <Field label="替换记录"><input value={r.替换记录||''} onChange={e=>put(index,'替换记录',e.target.value)}/></Field>
      <Field label="经历描述"><textarea value={r.经历描述||''} onChange={e=>put(index,'经历描述',e.target.value)}/></Field>
      <Field label="拒绝描述"><textarea value={r.拒绝描述||''} onChange={e=>put(index,'拒绝描述',e.target.value)} onBlur={()=>put(index,'拒绝描述','')}/></Field>
      {Array.from({length:13},(_,n)=><Field label={`补充描述${n+1}`} key={n}><textarea value={r[`补充描述${n+1}`]||''} onChange={e=>put(index,`补充描述${n+1}`,e.target.value)}/></Field>)}
      <Field label="竞赛名称"><div className="ud__select"><div className="ud__select__selector ud__select__selector-hide-arrow"><input role="combobox" value={r.竞赛名称||''} onChange={e=>put(index,'竞赛名称',e.target.value)}/></div></div></Field>
      <Field label="候选搜索"><div className="ud__select"><div className="ud__select__selector"><span className="ud__select__selector__selectItem"/><input role="combobox" value={r.候选搜索||''} onChange={e=>put(index,'候选搜索',e.target.value)}/></div></div></Field>
      {index===1&&['个人证件','学院','精通程度'].map(label=><Field label={label} key={label}><input/><div className="ud-formily-item-error-help">{label}为必填</div></Field>)}
      <Cities value={r.期望工作地点} onChange={value=>put(index,'期望工作地点',value)}/>
      <Field label="学校名称"><div className="ud__select"><input value={r.学校名称||''} onChange={e=>put(index,'学校名称',e.target.value)}/></div></Field>
      {keys.map(label=><Select label={label} value={r[label]} onChange={value=>put(index,label,value)} key={label}/>)}
      {['起止时间','已有时间','回滚时间','受限时间'].map(label=><Range label={label} value={r[label]} onChange={value=>put(index,label,value)} key={label}/>)}
    </div>)}
    <button key={`add-${revision}`} onClick={()=>setRecords(previous=>[...previous,{}])}>添加</button>
    <button onClick={()=>setRevision(v=>v+1)}>无效添加</button>
  </div></>;
}
if(location.pathname==='/ud-contract.html')createRoot(document.getElementById('root')).render(<App/>);
