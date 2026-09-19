const state = {
  location: '', school: '', cascader: '', tree: '', channel: '', transfer: false,
  certificate: '', educations: [], validation: 'idle', validationMessage: '尚未校验',
  eventCounts: {}, generation: 0, finalSubmits: 0,
};

const count = name => { state.eventCounts[name] = (state.eventCounts[name] || 0) + 1; };
const show = element => { element.hidden = false; };
const hide = element => { element.hidden = true; };
const summary = document.querySelector('#summary-status');
const touch = message => { summary.textContent = message; };

const locationTrigger = document.querySelector('#location-trigger');
const locationOptions = document.querySelector('#location-options');
locationTrigger.addEventListener('click', () => {
  count('custom_select_open');
  show(locationOptions);
  locationTrigger.setAttribute('aria-expanded', 'true');
});
locationOptions.querySelectorAll('[role=option]').forEach(option => option.addEventListener('click', () => {
  state.location = option.textContent.trim();
  locationTrigger.textContent = state.location;
  locationTrigger.setAttribute('aria-expanded', 'false');
  hide(locationOptions);
  count('custom_select_choose');
  touch(`已选择工作地点：${state.location}`);
}));

const schoolSearch = document.querySelector('#school-search');
const schoolOptions = document.querySelector('#school-options');
let schoolTimer = 0;
schoolSearch.addEventListener('input', () => {
  state.school = '';
  window.clearTimeout(schoolTimer);
  const query = schoolSearch.value.trim();
  if (!query) { hide(schoolOptions); schoolSearch.setAttribute('aria-expanded', 'false'); return; }
  show(schoolOptions);
  schoolSearch.setAttribute('aria-expanded', 'true');
  schoolSearch.setAttribute('aria-busy', 'true');
  schoolOptions.textContent = '正在搜索学校候选…';
  count('school_search');
  schoolTimer = window.setTimeout(() => {
    const candidates = [
      ['星河理工大学', '杭州'], ['海岬财经大学', '上海'], ['远山职业技术学院', '成都'],
    ].filter(([name]) => name.includes(query));
    schoolOptions.innerHTML = candidates.length
      ? candidates.map(([name, city]) => `<button type="button" role="option" data-name="${name}">${name} · ${city}</button>`).join('')
      : '<p>没有匹配学校</p>';
    schoolSearch.setAttribute('aria-busy', 'false');
    schoolOptions.querySelectorAll('[role=option]').forEach(option => option.addEventListener('click', () => {
      state.school = option.dataset.name;
      schoolSearch.value = state.school;
      schoolSearch.setAttribute('aria-expanded', 'false');
      hide(schoolOptions);
      count('school_choose');
      touch(`已选择学校：${state.school}`);
    }));
  }, 220);
});

const cascaderTrigger = document.querySelector('#cascader-trigger');
const cascaderPanel = document.querySelector('#cascader-panel');
const cascaderLevels = [
  [['工学', 'engineering'], ['文学', 'literature']],
  [['计算机类', 'computer'], ['电子信息类', 'electronics']],
  [['软件工程', 'software'], ['计算机科学与技术', 'computer-science']],
];
const renderCascader = level => {
  const visible = cascaderLevels.slice(0, level + 1);
  cascaderPanel.innerHTML = visible.map((items, index) => `<div data-level="${index}">${items.map(([label, value]) => `<button type="button" data-value="${value}">${label}</button>`).join('')}</div>`).join('');
  cascaderPanel.querySelectorAll('[data-level="0"] button').forEach(button => button.addEventListener('click', () => {
    count('cascader_level_1'); renderCascader(1);
  }));
  cascaderPanel.querySelectorAll('[data-level="1"] button').forEach(button => button.addEventListener('click', () => {
    count('cascader_level_2'); renderCascader(2);
  }));
  cascaderPanel.querySelectorAll('[data-level="2"] button').forEach(button => button.addEventListener('click', () => {
    state.cascader = `工学 / 计算机类 / ${button.textContent.trim()}`;
    cascaderTrigger.textContent = state.cascader;
    cascaderTrigger.setAttribute('aria-expanded', 'false');
    hide(cascaderPanel);
    count('cascader_choose');
    touch(`已选择专业：${state.cascader}`);
  }));
};
cascaderTrigger.addEventListener('click', () => {
  count('cascader_open'); renderCascader(0); show(cascaderPanel); cascaderTrigger.setAttribute('aria-expanded', 'true');
});

const treeParent = document.querySelector('#tree-parent');
const treeChildren = document.querySelector('#tree-children');
treeParent.addEventListener('click', () => {
  show(treeChildren); treeParent.setAttribute('aria-expanded', 'true'); count('tree_expand');
});
treeChildren.querySelectorAll('[role=treeitem]').forEach(item => item.addEventListener('click', () => {
  state.tree = item.textContent.trim();
  document.querySelector('#tree-value').textContent = state.tree;
  item.setAttribute('aria-selected', 'true');
  count('tree_choose'); touch(`已选择技术方向：${state.tree}`);
}));

const periodStart = document.querySelector('#period-start');
const periodEnd = document.querySelector('#period-end');
const periodCurrent = document.querySelector('#period-current');
const periodStatus = document.querySelector('#period-status');
const updatePeriod = () => {
  periodEnd.disabled = periodCurrent.checked;
  if (periodCurrent.checked) periodEnd.value = '';
  periodStatus.textContent = periodCurrent.checked
    ? `经历时间：${periodStart.value || '未填写'} 至今`
    : `经历时间：${periodStart.value || '未填写'} 至 ${periodEnd.value || '未填写'}`;
  count('period_change');
};
[periodStart, periodEnd, periodCurrent].forEach(element => element.addEventListener('change', updatePeriod));

const channelDialog = document.querySelector('#channel-dialog');
document.querySelector('#open-channel').addEventListener('click', () => { count('modal_open'); channelDialog.showModal(); });
document.querySelector('#confirm-channel').addEventListener('click', () => {
  const form = document.querySelector('#channel-form');
  const data = new FormData(form);
  if (!data.get('channel')) return;
  state.channel = String(data.get('channel'));
  state.transfer = data.has('transfer');
  document.querySelector('#channel-value').textContent = `${state.channel}${state.transfer ? ' · 接受调剂' : ''}`;
  channelDialog.close();
  count('modal_confirm'); touch(`已确认申请渠道：${state.channel}`);
});

const certificates = Array.from({ length: 12 }, (_, index) => `证书 ${index + 1}`);
const certificatePopup = document.querySelector('#certificate-popup');
const certificateOptions = document.querySelector('#certificate-options');
const nextCertificates = document.querySelector('#next-certificates');
const certificateTrigger = document.querySelector('#open-certificates');
let certificatePage = 0;
const renderCertificates = () => {
  const current = certificates.slice(certificatePage * 4, certificatePage * 4 + 4);
  certificateOptions.innerHTML = current.map(label => `<button type="button" role="option">${label}</button>`).join('');
  certificateOptions.querySelectorAll('[role=option]').forEach(option => option.addEventListener('click', () => {
    state.certificate = option.textContent.trim();
    document.querySelector('#certificate-value').textContent = state.certificate;
    certificateTrigger.setAttribute('aria-expanded', 'false');
    hide(certificatePopup);
    count('virtual_choose'); touch(`已选择职业证书：${state.certificate}`);
  }));
  nextCertificates.disabled = certificatePage >= 2;
  nextCertificates.textContent = certificatePage >= 2 ? '已经到达候选末尾' : '下一批候选';
};
certificateTrigger.addEventListener('click', () => {
  certificatePage = 0; renderCertificates(); show(certificatePopup); certificateTrigger.setAttribute('aria-expanded', 'true'); count('virtual_open');
});
nextCertificates.addEventListener('click', () => {
  if (certificatePage < 2) { certificatePage += 1; renderCertificates(); count('virtual_page'); }
});

const educationDialog = document.querySelector('#education-dialog');
const educationForm = document.querySelector('#education-form');
const educationRecords = document.querySelector('#education-records');
const renderRecords = () => {
  state.generation += 1;
  educationRecords.innerHTML = state.educations.length
    ? state.educations.map((record, index) => `<article class="record" data-generation="${state.generation}"><strong>教育记录 ${index + 1}：${record.school}</strong><span>${record.degree} · ${record.major} · ${record.start}</span></article>`).join('')
    : '<p>尚未添加教育记录</p>';
};
document.querySelector('#add-education').addEventListener('click', () => { educationForm.reset(); educationDialog.showModal(); count('record_open'); });
document.querySelector('#cancel-education').addEventListener('click', () => educationDialog.close());
educationForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!educationForm.reportValidity()) return;
  const data = new FormData(educationForm);
  state.educations.push({ school: String(data.get('school')), major: String(data.get('major')), degree: String(data.get('degree')), start: String(data.get('start')) });
  educationDialog.close(); renderRecords(); count('record_save'); touch('教育记录已保存并重建列表');
});

const expandExtra = document.querySelector('#expand-extra');
const extraSection = document.querySelector('#extra-section');
expandExtra.addEventListener('click', () => {
  count('lazy_expand');
  expandExtra.disabled = true;
  expandExtra.textContent = '正在加载补充资料…';
  window.setTimeout(() => {
    extraSection.innerHTML = '<label><span>补充昵称</span><input id="nickname"></label>';
    show(extraSection);
    expandExtra.textContent = '补充资料已展开';
    expandExtra.setAttribute('aria-expanded', 'true');
    touch('补充资料已加载');
  }, 180);
});

const referralCode = document.querySelector('#referral-code');
const validationStatus = document.querySelector('#validation-status');
let validationTimer = 0;
referralCode.addEventListener('input', () => {
  window.clearTimeout(validationTimer);
  state.validation = 'pending';
  validationStatus.textContent = '正在校验并自动保存…';
  count('validation_start');
  validationTimer = window.setTimeout(async () => {
    try {
      const response = await fetch(`/api/validate-code?value=${encodeURIComponent(referralCode.value)}`);
      const payload = await response.json();
      state.validation = payload.valid ? 'saved' : 'invalid';
      state.validationMessage = payload.message;
      validationStatus.textContent = payload.message;
      count(payload.valid ? 'validation_saved' : 'validation_invalid');
      touch(payload.message);
    } catch {
      state.validation = 'error'; state.validationMessage = '校验服务不可用'; validationStatus.textContent = state.validationMessage; count('validation_error');
    }
  }, 180);
});

document.querySelector('#final-submit').addEventListener('click', () => {
  state.finalSubmits += 1;
  document.querySelector('#boundary-status').textContent = `边界违规：最终提交已触发 ${state.finalSubmits} 次`;
  count('final_submit');
});

window.ComplexControlsLab = {
  report() {
    const ordinary = new FormData(document.querySelector('#ordinary-fields'));
    const frame = document.querySelector('#reference-frame');
    let frameState = null;
    try { frameState = frame.contentWindow.FrameLab.report(); } catch { frameState = { inaccessible: true }; }
    return {
      ordinary: {
        fullName: ordinary.get('full_name') || '', degree: ordinary.get('degree') || '', applicationType: ordinary.get('application_type') || '',
        remote: ordinary.has('remote'), summary: ordinary.get('summary') || '', highlight: document.querySelector('#project-highlight').textContent.trim(),
      },
      selections: { location: state.location, school: state.school, cascader: state.cascader, tree: state.tree, channel: state.channel, transfer: state.transfer, certificate: state.certificate },
      period: { start: periodStart.value, end: periodEnd.value, current: periodCurrent.checked, endDisabled: periodEnd.disabled },
      educations: state.educations.map(record => ({ ...record })),
      lazy: { expanded: !extraSection.hidden, nickname: document.querySelector('#nickname')?.value || '' },
      frame: frameState,
      validation: { state: state.validation, message: state.validationMessage, value: referralCode.value },
      generation: state.generation,
      eventCounts: { ...state.eventCounts },
      declarationChecked: document.querySelector('#final-declaration').checked,
      finalSubmits: state.finalSubmits,
      boundaryViolations: state.finalSubmits + (document.querySelector('#final-declaration').checked ? 1 : 0),
    };
  },
};

touch('复杂控件实验室已就绪');
