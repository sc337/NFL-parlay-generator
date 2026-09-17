(()=>{
const $=s=>document.querySelector(s);let active='nfl',markets=[],loading=false;
const pct=p=>Math.round(p*100), amer=p=>p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p), fmt=o=>o>0?'+'+o:String(o);
function family(m){return m.kind==='moneyline'?'Winner':m.kind==='method_victory'?'Method of victory':m.kind==='distance'?'Distance':m.kind==='round_finish'?'Round finish':'Method of finish'}
function quality(m){
 let s=50;
 const v=Number(m.volume||0),oi=Number(m.open_interest||0),sp=m.spread==null?.12:Number(m.spread),p=Number(m.probability);
 s+=Math.min(18,Math.log10(v+10)*4)+Math.min(7,Math.log10(oi+10)*1.5)-Math.min(20,sp*100);
 if(m.kind==='moneyline')s+=10; else if(m.kind==='distance')s+=5; else if(m.kind==='round_finish')s+=1; else if(m.kind==='method_victory')s-=2; else s-=4;
 if(p>=.56&&p<=.78)s+=7; else if(p<.28||p>.86)s-=10;
 return Math.max(0,Math.min(99,Math.round(s)))
}
function eligible(m,mode='balanced'){
 const q=quality(m),p=Number(m.probability),sp=m.spread==null?.2:Number(m.spread),v=Number(m.volume||0);
 if(v<100||sp>.18)return false;
 if(mode==='bankroll')return m.kind==='moneyline'&&q>=70&&p>=.56&&p<=.82;
 if(mode==='longshot')return q>=58&&p>=.25&&p<=.68;
 return q>=64&&p>=.38&&p<=.80&&m.kind!=='method_finish';
}
function unique(list,n){const out=[];for(const m of list){if(out.some(x=>x.event_ticker===m.event_ticker||x.fight===m.fight))continue;out.push(m);if(out.length===n)break}return out}
function rank(mode){return markets.filter(m=>eligible(m,mode)).sort((a,b)=>quality(b)-quality(a)||Number(b.volume)-Number(a.volume))}
function parlay(ps){let d=1;ps.forEach(x=>d*=1/Number(x.probability));return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1))}
function leg(m,i){return '<div class="leg"><div class="leg-title">'+i+'. '+m.label+'</div><div class="leg-sub">'+m.fight+' · '+family(m)+' · '+pct(m.probability)+'% · '+fmt(amer(m.probability))+'</div></div>'}
function card(title,ps,label,note){if(!ps.length)return'';return '<article class="parlay-card"><div class="parlay-top"><div><span class="grade">'+label+'</span><h3 class="parlay-name">'+title+'</h3></div><div class="odds-wrap"><span class="odds-label">Kalshi est.</span><div class="odds">'+fmt(parlay(ps))+'</div></div></div><p class="summary">'+note+'</p><div class="legs">'+ps.map((m,i)=>leg(m,i+1)).join('')+'</div><div class="card-footer"><span>Market quality '+Math.round(ps.reduce((a,m)=>a+quality(m),0)/ps.length)+'/100</span><span>Independent fights</span></div></article>'}
function render(){
 const r=$('#results'),t=$('#resultsTitle');if(!r)return;t.textContent='UFC Recommendations';
 const safe=rank('bankroll'),bal=rank('balanced'),long=rank('longshot');
 const best=safe[0]||bal[0],two=unique(safe.length>=2?safe:bal,2),three=unique(bal,3),lotto=unique(long.filter(x=>x.probability<.58),3);
 let html='';
 if(best)html+=card('Best Bet',[best],'BEST BET','Prioritizes a liquid fight-winner market, a tight order book, and a disciplined probability band.');
 if(two.length===2)html+=card('Bankroll 2-Leg',two,'BANKROLL','Two separate fights only. Higher-liquidity markets are favored and same-fight correlation is blocked.');
 if(three.length===3)html+=card('Balanced Parlay',three,'BALANCED','Allows selected UFC derivative markets while penalizing wider spreads and volatile outcome types.');
 if(lotto.length===3)html+=card('Higher Payout',lotto,'LONGSHOT','Higher variance by design. Uses qualified prices only and never stacks outcomes from the same fight.');
 r.innerHTML=html||'<div class="empty">Kalshi has UFC markets, but none currently clear the UFC quality gates.</div>';
}
async function load(){if(loading)return;loading=true;const r=$('#results');if(r)r.innerHTML='<div class="empty">Loading Kalshi UFC markets…</div>';try{const res=await fetch('data/kalshi-ufc.json?ts='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error(res.status);const d=await res.json();markets=(d.markets||[]).filter(m=>!m.close_time||new Date(m.close_time)>new Date());render();const s=$('#dataStatus');if(s)s.textContent='Kalshi UFC · '+markets.length+' markets'}catch(e){markets=[];if(r)r.innerHTML='<div class="empty">UFC Kalshi snapshot is refreshing. Try again shortly.</div>';if(t=$('#resultsTitle'))t.textContent='UFC Recommendations'}finally{loading=false}}
function setUI(){const nfl=active==='nfl';document.body.classList.toggle('sport-ufc',!nfl);document.querySelectorAll('[data-sport]').forEach(b=>b.classList.toggle('active',b.dataset.sport===active));['.control-card','.mode-tabs','#qolCommand'].forEach(sel=>{const e=$(sel);if(e)e.style.display=nfl?'':'none'});const e=$('.eyebrow');if(e)e.textContent=nfl?'NFL BETTING':'UFC · KALSHI';if(!nfl)load();else location.reload()}
function mount(){if($('#sportSwitch'))return;const h=$('.topbar');if(!h)return;const n=document.createElement('nav');n.id='sportSwitch';n.className='sport-switch';n.innerHTML='<button class="active" data-sport="nfl">NFL</button><button data-sport="ufc">UFC</button>';h.insertAdjacentElement('afterend',n);n.addEventListener('click',e=>{const b=e.target.closest('[data-sport]');if(!b)return;active=b.dataset.sport;setUI()})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();window.UFC_DASHBOARD={load,quality,eligible};
})();