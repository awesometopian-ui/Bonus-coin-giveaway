async function getJson(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Request failed');return r.json();}
(async()=>{
  document.getElementById('year').textContent=new Date().getFullYear();
  try{
    const [settings,giveaway]=await Promise.all([getJson('/api/settings'),getJson('/api/giveaway')]);
    document.getElementById('welcomeHeading').textContent=settings.welcome_heading||'Bonus Coin Giveaway';
    document.getElementById('welcomeMessage').textContent=settings.welcome_message||'';
    document.getElementById('securityMessage').textContent=settings.security_message||'';
    const buttons=document.querySelectorAll('.actions .btn');
    buttons[0].textContent=settings.primary_button_text||'Claim Reward';
    buttons[1].textContent=settings.secondary_button_text||'View Rewards';
    document.getElementById('heroBadge').textContent=giveaway.giveaway?'Welcome':'Check back soon';
  }catch(e){
    document.getElementById('welcomeMessage').textContent='Welcome to Bonus Coin Giveaway. Please check back for the latest giveaway.';
  }
})();
