(() => {
  function position(){
    const root=document.getElementById('qolV3');
    const hero=document.querySelector('.hero');
    if(!root||!hero)return false;
    if(hero.nextElementSibling!==root) hero.insertAdjacentElement('afterend',root);
    return true;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(position())return;
    let tries=0;
    const t=setInterval(()=>{tries++;if(position()||tries>20)clearInterval(t)},50);
  });
})();