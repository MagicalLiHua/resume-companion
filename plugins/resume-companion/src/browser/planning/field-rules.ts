import type {RawField} from '../form-engine.js';
import {recipes,type FieldRule,type Recipe,type SectionRule} from './recipes.js';

export const normalizeField=(s:string)=>s.replace(/[\s*＊:：]/g,'').toLowerCase();
export const sectionOf=(scope:string)=>scope.replace(/ \/ 第\d+条$/,'');
export function recipeFor(fields:RawField[]):Recipe|undefined {
  const families=[...new Set(fields.map(f=>f.plannerFamily).filter(Boolean))];
  return families.length===1?recipes.find(r=>r.family===families[0]):undefined;
}
export function fieldRules(section:SectionRule,label:string,company:string|null):FieldRule[] {
  return section.fields.filter(rule=>(!rule.company||rule.company===company)&&rule.labels.some(l=>normalizeField(l)===normalizeField(label)));
}
