// Build-only dependencies: @larksuiteoapi/lark-mcp@0.5.1, zod@3.25.76,
// zod-to-json-schema@3.24.6 installed in a separate temporary directory.
// Usage: node scripts/build-office-catalog.cjs /absolute/build-directory output.json
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const build=path.resolve(process.argv[2]),requireBuild=createRequire(path.join(build,'package.json'));
const {z}=requireBuild('zod'),{zodToJsonSchema}=requireBuild('zod-to-json-schema');
const root=path.join(build,'node_modules/@larksuiteoapi/lark-mcp');
if(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version!=='0.5.1')throw Error('Expected pinned lark-mcp 0.5.1');
function allowed(t){const [project,,resource,action]=t.name.split('.');
 if(project==='docx')return !resource.startsWith('chatAnnouncement');
 if(project==='contact')return ['user','department'].includes(resource)&&['get','list','findByDepartment','batchGetId','search'].includes(action);
 if(project==='vc')return ['meeting','reserve','meetingRecording'].includes(resource)&&!['end','set','setHost','start','stop'].includes(action);
 if(project==='drive')return !(/permission|Subscription|Subscribe|subscribe|upload/i.test(resource+'.'+action));
 if(project==='wiki')return !/spaceMember|spaceSetting/.test(resource);
 if(project==='calendar')return !/calendarAcl|exchangeBinding|setting|timeoffEvent|MeetingChat|subscription/i.test(resource+'.'+action);
 if(project==='bitable')return !/Role|Workflow/.test(resource);
 return ['sheets','task','search'].includes(project);
}
const tools=[];
for(const name of ['docx_v1','drive_v1','bitable_v1','sheets_v3','wiki_v2','calendar_v4','task_v2','contact_v3','vc_v1','search_v2']){
 const module=requireBuild(path.join(root,'dist/mcp-tool/tools/zh/gen-tools/zod',name+'.js'));
 for(const t of Object.values(module)){if(!t?.sdkName||!allowed(t))continue;const {useUAT,...shape}=t.schema;
 tools.push({name:t.name,sdkName:t.sdkName,method:t.httpMethod,tokens:t.accessTokens,description:t.description,schema:zodToJsonSchema(z.object(shape).strict(),{$refStrategy:'root',target:'jsonSchema7'})});
 }
}
fs.writeFileSync(process.argv[3],JSON.stringify({source:'@larksuiteoapi/lark-mcp',version:'0.5.1',license:'MIT',tools},null,2)+'\n');
