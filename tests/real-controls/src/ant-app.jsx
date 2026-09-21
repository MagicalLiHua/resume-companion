import React, { useState, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';

export function mount({ DatePicker, Cascader, Select, Form, Input, Button }, date, family) {
  const state = { family, values: {}, changes: {}, clicks: 0, ready: false, triggers: {} };
  window.fixtureOracle = () => JSON.parse(JSON.stringify(state));
  document.addEventListener('click', (event) => {
    state.clicks++;
    if (event.target.closest('.ant-select-selector')) {
      const name = event.target
        .closest('.ant-form-item')
        ?.querySelector('label')
        ?.textContent.trim();
      if (name) state.triggers[name] = (state.triggers[name] || 0) + 1;
    }
  });
  const delay = Number(new URL(location.href).searchParams.get('delay') || 0);
  const options = [
    { value: 'a', label: '省甲', children: [{ value: 'aa', label: '同名区' }] },
    { value: 'b', label: '省乙', children: [{ value: 'bb', label: '同名区' }] },
  ];
  const three = [
    {
      value: 'north',
      label: '北京市',
      children: [
        { value: 'city', label: '市辖区', children: [{ value: 'district', label: '海淀区' }] },
      ],
    },
  ];
  function App() {
    const [values, setValues] = useState({ 折叠多选: ['TypeScript', 'Python'] });
    useLayoutEffect(() => {
      state.values = { ...values, 回滚日期: '2025-01-01' };
      state.ready = true;
    }, [values]);
    const [lazy, setLazy] = useState([{ value: 'p', label: '浙江省', isLeaf: false }]);
    const put = (name, value) => {
      state.changes[name] = (state.changes[name] || 0) + 1;
      setValues((v) => ({ ...v, [name]: value }));
    };
    const dateField = (name, extra = {}) => (
      <Form.Item label={name} key={name} htmlFor={name}>
        <DatePicker
          id={name}
          value={values[name] ? date(values[name]) : null}
          defaultPickerValue={date('2026-09-19')}
          onChange={(value) =>
            put(name, value?.format(extra.picker === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD') || '')
          }
          {...extra}
        />
      </Form.Item>
    );
    return (
      <section aria-label="组件测试">
        <Form layout="vertical">
          {dateField('输入日期', { placeholder: 'YYYY-MM-DD' })}
          {dateField('只读日期', { inputReadOnly: true })}
          {dateField('入学月份', { picker: 'month', inputReadOnly: true })}
          {dateField(
            '确认日期',
            family === 'ant5'
              ? { inputReadOnly: true, needConfirm: true }
              : { inputReadOnly: true, showTime: true },
          )}
          {dateField('格式日期', { format: 'YYYY年MM月DD日', inputReadOnly: true })}
          {dateField('禁用日期', { disabled: true })}
          {dateField('限制日期', {
            inputReadOnly: true,
            disabledDate: (d) => d.isBefore(date('2020-01-01'), 'day'),
          })}
          <Form.Item label="回滚日期" htmlFor="rollback">
            <DatePicker
              id="rollback"
              value={date('2025-01-01')}
              defaultPickerValue={date('2026-09-19')}
              onChange={() => {
                state.changes['回滚日期'] = (state.changes['回滚日期'] || 0) + 1;
              }}
            />
          </Form.Item>
          <Form.Item label="两层地址" htmlFor="two">
            <Cascader
              id="two"
              options={options}
              value={values['两层地址']}
              onChange={(v) => put('两层地址', v)}
            />
          </Form.Item>
          <Form.Item label="三层地址" htmlFor="three">
            <Cascader
              id="three"
              options={three}
              value={values['三层地址']}
              onChange={(v) => put('三层地址', v)}
            />
          </Form.Item>
          <Form.Item label="悬停地址" htmlFor="hover">
            <Cascader
              id="hover"
              options={three}
              expandTrigger="hover"
              value={values['悬停地址']}
              onChange={(v) => put('悬停地址', v)}
            />
          </Form.Item>
          <Form.Item label="父级地址" htmlFor="parent">
            <Cascader
              id="parent"
              options={three}
              changeOnSelect
              value={values['父级地址']}
              onChange={(v) => put('父级地址', v)}
            />
          </Form.Item>
          <Form.Item label="叶子回显" htmlFor="leaf">
            <Cascader
              id="leaf"
              options={three}
              displayRender={(labels) => labels.at(-1)}
              value={values['叶子回显']}
              onChange={(v) => put('叶子回显', v)}
            />
          </Form.Item>
          <Form.Item label="异步地址" htmlFor="lazy">
            <Cascader
              id="lazy"
              options={lazy}
              loadData={(selected) => {
                const last = selected.at(-1);
                last.loading = true;
                setLazy([...lazy]);
                setTimeout(() => {
                  last.loading = false;
                  last.children = [{ value: 'hz', label: '杭州市' }];
                  setLazy([...lazy]);
                }, delay || 800);
              }}
              value={values['异步地址']}
              onChange={(v) => put('异步地址', v)}
            />
          </Form.Item>
          <Form.Item label="虚拟选项" htmlFor="virtual">
            <Select
              id="virtual"
              style={{ width: 300 }}
              options={Array.from({ length: 200 }, (_, i) => ({
                value: String(i),
                label: `候选${String(i).padStart(3, '0')}`,
              }))}
              value={values['虚拟选项']}
              onChange={(v) => put('虚拟选项', v)}
            />
          </Form.Item>
          <Form.Item label="多选技能" htmlFor="multi">
            <Select
              id="multi"
              mode="multiple"
              style={{ width: 300 }}
              options={['TypeScript', 'Python', 'SQL'].map((v) => ({ value: v, label: v }))}
              value={values['多选技能'] || []}
              onChange={(v) => put('多选技能', v)}
            />
          </Form.Item>
          <Form.Item label="折叠多选" htmlFor="collapsed">
            <Select
              id="collapsed"
              mode="multiple"
              maxTagCount={1}
              style={{ width: 300 }}
              value={values['折叠多选']}
              options={['TypeScript', 'Python', 'SQL'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => put('折叠多选', v)}
            />
          </Form.Item>
          <Form.Item label="经历范围">
            <DatePicker.RangePicker
              inputReadOnly
              value={values['经历范围']?.map((value) => date(value))}
              defaultPickerValue={[date('2026-09-19'), date('2026-10-19')]}
              onChange={(v) => put('经历范围', v?.map((d) => d.format('YYYY-MM-DD')) || [])}
            />
          </Form.Item>
          <Form.Item label="工作开始" htmlFor="job-start">
            <input
              id="job-start"
              type="month"
              value={values['工作开始'] || ''}
              onChange={(e) => put('工作开始', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="工作结束" htmlFor="job-end">
            <input
              id="job-end"
              type="month"
              disabled={Boolean(values['工作至今'])}
              value={values['工作结束'] || ''}
              onChange={(e) => put('工作结束', e.target.value)}
            />
          </Form.Item>
          <Form.Item label="工作至今" htmlFor="job-current">
            <input
              id="job-current"
              type="checkbox"
              checked={Boolean(values['工作至今'])}
              onChange={(e) => {
                put('工作至今', e.target.checked);
                if (e.target.checked) put('工作结束', '');
              }}
            />
          </Form.Item>
          <Form.Item label="普通金额" htmlFor="amount">
            <Input
              id="amount"
              value={values['普通金额'] || '1000'}
              onChange={(e) => put('普通金额', e.target.value)}
            />
          </Form.Item>
          <Button
            onClick={() => {
              state.changes.save = (state.changes.save || 0) + 1;
            }}
          >
            保存
          </Button>
        </Form>
      </section>
    );
  }
  createRoot(document.getElementById('root')).render(<App />);
}
