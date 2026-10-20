(()=>{'use strict';
// Colors describe an explicit UI state, never the sign of a price or forecast.
function profileFor(label){const text=String(label||'').trim();return /^conservative\b/i.test(text)?'conservative':/^(?:balanced|best balance)\b/i.test(text)?'balanced':/^lotto\b/i.test(text)?'lotto':''}
function statusTone(label){const text=String(label||'');
 if(/\b(?:unavailable|withdrawn|inactive|suspended|blocked|invalid|failed|error)\b/i.test(text))return 'danger';
 if(/\b(?:unvalidated|unverified|unconfirmed|experimental|conditional|delayed|stale|expired|questionable|pass)\b|confirm (?:starters|participation|lineup|availability)|no qualifying|not enough qualified|matchup suggestion|market only/i.test(text))return 'warning';
 return 'neutral';
}
function tag(node,key,value){if(node&&node.dataset[key]!==value)node.dataset[key]=value}
function sync(){
 const sport=window.__ACTIVE_SPORT||'nfl',profiles=['nfl','nba'].includes(sport);
 for(const card of document.querySelectorAll('#results>.parlay-card'))tag(card,'colorProfile',profiles?profileFor(card.querySelector('.parlay-name')?.textContent):'');
 for(const button of document.querySelectorAll('#parlaySwipeHint .carousel-dot'))tag(button,'colorProfile',profiles?profileFor(button.textContent):'');
 for(const node of document.querySelectorAll('#results .grade,#results .card-status,#results>.empty,#pickOfDay .pick-foot,#pickOfDay .pick-pass'))tag(node,'tone',statusTone(node.textContent));
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})}
function init(){sync();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-sport']})}
window.PURPOSE_COLORS={profileFor,statusTone,sync};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
