import { useState } from 'react';
import { createRoot } from 'react-dom/client';
function Controlled() {
  const [name, setName] = useState('');
  const [ignored, setIgnored] = useState('');
  return <form onSubmit={e => e.preventDefault()}><fieldset><legend>基本资料</legend><label>姓名<input id="controlled-name" value={name} onChange={e => setName(e.target.value)}/></label><label>电子邮箱<input id="reject-email" value={ignored} onChange={() => setIgnored('')}/></label><output id="react-state">{name}</output></fieldset></form>;
}
createRoot(document.getElementById('root')!).render(<Controlled/>);
