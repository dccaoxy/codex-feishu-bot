// Read-only status. No message bodies, identifiers, credentials, or model call.
import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {loadConfig} from '../src/config.mjs';
const c=loadConfig(undefined,false),file=path.join(c.storageDir,'groups','groups.sqlite');
const result={enabled:c.groups.enabled,allowedGroups:c.groups.allowedChatIds.length,retentionDays:c.groups.retentionDays,databaseExists:fs.existsSync(file)};
if(result.databaseExists){const db=new DatabaseSync(file,{readOnly:true});try{result.messagesByState=db.prepare('SELECT state,COUNT(*) AS count FROM messages GROUP BY state').all();if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='history_sync'").get()){result.historySync=db.prepare('SELECT state,initial_complete,COUNT(*) count,MIN(last_reconciled_at) oldestReconciliation FROM history_sync GROUP BY state,initial_complete').all();result.groupThreads=db.prepare('SELECT state,COUNT(*) count,SUM(cursor>0) checkpointed FROM group_threads GROUP BY state').all();}
if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='group_requests'").get())result.requestsByState=db.prepare('SELECT state,COUNT(*) count FROM group_requests GROUP BY state').all();
result.stoppedGroups=db.prepare('SELECT COUNT(*) AS count FROM stopped').get().count;}finally{db.close();}}
console.log(JSON.stringify(result,null,2));
