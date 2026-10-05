(()=>{'use strict';
function mount(){
 const root=document.documentElement,dialog=document.querySelector('#settingsDialog');
 const mobile=window.matchMedia('(max-width:600px), (max-width:940px) and (pointer:coarse) and (orientation:landscape)');
 let locked=false,scrollY=0,frame=null;
 function viewport(){
  const v=window.visualViewport;
  // Pinch zoom must keep its native viewport behavior.
  if(v&&v.scale!==1)return;
  root.style.setProperty('--iphone-visible-height',Math.round(v?.height||window.innerHeight)+'px');
  root.style.setProperty('--iphone-keyboard-inset',Math.max(0,Math.round(window.innerHeight-(v?v.height+v.offsetTop:window.innerHeight)))+'px');
 }
 function schedule(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;viewport()})}
 function sync(){
  const shouldLock=!!dialog?.open&&mobile.matches;
  if(shouldLock&&!locked){scrollY=window.scrollY;root.style.setProperty('--iphone-scroll-offset',-scrollY+'px');document.body.classList.add('iphone-settings-open');locked=true}
  else if(!shouldLock&&locked){document.body.classList.remove('iphone-settings-open');root.style.removeProperty('--iphone-scroll-offset');locked=false;window.scrollTo({top:scrollY,left:0,behavior:'instant'})}
  schedule();
 }
 if(dialog){new MutationObserver(sync).observe(dialog,{attributes:true,attributeFilter:['open']});dialog.addEventListener('close',sync)}
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',schedule,{passive:true});
 mobile.addEventListener('change',sync);
 viewport();sync();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
