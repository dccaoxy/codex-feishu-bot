import fs from 'node:fs';import path from 'node:path';import {DatabaseSync,constants as C} from 'node:sqlite';
process.once('message',({resource:r,query:q})=>{let db,result;
try{
 if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).some(k=>!['table','columns','where','groupBy','metrics','limit','derive'].includes(k)))throw Error();
 const columns=Object.hasOwn(r.tables,q.table)&&r.tables[q.table];if(!columns)throw Error();
 const ident=x=>{if(!columns.includes(x))throw Error();return '"'+x+'"';};
 const limit=q.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error();
 const group=q.groupBy??[],metrics=q.metrics??[],where=q.where??[];if(!Array.isArray(group)||group.length>3||!Array.isArray(metrics)||metrics.length>8||!Array.isArray(where)||where.length>8)throw Error();
 let projection;if(metrics.length){if(!r.permissions.includes('compute')||q.columns)throw Error();projection=[...group.map(ident),...metrics.map((m,i)=>{if(!m||Object.keys(m).some(k=>!['op','column'].includes(k))||!['count','sum','avg','min','max'].includes(m.op))throw Error();return `${m.op}(${m.op==='count'&&!m.column?'*':ident(m.column)}) AS metric_${i}`;})];}else{if(group.length||!Array.isArray(q.columns)||!q.columns.length||q.columns.length>10)throw Error();projection=q.columns.map(ident);}
 const derive=q.derive??[];
 if(!Array.isArray(derive)||derive.length>4||derive.length&&!r.permissions.includes('compute'))throw Error();
 for(const d of derive)if(!d||Object.keys(d).some(k=>!['op','left','right'].includes(k))||!['difference','ratio','growth'].includes(d.op)||![d.left,d.right].every(i=>Number.isInteger(i)&&i>=0&&i<metrics.length))throw Error();
 const values=[];const filters=where.map(f=>{if(!f||Object.keys(f).some(k=>!['column','op','value'].includes(k))||!['=','!=','>','>=','<','<='].includes(f.op)||!['string','number'].includes(typeof f.value)||String(f.value).length>500)throw Error();values.push(f.value);return `${ident(f.column)} ${f.op} ?`;});
 const absolute=path.resolve(r.path);if(fs.realpathSync(absolute)!==absolute||!fs.statSync(absolute).isFile())throw Error();const stat=fs.statSync(absolute);
 db=new DatabaseSync(absolute,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false});
 const after=fs.statSync(absolute);if(stat.ino!==after.ino||stat.dev!==after.dev||fs.realpathSync(absolute)!==absolute)throw Error();
 db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
 db.setAuthorizer((action,a,b,name,view)=>{
  if(action===C.SQLITE_SELECT)return C.SQLITE_OK;
  if(action===C.SQLITE_READ&&name==='main'&&!view&&a===q.table&&(b===''||columns.includes(b)))return C.SQLITE_OK;
  if(action===C.SQLITE_FUNCTION&&['count','sum','avg','min','max'].includes(b))return C.SQLITE_OK;
  return C.SQLITE_DENY;
 });
 const sql=`SELECT ${projection.join(',')} FROM "${q.table}"${filters.length?' WHERE '+filters.join(' AND '):''}${group.length?' GROUP BY '+group.map(ident).join(','):''} LIMIT ${limit+1}`;
 process.send({phase:'query-started'});
 const rows=[];let bytes=0;for(const row of db.prepare(sql).iterate(...values)){if(rows.length===limit)throw Error();if(Object.values(row).some(v=>v!==null&&(!['string','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))))throw Error();for(const [i,d] of derive.entries()){
  const l=row['metric_'+d.left],v=row['metric_'+d.right];
  if(typeof l!=='number'||typeof v!=='number')throw Error();
  const result=d.op==='difference'?l-v:v===0?null:d.op==='growth'?(l-v)/v:l/v;
  if(result!==null&&!Number.isFinite(result))throw Error();row['derived_'+i]=result;
 }bytes+=JSON.stringify(row).length;if(bytes>16000)throw Error();rows.push(row);}
 result={ok:true,result:{rows,range:{table:q.table,where,groupBy:group,metrics,derive,limit},readAt:new Date().toISOString(),complete:true}};
}catch{result={ok:false};}finally{db?.close();}
process.send(result,()=>process.disconnect());
});
