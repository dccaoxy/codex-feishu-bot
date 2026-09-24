// Read-only status. No message bodies, identifiers, credentials, or model call.
import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {loadConfig} from '../src/config.mjs';
const c=loadConfig(undefined,false),file=path.join(c.storageDir,'groups','groups.sqlite');
const result={enabled:c.groups.enabled,allowedGroups:c.groups.allowedChatIds.length,retentionDays:c.groups.retentionDays,databaseExists:fs.existsSync(file)};
if(result.databaseExists){const db=new DatabaseSync(file,{readOnly:true});try{result.messagesByState=db.prepare('SELECT state,COUNT(*) AS count FROM messages GROUP BY state').all();result.stoppedGroups=db.prepare('SELECT COUNT(*) AS count FROM stopped').get().count;}finally{db.close();}}
console.log(JSON.stringify(result,null,2));
