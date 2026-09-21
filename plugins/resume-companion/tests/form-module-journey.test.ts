import {expect,test,vi} from 'vitest';
import {FormModuleJourney} from '../src/browser/form-module-journey.js';
import {policySchema} from '../src/browser/planning/compiler.js';
import {ProfileSchema} from '../src/profile-store.js';
import type {FormEngine,RawPageForm} from '../src/browser/form-engine.js';
const profile=ProfileSchema.parse({schema_version:'1.2',profile_id:'virtual',revision:1,basic:{full_name:null,phone:null,email:null,city:null,job_intention:null},education:[],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:[]});
const raw=():RawPageForm=>({documentId:'doc',url:'https://c.iguopin.com/resume?id=synthetic',title:'简历',fields:[],sections:[],overlays:[],validations:[]});
test.each(['login','resume_changed','profile_changed'] as const)('Guopin coordinator refuses writes when its pinned context changes: %s',async(mode)=>{
 const page=raw(),journey=new FormModuleJourney();const entry=journey.start('owner','request',{pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true},page);
 const activate=vi.fn();const current=structuredClone(profile);
 if(mode==='login')page.authenticationRequired=true;
 if(mode==='resume_changed')page.url='https://c.iguopin.com/resume?id=another';
 if(mode==='profile_changed')current.revision=2;
 const engine={capturePlanning:async()=>({raw:page}),activate} as unknown as FormEngine;
 const result=await journey.execute('owner',entry.journey_id,engine,async()=>current);
 expect(result.issue.code).toBe({login:'authentication_required',resume_changed:'workflow_changed',profile_changed:'profile_revision_changed'}[mode]);expect(activate).not.toHaveBeenCalled();expect(result.records).toEqual([]);
});
test('Guopin request replay is owner and revision scoped',()=>{
 const journey=new FormModuleJourney(),input={pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true};
 const first=journey.start('owner','request',input,raw());
 expect(journey.start('owner','request',input,raw())).toMatchObject({journey_id:first.journey_id,replayed:true});
 expect(()=>journey.start('another','request',input,raw())).toThrow('journey_access_denied');
 expect(()=>journey.start('owner','request',{...input,revision:2},raw())).toThrow('request_id_conflict');
 expect(()=>journey.status('another',first.journey_id,'wrong')).toThrow('journey_access_denied');
});
