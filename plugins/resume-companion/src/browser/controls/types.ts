export interface ControlOption {
  token: string;
  label: string;
  disabled: boolean;
  selected: boolean;
  branch: boolean;
  loading: boolean;
  check: string | null;
  leaf: boolean;
}
export interface CalendarCell {
  token: string;
  text: string;
  title: string;
  disabled: boolean;
  inView: boolean;
  selected: boolean;
  month: number;
}
export interface CalendarPanel {
  mode: 'year' | 'month' | 'date' | 'decade';
  year: number;
  month: number;
  header: string;
  cells: CalendarCell[];
  yearButton: string | null;
  monthButton: string | null;
  prev: string | null;
  next: string | null;
  prevMonth: string | null;
  nextMonth: string | null;
}
export interface ControlState {
  policyContext?:string;
  guopinPath?: {tabs:ControlOption[];parents:ControlOption[];leaves:ControlOption[];path:string[];close:string|null};
  family: 'guopin-certificates' | 'guopin-path' | 'my97-date' | 'job51-autocomplete' | 'dayee-dictionary' | 'ant-radio' | 'phoenix-autocomplete' | 'phoenix-select' | 'phoenix-date' | 'phoenix-radio' | 'native' | 'ant-date' | 'el-date' | 'ud-date' | 'sd-date' | 'ant-path' | 'el-path' | 'ant-select' | 'el-select' | 'sd-select' | 'ud-select';
  editing?: boolean;
  nativeOptions?: Array<{label:string;value:string;disabled:boolean}>;
  companion?: {input:string|null;value:string;otherLabel:string};
  dictionary?: {search:string|null;cancel:string|null};
  document: string;
  root: string;
  input: string;
  trigger: string;
  inputs: Array<{
    token: string;
    value: string;
    type: string;
    readonly: boolean;
    placeholder: string;
  }>;
  label: string;
  scope: string;
  identity: string;
  splitDate?: {
    parts: Array<{ label: string; identity: string; value: string; disabled: boolean; invalid: boolean; endpoint: 'start' | 'end'; part: 'year' | 'month' }>;
    current: { token: string; checked: boolean; disabled: boolean } | null;
  };
  value: string;
  tags: string[];
  disabled: boolean;
  readonly: boolean;
  constraints: {
    min: string | null;
    max: string | null;
    step: string | null;
    pattern: string | null;
    minlength: number | null;
    maxlength: number | null;
  };
  invalid: boolean;
  checked: boolean | null;
  popupToken: string | null;
  popupReady: boolean;
  expanded: boolean;
  activeEndpoint?: number;
  calendar: CalendarPanel[];
  precision: 'date' | 'month' | null;
  hasTime: boolean;
  columns: ControlOption[][];
  options: ControlOption[];
  confirm: string | null;
  clear: string | null;
  dismiss?: string | null;
  custom?: {entry:string|null;input:string|null;confirm:string|null};
  pendingSelection?: {search:string|null;selected:string[];options:ControlOption[]};
  multiple: boolean;
  opaqueSelection: boolean;
  scroll: { token: string; top: number; height: number; total: number } | null;
}
