// Aggregate-only read-only diagnostics. Does not construct a message store,
// recover jobs, call a model, send messages or expose group/source identifiers.
import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {loadConfig} from '../src/config.mjs';
const c=loadConfig(undefined,false),file=path.join(c.storageDir,'groups','groups.sqlite');
const result={knowledge:c.groups.knowledge,databaseExists:fs.existsSync(file)};
if(result.databaseExists){const db=new DatabaseSync(file,{readOnly:true});try{
 for(const table of ['knowledge_jobs','daily_digests','knowledge_topics','topic_revisions'])if(db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table))result[table]=db.prepare(`SELECT status,COUNT(*) count FROM ${table} GROUP BY status`).all();
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='knowledge_schedule'").get())result.schedules=db.prepare('SELECT last_successful_day,next_date,current_job,error FROM knowledge_schedule').all();
}finally{db.close();}}
console.log(JSON.stringify(result,null,2));
