import {expect,test} from 'vitest';
import {guopinFact} from '../src/browser/planning/guopin.js';
const f=(value:string)=>({value,source:'synthetic'});
test('Guopin converts explicit yuan amounts to the thousand-yuan input unit',()=>{
 expect(guopinFact('monthly_salary_yuan',f('4000'))?.value).toBe('4');
 expect(guopinFact('monthly_salary_yuan',f('4500.50'))?.value).toBe('4.5005');
 for(const value of ['4千','面议','4000-5000','-2'])expect(guopinFact('monthly_salary_yuan',f(value))).toBeUndefined();
});
test('Guopin preserves literal slashes in taxonomy labels and rejects malformed paths',()=>{
 expect(guopinFact('industry_path',f('["互联网/IT/电子/通信","计算机软件"]'))?.value).toEqual(['互联网/IT/电子/通信','计算机软件']);
 for(const value of ['浙江/杭州','["浙江"]','["浙江",4]','["浙江","杭州","西湖","其他","多余"]'])expect(guopinFact('location_path',f(value))).toBeUndefined();
});
test('Guopin company size needs a precise count within an observed band',()=>{
 expect(guopinFact('company_headcount',f('200'))?.value).toBe('100-300人');
 expect(guopinFact('company_headcount',f('400'))?.value).toBe('300-500人');
 for(const value of ['100-499人','300','未知'])expect(guopinFact('company_headcount',f(value))).toBeUndefined();
});
test('certificate paths reject blank segments and ambiguous repeated leaf names',()=>{
 expect(guopinFact('guopin_certificate_paths',f('["英语类 / 全国性英语等级考试 / 大学英语六级CET6","驾驶类 / 机动车驾驶证 / 驾驶证C1"]'))?.value).toHaveLength(2);
 for(const paths of [[],['大学英语六级CET6'],['英语类 /  / CET6'],['英语类 / CET6 '],['英语类 / CET6','外语类 / CET6'],[4]])expect(guopinFact('guopin_certificate_paths',f(JSON.stringify(paths)))).toBeUndefined();
});
