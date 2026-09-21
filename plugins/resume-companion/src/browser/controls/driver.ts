import { createDomFormRuntime } from '../form-dom.js';
import { createControlDom, waitControlMutation } from './dom.js';
import { ControlFailure, ControlTransaction, fencedLocatorAction } from './transaction.js';
import { parseCalendarValue, readCalendarText, sameValue, samePath, sameSet, datePartNumber } from './verify.js';
import type { ControlState } from './types.js';
import type { TargetSpec } from '../form-engine.js';
import {preparePointerTarget} from '../pointer-target.js';
import {manualReason} from '../manual-policy.js';
type Any = any;
const readDom = new Function(
  'spec',
  `return (${createControlDom.toString()})((${createDomFormRuntime.toString()})()).read(spec);`,
) as (spec: TargetSpec) => Any;
const getElement = new Function(
  'id',
  `return (${createControlDom.toString()})((${createDomFormRuntime.toString()})()).element(id);`,
) as (id: string) => HTMLElement | null;
const beginDictionary = new Function('id',`return (${createControlDom.toString()})((${createDomFormRuntime.toString()})()).beginDictionary(id);`) as (id:string)=>boolean;
export interface ControlContext {
  transaction?: ControlTransaction;
  pageId: number;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}
export class ControlDriver {
  readonly tx: ControlTransaction;
  private frame: Any;
  private popupToken: string | undefined;
  private document: string | undefined;
  readonly calendarProbes:Array<{ready:boolean;expanded:boolean;mode:string|undefined;cells:number;stable:boolean}>=[];
  private readonly url: string;
  constructor(
    private readonly page: Any,
    private readonly spec: TargetSpec,
    context: ControlContext,
  ) {
    this.tx = context.transaction ?? new ControlTransaction(context.signal, context.timeoutMs);
    this.url = page.url();
  }
  async read(): Promise<ControlState> {
    this.tx.check();
    if (this.page.url() !== this.url) throw new ControlFailure('page_changed', this.tx.phase);
    const frames = this.frame ? [this.frame] : this.page.frames();
    const found: Array<{ frame: Any; state: ControlState }> = [];
    for (const [index, frame] of frames.entries()) {
      if (!this.frame && this.spec.frame !== undefined && index !== this.spec.frame) continue;
      let state;
      try {
        state = await frame.evaluate(readDom, {
          ...this.spec,
          ...(this.popupToken ? { popupToken: this.popupToken } : {}),
        });
      } catch (error) {
        throw new ControlFailure(
          /ambiguous/.test(String(error)) ? 'target_ambiguous' : 'target_unresolved',
          this.tx.phase,
        );
      }
      if (state) found.push({ frame, state });
    }
    if (found.length !== 1)
      throw new ControlFailure(
        found.length ? 'target_ambiguous' : 'target_unresolved',
        this.tx.phase,
      );
    const { frame, state } = found[0]!;
    if(manualReason(state))throw new ControlFailure('manual_boundary','control_preflight');
    this.frame = frame;
    if (this.document && state.document !== this.document)
      throw new ControlFailure('page_changed', this.tx.phase);
    this.tx.wake = async () => {
      this.tx.check();
      await frame.evaluate(
        waitControlMutation,
        [state.root, ...(state.popupToken ? [state.popupToken] : [])],
        Math.min(60, this.tx.deadline - Date.now()),
      );
      this.tx.check();
    };
    this.document = state.document;
    if (state.popupToken) this.popupToken = state.popupToken;
    return state;
  }
  async act(
    id: string | null,
    kind: 'click' | 'hover' | 'fill' | 'press' | 'blur' | 'scroll' = 'click',
    value?: string | number,
    expectedOption?: string,
  ): Promise<void> {
    this.tx.check();
    if (!id) throw new ControlFailure('unsupported_component', this.tx.phase);
    const js = await this.frame.evaluateHandle(getElement, id);
    const handle = js.asElement();
    if (!handle) {
      await js.dispose();
      throw new ControlFailure('target_unresolved', this.tx.phase);
    }
    try {
      if (
        await handle.evaluate((el: HTMLElement) =>
          Boolean((el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true'),
        )
      )
        throw new ControlFailure('constraint_violation', this.tx.phase);
      if (kind === 'click' || kind === 'hover') {
        await handle.scrollIntoView();
        let lastBox = '';
        let repositioned=false;
        await this.tx.wait(
          async () => {
            const sample=await handle.evaluate((el: HTMLElement) => {
              const box = el.getBoundingClientRect();
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return {
                connected: el.isConnected,
                box: [box.x, box.y, box.width, box.height].join(','),
                ready:
                  box.width > 0 &&
                  box.height > 0 &&
                  Boolean(hit && (hit === el || el.contains(hit))),
              };
            });
            if(!sample.ready && !repositioned) {
              // Intersection with the viewport does not imply an unobstructed
              // target: a fixed footer can cover a fully visible year cell.
              repositioned=true;
              await handle.evaluate((el:HTMLElement)=>{
                const popup=el.closest('[class^="sd-Dropdown-dropdown-"],[class*=" sd-Dropdown-dropdown-"]');
                const owner=popup?.closest('[class^="sd-Dropdown-container-"],[class*=" sd-Dropdown-container-"]');
                if(popup&&owner&&getComputedStyle(popup).position==='fixed'){
                  // Scrolling a fixed popup cell cannot move it. Move its owning
                  // trigger so an upward calendar clears the fixed site header.
                  const anchor=owner.getBoundingClientRect(),panel=popup.getBoundingClientRect();
                  const desired=panel.top<anchor.top?innerHeight-anchor.height-96:96;
                  let scroller=owner.parentElement;
                  while(scroller&&!(scroller.scrollHeight>scroller.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
                  (scroller??window).scrollBy({top:anchor.top-desired,behavior:'instant'});
                } else el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
              });
              lastBox='';
            }
            return sample;
          },
          (sample: Any) => {
            if (!sample.connected) throw new ControlFailure('target_detached', 'pointer_ready');
            const stable = sample.ready && lastBox === sample.box;
            lastBox = sample.box;
            return stable;
          },
          'pointer_ready',
        );
      }
      if (
        expectedOption !== undefined &&
        !(await handle.evaluate((el: Element, expected: string) => {
          const item =
            el.closest(
              '.area-item-container,.list-item-container,.ant-select-item-option,.el-select-dropdown__item,.ant-cascader-menu-item,.el-cascader-node,.ud__select__list__item,.ud__tree__node,[role=option],[role=menuitemcheckbox]',
            ) || el;
          const content =
            (item.matches('.my-cascader-modal .level-item') ? item.querySelector('.item-txt') : null) ||
            item.querySelector(
              '.area-text-label,.item-text-label,.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label,.ud__select__list__item__content,.ud__tree__node__label',
            ) || item;
          const clone = content.cloneNode(true) as Element;
          clone
            .querySelectorAll('svg,[role=img],[aria-hidden=true]')
            .forEach((node) => node.remove());
          return (clone.textContent || '').replace(/\s+/g, ' ').trim() === expected;
        }, expectedOption))
      )
        throw new ControlFailure('target_unresolved', 'option_changed');
      this.tx.check();
      if (kind !== 'fill') this.tx.start();
      // Await the actual browser command to completion. Do not race an in-flight
      // mouse command against cancellation and leave it running after releasing the lease.
      if (kind === 'click' || kind === 'hover') {
        // Geometry and hit testing above already proved this specific target.
        // ElementHandle.click/hover re-enter IntersectionObserver, which can
        // wait indefinitely in a background tab. Use the same trusted mouse
        // command with Puppeteer's frame-aware point; never activate the tab.
        const point=await handle.clickablePoint();
        this.tx.check();
        if(kind==='click')await this.page.mouse.click(point.x,point.y);
        else await this.page.mouse.move(point.x,point.y);
      }
      else if (kind === 'fill') {
        const calendarInput = await handle.evaluate(
          (el: HTMLElement) =>
            el instanceof HTMLInputElement && ['date', 'month'].includes(el.type),
        );
        if (calendarInput) {
          this.tx.start();
          await handle.evaluate((el: HTMLInputElement, next: string) => {
            if (el.disabled || el.readOnly) throw new Error('constraint_violation');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
              el,
              next,
            );
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, String(value));
        } else if(await handle.evaluate((el:Element)=>el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          // Controlled search inputs can restore their previous value on focus.
          // Select after focus and insert through the keyboard, as ordinary
          // form fills do; Locator.fill can otherwise append the next query.
          await handle.focus();
          const prepared=await handle.evaluate((el:HTMLInputElement|HTMLTextAreaElement)=>{
            if(!el.isConnected || el!==document.activeElement || el.disabled || el.readOnly)return false;
            el.select();
            return !el.value || el.selectionStart===0&&el.selectionEnd===el.value.length || el.ownerDocument.getSelection()?.toString()===el.value;
          });
          if(!prepared)throw new ControlFailure('selection_not_confirmed','control_fill_prepare');
          this.tx.check();
          if(!await handle.evaluate((el:Element)=>el.isConnected&&el===document.activeElement))throw new ControlFailure('target_detached','control_fill_prepare');
          this.tx.start();
          if(String(value))await this.page.keyboard.sendCharacter(String(value));
          else await this.page.keyboard.press('Backspace');
        } else {
          const locator = handle
            .asLocator()
            .setTimeout(Math.max(1, Math.min(4000, this.tx.deadline - Date.now())));
          await fencedLocatorAction(
            locator,
            this.tx.signal,
            (runner, options) => runner.fill(String(value), options),
            () => this.tx.start(),
            [handle],
          );
        }
      } else if (kind === 'press') await handle.press(String(value));
      else if (kind === 'blur') await handle.evaluate((el: HTMLElement) => el.blur());
      else
        await handle.evaluate((el: HTMLElement, top: number) => {
          el.scrollTop = top;
        }, Number(value));
      this.tx.check();
    } finally {
      await handle.dispose();
    }
  }
  private async actOption(
    label: string,
    level?: number,
    kind: 'click' | 'hover' = 'click',
    check = false,
    prefix: string[] = [],
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = await this.ready(
        (s) =>
          Boolean(
            (level === undefined ? s.options : s.columns[level])?.some(
              (option) => option.label === label,
            ),
          ),
        'option_ready',
      );
      this.checkPathPrefix(state, prefix);
      const options = (level === undefined ? state.options : state.columns[level] || []).filter(
        (o) => o.label === label,
      );
      if (options.length !== 1 || options[0]!.disabled)
        throw new ControlFailure(
          options.length > 1 ? 'option_ambiguous' : 'constraint_violation',
          'option_ready',
        );
      const option = options[0]!;
      const actions = this.tx.actions;
      try {
        await this.act(check ? option.check || option.token : option.token, kind, undefined, label);
        return;
      } catch (error) {
        if (
          attempt ||
          this.tx.actions !== actions ||
          !(error instanceof ControlFailure) ||
          !['target_unresolved','target_detached'].includes(error.code)
        )
          throw error;
      }
    }
  }
  private async clickCustom(part:'entry'|'confirm'):Promise<void> {
    for(let attempt=0;attempt<2;attempt++) {
      const state=await this.ready(s=>Boolean(s.custom?.[part]),`custom_${part}`);
      const actions=this.tx.actions;
      try {await this.act(state.custom![part]);return;}
      catch(error) {
        if(attempt || this.tx.actions!==actions || !(error instanceof ControlFailure)
          || !['target_unresolved','target_detached'].includes(error.code))throw error;
      }
    }
  }
  private checkPathPrefix(state: ControlState, prefix: string[]): void {
    for (let index = 0; index < prefix.length; index++) {
      const column = state.columns[index] || [];
      // Some SD menus expose the columns but no selected-state marker. Such
      // paths require a changed child column and the complete committed path;
      // leaf-only display cannot verify them.
      const hasSelection = column.some(option => option.selected);
      if (!column.some(option => option.label === prefix[index] && !option.loading
        && (option.selected || state.family === 'sd-select' && !hasSelection)))
        throw new ControlFailure('path_prefix_changed', 'path_verify');
    }
  }
  private result(status: string, matched: boolean, extra: Any = {}): Any {
    return { ok: true, status, verification: { level: 'ui', matched }, ...extra };
  }
  private protect(
    state: ControlState,
    wanted: string,
    overwrite = false,
    date = false,
  ): Any | null {
    if (state.disabled) throw new ControlFailure('constraint_violation', 'preflight');
    const actual = date ? readCalendarText(state.value) : state.value;
    if (actual && sameValue(actual, wanted)) return this.result('unchanged', true);
    if (
      state.value &&
      !/^(请选择.*|选择.*|未选择.*|尚未选择.*|打开.*|please.*|select.*)$/i.test(state.value) &&
      !overwrite
    )
      return this.result('preserved', false, { reason: 'existing_value' });
    return null;
  }
  private async ready(
    predicate: (state: ControlState) => boolean,
    phase: string,
  ): Promise<ControlState> {
    let previous = '';
    let stableSince = 0;
    return await this.tx.wait(
      () => this.read(),
      (state) => {
        if (!state.popupReady || !predicate(state)) {
          previous = '';
          return false;
        }
        const signature = JSON.stringify([
          state.popupToken,
          state.columns,
          state.options,
          state.pendingSelection,
          state.scroll,
        ]);
        if (previous !== signature) stableSince = Date.now();
        const stable = previous === signature && Date.now() - stableSince >= 40;
        previous = signature;
        return stable;
      },
      phase,
    );
  }
  private async calendarReady(): Promise<ControlState> {
    let previous = '';
    return await this.tx.wait(
      () => this.read(),
      (state) => {
        const signature = JSON.stringify([state.popupToken, state.calendar]);
        const stable = state.popupReady && state.calendar.length>0 && previous === signature;
        this.calendarProbes.push({ready:state.popupReady,expanded:state.expanded,mode:state.calendar[0]?.mode,cells:state.calendar[0]?.cells.length??0,stable});
        if(this.calendarProbes.length>8)this.calendarProbes.shift();
        if (!state.popupReady || !state.calendar.length) {
          previous = '';
          return false;
        }
        previous = signature;
        return stable;
      },
      'date_panel_ready',
    );
  }
  private async openDate(endpoint=0):Promise<ControlState> {
    let state=await this.read();
    if((state.family==='sd-date'||state.family==='phoenix-date') && state.expanded)return await this.calendarReady();
    if(state.family==='ud-date' && state.expanded) {
      if(state.activeEndpoint===endpoint)return await this.calendarReady();
      await this.closeDate(state,state.activeEndpoint??0);
      state=await this.read();
    }
    this.tx.check('date_open');
    await this.act(state.inputs[endpoint]!.token);
    return await this.calendarReady();
  }
  private async closeDate(state: ControlState, endpoint = 0): Promise<void> {
    await this.act(state.inputs[endpoint]!.token, 'press', 'Escape');
    if (state.family === 'ud-date' || state.family === 'sd-date' || state.family === 'phoenix-date' || state.family==='ant-date' && state.dismiss) {
      await this.tx.pause(40);
      const after = await this.read();
      if (after.expanded && after.dismiss) await this.act(after.dismiss);
    }
    await this.tx.wait(() => this.read(), s => !s.expanded, 'date_closed');
  }
  private async navigateCalendar(value: string, select: boolean, endpoint = 0): Promise<void> {
    const wanted = parseCalendarValue(value)!;
    for (let navigation = 0; navigation < 40; navigation++) {
      this.tx.check('date_navigate');
      const state = await this.calendarReady();
      if (!state.calendar.length) throw new ControlFailure('overlay_closed', 'date_navigate');
      const calendar =
        state.calendar.find(
          (c) =>
            c.year === wanted.year && (wanted.precision === 'month' || c.month === wanted.month),
        ) || state.calendar[endpoint ? Math.min(endpoint, state.calendar.length - 1) : 0]!;
      let action: string | null = null;
      let final = false;
      let selected = false;
      if (calendar.mode === 'year') {
        const cell = calendar.cells.find((c) => c.inView && Number(c.text) === wanted.year);
        if (cell) {
          if (cell.disabled) throw new ControlFailure('constraint_violation', 'date_year');
          action = cell.token;
        } else action = wanted.year < calendar.year ? calendar.prev : calendar.next;
      } else if (calendar.mode === 'month') {
        if (calendar.year !== wanted.year)
          action =
            (select ? calendar.yearButton : null) ||
            (wanted.year < calendar.year ? calendar.prev : calendar.next);
        else {
          const cell = calendar.cells.find((c) => c.month === wanted.month);
          if (!cell || cell.disabled)
            throw new ControlFailure('constraint_violation', 'date_month');
          action = cell.token;
          final = wanted.precision === 'month';
          selected = cell.selected;
        }
      } else if (calendar.mode === 'date') {
        if (calendar.year !== wanted.year)
          action =
            (select ? calendar.yearButton : null) ||
            (wanted.year < calendar.year ? calendar.prev : calendar.next);
        else if (calendar.month !== wanted.month)
          action =
            (select ? calendar.monthButton : null) ||
            (wanted.month < calendar.month ? calendar.prevMonth : calendar.nextMonth);
        else {
          const cell = calendar.cells.find(
            (c) => c.inView && (c.title === value || Number(c.text) === wanted.day),
          );
          if (!cell || cell.disabled) throw new ControlFailure('constraint_violation', 'date_day');
          action = cell.token;
          final = true;
          selected = cell.selected;
        }
      } else throw new ControlFailure('unsupported_component', 'date_panel');
      const previous = JSON.stringify(state.calendar.map((c) => [c.mode, c.header]));
      if (final && !select) {
        if (!selected)
          throw new ControlFailure('postcondition_failed', 'calendar_selection_verify');
        return;
      }
      await this.act(action);
      if (final) {
        this.tx.check('date_commit');
        await this.tx.pause(80);
        const after = await this.read();
        if (after.confirm) await this.act(after.confirm);
        return;
      }
      await this.tx.wait(
        () => this.read(),
        (s) => JSON.stringify(s.calendar.map((c) => [c.mode, c.header])) !== previous,
        'date_panel_change',
      );
      if (navigation === 39) throw new ControlFailure('action_budget_exceeded', 'date_navigate');
    }
  }
  private async my97Frame():Promise<Any|null> {
    const found=[];
    for(const frame of this.page.frames()){
      if(!/\/My97DatePicker\/My97DatePicker\.htm(?:[?#]|$)/i.test(frame.url()))continue;
      const host=await frame.frameElement();
      try{if(host&&await host.evaluate((el:HTMLElement)=>{
        for(let p:HTMLElement|null=el;p;p=p.parentElement){const style=getComputedStyle(p);if(style.display==='none'||style.visibility==='hidden'||p.hidden)return false;}
        const box=el.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>0&&box.right>0;
      }))found.push(frame);}finally{await host?.dispose();}
    }
    if(found.length>1)throw new ControlFailure('overlay_ambiguous','my97_probe');
    return found[0]??null;
  }
  private async setMy97Date(value:string):Promise<Any> {
    const wanted=parseCalendarValue(value)!;
    if(wanted.precision!=='date')throw new ControlFailure('precision_mismatch','my97_date');
    if(await this.my97Frame())throw new ControlFailure('overlay_ownership_unknown','my97_open');
    await this.act((await this.read()).input);
    const frame:Any=await this.tx.wait(()=>this.my97Frame(),Boolean,'my97_open');
    const fillHeader=async(selector:string,next:string)=>{
      this.tx.check();await this.read();
      const handle=await frame.$(selector);if(!handle)throw new ControlFailure('unsupported_component','my97_header');
      try{
        const locator=handle.asLocator().setTimeout(Math.max(1,Math.min(3000,this.tx.deadline-Date.now())));
        await fencedLocatorAction(locator,this.tx.signal,(runner,options)=>runner.fill(next,options),()=>this.tx.start(),[handle]);
        await handle.press('Tab');this.tx.check();
      }finally{await handle.dispose();}
    };
    await fillHeader('div:has(> .YMenu) > .yminput',String(wanted.year));
    await fillHeader('div:has(> .MMenu) > .yminput',String(wanted.month));
    // Tab out of the month input can focus the year input and open its menu.
    // Dismiss through the non-action weekday heading before selecting a day;
    // otherwise a click on the first week can select a year behind that menu.
    const weekday=await frame.$('.MTitle td:first-child');
    if(weekday)try{
      await preparePointerTarget(weekday);this.tx.check();
      await fencedLocatorAction(weekday.asLocator().setTimeout(3000),this.tx.signal,(runner,options)=>runner.click(options),()=>this.tx.start(),[weekday]);
    }finally{await weekday.dispose();}
    const selector=`td[onclick="day_Click(${wanted.year},${wanted.month},${wanted.day});"]`;
    const available=async()=>frame.$eval(selector,(el:HTMLElement)=>!/(?:disabled|invalid)/i.test(el.className)&&el.getBoundingClientRect().width>0).catch(()=>false);
    await this.tx.wait(available,Boolean,'my97_day_ready');
    await this.read();this.tx.check();
    const day=await frame.$(selector);
    try{
      if(!day)throw new ControlFailure('target_unresolved','my97_day');
      await preparePointerTarget(day);this.tx.check();
      const locator=day.asLocator().setTimeout(Math.max(1,Math.min(3000,this.tx.deadline-Date.now())));
      await fencedLocatorAction(locator,this.tx.signal,(runner,options)=>runner.click(options),()=>this.tx.start(),[day]);
    }finally{await day?.dispose();}
    await this.tx.wait(()=>this.read(),s=>readCalendarText(s.value)===value&&!s.invalid,'my97_verify');
    await this.tx.wait(()=>this.my97Frame(),f=>!f,'my97_close');
    await this.tx.pause(120);
    if(readCalendarText((await this.read()).value)!==value)throw new ControlFailure('postcondition_failed','my97_verify');
    return this.result('verified_ui',true,{field_state:'filled',precision:'date'});
  }
  async setDate(value: string, overwrite = false, endpoint?: number): Promise<Any> {
    const wanted = parseCalendarValue(value);
    if (!wanted) throw new ControlFailure('constraint_violation', 'date_parse');
    let state = await this.read();
    if (endpoint === undefined) {
      const protectedResult = this.protect(state, value, overwrite, true);
      if (protectedResult) {
        if (
          protectedResult.status === 'unchanged' &&
          ['ant-date', 'el-date', 'ud-date', 'sd-date', 'phoenix-date'].includes(state.family)
        ) {
          await this.openDate();
          await this.navigateCalendar(value, false);
          state = await this.read();
          await this.closeDate(state);
          if (readCalendarText((await this.read()).inputs[0]?.value || '') !== value)
            throw new ControlFailure('postcondition_failed', 'existing_date_verify');
        }
        return protectedResult;
      }
    }
    if(state.family==='my97-date')return this.setMy97Date(value);
    if (!['native', 'ant-date', 'el-date', 'ud-date', 'sd-date', 'phoenix-date'].includes(state.family))
      throw new ControlFailure('unsupported_component', 'date_probe');
    const input = state.inputs[endpoint ?? 0];
    if (!input) throw new ControlFailure('target_unresolved', 'date_probe');
    const isRange = state.inputs.length > 1;
    if (isRange && endpoint === undefined)
      throw new ControlFailure('range_requires_endpoints', 'date_probe');
    if (state.family === 'native') {
      const min = state.constraints.min && parseCalendarValue(state.constraints.min);
      const max = state.constraints.max && parseCalendarValue(state.constraints.max);
      if (
        (min && min.precision === wanted.precision && value < min.iso) ||
        (max && max.precision === wanted.precision && value > max.iso)
      )
        throw new ControlFailure('constraint_violation', 'date_preflight');
      if (state.constraints.step && !['1', 'any'].includes(state.constraints.step))
        throw new ControlFailure('unsupported_constraint', 'date_preflight');
      if (input.type === 'datetime-local' || input.type === 'time')
        throw new ControlFailure('unsupported_date_time', 'date_preflight');
      if (input.readonly) throw new ControlFailure('unsupported_component', 'date_probe');
      if (
        (input.type === 'month' && wanted.precision !== 'month') ||
        (input.type === 'date' && wanted.precision !== 'date')
      )
        throw new ControlFailure('date_precision_mismatch', 'date_probe');
      this.tx.check('date_input');
      await this.act(input.token, 'fill', value);
      await this.act(input.token, 'blur');
    } else {
      state = await this.openDate(endpoint??0);
      if (state.hasTime) throw new ControlFailure('unsupported_date_time', 'date_probe');
      if (!state.precision) throw new ControlFailure('date_precision_unknown', 'date_probe');
      if (wanted.precision !== state.precision)
        throw new ControlFailure('date_precision_mismatch', 'date_probe');
      const hint = input.placeholder?.toUpperCase();
      const known =
        wanted.precision === 'date'
          ? ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY年MM月DD日']
          : ['YYYY-MM', 'YYYY/MM', 'YYYY年MM月'];
      if (!isRange && !input.readonly && known.includes(hint)) {
        const rendered = hint
          .replace('YYYY', String(wanted.year).padStart(4, '0'))
          .replace('MM', String(wanted.month).padStart(2, '0'))
          .replace('DD', String(wanted.day || 1).padStart(2, '0'));
        this.tx.check('date_input');
        await this.act(input.token, 'fill', rendered);
        await this.act(input.token, 'press', 'Enter');
        state = await this.tx.wait(
          () => this.read(),
          () => true,
          'date_commit',
        );
        if (state.confirm) await this.act(state.confirm);
      } else await this.navigateCalendar(value, true, endpoint);
      if (!isRange) {
        state = await this.read();
        await this.act(state.inputs[0]!.token, 'blur');
      }
    }
    if (isRange) return this.result('partial', false, { phase: 'range_endpoint' });
    const matches = (s: ControlState): boolean =>
      readCalendarText(s.inputs[0]?.value || s.value) === value && !s.invalid;
    await this.tx.wait(
      () => this.read(),
      (s) => matches(s) && !s.expanded,
      'date_verify',
      2000,
    );
    await this.tx.pause(120);
    state = await this.read();
    if (!matches(state)) throw new ControlFailure('postcondition_failed', 'date_verify');
    if (state.family !== 'native') {
      await this.openDate();
      await this.navigateCalendar(value, false);
      state = await this.read();
      await this.closeDate(state);
      if (!matches(await this.read()))
        throw new ControlFailure('postcondition_failed', 'date_reopen_verify');
    }
    return this.result('verified_ui', true, { field_state: 'selected', selected: value });
  }
  async selectPath(path: string[], overwrite = false): Promise<Any> {
    let state = await this.read();
    if(state.family==='guopin-path'){
      if(path.length<2||path.length>4)throw new ControlFailure('unsupported_path_depth','guopin_path_preflight');
      const wanted=state.multiple?path.at(-1)!:path.join(' / ');
      const verifyExisting=state.multiple&&sameValue(state.value,wanted)&&state.tags.length===1;
      if(!state.multiple&&sameValue(state.value,wanted))return this.result('unchanged',true,{completed_path:path});
      const protectedResult=verifyExisting?null:this.protect(state,wanted,overwrite);if(protectedResult)return protectedResult;
      if(!await this.frame.evaluate(beginDictionary,state.root))throw new ControlFailure('overlay_ownership_unknown','guopin_path_open');
      await this.act(state.trigger);
      state=await this.ready(s=>Boolean(s.guopinPath?.parents.length),'guopin_path_open');
      let route=path;
      if(state.guopinPath!.tabs.length){
        const tabs=state.guopinPath!.tabs.filter(t=>t.label===path[0]&&!t.disabled);
        if(tabs.length!==1)throw new ControlFailure('path_country_required','guopin_path_country');
        await this.act(tabs[0]!.token,'click',undefined,path[0]);
        route=path.slice(1);this.tx.progress.push(path[0]!);
        state=await this.ready(s=>Boolean(s.guopinPath?.parents.length),'guopin_path_country');
      }
      if(route.length<2||route.length>3)throw new ControlFailure('unsupported_path_depth','guopin_path_parent');
      const parents=state.guopinPath!.parents.filter(p=>p.label===route[0]&&!p.disabled);
      if(parents.length!==1)throw new ControlFailure(parents.length?'option_ambiguous':'option_not_found','guopin_path_parent');
      await this.act(parents[0]!.token,'click',undefined,route[0]);
      this.tx.progress.push(route[0]!);
      for(let level=1;level<route.length;level++){
        state=await this.ready(s=>samePath(s.guopinPath?.path??[],route.slice(0,level))&&Boolean(s.guopinPath?.leaves.length),'guopin_path_children');
        const leaves=state.guopinPath!.leaves.filter(p=>p.label===route[level]&&!p.disabled);
        if(leaves.length!==1)throw new ControlFailure(leaves.length?'option_ambiguous':'option_not_found','guopin_path_leaf');
        if(verifyExisting&&level===route.length-1){if(!leaves[0]!.selected)throw new ControlFailure('selected_path_conflict','guopin_path_verify');}
        else await this.act(leaves[0]!.token,'click',undefined,route[level]);
        this.tx.progress.push(route[level]!);
      }
      state=await this.read();if(state.multiple&&state.expanded){state=await this.ready(s=>Boolean(s.confirm),'guopin_path_confirm');await this.act(state.confirm);}
      await this.tx.wait(()=>this.read(),s=>!s.expanded&&sameValue(s.value,wanted),'guopin_path_verify');
      return this.result('verified_ui',true,{completed_path:path,readback_value:wanted});
    }
    if (!['ant-path', 'el-path', 'sd-select'].includes(state.family))
      throw new ControlFailure('unsupported_component', 'path_probe');
    const existing = state.value.split(/\s*\/\s*/);
    if (samePath(existing, path)) return this.result('unchanged', true, { completed_path: path });
    const protectedResult = this.protect(state, path.join(' / '), overwrite);
    if (protectedResult) return protectedResult;
    if (!state.expanded) {
      this.tx.check('path_open');
      await this.act(state.trigger);
    }
    state = await this.ready((s) => s.columns.length > 0, 'path_open');
    for (let level = 0; level < path.length; level++) {
      this.tx.check(`path_level_${level}`);
      state = await this.ready((s) => Boolean(s.columns[level]?.length), 'path_loading');
      // Every existing parent is checked before selecting a child.
      this.checkPathPrefix(state, path.slice(0, level));
      const matches = state.columns[level]!.filter((c) => c.label === path[level]);
      if (matches.length !== 1)
        throw new ControlFailure(
          matches.length ? 'option_ambiguous' : 'option_not_found',
          this.tx.phase,
        );
      const item = matches[0]!;
      if (item.disabled) throw new ControlFailure('constraint_violation', this.tx.phase);
      const last = level === path.length - 1;
      if (!last) {
        const previousChildren = JSON.stringify(
          state.columns[level + 1]?.map((c) => [c.token, c.label]) || [],
        );
        const switchedParent = !item.selected;
        if (!item.selected || !state.columns[level + 1]?.length) {
          // Hover is a supported expansion gesture; read its outcome before
          // deciding whether the component instead requires a click.
          await this.actOption(path[level]!, level, 'hover', false, path.slice(0, level));
          await this.tx.pause(120);
          state = await this.read();
          if (!state.columns[level]?.some((c) => c.label === path[level] && c.selected)) {
            const current = state.columns[level]?.find((c) => c.label === path[level]);
            await this.actOption(path[level]!, level, 'click', false, path.slice(0, level));
          }
        }
        state = await this.tx.wait(
          () => this.read(),
          (s) =>
            Boolean(
              s.columns[level]?.some((c) => c.label === path[level] && !c.loading && (c.selected || s.family === 'sd-select' && !s.columns[level]!.some(o => o.selected))),
            ) &&
            Boolean(s.columns[level + 1]?.length) &&
            (!switchedParent ||
              JSON.stringify(s.columns[level + 1]?.map((c) => [c.token, c.label]) || []) !==
                previousChildren),
          'path_loading',
        );
      } else {
        await this.actOption(path[level]!, level, 'click', true, path.slice(0, level));
        await this.tx.pause(100);
        state = await this.read();
        if (state.confirm) await this.act(state.confirm);
      }
      this.tx.progress.push(path[level]!);
    }
    const matches = (s: ControlState): boolean => !s.invalid && (s.family === 'sd-select'
      ? !s.expanded && samePath(s.value.split(/\s*\/\s*/), path)
      : samePath(s.value.split(/\s*\/\s*/), path) ||
        (!s.expanded && s.value === path.at(-1) && this.tx.progress.length === path.length));
    await this.tx.wait(() => this.read(), matches, 'path_commit');
    await this.tx.pause(120);
    state = await this.read();
    if (!matches(state)) throw new ControlFailure('postcondition_failed', 'path_verify');
    return this.result('verified_ui', true, {
      field_state: 'selected',
      requested_path: path,
      completed_path: [...this.tx.progress],
    });
  }
  async selectOption(value: string, overwrite = false, query?: string, datePart?: 'year' | 'month', allowCustom=false): Promise<Any> {
    let state = await this.read();
    if(state.family==='dayee-dictionary'){
      const protectedResult=this.protect(state,value,overwrite);
      if(protectedResult)return protectedResult;
      // A dictionary modal from a prior transaction/user action has no current
      // ownership proof, even if the DOM registry remembers its last trigger.
      if(!await this.frame.evaluate(beginDictionary,state.root))throw new ControlFailure('overlay_ownership_unknown','dictionary_open');
      await this.act(state.trigger);
      state=await this.ready(s=>Boolean(s.dictionary?.search),'dictionary_open');
      await this.act(state.dictionary!.search,'fill',query??value.split(/[（(]/)[0]!);
      try{state=await this.ready(s=>s.options.some(o=>sameValue(o.label,value)),'dictionary_search');}
      catch(error){
        this.tx.check();
        if(!(error instanceof ControlFailure)||error.code!=='postcondition_timeout')throw error;
        const current=await this.read();if(current.dictionary?.cancel)await this.act(current.dictionary.cancel);
        throw new ControlFailure('option_not_found','dictionary_search');
      }
      const choices=state.options.filter(o=>sameValue(o.label,value));
      if(choices.length!==1)throw new ControlFailure('option_ambiguous','dictionary_select');
      await this.act(choices[0]!.token,'click',undefined,choices[0]!.label);
      state=await this.tx.wait(()=>this.read(),s=>Boolean(s.confirm)||!s.expanded,'dictionary_commit_ready');
      if(state.expanded)await this.act(state.confirm);
      await this.tx.wait(()=>this.read(),s=>!s.expanded&&sameValue(s.value,value)&&!s.invalid,'dictionary_verify');
      await this.tx.pause(120);
      if(!sameValue((await this.read()).value,value))throw new ControlFailure('postcondition_failed','dictionary_verify');
      return this.result('verified_ui',true,{field_state:'selected',selected:value});
    }
    if(state.nativeOptions){
      const choices=state.nativeOptions.filter(option=>!option.disabled && (datePart?datePartNumber(option.label,datePart)===Number(value):sameValue(option.label,value)));
      if(choices.length!==1)throw new ControlFailure(choices.length?'target_ambiguous':'option_not_found','native_select');
      const choice=choices[0]!;
      if(state.disabled)throw new ControlFailure('constraint_violation','native_select');
      if(sameValue(state.value,choice.label))return this.result('unchanged',true);
      if(state.value&&!overwrite)return this.result('preserved',false,{reason:'existing_value'});
      await this.act(state.input,'fill',choice.value);
      await this.tx.wait(()=>this.read(),s=>sameValue(s.value,choice.label)&&!s.invalid,'native_select_verify');
      return this.result('verified_ui',true);
    }
    if (!['ant-select', 'el-select', 'sd-select', 'ud-select', 'phoenix-select', 'phoenix-radio', 'ant-radio', 'phoenix-autocomplete', 'job51-autocomplete'].includes(state.family))
      throw new ControlFailure('unsupported_component', 'select_probe');
    if (state.multiple) throw new ControlFailure('multiple_requires_values', 'select_probe');
    const matchesValue = (actual: string): boolean => datePart
      ? datePartNumber(value, datePart) !== null && datePartNumber(actual, datePart) === datePartNumber(value, datePart)
      : sameValue(actual, value);
    if (datePart && !state.disabled && matchesValue(state.value)) return this.result('unchanged', true);
    if(['phoenix-autocomplete','job51-autocomplete'].includes(state.family) && state.editing)throw new ControlFailure('uncommitted_selection','autocomplete_preflight');
    const protectedResult = this.protect(state, value, overwrite);
    if (protectedResult) return protectedResult;
    if(['phoenix-autocomplete','job51-autocomplete'].includes(state.family)) {
      if(state.family==='job51-autocomplete'&&allowCustom&&state.companion?.value&&state.companion.value!==value&&!overwrite)
        return this.result('preserved',false,{reason:'existing_companion_value'});
      await this.act(state.input,'fill',query || value);
      // The legacy autocomplete debounces filtering. A stale no-results menu
      // from the last query must not select Other before this query is applied.
      if(state.family==='job51-autocomplete')await this.tx.pause(400);
      try {state=await this.ready(s=>s.options.some(o=>sameValue(o.label,value)) || Boolean(s.family==='job51-autocomplete'&&allowCustom&&s.companion?.input&&s.options.some(o=>o.disabled&&/没有找到/.test(o.label))&&s.options.some(o=>o.label===s.companion!.otherLabel&&!o.disabled)),'autocomplete_search');}
      catch(error) {
        // A dictionary-only school cannot accept arbitrary draft text. Blur
        // once to discard that uncommitted query; never fabricate a candidate.
        await this.act((await this.read()).input,'blur');
        if(error instanceof ControlFailure && error.code==='postcondition_timeout')throw new ControlFailure('option_not_found','autocomplete_search');
        throw error;
      }
      if(state.family==='job51-autocomplete'&&!state.options.some(o=>sameValue(o.label,value))&&allowCustom&&state.companion?.input){
        await this.actOption(state.companion.otherLabel);
        state=await this.read();
        if(!state.companion?.input)throw new ControlFailure('target_unresolved','autocomplete_other');
        await this.act(state.companion.input,'fill',value);
        await this.act(state.companion.input,'blur');
      }else await this.actOption(value);
      state=await this.read();
      await this.act(state.input,'blur');
      await this.tx.wait(()=>this.read(),s=>!s.expanded&&sameValue(s.value,value)&&!s.invalid,'autocomplete_commit');
      await this.tx.pause(120);
      state=await this.read();
      if(state.editing||state.expanded||!sameValue(state.value,value)||state.invalid)throw new ControlFailure('postcondition_failed','autocomplete_verify');
      return this.result('verified_ui',true,{field_state:'selected',selected:value});
    }
    if ((state.family==='phoenix-radio'||state.family==='ant-radio')) {
      const choices=state.options.filter(option=>sameValue(option.label,value));
      if(choices.length!==1)throw new ControlFailure(choices.length?'option_ambiguous':'option_not_found','radio_option');
      if(choices[0]!.disabled)throw new ControlFailure('constraint_violation','radio_option');
      await this.act(choices[0]!.token,'click',undefined,choices[0]!.label);
      await this.tx.wait(()=>this.read(),s=>sameValue(s.value,value)&&!s.invalid,'radio_commit');
      await this.tx.pause(120);
      const after=await this.read();
      if(!sameValue(after.value,value)||after.invalid)throw new ControlFailure('postcondition_failed','radio_verify');
      return this.result('verified_ui',true,{field_state:'selected',selected:value});
    }
    if (!state.expanded) {
      this.tx.check('select_open');
      await this.act(state.trigger);
    }
    if(state.family==='phoenix-select') {
      state=await this.ready(s=>s.options.length>0 || Boolean(s.pendingSelection),'select_options');
      if(state.pendingSelection)return this.selectPhoenixMany([value],'replace',overwrite);
    }
    if (query) {
      state = await this.read();
      if (state.readonly) throw new ControlFailure('query_not_supported', 'select_search');
      await this.act(state.input, 'fill', query);
    }
    state = await this.ready((s) => s.options.length > 0 || Boolean(s.custom?.entry || s.custom?.input), 'select_options');
    // Remote autocomplete can briefly show its previous list or “no data”
    // while the new query is pending. Only an exact candidate proves readiness.
    if(query&&!state.options.some(o=>matchesValue(o.label))&&!state.custom?.entry&&!state.custom?.input){
      try{state=await this.ready(s=>s.options.some(o=>matchesValue(o.label))||Boolean(s.custom?.entry||s.custom?.input),'search_results');}
      catch(error){if(error instanceof ControlFailure&&error.code==='postcondition_timeout')throw new ControlFailure('option_not_found','search_results');throw error;}
    }
    // A previous search can leave an open virtual menu at the bottom. Search
    // the entire list again rather than declaring an earlier item absent.
    if(!query && state.scroll && state.scroll.top>1 && !state.options.some(o=>matchesValue(o.label))){
      await this.act(state.scroll.token,'scroll',0);
      state=await this.ready(s=>Boolean(s.scroll&&s.scroll.top<1),'select_scroll_reset');
    }
    const seen = new Set<string>();
    for (let step = 0; step < 60; step++) {
      const matches = state.options.filter((o) => matchesValue(o.label));
      if (matches.length > 1) throw new ControlFailure('option_ambiguous', 'select_option');
      if (matches[0]) {
        if (matches[0].disabled) throw new ControlFailure('constraint_violation', 'select_option');
        await this.actOption(matches[0].label);
        break;
      }
      const scroll = state.scroll;
      const signature = JSON.stringify([state.options.map((o) => o.label), scroll?.top]);
      if (!scroll || seen.has(signature) || scroll.top + scroll.height >= scroll.total - 2) {
        if(allowCustom && state.custom && (state.custom.entry || state.custom.input)) {
          if(state.custom.entry)await this.clickCustom('entry');
          state=await this.ready(s=>Boolean(s.custom?.input && s.custom.confirm),'custom_input');
          await this.act(state.custom!.input,'fill',value);
          state=await this.read();
          if(!state.custom?.confirm)throw new ControlFailure('target_unresolved','custom_confirm');
          await this.clickCustom('confirm');
          break;
        }
        throw new ControlFailure('option_not_found', 'select_search');
      }
      seen.add(signature);
      this.tx.check('select_scroll');
      await this.act(
        scroll.token,
        'scroll',
        Math.min(scroll.top + scroll.height * 0.8, scroll.total - scroll.height),
      );
      // scrollTop changes before React replaces the virtual rows. Wait for a
      // stable option window before searching or advancing the next page.
      state = await this.ready(
        (s) =>
          JSON.stringify(s.options.map((o) => o.label)) !==
          JSON.stringify(state.options.map((o) => o.label)) || s.scroll?.top!==scroll.top,
        'select_scroll',
      );
      if (step === 59) throw new ControlFailure('virtual_list_budget_exceeded', 'select_scroll');
    }
    state = await this.tx.wait(
      () => this.read(),
      (s) => matchesValue(s.value),
      'select_commit',
    );
    if (state.family === 'ud-select' || state.family === 'sd-select' || state.family === 'phoenix-select') {
      await this.act(state.input, 'blur');
      // UD can keep the portal mounted during its exit animation without an
      // aria-expanded flag. Wait for closure, then verify the committed value
      // again so a rollback during the animation cannot look like success.
      await this.tx.wait(() => this.read(), (s) => !s.expanded, 'select_close');
    }
    await this.tx.pause(120);
    const finalState = await this.read();
    if (!matchesValue(finalState.value) || finalState.invalid || ['ud-select','sd-select','phoenix-select'].includes(state.family) && finalState.expanded)
      throw new ControlFailure('postcondition_failed', 'select_verify');
    return this.result('verified_ui', true, { field_state: 'selected', selected: value });
  }
  async setSplitDate(value: string | { start: string; end?: string; current?: boolean }, overwrite = false): Promise<Any> {
    const range = typeof value === 'string' ? { start: value } : value;
    const start = parseCalendarValue(range.start);
    const end = range.end ? parseCalendarValue(range.end) : null;
    if (!start || start.precision !== 'month' || range.end && (!end || end.precision !== 'month')
      || range.current && range.end || range.end && range.start > range.end)
      throw new ControlFailure('date_precision_mismatch', 'split_date_parse');
    let state = await this.read();
    const group = state.splitDate;
    if (!group || (typeof value === 'string' ? group.parts.length !== 2 : group.parts.length !== 4)
      || typeof value !== 'string' && !range.current && !end)
      throw new ControlFailure('range_requires_endpoints', 'split_date_parse');
    if (range.current && !group.current) throw new ControlFailure('missing_current_field', 'split_date_parse');
    const expected = (part: NonNullable<ControlState['splitDate']>['parts'][number]): number =>
      (part.endpoint === 'start' ? start : end)![part.part];
    const wantedParts = group.parts.filter(part => part.endpoint === 'start' || !range.current);
    const currentMatches = (next: ControlState): boolean => {
      const g = next.splitDate;
      return Boolean(g && g.parts.length === group.parts.length && !next.invalid
        && g.parts.filter(part => part.endpoint === 'start' || !range.current).every(part => !part.invalid && datePartNumber(part.value, part.part) === expected(part))
        && (range.current ? g.current?.checked && g.parts.filter(part => part.endpoint === 'end').every(part => part.disabled || !part.value)
          : !g.current?.checked));
    };
    if (currentMatches(state)) return this.result('unchanged', true);
    const waitingOnYear = (part: typeof wantedParts[number]): boolean => {
      const year = group.parts.find(candidate => candidate.endpoint === part.endpoint && candidate.part === 'year');
      return part.part === 'month' && Boolean(year && !year.disabled && datePartNumber(year.value, 'year') !== expected(year));
    };
    if (state.disabled || wantedParts.some(part => part.disabled && !(part.endpoint === 'end' && group.current?.checked) && !waitingOnYear(part))
      || group.current?.disabled && group.current.checked !== Boolean(range.current))
      throw new ControlFailure('constraint_violation', 'split_date_preflight');
    if (!overwrite && (group.current?.checked && !range.current || group.parts.some(part => part.value
      && (part.endpoint === 'end' && range.current || datePartNumber(part.value, part.part) !== expected(part)))))
      return this.result('preserved', false, { reason: 'existing_value' });
    const setCurrent = async (checked: boolean): Promise<void> => {
      const before = (await this.read()).splitDate?.current;
      if (!before || before.checked === checked) return;
      if (before.disabled) throw new ControlFailure('constraint_violation', 'split_date_current');
      this.tx.check('split_date_current');
      await this.act(before.token);
      await this.tx.wait(() => this.read(), next => next.splitDate?.current?.checked === checked, 'split_date_current');
    };
    if (!range.current) await setCurrent(false);
    for (let index = 0; index < group.parts.length; index++) {
      const initial = group.parts[index]!;
      if (initial.endpoint === 'end' && range.current) continue;
      this.tx.check(`split_date_${initial.endpoint}_${initial.part}`);
      state = await this.tx.wait(() => this.read(), next => Boolean(next.splitDate?.parts[index] && !next.splitDate.parts[index]!.disabled), 'split_date_enabled');
      const part = state.splitDate!.parts[index]!;
      if (part.endpoint !== initial.endpoint || part.part !== initial.part || state.splitDate!.parts.length !== group.parts.length)
        throw new ControlFailure('range_scope_conflict', 'split_date_preflight');
      const child = new ControlDriver(this.page, { field: part.label, identity: part.identity, frame: this.page.frames().indexOf(this.frame) }, { pageId: 0, transaction: this.tx });
      await child.selectOption(String(expected(part)), true, undefined, part.part);
    }
    if (range.current) await setCurrent(true);
    await this.tx.wait(() => this.read(), currentMatches, 'split_date_verify');
    await this.tx.pause(120);
    if (!currentMatches(await this.read())) throw new ControlFailure('postcondition_failed', 'split_date_verify');
    return this.result('verified_ui', true, { field_state: 'selected', ...(typeof value === 'string' ? { selected: value } : { range }) });
  }
  async setBoolean(value: boolean): Promise<Any> {
    const state = await this.read();
    if (state.disabled || state.checked === null)
      throw new ControlFailure('constraint_violation', 'boolean_preflight');
    if (state.checked === value) return this.result('unchanged', true);
    this.tx.check('boolean_set');
    await this.act(state.trigger);
    await this.tx.wait(
      () => this.read(),
      (s) => s.checked === value,
      'boolean_verify',
    );
    return this.result('verified_ui', true);
  }
  async setRange(start: string, end: string, overwrite = false): Promise<Any> {
    const a = parseCalendarValue(start),
      b = parseCalendarValue(end);
    if (!a || !b || a.precision !== b.precision || start > end)
      throw new ControlFailure('constraint_violation', 'range_parse');
    let state = await this.read();
    if (state.disabled) throw new ControlFailure('constraint_violation', 'range_preflight');
    if (state.inputs.length !== 2)
      throw new ControlFailure('range_requires_end_field', 'range_probe');
    const matches = (s: ControlState): boolean =>
      readCalendarText(s.inputs[0]?.value || '') === start &&
      readCalendarText(s.inputs[1]?.value || '') === end &&
      !s.invalid;
    const unchanged = matches(state);
    if (unchanged && state.family !== 'ud-date') return this.result('unchanged', true);
    if (state.inputs.some((x: Any) => x.value) && !overwrite && !unchanged)
      return this.result('preserved', false, { reason: 'existing_value' });
    if (!unchanged) {
      await this.setDate(start, true, 0);
      await this.setDate(end, true, 1);
    }
    state = await this.read();
    if (state.confirm) await this.act(state.confirm);
    await this.act(state.inputs[1]!.token, 'blur');
    await this.tx.wait(() => this.read(), matches, 'range_verify');
    await this.tx.pause(120);
    state = await this.read();
    if (!matches(state)) throw new ControlFailure('postcondition_failed', 'range_verify');
    await this.openDate();
    await this.navigateCalendar(start, false, 0);
    if (state.family === 'ud-date') {
      await this.closeDate(await this.read());
      await this.openDate(1);
    }
    await this.navigateCalendar(end, false, 1);
    state = await this.read();
    await this.closeDate(state, state.family === 'ud-date' ? 1 : 0);
    if (!matches(await this.read()))
      throw new ControlFailure('postcondition_failed', 'range_reopen_verify');
    return this.result(unchanged ? 'unchanged' : 'verified_ui', true, { field_state: 'selected', range: { start, end } });
  }
  async selectMany(
    values: string[],
    mode: 'add' | 'replace' = 'add',
    overwrite = false,
  ): Promise<Any> {
    if (new Set(values).size !== values.length)
      throw new ControlFailure('constraint_violation', 'multiple_parse');
    let state = await this.read();
    if(state.family==='guopin-certificates'){
      const paths=values.map(value=>value.split(' / '));
      if(paths.some(path=>path.length<2||path.length>3||path.some(part=>!part)))throw new ControlFailure('explicit_paths_required','certificate_parse');
      const leaves=paths.map(path=>path.at(-1)!);
      if(new Set(leaves).size!==leaves.length)throw new ControlFailure('ambiguous_leaf_names','certificate_parse');
      if(mode==='replace'&&state.tags.some(tag=>!leaves.includes(tag)))return this.result('preserved',false,{reason:'existing_value'});
      const desired=mode==='add'?[...new Set([...state.tags,...leaves])]:leaves;
      for(const path of paths){
        state=await this.ready(s=>Boolean(s.guopinPath?.parents.length),'certificate_parent');
        const parents=state.guopinPath!.parents.filter(p=>p.label===path[0]&&!p.disabled);
        if(parents.length!==1)throw new ControlFailure('option_not_found','certificate_parent');
        await this.act(parents[0]!.token,'click',undefined,path[0]);
        for(let level=1;level<path.length;level++){
          state=await this.ready(s=>samePath(s.guopinPath?.path??[],path.slice(0,level))&&Boolean(s.guopinPath?.leaves.length),'certificate_children');
          const options=state.guopinPath!.leaves.filter(p=>p.label===path[level]&&!p.disabled);
          if(options.length!==1)throw new ControlFailure('option_not_found','certificate_leaf');
          if(level<path.length-1||!options[0]!.selected)await this.act(options[0]!.token,'click',undefined,path[level]);
        }
      }
      await this.tx.wait(()=>this.read(),s=>sameSet(s.tags,desired),'certificate_pending_verify');
      // Selection is staged in the visible modal. The module coordinator owns
      // its explicit Confirm/save and the subsequent saved-preview check.
      return this.result('verified_ui',true,{completed_paths:values,readback_values:desired,commit_state:'pending_confirmation'});
    }
    if(state.family==='phoenix-select' && state.multiple && !state.disabled)return this.selectPhoenixMany(values,mode,overwrite);
    if (!['ant-select', 'el-select', 'ud-select'].includes(state.family) || state.disabled)
      throw new ControlFailure('unsupported_component', 'multiple_probe');
    if (state.opaqueSelection)
      throw new ControlFailure('unsupported_collapsed_selection', 'multiple_probe');
    if (!state.multiple) {
      if (state.family === 'ant-select')
        throw new ControlFailure('not_multiple_control', 'multiple_probe');
      if (!state.expanded) await this.act(state.trigger);
      state = await this.ready((s) => s.options.length > 0, 'multiple_probe');
      if (!state.multiple) throw new ControlFailure('not_multiple_control', 'multiple_probe');
    }
    const desired = mode === 'add' ? [...new Set([...state.tags, ...values])] : values;
    if (sameSet(state.tags, desired)) return this.result('unchanged', true, {selected: state.tags});
    if (mode === 'replace' && state.tags.some((v: string) => !desired.includes(v)) && !overwrite)
      return this.result('preserved', false, { reason: 'existing_value' });
    if (!state.expanded) await this.act(state.trigger);
    state = await this.ready((s) => s.options.length > 0, 'multiple_open');
    if (!state.multiple) throw new ControlFailure('not_multiple_control', 'multiple_probe');
    const changes = [
      ...state.tags.filter((v: string) => !desired.includes(v)),
      ...desired.filter((v: string) => !state.tags.includes(v)),
    ];
    for (const value of changes) {
      const previouslySelected = state.tags.includes(value);
      const seen = new Set<string>();
      for (let scrollCount = 0; scrollCount < 60; scrollCount++) {
        const options = state.options.filter((o) => o.label === value);
        if (options.length > 1) throw new ControlFailure('option_ambiguous', 'multiple_option');
        if (options[0]) {
          if (options[0].disabled)
            throw new ControlFailure('constraint_violation', 'multiple_option');
          await this.actOption(value, undefined, 'click', state.family === 'ud-select');
          break;
        }
        const scroll = state.scroll;
        const signature = JSON.stringify([state.options.map((o) => o.label), scroll?.top]);
        if (!scroll || seen.has(signature) || scroll.top + scroll.height >= scroll.total - 2)
          throw new ControlFailure('option_not_found', 'multiple_option');
        seen.add(signature);
        await this.act(
          scroll.token,
          'scroll',
          Math.min(scroll.top + scroll.height * 0.8, scroll.total - scroll.height),
        );
        state = await this.ready(s=>s.scroll?.top!==scroll.top,'multiple_scroll');
        if (scrollCount === 59)
          throw new ControlFailure('virtual_list_budget_exceeded', 'multiple_option');
      }
      state = await this.tx.wait(
        () => this.read(),
        (s) => s.tags.includes(value) !== previouslySelected,
        'multiple_commit',
      );
      if (!state.expanded && value !== changes.at(-1)) {
        await this.act(state.trigger);
        state = await this.read();
      }
    }
    await this.act(state.input, 'press', 'Escape');
    if (state.family === 'ud-select') {
      await this.act(state.input, 'blur');
      await this.tx.wait(() => this.read(), current => !current.expanded, 'multiple_close');
    }
    await this.tx.pause(120);
    state = await this.read();
    if (state.invalid || !sameSet(state.tags, desired))
      throw new ControlFailure('postcondition_failed', 'multiple_verify');
    return this.result('verified_ui', true, { field_state: 'selected', selected: desired });
  }
  private async selectPhoenixMany(values:string[],mode:'add'|'replace',overwrite:boolean):Promise<Any> {
    let state=await this.read();
    const committed=(s:ControlState):string[]=>s.multiple?s.tags:s.value?[s.value]:[];
    const initial=committed(state);
    const desired=mode==='add'?[...new Set([...initial,...values])]:values;
    if(sameSet(initial,desired))return this.result('unchanged',true,{selected:initial});
    if(mode==='replace'&&!overwrite&&initial.some(v=>!desired.includes(v)))return this.result('preserved',false,{reason:'existing_value'});
    if(!state.expanded)await this.act(state.trigger);
    state=await this.ready(s=>Boolean(s.pendingSelection),'multiple_pending_open');
    if(!sameSet(state.pendingSelection!.selected,initial))throw new ControlFailure('uncommitted_selection','multiple_preflight');
    const changes=[...initial.filter(v=>!desired.includes(v)),...desired.filter(v=>!initial.includes(v))];
    for(const value of changes) {
      if(!state.pendingSelection?.search)throw new ControlFailure('unsupported_component','multiple_search');
      await this.act(state.pendingSelection.search,'fill',value);
      state=await this.ready(s=>Boolean(s.pendingSelection?.options.some(o=>sameValue(o.label,value))),'multiple_search');
      const options=state.pendingSelection!.options.filter(o=>sameValue(o.label,value));
      if(options.length!==1)throw new ControlFailure(options.length?'option_ambiguous':'option_not_found','multiple_search');
      const option=options[0]!;
      if(option.disabled || !option.check)throw new ControlFailure('constraint_violation','multiple_option');
      const wasSelected=state.pendingSelection!.selected.includes(value);
      await this.act(option.check,'click',undefined,option.label);
      state=await this.tx.wait(()=>this.read(),s=>Boolean(s.pendingSelection)&&s.pendingSelection!.selected.includes(value)!==wasSelected,'multiple_pending_commit');
    }
    if(!sameSet(state.pendingSelection!.selected,desired)||!state.confirm)throw new ControlFailure('postcondition_failed','multiple_pending_verify');
    await this.act(state.confirm);
    await this.tx.wait(()=>this.read(),s=>!s.expanded&&sameSet(committed(s),desired),'multiple_confirm');
    await this.tx.pause(120);state=await this.read();
    if(state.invalid||state.expanded||!sameSet(committed(state),desired))throw new ControlFailure('postcondition_failed','multiple_verify');
    return this.result('verified_ui',true,{field_state:'selected',selected:state.multiple?desired:desired[0]});
  }
  async openPopup():Promise<void> {
    const state=await this.read();
    if(state.disabled)throw new ControlFailure('constraint_violation','popup_open');
    if(state.family==='guopin-path'){
      if(!state.expanded){if(!await this.frame.evaluate(beginDictionary,state.root))throw new ControlFailure('overlay_ownership_unknown','guopin_path_open');await this.act(state.trigger);}
      await this.ready(s=>Boolean(s.guopinPath?.parents.length),'guopin_path_open');return;
    }
    if(state.family==='dayee-dictionary'){
      if(!state.expanded){
        if(!await this.frame.evaluate(beginDictionary,state.root))throw new ControlFailure('overlay_ownership_unknown','dictionary_open');
        await this.act(state.trigger);
      }
      await this.ready(s=>Boolean(s.dictionary?.search),'dictionary_open');return;
    }
    if(state.family.endsWith('-date')) {await this.openDate();return;}
    if(!['ant-select','el-select','sd-select','ud-select','phoenix-select','ant-path','el-path'].includes(state.family))
      throw new ControlFailure('unsupported_component','popup_open');
    if(!state.expanded)await this.act(state.trigger);
    await this.ready(s=>s.options.length>0 || s.columns.length>0 || Boolean(s.custom) || Boolean(s.pendingSelection) || s.expanded,'popup_open');
  }
  async dismissPopup():Promise<void> {
    const before=await this.read();
    if(!before.expanded)return;
    if(!before.popupToken)throw new ControlFailure('overlay_ownership_unknown','popup_close');
    if(before.family.endsWith('-date'))await this.closeDate(before,before.activeEndpoint??0);
    else if(before.family==='guopin-path'){
      if(!before.guopinPath?.close)throw new ControlFailure('target_unresolved','guopin_path_close');
      await this.act(before.guopinPath.close);await this.tx.wait(()=>this.read(),s=>!s.expanded,'guopin_path_close');
    }
    else if(before.family==='dayee-dictionary'){
      if(!before.dictionary?.cancel)throw new ControlFailure('target_unresolved','dictionary_close');
      await this.act(before.dictionary.cancel);
      await this.tx.wait(()=>this.read(),s=>!s.expanded,'dictionary_close');
    }
    else {
      await this.act(before.input,'press','Escape');
      await this.tx.pause(60);
      let state=await this.read();
      if(state.expanded && state.dismiss)await this.act(state.dismiss);
      else if(state.expanded)await this.act(state.input,'blur');
      state=await this.tx.wait(()=>this.read(),s=>!s.expanded,'popup_close',1200);
    }
    const after=await this.read();
    if(!sameValue(after.value,before.value) || !sameSet(after.tags,before.tags))
      throw new ControlFailure('value_changed_during_close','popup_close');
  }
  async dismissOwnedPopup():Promise<boolean> {
    if(!this.popupToken || this.tx.signal.aborted || this.tx.deadline-Date.now()<1500)return false;
    try {
      this.tx.check('failure_popup_cleanup');
      await this.dismissPopup();
      return true;
    } catch {return false;}
  }
  close(): void {
    this.tx.close();
  }
}
