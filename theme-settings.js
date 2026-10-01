(()=>{'use strict';
const key='sportsDashboardTheme',root=document.documentElement;
const system=window.matchMedia?.('(prefers-color-scheme: light)');
function preference(){try{return localStorage.getItem(key)||'system'}catch{return 'system'}}
function apply(choice=preference()){
  const selected=['system','light','dark'].includes(choice)?choice:'system';
  const resolved=selected==='system'?(system?.matches?'light':'dark'):selected;
  root.dataset.themePreference=selected;root.dataset.theme=resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='light'?'#f5f7fa':'#0a121c');
  document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===selected)));
}
function mount(){
  const dialog=document.querySelector('#settingsDialog');
  document.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{
    try{localStorage.setItem(key,button.dataset.themeChoice)}catch{}
    apply(button.dataset.themeChoice);
  }));
  system?.addEventListener?.('change',()=>{if(preference()==='system')apply()});
  document.querySelector('#settingsBtn')?.addEventListener('click',()=>requestAnimationFrame(()=>document.querySelector('#settingsTitle')?.focus({preventScroll:true})));
  const toggle=document.querySelector('#toggleKeyVisibility'),input=document.querySelector('#apiKeyInput');
  toggle?.addEventListener('click',()=>{
    const visible=input.type==='password';input.type=visible?'text':'password';
    toggle.textContent=visible?'Hide':'Show';toggle.setAttribute('aria-label',(visible?'Hide':'Show')+' API key');toggle.setAttribute('aria-pressed',String(visible));
  });
  dialog?.addEventListener('close',()=>{if(input)input.type='password';if(toggle){toggle.textContent='Show';toggle.setAttribute('aria-label','Show API key');toggle.setAttribute('aria-pressed','false')}});
  apply();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
