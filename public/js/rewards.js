const $=id=>document.getElementById(id);
async function getJson(url,opts={}){const r=await fetch(url,{cache:'no-store',...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Request failed');return d;}
function fmtDate(v){if(!v)return 'Not set';const d=new Date(v);return Number.isNaN(d.getTime())?'Not set':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
function makeField(field){
  const wrap=document.createElement('div');wrap.className='dynamic-field';
  const label=document.createElement('label');label.htmlFor=`field-${field.id}`;label.textContent=field.label;
  if(field.required){const s=document.createElement('span');s.className='required-star';s.textContent=' *';label.appendChild(s);}
  wrap.appendChild(label);
  let input;
  if(field.field_type==='textarea'){input=document.createElement('textarea');input.rows=4}
  else {input=document.createElement('input');input.type=field.field_type==='url'?'url':field.field_type==='email'?'email':field.field_type==='number'?'number':'text';}
  input.className='field-input';input.id=`field-${field.id}`;input.name=field.id;input.placeholder=field.placeholder||'';input.required=!!field.required;input.autocomplete='off';
  wrap.appendChild(input);
  if(field.copy_enabled){const b=document.createElement('button');b.type='button';b.className='copy-btn';b.textContent='Copy';b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(input.value);b.textContent='Copied!';setTimeout(()=>b.textContent='Copy',1200)}catch{b.textContent='Copy unavailable';setTimeout(()=>b.textContent='Copy',1200)}});wrap.appendChild(b);}
  return wrap;
}
(async()=>{
  $('year').textContent=new Date().getFullYear();
  try{
    const [settings,g]=await Promise.all([getJson('/api/settings'),getJson('/api/giveaway')]);
    $('securityMessage').textContent=settings.security_message||'Your submitted information is secured and will not be publicly displayed.';
    if(!g.giveaway){$('loading').classList.add('hidden');$('emptyState').classList.remove('hidden');return;}
    const giveaway=g.giveaway;
    $('loading').classList.add('hidden');$('rewardSection').classList.remove('hidden');
    $('status').textContent=giveaway.status;
    $('rewardTitle').textContent=giveaway.title;
    $('rewardDescription').textContent=giveaway.description||giveaway.reward_information||'';
    $('startDate').textContent=fmtDate(giveaway.start_date);
    $('endDate').textContent=fmtDate(giveaway.end_date);
    if(giveaway.image_url){$('rewardImage').src=giveaway.image_url;$('rewardImage').classList.remove('hidden');}
    const f=await getJson('/api/fields');
    const box=$('dynamicFields');box.innerHTML='';
    (f.fields||[]).forEach(field=>box.appendChild(makeField(field)));
    if(giveaway.status!=='active'){$('submitBtn').disabled=true;$('formError').textContent=`This giveaway is ${giveaway.status} and is not accepting submissions.`}
    $('claimForm').addEventListener('submit',async e=>{
      e.preventDefault();$('formError').textContent='';
      if(!$('agree').checked){$('formError').textContent='Please agree to the terms and conditions.';return;}
      const values={};document.querySelectorAll('#dynamicFields [name]').forEach(el=>values[el.name]=el.value);
      $('submitBtn').disabled=true;$('submitBtn').textContent='Submitting…';
      try{
        await getJson('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});
        $('rewardSection').classList.add('hidden');$('successState').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
      }catch(err){$('formError').textContent=err.message;$('submitBtn').disabled=false;$('submitBtn').textContent='Submit Claim';}
    });
  }catch(e){$('loading').textContent='Unable to load the giveaway right now. Please refresh and try again.';}
})();
