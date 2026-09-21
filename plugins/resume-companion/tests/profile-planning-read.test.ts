import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProfileStore,ProfileChangesSchema,ProfileSchema} from '../src/profile-store.js';

it('accepts a comprehensive cross-platform fixture while retaining a bounded supplemental library',async()=>{
 const input=JSON.parse(await readFile(new URL('../../../tests/fixtures/comprehensive-virtual-profile.json',import.meta.url),'utf8'));
 const changes=ProfileChangesSchema.parse(input.changes);
 expect(changes.supplemental_fields!.length).toBeGreaterThan(100);
 const directory=await mkdtemp(join(tmpdir(),'profile-comprehensive-'));
 try {
  const store=new ProfileStore(directory);
  const saved=await store.save(input);
  const value=await store.readForPlanning(saved.profile.id,saved.profile.revision);
  expect(ProfileSchema.parse(value).supplemental_fields).toHaveLength(changes.supplemental_fields!.length);
  expect(()=>ProfileChangesSchema.parse({supplemental_fields:Array.from({length:501},(_,i)=>({...changes.supplemental_fields![0],id:`f${i}`,field_key:`test.${i}`}))})).toThrow();
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('reads one legacy profile without initializing an index or rewriting its source',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'profile-planning-read-'));
 try{
  await mkdir(join(directory,'profiles'));
  const p={schema_version:'1.1',profile_id:'legacy',revision:2,basic:{full_name:'虚构',email:null,phone:null,city:null,job_intention:null},education:[],experience:[],projects:[],skills:[],certificates:[],custom_answers:[],supplemental_fields:[]};
  const source=JSON.stringify({format:'resume-companion-profile',storage_version:1,id:'legacy',name:'虚拟旧资料',revision:2,created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z',source_markdown:'虚拟原文',profile:p});
  const file=join(directory,'profiles','legacy.json');await writeFile(file,source);
  const store=new ProfileStore(directory),view=await store.readForPlanning('legacy',2);
  expect(view.schema_version).toBe('1.2');expect(view.section_status.internships).toBe('unknown');
  expect(await readFile(file,'utf8')).toBe(source);expect(await readdir(directory)).toEqual(['profiles']);
  await expect(store.readForPlanning('legacy',1)).rejects.toMatchObject({code:'profile_changed'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
