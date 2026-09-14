(() => {
  const BANKROLL_KEY='nflParlayBankroll:v1';

  function hiddenCurrent(){ return document.getElementById('currentBankroll'); }
  function hiddenStart(){ return document.getElementById('startingBankroll'); }
  function currentValue(){
    const n=Number(hiddenCurrent()?.value);
    if(Number.isFinite(n)) return Math.max(0,n);
    try{
      const saved=JSON.parse(localStorage.getItem(BANKROLL_KEY)||'{}');
      return Math.max(0,Number(saved.current)||0);
    }catch{return 0;}
  }
  function money(n){return (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});}

  function commit(value){
    const n=Math.max(0,Number(value));
    if(!Number.isFinite(n)) return false;
    const current=hiddenCurrent();
    if(!current) return false;
    current.value=String(n);
    current.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }

  function patch(){
    const tracker=document.querySelector('.qtracker');
    const bank=tracker?.querySelector('.bank-stat');
    if(!tracker||!bank) return;

    tracker.querySelector('.tracker-menu')?.remove();

    const value=currentValue();
    bank.classList.add('bank-edit-stat');
    bank.innerHTML=`
      <label for="qBankrollEdit">Current Bankroll</label>
      <div class="qbank-input"><span>$</span><input id="qBankrollEdit" type="number" min="0" step="0.01" inputmode="decimal" value="${value.toFixed(2)}" aria-label="Current bankroll"></div>
      <small>1 Unit (1%) <b>${money(value*.01)}</b></small>`;

    const input=bank.querySelector('#qBankrollEdit');
    const save=()=>{
      if(!commit(input.value)) input.value=currentValue().toFixed(2);
    };
    input.addEventListener('change',save,{once:true});
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        input.blur();
      }
    });
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(patch,80));
  window.addEventListener('nfl-qol-rendered',()=>setTimeout(patch,0));
  window.NFL_BANKROLL_EDITOR={refresh:patch,set:commit,current:currentValue};
})();