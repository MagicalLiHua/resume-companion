// React restores controlled values during focus. Clearing only the DOM before
// focus must never turn an authorized replacement into old + new text.
import React, {useLayoutEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';

const initial = {姓名:'原测试姓名',手机号:'13800001234',电子邮箱:'old@example.test',专业:'原专业',年限:'12',经历描述:'原来的经历描述'};
const oracle = {ready:false,values:[initial,initial],changes:0};
window.fixtureOracle = () => JSON.parse(JSON.stringify(oracle));
function App() {
  const [records,setRecords] = useState([{...initial},{...initial}]);
  const [revision,setRevision] = useState(0);
  useLayoutEffect(()=>{oracle.ready=true;oracle.values=records;oracle.revision=revision;},[records,revision]);
  const change=(index,label,value)=>{oracle.changes++;setRecords(rows=>rows.map((row,i)=>i===index?{...row,[label]:value}:row));};
  return <div className="applyFormModuleWrapper__contract">
    <div className="applyFormModuleWrapper-title">教育经历</div>
    {records.map((record,index)=><div key={index} className="apply-form-array-card__contract" style={{padding:20,border:'1px solid #ccc'}}>
      {Object.entries(record).map(([label,value])=><div className="ud-formily-item" data-form-field-i18n-name={label} key={label}>
        <div className="ud-formily-item-label"><label>{label}</label></div>
        <div className="ud-formily-item-control">{label==='经历描述'
          ? <textarea value={value} onFocus={()=>setRevision(r=>r+1)} onChange={e=>change(index,label,e.target.value)}/>
          : <input type={label==='电子邮箱'?'email':label==='手机号'?'tel':label==='年限'?'number':'text'} value={value}
              onFocus={()=>setRevision(r=>r+1)} onChange={e=>change(index,label,e.target.value)}/>}</div>
      </div>)}
    </div>)}
    <button onClick={()=>setRevision(r=>r+1)}>重新渲染</button>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
