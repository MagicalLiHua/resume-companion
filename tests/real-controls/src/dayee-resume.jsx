import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Form,Input,Select,DatePicker,Radio,Modal,Button} from 'antd3';
import zhCN from 'antd3/es/date-picker/locale/zh_CN';
import moment from 'moment';
import 'antd3/dist/antd.css';

const definitions={
 '个人基本信息':[['姓名','text'],['性别','radio'],['出生日期','date'],['民族','select',['汉族','蒙古族']],['现居住地','city']],
 '教育经历':[['学校','school'],['专业','major'],['学历','select',['本科','硕士研究生','博士研究生']],['开始时间','month'],['结束时间','month'],['专业描述','textarea']],
 '实习经历':[['企业名称','text'],['开始时间','month'],['结束时间','month'],['工作描述','textarea']],
 '项目经验':[['项目名称','text'],['开始时间','month'],['结束时间','month'],['项目职责','textarea'],['项目描述','textarea']],
 '家庭关系':[['姓名','text'],['关系','select',['父亲','母亲','配偶']],['出生日期','date'],['工作单位','text']],
 '科研经历':[['研究课题/项目','text'],['开始时间','month'],['结束时间','month'],['成果','textarea']],
 '自我评价':[['评价内容','textarea']],
};
const repeated=['教育经历','实习经历','项目经验','家庭关系','科研经历'];
function App(){
 const [values,setValues]=useState({'个人基本信息':[{}],'教育经历':[{}],'实习经历':[],'项目经验':[{}],'家庭关系':[],'科研经历':[],'自我评价':[{}]});
 const [dialog,setDialog]=useState(null),[query,setQuery]=useState(''),[choice,setChoice]=useState('');
 const set=(section,index,key,value)=>setValues(old=>({...old,[section]:old[section].map((row,i)=>i===index?{...row,[key]:value}:row)}));
 window.fixtureOracle=()=>({ready:true,values,dialog:!!dialog});
 return <><Form>{Object.entries(definitions).map(([section,fields],si)=><div className="form-cell" id={`module-${si}`} key={section}>
  <div className="tit-wrap"><div className="tit"><p title={section}>{section}</p></div></div>
  <div className="form-cell-right">{values[section].map((row,index)=><div className="form-cell-inner" key={index}>
   {fields.map(([name,kind,options])=><Form.Item key={name} label={<>{name}<span className="labelRequired">*</span></>} required>
    {kind==='text'?<Input placeholder={`请填写${name}`} value={row[name]||''} onChange={e=>set(section,index,name,e.target.value)}/>
     :kind==='textarea'?<Input.TextArea placeholder={`请填写${name}`} value={row[name]||''} onChange={e=>set(section,index,name,e.target.value)}/>
     :kind==='radio'?<Radio.Group value={row[name]} onChange={e=>set(section,index,name,e.target.value)}><Radio value="男">男</Radio><Radio value="女">女</Radio></Radio.Group>
     :kind==='select'?<Select value={row[name]} placeholder={`请选择${name}`} style={{width:260}} onChange={v=>set(section,index,name,v)}>{options.map(x=><Select.Option key={x}>{x}</Select.Option>)}</Select>
     :kind==='city'?<><Select placeholder="省份" style={{width:130}} value={row[name+'省']} onChange={v=>{set(section,index,name+'省',v);set(section,index,name+'市',undefined);}}>{['浙江','江苏'].map(x=><Select.Option key={x}>{x}</Select.Option>)}</Select><Select placeholder="城市" style={{width:130}} value={row[name+'市']} onChange={v=>set(section,index,name+'市',v)}>{(row[name+'省']==='浙江'?['杭州','宁波']:row[name+'省']==='江苏'?['南京','苏州']:[]).map(x=><Select.Option key={x}>{x}</Select.Option>)}</Select></>
     :['school','major'].includes(kind)?<Input placeholder={kind==='school'?'请选择学校':'请选择专业'} value={row[name]||''} readOnly onClick={()=>{setDialog({section,index,name,kind});setQuery('');setChoice('');}}/>
     :kind==='month'?<DatePicker.MonthPicker locale={zhCN} placeholder={`请选择${name}`} value={row[name]?moment(row[name],'YYYY-MM'):null} onChange={(_,v)=>set(section,index,name,v)} format="YYYY-MM"/>
     :<DatePicker locale={zhCN} placeholder={`请选择${name}`} inputReadOnly value={row[name]?moment(row[name],'YYYY-MM-DD'):null} onChange={(_,v)=>set(section,index,name,v)} format="YYYY-MM-DD"/>}
   </Form.Item>)}{section==='个人基本信息'&&<div role="button"><button>+ 证件照</button></div>}
  </div>)}{repeated.includes(section)&&<div className="add-more"><div className="add-more-btn" onClick={()=>setValues(old=>({...old,[section]:[...old[section],...(section==='家庭关系'&&old[section].length===0?[{},{}]:[{}])]}))}>添加新的{section}</div></div>}</div>
 </div>)}</Form><Modal visible={!!dialog} title={dialog?.kind==='major'?'请选择专业':'请选择学校'} onCancel={()=>setDialog(null)} footer={<><Button onClick={()=>setDialog(null)}>取消</Button><Button type="primary" disabled={!choice} onClick={()=>{set(dialog.section,dialog.index,dialog.name,choice);setDialog(null);}}>选择</Button></>}>
 <div className="search-bar"><Input placeholder={dialog?.kind==='major'?'请输入专业名称':'请输入学校名称'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="school-list">{(dialog?.kind==='major'?['软件工程(计算机类)(普通本科)(中国大陆)','软件工程(软件工程)(研究生)(中国大陆)','计算机科学']:['测试学校','另一所学校']).filter(x=>x.includes(query)).map(x=><div key={x}><span className={'school-item'+(choice===x?' active':'')} onClick={()=>setChoice(x)}>{x}</span></div>)}</div>
 </Modal></>;
}
const style=document.createElement('style');style.textContent='.form-cell{padding:24px;border-bottom:1px solid #eee}.form-cell-inner{padding:12px;border:1px solid #eee}.ant-form-item{max-width:580px}.ant-form-item label{min-width:0}.add-more-btn,.school-item{cursor:pointer;padding:8px;display:inline-block}.school-item.active{background:#dff}.tit{font-size:20px}';document.head.append(style);
createRoot(document.getElementById('root')).render(<App/>);
