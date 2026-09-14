async function api(url, opts={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});if(r.status===401){location.href='/admin';throw new Error('Unauthorized')}let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Request failed');return d}
let csrf='';
(async()=>{try{const d=await api('/api/admin/session');csrf=d.csrf||''}catch{}})();
function headers(extra={}){return {'Content-Type':'application/json','x-csrf-token':csrf,...extra}}
document.getElementById('logout')?.addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',headers:headers()})}finally{location.href='/admin'}});
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString()}
function toLocal(v){if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
