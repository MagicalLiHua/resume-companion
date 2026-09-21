import { createApp, h, reactive } from 'vue';
import {
  ElDatePicker,
  ElCascader,
  ElSelect,
  ElOption,
  ElForm,
  ElFormItem,
  ElButton,
} from 'element-plus';
import 'element-plus/dist/index.css';
const state = { family: 'element', values: {}, changes: {}, clicks: 0, ready: false };
window.fixtureOracle = () => JSON.parse(JSON.stringify(state));
document.addEventListener('click', () => state.clicks++);
const paths = [
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
const delay = Number(new URL(location.href).searchParams.get('delay') || 800);
createApp({
  setup() {
    const values = reactive({});
    const put = (name, v) => {
      state.values[name] = v;
      state.changes[name] = (state.changes[name] || 0) + 1;
      values[name] = v;
    };
    const row = (name, control) => h(ElFormItem, { label: name }, () => control);
    const date = (name, props = {}) =>
      row(
        name,
        h(ElDatePicker, {
          modelValue: values[name] || '',
          'onUpdate:modelValue': (v) => put(name, v),
          type: 'date',
          valueFormat: 'YYYY-MM-DD',
          defaultValue: new Date(2026, 8, 19),
          ...props,
        }),
      );
    const cascade = (name, props = {}) =>
      row(
        name,
        h(ElCascader, {
          modelValue: values[name],
          'onUpdate:modelValue': (v) => put(name, v),
          options: three,
          ...props,
        }),
      );
    return () =>
      h('section', { 'aria-label': '组件测试' }, [
        h(ElForm, { labelWidth: 160 }, () => [
          date('输入日期', { placeholder: 'YYYY-MM-DD' }),
          date('只读日期', { editable: false }),
          date('入学月份', { type: 'month', valueFormat: 'YYYY-MM', editable: false }),
          date('格式日期', { format: 'YYYY年MM月DD日', editable: false }),
          date('禁用日期', { disabled: true }),
          date('限制日期', { editable: false, disabledDate: (d) => d < new Date(2020, 0, 1) }),
          cascade('两层地址', { options: paths }),
          cascade('三层地址'),
          cascade('悬停地址', { props: { expandTrigger: 'hover' } }),
          cascade('父级地址', { props: { checkStrictly: true } }),
          cascade('叶子回显', { showAllLevels: false }),
          cascade('异步地址', {
            options: [{ value: 'p', label: '浙江省', leaf: false }],
            props: {
              lazy: true,
              lazyLoad: (node, resolve) =>
                setTimeout(() => resolve([{ value: 'hz', label: '杭州市', leaf: true }]), delay),
            },
          }),
          row(
            '虚拟选项',
            h(
              ElSelect,
              { modelValue: values['虚拟选项'], 'onUpdate:modelValue': (v) => put('虚拟选项', v) },
              () =>
                Array.from({ length: 200 }, (_, i) =>
                  h(ElOption, { value: String(i), label: `候选${String(i).padStart(3, '0')}` }),
                ),
            ),
          ),
          row(
            '多选技能',
            h(
              ElSelect,
              {
                multiple: true,
                modelValue: values['多选技能'] || [],
                'onUpdate:modelValue': (v) => put('多选技能', v),
              },
              () => ['TypeScript', 'Python', 'SQL'].map((v) => h(ElOption, { value: v, label: v })),
            ),
          ),
          date('经历范围', { type: 'daterange', editable: false }),
          row(
            '工作开始',
            h('input', {
              'aria-label': '工作开始',
              type: 'month',
              value: values['工作开始'] || '',
              onInput: (e) => put('工作开始', e.target.value),
            }),
          ),
          row(
            '工作结束',
            h('input', {
              'aria-label': '工作结束',
              type: 'month',
              disabled: Boolean(values['工作至今']),
              value: values['工作结束'] || '',
              onInput: (e) => put('工作结束', e.target.value),
            }),
          ),
          row(
            '工作至今',
            h('input', {
              'aria-label': '工作至今',
              type: 'checkbox',
              checked: Boolean(values['工作至今']),
              onChange: (e) => {
                put('工作至今', e.target.checked);
                if (e.target.checked) put('工作结束', '');
              },
            }),
          ),
          h(
            ElButton,
            { onClick: () => (state.changes.save = (state.changes.save || 0) + 1) },
            () => '保存',
          ),
        ]),
      ]);
  },
}).mount('#root');
requestAnimationFrame(() => (state.ready = true));
