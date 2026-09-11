import {z} from 'zod';
export const journalStatuses={recorded:'已记录',interview:'面试中',offer:'已获 Offer',rejected:'未通过',withdrawn:'已撤回'} as const;
export function applicationUrl(raw:string){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('投递网址需使用 HTTP 或 HTTPS');for(const key of [...u.searchParams.keys()])if(/token|auth|session|password|secret|api.?key|^utm_|^code$/i.test(key))u.searchParams.delete(key);if(/token|auth|session|password|secret|api.?key/i.test(u.hash))u.hash='';return u.href;}
export const JobMetadataSchema=z.strictObject({company:z.string().max(160),role:z.string().max(200),url:z.string().max(3000).transform(applicationUrl)});
export type JobMetadata=z.infer<typeof JobMetadataSchema>;
export const JournalEntrySchema=JobMetadataSchema.extend({id:z.string().max(100),status:z.enum(['recorded','interview','offer','rejected','withdrawn']),appliedDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),notes:z.string().max(2000),createdAt:z.number(),updatedAt:z.number(),evidence:z.enum(['manual','submit_detected','success_detected']),sessionKey:z.string().max(160).nullable()}).superRefine((e,ctx)=>{
  if(e.appliedDate){const date=new Date(e.appliedDate);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==e.appliedDate)ctx.addIssue({code:'custom',message:'投递日期无效'});}

});
export type JournalEntry=z.infer<typeof JournalEntrySchema>;
export function journalStats(entries:JournalEntry[]){return {total:entries.length,companies:new Set(entries.map(e=>e.company.trim()).filter(Boolean)).size,interviews:entries.filter(e=>e.status==='interview').length,offers:entries.filter(e=>e.status==='offer').length};}
