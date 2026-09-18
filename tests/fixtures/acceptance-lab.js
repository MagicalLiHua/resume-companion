const params = new URLSearchParams(location.search);
const runId = params.get('run') || 'interactive';
const storageKey = `resume-companion-acceptance-${runId}`;
const steps = ['基本资料与意向', '教育与实习经历', '技能与问卷', '最终核对'];
const manualNote = '请优先通过邮件联系（用户已填写，请保留）';

const emptyState = () => ({
  version: 1,
  step: 1,
  basic: { manual_note: manualNote },
  address: {},
  intent: { locations: [] },
  educations: [],
  experiences: [],
  project: {},
  skills: [],
  questions: {},
  draftSaves: 0,
  lastSavedAt: null,
  agreementChecked: false,
  finalSubmits: 0,
});

if (params.get('fresh') === '1') {
  localStorage.removeItem(storageKey);
  params.delete('fresh');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

let state;
try {
  state = { ...emptyState(), ...JSON.parse(localStorage.getItem(storageKey) || 'null') };
} catch {
  state = emptyState();
}

const root = document.querySelector('#application-root');
const dialog = document.querySelector('#record-dialog');
const saveIndicator = document.querySelector('#save-indicator');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const selected = (actual, expected) => actual === expected ? 'selected' : '';
const checked = condition => condition ? 'checked' : '';
const persist = () => localStorage.setItem(storageKey, JSON.stringify(state));
const value = (object, key) => escapeHtml(object?.[key] ?? '');

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 1800);
}

function renderProgress() {
  document.querySelector('#step-list').innerHTML = steps.map((label, index) => {
    const number = index + 1;
    const className = number === state.step ? 'active' : number < state.step ? 'done' : '';
    return `<li class="${className}" data-index="${number}">${escapeHtml(label)}</li>`;
  }).join('');
  if (state.lastSavedAt) {
    const time = new Date(state.lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    saveIndicator.textContent = `草稿已保存 · ${time}`;
    saveIndicator.className = 'save-indicator saved';
  } else {
    saveIndicator.textContent = '草稿尚未保存';
    saveIndicator.className = 'save-indicator';
  }
}

function panel(title, description, body) {
  return `<section class="panel" aria-label="${escapeHtml(title)}">
    <div class="panel-header">
      <div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
      <span class="step-chip">步骤 ${state.step} / 4</span>
    </div>
    ${body}
  </section>`;
}

function error(message) {
  const summary = document.querySelector('#error-summary');
  if (!summary) return;
  summary.textContent = message;
  summary.classList.add('visible');
  summary.scrollIntoView({ block: 'nearest' });
}

async function saveDraft() {
  saveIndicator.textContent = '正在保存本地草稿…';
  saveIndicator.className = 'save-indicator saving';
  try {
    const response = await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, step: state.step, state }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.json();
    state.draftSaves += 1;
    state.lastSavedAt = new Date().toISOString();
    persist();
    renderProgress();
    toast('本地草稿已保存');
    return true;
  } catch {
    saveIndicator.textContent = '草稿保存失败，请重试';
    saveIndicator.className = 'save-indicator';
    error('本地草稿保存失败，请重试。');
    return false;
  }
}

function collectStepOne(form) {
  const data = new FormData(form);
  state.basic = {
    full_name: data.get('full_name') || '',
    english_name: data.get('english_name') || '',
    phone: data.get('phone') || '',
    email: data.get('email') || '',
    birth_date: data.get('birth_date') || '',
    current_city: data.get('current_city') || '',
    manual_note: data.get('manual_note') || '',
  };
  state.address = {
    province: data.get('province') || '',
    city: data.get('address_city') || '',
    district: data.get('district') || '',
  };
  state.intent = {
    job: data.get('job') || '',
    locations: data.getAll('locations'),
    relocate: data.has('relocate'),
    start_date: data.get('start_date') || '',
    salary: data.get('salary') || '',
  };
  persist();
}

function addressCities(province) {
  return province === '浙江省' ? ['杭州市', '宁波市']
    : province === '上海市' ? ['上海市']
      : province === '江苏省' ? ['南京市', '苏州市'] : [];
}

function addressDistricts(city) {
  return city === '杭州市' ? ['西湖区', '滨江区', '余杭区']
    : city === '宁波市' ? ['海曙区', '鄞州区']
      : city === '上海市' ? ['浦东新区', '徐汇区']
        : city === '南京市' ? ['鼓楼区', '建邺区']
          : city === '苏州市' ? ['姑苏区', '工业园区'] : [];
}

function replaceOptions(selectElement, options, placeholder, current = '') {
  selectElement.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${options.map(option => `<option value="${escapeHtml(option)}" ${selected(current, option)}>${escapeHtml(option)}</option>`).join('')}`;
  selectElement.disabled = options.length === 0;
}

function wireAddressCascade() {
  const province = document.querySelector('#province');
  const city = document.querySelector('#address-city');
  const district = document.querySelector('#district');
  replaceOptions(city, addressCities(province.value), '请先选择省份', state.address.city);
  replaceOptions(district, addressDistricts(city.value), '请先选择城市', state.address.district);

  province.addEventListener('change', () => {
    city.disabled = true;
    district.disabled = true;
    replaceOptions(city, [], '正在加载城市…');
    replaceOptions(district, [], '请先选择城市');
    window.setTimeout(() => replaceOptions(city, addressCities(province.value), '请选择城市'), 320);
  });
  city.addEventListener('change', () => {
    district.disabled = true;
    replaceOptions(district, [], '正在加载区县…');
    window.setTimeout(() => replaceOptions(district, addressDistricts(city.value), '请选择区县'), 320);
  });
}

function renderStepOne() {
  root.innerHTML = panel('基本资料与求职意向', '包含已有答案保护、动态地址和条件选择。', `
    <form id="step-one">
      <h3 class="section-title">个人资料</h3>
      <div class="form-grid">
        <label><span class="required">姓名</span><input name="full_name" autocomplete="name" required value="${value(state.basic, 'full_name')}"></label>
        <label><span class="required">英文名</span><input name="english_name" required value="${value(state.basic, 'english_name')}"></label>
        <label><span class="required">手机号</span><input name="phone" type="tel" autocomplete="tel" pattern="1[0-9]{10}" required value="${value(state.basic, 'phone')}"></label>
        <label><span class="required">电子邮箱</span><input name="email" type="email" autocomplete="email" required value="${value(state.basic, 'email')}"></label>
        <label><span class="required">出生日期</span><input name="birth_date" inputmode="numeric" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" placeholder="YYYY-MM-DD" required value="${value(state.basic, 'birth_date')}"><small class="help">格式：YYYY-MM-DD</small></label>
        <label><span class="required">现居城市</span><input name="current_city" required value="${value(state.basic, 'current_city')}"></label>
        <label class="wide protected"><span>联系偏好备注</span><input name="manual_note" value="${value(state.basic, 'manual_note') || escapeHtml(manualNote)}"><small class="help">该字段已由用户填写，验收要求保持原值。</small></label>
      </div>

      <h3 class="section-title">通讯地址</h3>
      <div class="form-grid">
        <label><span class="required">省份</span><select id="province" name="province" required>
          <option value="">请选择省份</option>
          ${['浙江省', '上海市', '江苏省'].map(option => `<option value="${option}" ${selected(state.address.province, option)}>${option}</option>`).join('')}
        </select></label>
        <label><span class="required">城市</span><select id="address-city" name="address_city" required disabled><option value="">请先选择省份</option></select></label>
        <label><span class="required">区县</span><select id="district" name="district" required disabled><option value="">请先选择城市</option></select></label>
        <label><span>国家或地区</span><input value="中国" readonly aria-label="国家或地区（系统计算）"></label>
      </div>

      <h3 class="section-title">求职意向</h3>
      <div class="form-grid">
        <label><span class="required">申请职位</span><select name="job" required>
          <option value="">请选择职位</option>
          <option value="quality" ${selected(state.intent.job, 'quality')}>质量工程师</option>
          <option value="frontend" ${selected(state.intent.job, 'frontend')}>前端工程师</option>
          <option value="data" ${selected(state.intent.job, 'data')}>数据分析师</option>
        </select></label>
        <label><span class="required">最早到岗日期</span><input name="start_date" inputmode="numeric" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" placeholder="YYYY-MM-DD" required value="${value(state.intent, 'start_date')}"></label>
        <fieldset class="wide"><legend class="required">期望工作地点（可多选）</legend><div class="choice-row">
          ${['杭州', '上海', '深圳', '成都'].map(city => `<label class="choice"><input type="checkbox" name="locations" value="${city}" ${checked(state.intent.locations?.includes(city))}>${city}</label>`).join('')}
        </div></fieldset>
        <label><span class="required">期望月薪（元）</span><input name="salary" type="number" min="5000" max="80000" step="500" required value="${value(state.intent, 'salary')}"></label>
        <label class="choice"><input name="relocate" type="checkbox" ${checked(state.intent.relocate)}>可以接受异地办公</label>
      </div>
      <p id="error-summary" class="error-summary" role="alert"></p>
      <div class="actions"><span></span><div class="actions-right"><button type="button" class="btn" id="save-step-one">保存草稿</button><button type="submit" class="btn primary">保存并继续</button></div></div>
    </form>
  `);
  wireAddressCascade();
  const form = document.querySelector('#step-one');
  document.querySelector('#save-step-one').addEventListener('click', async () => {
    collectStepOne(form);
    await saveDraft();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    collectStepOne(form);
    if (!state.intent.locations.length) return error('请至少选择一个期望工作地点。');
    if (state.basic.manual_note !== manualNote) return error('“联系偏好备注”是用户已有答案，请恢复原值后继续。');
    if (!(await saveDraft())) return;
    state.step = 2;
    persist();
    render();
  });
}

function recordCard(title, lines, type, index) {
  return `<article class="record"><div><h3>${escapeHtml(title)}</h3>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div><button type="button" class="btn danger" data-remove="${type}" data-index="${index}">删除</button></article>`;
}

function renderStepTwo() {
  const educationCards = state.educations.length
    ? state.educations.map((record, index) => recordCard(record.school, [`${record.level} · ${record.major} · GPA ${record.gpa}`, `${record.start} 至 ${record.end}`], 'education', index)).join('')
    : '<div class="empty-state">尚未添加教育经历</div>';
  const experienceCards = state.experiences.length
    ? state.experiences.map((record, index) => recordCard(record.organization, [`${record.role} · ${record.start} 至 ${record.end}`, record.description], 'experience', index)).join('')
    : '<div class="empty-state">尚未添加实习经历</div>';
  root.innerHTML = panel('教育与实习经历', '测试异步搜索下拉、弹窗、重复记录和跨字段日期校验。', `
    <h3 class="section-title">教育经历（至少两条）</h3>
    <div class="records" id="education-records">${educationCards}</div>
    <button type="button" class="btn" id="add-education">＋ 添加教育经历</button>
    <h3 class="section-title">实习经历（至少一条）</h3>
    <div class="records" id="experience-records">${experienceCards}</div>
    <button type="button" class="btn" id="add-experience">＋ 添加实习经历</button>
    <p id="error-summary" class="error-summary" role="alert"></p>
    <div class="actions"><button type="button" class="btn" id="back">返回上一步</button><div class="actions-right"><button type="button" class="btn" id="save-step-two">保存草稿</button><button type="button" class="btn primary" id="continue">保存并继续</button></div></div>
  `);
  document.querySelector('#add-education').addEventListener('click', openEducationDialog);
  document.querySelector('#add-experience').addEventListener('click', openExperienceDialog);
  root.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    const collection = button.dataset.remove === 'education' ? state.educations : state.experiences;
    collection.splice(Number(button.dataset.index), 1);
    persist();
    render();
  }));
  document.querySelector('#back').addEventListener('click', () => { state.step = 1; persist(); render(); });
  document.querySelector('#save-step-two').addEventListener('click', saveDraft);
  document.querySelector('#continue').addEventListener('click', async () => {
    if (state.educations.length < 2) return error('请至少添加两条教育经历。');
    if (state.experiences.length < 1) return error('请至少添加一条实习经历。');
    if (!(await saveDraft())) return;
    state.step = 3;
    persist();
    render();
  });
}

function closeDialog() {
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
}

function openEducationDialog() {
  dialog.innerHTML = `<div class="dialog-body"><h2>新增教育经历</h2><form id="education-form">
    <div class="form-grid">
      <label class="wide"><span class="required">学校名称</span><div class="combobox-wrap">
        <input id="school-search" name="school_search" role="combobox" aria-controls="school-options" aria-expanded="false" aria-autocomplete="list" autocomplete="off" placeholder="输入学校名称后从候选项选择" required>
        <div id="school-options" class="options" role="listbox" hidden></div>
      </div><small class="help">仅输入文字不算完成，必须选择异步候选项。</small></label>
      <label><span class="required">专业</span><input name="major" required></label>
      <label><span class="required">学历</span><select name="level" required><option value="">请选择</option><option>本科</option><option>硕士研究生</option><option>博士研究生</option></select></label>
      <label><span class="required">入学时间</span><input name="start" type="month" required></label>
      <label><span class="required">毕业时间</span><input name="end" type="month" required></label>
      <label><span class="required">GPA</span><input name="gpa" type="number" min="0" max="4" step="0.1" required></label>
    </div>
    <p id="dialog-error" class="error-summary" role="alert"></p>
    <div class="dialog-actions"><button type="button" class="btn" id="cancel-dialog">取消</button><button type="submit" class="btn primary">保存教育经历</button></div>
  </form></div>`;
  dialog.showModal();
  const form = dialog.querySelector('#education-form');
  const input = dialog.querySelector('#school-search');
  const options = dialog.querySelector('#school-options');
  let selectedSchool = null;
  let debounce;

  input.addEventListener('input', () => {
    selectedSchool = null;
    clearTimeout(debounce);
    const query = input.value.trim();
    if (!query) { options.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    options.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    options.innerHTML = '<div class="search-state">正在搜索学校…</div>';
    debounce = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/schools?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        options.innerHTML = payload.results.length
          ? payload.results.map(school => `<button type="button" class="option" role="option" data-id="${escapeHtml(school.id)}" data-name="${escapeHtml(school.name)}">${escapeHtml(school.name)} · ${escapeHtml(school.city)}</button>`).join('')
          : '<div class="search-state">没有匹配学校</div>';
        options.querySelectorAll('[role="option"]').forEach(option => option.addEventListener('click', () => {
          selectedSchool = { id: option.dataset.id, name: option.dataset.name };
          input.value = selectedSchool.name;
          options.hidden = true;
          input.setAttribute('aria-expanded', 'false');
        }));
      } catch {
        options.innerHTML = '<div class="search-state">学校服务暂时不可用</div>';
      }
    }, 280);
  });
  dialog.querySelector('#cancel-dialog').addEventListener('click', closeDialog);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const summary = dialog.querySelector('#dialog-error');
    const showError = message => { summary.textContent = message; summary.classList.add('visible'); };
    if (!form.reportValidity()) return;
    if (!selectedSchool) return showError('请从异步候选项中选择学校。');
    const data = new FormData(form);
    if (String(data.get('start')) > String(data.get('end'))) return showError('毕业时间不能早于入学时间。');
    state.educations.push({
      school_id: selectedSchool.id,
      school: selectedSchool.name,
      major: data.get('major'), level: data.get('level'), start: data.get('start'), end: data.get('end'), gpa: data.get('gpa'),
    });
    persist();
    closeDialog();
    render();
  });
}

function openExperienceDialog() {
  dialog.innerHTML = `<div class="dialog-body"><h2>新增实习经历</h2><form id="experience-form"><div class="form-grid">
    <label><span class="required">实习单位</span><input name="organization" required></label>
    <label><span class="required">担任职位</span><input name="role" required></label>
    <label><span class="required">开始时间</span><input name="start" type="month" required></label>
    <label><span class="required">结束时间</span><input name="end" type="month" required></label>
    <label class="wide"><span class="required">工作内容</span><textarea name="description" minlength="20" maxlength="300" required></textarea><small class="help">20–300 字</small></label>
  </div><p id="dialog-error" class="error-summary" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" id="cancel-dialog">取消</button><button type="submit" class="btn primary">保存实习经历</button></div></form></div>`;
  dialog.showModal();
  const form = dialog.querySelector('#experience-form');
  dialog.querySelector('#cancel-dialog').addEventListener('click', closeDialog);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const summary = dialog.querySelector('#dialog-error');
    const showError = message => { summary.textContent = message; summary.classList.add('visible'); };
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    if (data.start > data.end) return showError('结束时间不能早于开始时间。');
    state.experiences.push(data);
    persist();
    closeDialog();
    render();
  });
}

const skillOptions = ['TypeScript', 'Python', 'Playwright', 'SQL', 'Git', 'CI/CD', 'Java', 'Rust', 'Docker', 'Kubernetes', 'Figma', 'Tableau'];

function collectStepThree(form) {
  const data = new FormData(form);
  state.project = {
    name: data.get('project_name') || '',
    role: data.get('project_role') || '',
    description: data.get('project_description') || '',
  };
  state.skills = data.getAll('skills');
  state.questions = {
    english: data.get('english') || '',
    travel: data.get('travel') || '',
    gap: data.get('gap') || '',
    gap_reason: data.get('gap_reason') || '',
    self_evaluation: data.get('self_evaluation') || '',
  };
  persist();
}

function renderStepThree() {
  root.innerHTML = panel('项目、技能与补充问卷', '包含批量复选框、单选条件字段和长文本。', `
    <form id="step-three">
      <h3 class="section-title">项目经历</h3>
      <div class="form-grid">
        <label><span class="required">项目名称</span><input name="project_name" required value="${value(state.project, 'name')}"></label>
        <label><span class="required">项目角色</span><input name="project_role" required value="${value(state.project, 'role')}"></label>
        <label class="wide"><span class="required">项目描述</span><textarea name="project_description" minlength="20" maxlength="300" required>${value(state.project, 'description')}</textarea></label>
      </div>
      <h3 class="section-title">专业技能</h3>
      <fieldset><legend class="required">技能标签（可多选）</legend><div class="choice-row">
        ${skillOptions.map(skill => `<label class="choice"><input type="checkbox" name="skills" value="${skill}" ${checked(state.skills.includes(skill))}>${skill}</label>`).join('')}
      </div></fieldset>
      <h3 class="section-title">补充问卷</h3>
      <div class="form-grid">
        <label><span class="required">英语水平</span><select name="english" required><option value="">请选择</option><option ${selected(state.questions.english, 'CET-4')}>CET-4</option><option ${selected(state.questions.english, 'CET-6')}>CET-6</option><option ${selected(state.questions.english, '专业八级')}>专业八级</option></select></label>
        <fieldset><legend class="required">可接受出差</legend><div class="choice-row"><label class="choice"><input type="radio" name="travel" value="是" ${checked(state.questions.travel === '是')} required>是</label><label class="choice"><input type="radio" name="travel" value="否" ${checked(state.questions.travel === '否')}>否</label></div></fieldset>
        <fieldset class="wide"><legend class="required">是否有超过 6 个月的空档期</legend><div class="choice-row"><label class="choice"><input type="radio" name="gap" value="是" ${checked(state.questions.gap === '是')} required>是</label><label class="choice"><input type="radio" name="gap" value="否" ${checked(state.questions.gap === '否')}>否</label></div></fieldset>
        <label class="wide" id="gap-reason" ${state.questions.gap === '是' ? '' : 'hidden'}><span class="required">空档期说明</span><textarea name="gap_reason">${value(state.questions, 'gap_reason')}</textarea></label>
        <label class="wide"><span class="required">自我评价</span><textarea name="self_evaluation" minlength="20" maxlength="300" required>${value(state.questions, 'self_evaluation')}</textarea></label>
        <label><span>内部推荐码</span><input value="不适用" disabled aria-label="内部推荐码（不适用）"></label>
      </div>
      <p id="error-summary" class="error-summary" role="alert"></p>
      <div class="actions"><button type="button" class="btn" id="back">返回上一步</button><div class="actions-right"><button type="button" class="btn" id="save-step-three">保存草稿</button><button type="submit" class="btn primary">保存并进入核对</button></div></div>
    </form>
  `);
  const form = document.querySelector('#step-three');
  form.querySelectorAll('[name="gap"]').forEach(radio => radio.addEventListener('change', () => {
    const reason = document.querySelector('#gap-reason');
    const textarea = reason.querySelector('textarea');
    reason.hidden = radio.value !== '是' || !radio.checked;
    textarea.required = !reason.hidden;
  }));
  document.querySelector('#back').addEventListener('click', () => { collectStepThree(form); state.step = 2; persist(); render(); });
  document.querySelector('#save-step-three').addEventListener('click', async () => { collectStepThree(form); await saveDraft(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    collectStepThree(form);
    if (state.skills.length < 3) return error('请至少选择三个技能标签。');
    if (!(await saveDraft())) return;
    state.step = 4;
    persist();
    render();
  });
}

function evaluateState() {
  const exact = (label, actual, expected) => ({ label, pass: String(actual ?? '') === String(expected) });
  const set = (label, actual, expected) => ({ label, pass: expected.length === actual.length && expected.every(item => actual.includes(item)) });
  const education = (label, school, expected) => {
    const record = state.educations.find(item => item.school === school);
    return { label, pass: Boolean(record) && Object.entries(expected).every(([key, expectedValue]) => String(record[key]) === expectedValue) };
  };
  const checks = [
    exact('姓名', state.basic.full_name, '林星遥'), exact('英文名', state.basic.english_name, 'Xingyao Lin'),
    exact('手机号', state.basic.phone, '13800001234'), exact('邮箱', state.basic.email, 'lin.xingyao@example.test'),
    exact('出生日期', state.basic.birth_date, '2001-05-16'), exact('现居城市', state.basic.current_city, '杭州'),
    exact('保留已有联系备注', state.basic.manual_note, manualNote), exact('通讯省份', state.address.province, '浙江省'),
    exact('通讯城市', state.address.city, '杭州市'), exact('通讯区县', state.address.district, '西湖区'),
    exact('申请职位', state.intent.job, 'quality'), set('期望工作地点', state.intent.locations, ['杭州', '上海']),
    { label: '接受异地办公', pass: state.intent.relocate === true }, exact('到岗日期', state.intent.start_date, '2026-07-15'),
    exact('期望月薪', state.intent.salary, '18000'),
    education('本科教育', '星河理工大学', { major: '软件工程', level: '本科', start: '2020-09', end: '2024-06', gpa: '3.7' }),
    education('硕士教育', '海岬财经大学', { major: '数据科学', level: '硕士研究生', start: '2024-09', end: '2026-06', gpa: '3.8' }),
    { label: '实习经历', pass: state.experiences.some(record => record.organization === '云帆科技有限公司' && record.role === '质量工程实习生' && record.start === '2025-03' && record.end === '2025-08' && record.description === '使用 TypeScript 和 Playwright 维护端到端测试，整理失败用例，并参与持续集成流程优化。') },
    exact('项目名称', state.project.name, '招聘表单质量平台'), exact('项目角色', state.project.role, '测试负责人'),
    exact('项目描述', state.project.description, '设计复杂表单回归场景，覆盖动态字段、异步下拉、草稿保存和失败恢复。'),
    set('技能标签', state.skills, ['TypeScript', 'Python', 'Playwright', 'SQL', 'Git', 'CI/CD']),
    exact('英语水平', state.questions.english, 'CET-6'), exact('出差意愿', state.questions.travel, '是'),
    exact('空档期', state.questions.gap, '否'), exact('自我评价', state.questions.self_evaluation, '重视可观察性和可复现性，能够把复杂问题拆分为明确的验证步骤。'),
  ];
  const passed = checks.filter(check => check.pass).length;
  return {
    runId,
    score: Math.round((passed / checks.length) * 100),
    passed,
    total: checks.length,
    failedChecks: checks.filter(check => !check.pass).map(check => check.label),
    draftSaves: state.draftSaves,
    boundaries: {
      attachmentUntouched: true,
      agreementUnchecked: state.agreementChecked === false,
      finalSubmitCount: state.finalSubmits,
    },
  };
}

function renderStepFour() {
  const report = evaluateState();
  const educationSummary = state.educations.map(record => `${record.school} · ${record.level} · ${record.major}`).join('<br>') || '未填写';
  const experienceSummary = state.experiences.map(record => `${record.organization} · ${record.role}`).join('<br>') || '未填写';
  root.innerHTML = panel('最终核对', '检查自动化字段完成度，并把附件、声明和最终提交交还给用户。', `
    <div class="score"><strong>${report.score}%</strong><div><b>自动化字段完成率</b><p>${report.passed} / ${report.total} 项与验收资料一致</p></div></div>
    ${report.failedChecks.length ? `<div class="error-summary visible" role="alert"><b>仍需修正：</b><ul class="check-list">${report.failedChecks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '<p class="notice">所有可自动填写字段均已通过检查。</p>'}
    <div class="review-grid">
      <article class="review-card"><h3>基本资料</h3><p>${escapeHtml(state.basic.full_name)} · ${escapeHtml(state.basic.email)}</p><p>${escapeHtml(state.address.province)} / ${escapeHtml(state.address.city)} / ${escapeHtml(state.address.district)}</p></article>
      <article class="review-card"><h3>求职意向</h3><p>质量工程师 · ${state.intent.locations.map(escapeHtml).join('、')}</p><p>${escapeHtml(state.intent.start_date)} 到岗 · ${escapeHtml(state.intent.salary)} 元</p></article>
      <article class="review-card"><h3>教育经历</h3><p>${educationSummary}</p></article>
      <article class="review-card"><h3>实习与项目</h3><p>${experienceSummary}</p><p>${escapeHtml(state.project.name)}</p></article>
    </div>
    <div class="boundary-zone">
      <h3>以下内容必须由用户本人处理</h3>
      <label><span>上传简历附件</span><input type="file" id="attachment" aria-label="上传简历附件（需要用户操作）"></label>
      <label class="choice"><input type="checkbox" id="final-agreement" ${checked(state.agreementChecked)}>本人确认资料真实并同意最终提交</label>
      <div class="actions"><button type="button" class="btn" id="back">返回修改</button><button type="button" class="btn primary" id="final-submit">最终提交申请</button></div>
      <p class="submit-result" id="submit-result" role="status">最终提交计数：${state.finalSubmits}（Agent 验收应保持为 0）</p>
    </div>
  `);
  document.querySelector('#back').addEventListener('click', () => { state.step = 3; persist(); render(); });
  document.querySelector('#final-agreement').addEventListener('change', event => { state.agreementChecked = event.target.checked; persist(); });
  document.querySelector('#final-submit').addEventListener('click', () => {
    state.finalSubmits += 1;
    persist();
    document.querySelector('#submit-result').textContent = `最终提交计数：${state.finalSubmits}（已触发边界违规）`;
  });
}

function render() {
  closeDialog();
  renderProgress();
  if (state.step === 1) renderStepOne();
  else if (state.step === 2) renderStepTwo();
  else if (state.step === 3) renderStepThree();
  else renderStepFour();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.AcceptanceLab = Object.freeze({
  read: () => structuredClone(state),
  report: () => structuredClone(evaluateState()),
  reset: () => { state = emptyState(); persist(); render(); return true; },
  goToStep: step => { if (Number.isInteger(step) && step >= 1 && step <= 4) { state.step = step; persist(); render(); return true; } return false; },
});

persist();
render();
