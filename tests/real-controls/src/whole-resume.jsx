// Original React behavior fixture, not an implementation of the remote site.
import React,{useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Field,Select,Range,Cities} from './ud-contract.jsx';
const schema={
  基本信息:[['姓名','text'],['手机号','tel'],['邮箱','email'],['期望工作地点','cities'],['个人证件','protected']],
  教育经历:[['学校名称','text'],['学历','choice',['高中','本科','硕士']],['学院','text'],['专业','text'],['学历类型','choice',['统招全日制','非全日制']],['起止时间','range']],
  实习经历:[['公司名称','text'],['职位名称','text'],['描述','long'],['起止时间','range']],
  工作经历:[['公司名称','text'],['职位名称','text'],['描述','long'],['起止时间','range']],
  项目经历:[['项目名称','text'],['项目角色','text'],['描述','long'],['起止时间','range'],['项目链接','text']],
  竞赛:[['竞赛名称','custom'],['描述','long']],
  证书:[['证书名称','custom'],['描述','long']],
  语言能力:[['语言','choice',['英语','日语','普通话']],['精通程度','choice',['入门','精通','母语']]],
  自我评价:[['自我评价','long']],
  作品链接:[['作品链接','text']],
};
const singleton=new Set(['基本信息','自我评价','作品链接']);
const seeded=new URLSearchParams(location.search).get('delay')==='1';
const oracle={ready:false,values:{},changes:0};
window.fixtureOracle=()=>JSON.parse(JSON.stringify(oracle));
function App(){
  const [rows,setRows]=useState(()=>Object.fromEntries(Object.keys(schema).map(section=>{
    if(section==='基本信息')return [section,[{个人证件:'TEST-PRESERVE-IDENTITY',...(seeded?{姓名:'原姓名',手机号:'13800001234',邮箱:'old@example.test'}:{})}]];
    if(section==='作品链接')return [section,[{}]];
    if(section==='教育经历'&&seeded)return [section,[{学校名称:'原学校',学历:'本科',学院:'原学院',专业:'原专业',学历类型:'非全日制',起止时间:['2020-09','2024-06']}]];
    return [section,[]];
  })));
  const [revision,setRevision]=useState(0);
  const [internshipsEnabled,setInternshipsEnabled]=useState(false);
  useLayoutEffect(()=>{oracle.ready=true;oracle.values=rows;},[rows]);
  const put=(section,index,label,value)=>{oracle.changes++;setRows(previous=>({...previous,[section]:previous[section].map((row,i)=>i===index?{...row,[label]:value}:row)}));};
  return <>{Object.entries(schema).map(([section,fields])=><div className="applyFormModuleWrapper__contract" key={section}>
    <div className="applyFormModuleWrapper-title">{section}</div>
    {section==='实习经历'&&<Field label="没有实习经历"><input type="checkbox" checked={!internshipsEnabled} onChange={()=>{setInternshipsEnabled(true);setRows(previous=>({...previous,实习经历:previous.实习经历.length?previous.实习经历:[{}]}));}}/></Field>}
    {rows[section].map((row,index)=><div className={singleton.has(section)&&!(section==='自我评价'&&seeded)?'singleton':'apply-form-array-card__contract'} key={index}>
      {fields.map(([label,type,choices])=>{
        const value=row[label],change=next=>put(section,index,label,next);
        if(type==='choice')return <Select key={label} label={label} value={value} onChange={change} choices={choices}/>;
        if(type==='range')return <Range key={label} label={label} value={value} onChange={change}/>;
        if(type==='cities')return <Cities key={label} value={value} onChange={change}/>;
        const props={value:value||'',onFocus:()=>setRevision(n=>n+1),onChange:e=>change(e.target.value),readOnly:type==='protected'};
        return <Field key={label} label={label}>{type==='long'?<textarea {...props}/>:type==='custom'
          ?<div className="ud__select"><div className="ud__select__selector ud__select__selector-hide-arrow"><input role="combobox" {...props}/></div></div>
          :<>{type==='tel'&&<div className="ud__select"><div className="ud__select__selector"><span className="ud__select__selector__selectItem">+86</span><input role="combobox" value="" readOnly/></div></div>}<input type={['tel','email'].includes(type)?type:'text'} {...props}/></>}</Field>;
      })}
    </div>)}
    {(!singleton.has(section)||!rows[section].length)&&(section!=='实习经历'||internshipsEnabled)&&<button key={revision} onClick={()=>setRows(previous=>({...previous,[section]:[...previous[section],{}]}))}>添加</button>}
  </div>)}<div className="applyFormModuleWrapper__contract"><div className="applyFormModuleWrapper-title">附件</div><input type="file" aria-label="附件上传"/></div></>;
}
createRoot(document.getElementById('root')).render(<App/>);
