// Original React fixture with observed SD structure; no vendor code or data.
import React,{useState,useLayoutEffect,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
const oracle={ready:false,values:{},changes:0};
window.fixtureOracle=()=>JSON.parse(JSON.stringify(oracle));
const style=document.createElement('style');style.textContent=`.apply-block-fixture,.basic-block-fixture{border:1px solid #ddd;padding:18px;margin:10px}.apply-field-fixture{margin:12px}.multi-fixture{border:1px dashed #aaa;padding:14px}.sd-Input-container-fixture{border:1px solid #aaa;padding:6px;min-width:150px;display:inline-flex}.sd-Dropdown-container-fixture{display:inline-block;position:relative}.sd-Dropdown-dropdown-fixture{position:absolute;top:100%;left:0;z-index:50;background:white;border:1px solid #777;min-width:220px}.sd-Select-scrollable-fixture{max-height:190px;overflow:auto}.sd-Select-common-item-fixture{padding:7px;cursor:pointer}.sd-basic-year-container-fixture{display:grid;grid-template-columns:repeat(4,1fr)}.sd-basic-year-item-fixture{padding:10px;cursor:pointer}.sd-basic-selector-fixture{display:flex;justify-content:space-between;padding:8px}.sd-basic-selector-icon-fixture{padding:8px;cursor:pointer}.sd-basic-selected-fixture{background:#adf}.sd-basic-disabled-fixture{opacity:.4}input{width:130px}textarea{width:400px;height:80px}`;document.head.append(style);
function Field({label,children}){return <div className="apply-field-fixture"><div className="title-fixture">{label}</div><div className="ctrl-fixture">{children}</div></div>;}
function useOutsideClose(close){
 const ref=useRef(null);
 useEffect(()=>{const handler=e=>{if(ref.current&&!ref.current.contains(e.target))close(false);};document.addEventListener('mousedown',handler);return()=>document.removeEventListener('mousedown',handler);},[close]);return ref;
}
function Select({value='',onChange,choices,placeholder='请选择',search=false}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[custom,setCustom]=useState(false),[customValue,setCustomValue]=useState('');
 const ref=useOutsideClose(setOpen);
 const candidates=search&&query?choices.filter(x=>x.includes(query)):choices;
 return <div ref={ref} className="sd-Dropdown-container-fixture"><label className="sd-Input-container-fixture sd-Select-container-fixture" onMouseDown={e=>e.preventDefault()} onClick={e=>{e.currentTarget.querySelector('input').focus();setOpen(true);}}><span className="sd-Input-display-value-fixture">{value}</span><input placeholder={value?'':placeholder} value={query} onChange={e=>setQuery(e.target.value)} /></label>{open&&<div className="sd-Dropdown-dropdown-fixture"><div className="sd-Select-menu-fixture"><div className="sd-Select-scrollable-fixture">{candidates.map(x=><div key={x} className={placeholder==='年'||placeholder==='月'||search?'sd-Menu-container-fixture':'sd-Select-common-item-fixture'} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(x);setQuery('');setOpen(false);}}><div className="sd-Menu-content-item-fixture">{x}</div></div>)}{search&&<div className="custom-option-fixture">{custom?<><input placeholder="请输入就读学校全称" value={customValue} onChange={e=>setCustomValue(e.target.value)}/><button onClick={()=>{onChange(customValue);setQuery('');setOpen(false);setCustom(false);}}>添加</button></>:<button onClick={()=>setCustom(true)}>添加学校全称</button>}</div>}</div></div></div>}</div>;
}
function Month({value='',onChange,disabledMonth=false,reject=false}){
 const [open,setOpen]=useState(false),[year,setYear]=useState(1990);
 const obstructed=new URLSearchParams(location.search).get('delay')==='3';
 const [position,setPosition]=useState({});
 const ref=useOutsideClose(setOpen);
 useLayoutEffect(()=>{if(!open||!obstructed)return;const update=()=>{const r=ref.current.getBoundingClientRect();setPosition({position:'fixed',top:r.top-270,left:r.left});};update();window.addEventListener('scroll',update,true);return()=>window.removeEventListener('scroll',update,true);},[open,obstructed]);
 const cn=['一','二','三','四','五','六','七','八','九','十','十一','十二'];
 return <div ref={ref} className="sd-Dropdown-container-fixture"><label className="sd-Input-container-fixture day_info"><input readOnly value={value?`${value} (25岁)`:''} placeholder="出生日期 (年龄)" onClick={()=>{setYear(Number(value.slice(0,4))||1990);setOpen(true);}} /></label>{open&&<div style={position} className="sd-Dropdown-dropdown-fixture"><div className="sd-panal-menu-wrapper-fixture"><div className="sd-basic-selector-fixture"><span className="sd-basic-selector-icon-fixture" onMouseDown={e=>e.preventDefault()} onClick={()=>setYear(n=>n-1)}>‹</span><span className="sd-basic-selector-year-fixture">{year}年</span><span className="sd-basic-selector-icon-fixture" onMouseDown={e=>e.preventDefault()} onClick={()=>setYear(n=>n+1)}>›</span></div><div className="sd-basic-year-container-fixture">{cn.map((x,i)=>{const month=`${year}-${String(i+1).padStart(2,'0')}`,disabled=disabledMonth&&i===1;return <div key={x} className={`sd-basic-year-wrapper-fixture ${month===value?'sd-basic-selected-fixture':''} ${disabled?'sd-basic-disabled-fixture':''}`}><div className="sd-basic-year-item-fixture" onMouseDown={e=>e.preventDefault()} onClick={()=>{if(disabled)return;if(!reject)onChange(month);setOpen(false);}}>{x}月</div></div>;})}</div></div></div>}</div>;
}
function Period({value,onChange,current=false,single=false}){
 value??=single?['','']:['','','',''];
 return <div className="month-range-select date_info">{(single?['年','月']:['年','月','年','月']).map((part,i)=><Select key={i} placeholder={part} value={value[i]} choices={part==='年'?Array.from({length:45},(_,n)=>String(1990+n)):Array.from({length:12},(_,n)=>String(n+1))} onChange={next=>{const v=[...value];v[i]=next;if(i%2===0&&!v[i+1])v[i+1]='1';onChange(v);}}/>)}{current&&<label><input type="checkbox" checked={!!value[4]} onChange={e=>onChange([...value.slice(0,4),e.target.checked])}/>至今</label>}</div>;
}
const schema={
 '个人信息':[['性别','gender'],['最高学历','degree'],['所在地','text'],['出生日期 (年龄)','month'],['受限出生年月','limited'],['拒绝出生年月','reject']],
 '求职意向':[['当前薪资','text'],['期望薪资','text'],['期望城市','text']],
 '工作经历':[['起止时间','period'],['公司名称','text'],['职位名称','text'],['工作职责','long']],
 '教育背景':[['就读时间','period'],['学校名称','school'],['专业名称','major'],['学历','degree']],
 '实习经历':[['起止时间','period'],['公司名称','text'],['职位名称','text'],['工作职责','long']],
 '项目经验':[['起止时间','period'],['项目名称','text'],['职责','text'],['项目描述','long'],['项目中职责','long']],
 '语言能力':[['语言类型','text'],['掌握程度','level'],['听说','level'],['读写','level']],
 '自我描述':[['自我描述','long']],
 '获奖经历':[['获奖时间','singlePeriod'],['奖项名称','text']],
};
const employerModules=new URLSearchParams(location.search).get('delay')==='2'?new Set(['个人信息','教育背景','项目经验']):null;
const repeated=new Set(['工作经历','教育背景','实习经历','项目经验','语言能力','获奖经历']);
function App(){
 const [rows,setRows]=useState(()=>Object.fromEntries(Object.keys(schema).map(key=>[key,[{}]])));
 useLayoutEffect(()=>{oracle.ready=true;oracle.values=rows;},[rows]);
 const put=(section,index,label,value)=>{oracle.changes++;setRows(prev=>({...prev,[section]:prev[section].map((row,i)=>i===index?{...row,[label]:value}:row)}));};
 return <>{new URLSearchParams(location.search).get('delay')==='3'&&<div style={{position:'fixed',top:0,left:0,right:0,height:150,zIndex:200,background:'white'}}>固定页头</div>}<div className="basic-block-fixture"><div className="block-title-fixture">基础信息</div>{['姓名','手机号码','邮箱'].map(label=><div className="field-fixture" key={label}><div className="filed-title-fixture">{label}</div><label className="sd-Input-container-fixture"><input placeholder={label} value={label==='手机号码'?'13800000000':''} disabled readOnly/></label></div>)}</div>{Object.entries(schema).filter(([section])=>!employerModules||employerModules.has(section)).map(([section,fields])=><div className="apply-block-fixture" key={section}><div className="blockTitle-fixture"><span>{section}</span>{repeated.has(section)&&<button onClick={()=>setRows(prev=>({...prev,[section]:[...prev[section],{}]}))}>添加</button>}</div>{rows[section].map((row,index)=><div key={index} className={`apply-fields-fixture ${repeated.has(section)?'multi-fixture':''}`}>{fields.map(([label,type])=>{const value=row[label],change=next=>put(section,index,label,next);return <Field label={label} key={label}>{['period','singlePeriod'].includes(type)?<Period value={value} onChange={change} single={type==='singlePeriod'}/>:['month','limited','reject'].includes(type)?<Month value={value} onChange={change} disabledMonth={type==='limited'} reject={type==='reject'}/>:['school','major','degree','level','gender'].includes(type)?<Select value={value} onChange={change} search={type==='school'||type==='major'} choices={type==='gender'?['男','女']:type==='degree'?['高中','本科','硕士']:type==='level'?['一般','熟练','精通']:['软件工程','测试学校']}/>:type==='long'?<textarea className="sd-Textarea-textarea-fixture" value={value||''} onChange={e=>change(e.target.value)}/>:<label className="sd-Input-container-fixture"><input value={value||''} placeholder={label} onChange={e=>change(e.target.value)}/></label>}</Field>;})}</div>)}</div>)}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
