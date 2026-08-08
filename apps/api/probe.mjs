const API='http://localhost:3001';
async function login(p){const r=await fetch(API+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:p,password:'demo1234'})});const j=await r.json();return j;}
for (const [vai,p] of [['OWNER','0901000001'],['BRANCH_MANAGER','0901000002'],['SERVICE_ADVISOR','0901000003'],['TECHNICIAN','0901000004']]) {
  const j = await login(p);
  console.log(vai, 'branchIds =', JSON.stringify(j.user.branchIds));
}
const t = (await login('0901000004')).accessToken;
for (const [ten, path, body] of [
  ['supplement resolve (thợ)','/api/v1/supplements/00000000-0000-0000-0000-0000000000ff/resolve',{decision:'CANCEL',note:'thử'}],
  ['time-logs/enter (thợ)','/api/v1/time-logs/enter',{workAssignmentId:'00000000-0000-0000-0000-0000000000ff',startedAt:new Date(Date.now()-7200000).toISOString(),endedAt:new Date(Date.now()-3600000).toISOString()}],
]) {
  const r = await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify(body)});
  console.log(ten, '->', r.status, (await r.text()).slice(0,140));
}
