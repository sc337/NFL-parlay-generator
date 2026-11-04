(()=>{'use strict';
const $=s=>document.querySelector(s);
function actionKind(text){return /unavailable|delayed|stale|failed|refreshing/i.test(text)?'refresh':/No upcoming quoted events/i.test(text)?'next':''}
function emptyActions(host,text){
 const kind=actionKind(text);let group=host.querySelector('.empty-actions');
 const existing=group?.querySelector('[data-empty-action]');
 if(!kind){existing?.remove();return}
 if(!group){group=document.createElement('div');group.className='empty-actions';host.append(group)}
 let button=existing;
 if(button&&button.dataset.emptyAction!==kind){button.remove();button=null}
 if(!button){button=document.createElement('button');button.type='button';button.dataset.emptyAction=kind;button.textContent=kind==='next'?'Next slate':'Refresh markets';button.addEventListener('click',()=>{if(kind==='next')window.SLATE_UI?.set(window.__ACTIVE_SPORT||'nfl','next');else $('#feedRefresh')?.click()});group.prepend(button)}
 const disabled=kind==='refresh'&&!!$('#feedRefresh')?.disabled;
 if(button.disabled!==disabled)button.disabled=disabled;
}
function sync(){
 const results=$('#results');if(!results)return;
 let toolbar=$('#recommendationToolbar');
 if(!toolbar){toolbar=document.createElement('div');toolbar.id='recommendationToolbar';toolbar.innerHTML='<h2>Parlay picks</h2><span id="recommendationUpdate" role="status" aria-live="polite"></span>';results.before(toolbar)}
 const updating=results.getAttribute('aria-busy')==='true'||!!$('#feedRefresh')?.disabled;
 const indicator=$('#recommendationUpdate'),label=updating?'Updating…':'';
 if(indicator.textContent!==label)indicator.textContent=label;
 for(const host of document.querySelectorAll('#results > .empty'))emptyActions(host,host.querySelector('.empty-message')?.textContent||host.textContent);
 const pass=$('#pickOfDayContent .pick-pass');if(pass)emptyActions($('#pickOfDayContent'),pass.textContent);
 const source=$('#legsSelect');if(source){
  let group=$('#legCountButtons');
  if(!group){group=document.createElement('div');group.id='legCountButtons';group.setAttribute('role','group');group.setAttribute('aria-label','Number of parlay legs');
   for(const value of ['2','3']){const button=document.createElement('button');button.type='button';button.dataset.legs=value;button.textContent=value+' legs';button.addEventListener('click',()=>{source.value=value;source.dispatchEvent(new Event('change',{bubbles:true}))});group.append(button)}source.after(group);source.classList.add('gui-native-legs');}
  for(const button of group.children){const option=[...source.options].find(o=>o.value===button.dataset.legs);const disabled=source.disabled||!option||option.disabled;button.disabled=!!disabled;button.hidden=!!option?.hidden;const pressed=String(source.value===button.dataset.legs);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed)}
 }
 for(const button of document.querySelectorAll('.mode-tabs [data-mode]')){const value=String(button.classList.contains('active'));if(button.getAttribute('aria-pressed')!==value)button.setAttribute('aria-pressed',value)}
}
let queued=false,observer;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;observer.disconnect();sync();observe()})}
function observe(){observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sport','aria-busy','disabled','class']})}
function init(){observer=new MutationObserver(schedule);sync();observe();document.addEventListener('change',schedule)}
window.GUI_POLISH={actionKind,sync};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
