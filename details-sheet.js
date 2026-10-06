(()=>{'use strict';
const selector='.card-explanation, .leg-details, .ticket-details';
let dialog,content,title,trigger,source,sport,slots=[],position=0;
function restore(){
 for(const {node,marker} of slots){if(marker.parentNode&&source?.isConnected)marker.replaceWith(node);else marker.remove()}
 slots=[];if(source?.isConnected)for(const node of [...content.childNodes])source.append(node);content?.replaceChildren();
 document.body.classList.remove('details-sheet-open');
 document.documentElement.style.removeProperty('--details-scroll-offset');
 window.scrollTo({top:position,left:0,behavior:'instant'});
 if(trigger?.isConnected)trigger.focus({preventScroll:true});
 trigger=null;source=null;
}
function close(){if(dialog?.open)dialog.close()}
function mount(){
 if(dialog)return;
 dialog=document.createElement('dialog');dialog.id='pickDetailsSheet';dialog.className='details-sheet';
 dialog.setAttribute('aria-labelledby','pickDetailsTitle');
 dialog.innerHTML='<div class="details-sheet-frame"><header class="details-sheet-header"><div><span class="details-sheet-kicker">PICK DETAILS</span><h2 id="pickDetailsTitle">Details</h2></div><button type="button" class="details-sheet-close" aria-label="Close pick details">Close</button></header><div class="details-sheet-scroll" tabindex="0" role="region" aria-label="Pick analysis"><div class="details-sheet-content"></div></div></div>';
 document.body.append(dialog);content=dialog.querySelector('.details-sheet-content');title=dialog.querySelector('h2');
 dialog.querySelector('button').addEventListener('click',close);
 dialog.addEventListener('close',restore);
 dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
 new MutationObserver(()=>{if(dialog.open&&(!source?.isConnected||document.body.dataset.sport!==sport))close()}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-sport']});
}
function open(details,button){
 mount();if(dialog.open)return;source=details;trigger=button;position=window.scrollY;sport=document.body.dataset.sport;
 const card=details.closest('.parlay-card,.qcard'),leg=details.closest('.leg');
 const heading=leg?.querySelector('.leg-title')||card?.querySelector('.parlay-name,h3,.ticket-main h3');
 title.textContent=(document.body.dataset.sport||'nfl').toUpperCase()+' · '+(heading?.textContent.trim()||'Pick details');
 // Move, rather than clone, so listeners, IDs and expanded analysis survive.
 for(const node of [...details.childNodes]){if(node===button||node.nodeType===1&&node.tagName==='SUMMARY')continue;const marker=document.createComment('pick-detail');details.insertBefore(marker,node);slots.push({node,marker});content.append(node)}
 if(card?.classList.contains('qcard')){content.classList.add('qcard');content.dataset.k=card.dataset.k||''}else{content.classList.remove('qcard');delete content.dataset.k}
 details.open=false;
 document.documentElement.style.setProperty('--details-scroll-offset',-position+'px');document.body.classList.add('details-sheet-open');
 dialog.showModal();dialog.querySelector('.details-sheet-scroll').scrollTop=0;dialog.querySelector('button').focus({preventScroll:true});
}
document.addEventListener('click',e=>{const summary=e.target.closest?.('summary');if(!summary)return;const details=summary.parentElement;if(!details?.matches(selector)||!details.closest('#results,#analysisSecondary,#qolV3'))return;e.preventDefault();open(details,summary)});
window.PICK_DETAILS_SHEET={close};
})();
