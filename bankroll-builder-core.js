(()=>{'use strict';
const cents=n=>Math.round(Number(n)*100)/100;
const validMoney=n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=10000000;
const implied=odds=>odds>0?100/(100+odds):Math.abs(odds)/(100+Math.abs(odds));
const decimal=odds=>odds>0?1+odds/100:1+100/Math.abs(odds);
function validOdds(value){const n=Number(value);return Number.isInteger(n)&&((n>=100&&n<=10000)||(n<=-100&&n>=-10000))}
function ev(p,odds){return validOdds(odds)&&Number.isFinite(p)&&p>0&&p<1?p*decimal(Number(odds))-1:null}
function localDay(iso){const d=new Date(iso);return Number.isFinite(+d)?d.toLocaleDateString('en-CA'):''}
function today(start,now=new Date()){return localDay(start)===localDay(now)}
function balances(ledger){let cash=Number(ledger.opening)||0,profit=0,pending=0;
 for(const row of ledger.bets||[]){cash-=Number(row.stake)||0;if(row.status==='pending')pending+=Number(row.stake)||0;
 else {cash+=Number(row.returned)||0;profit+=(Number(row.returned)||0)-(Number(row.stake)||0)}}
 for(const adj of ledger.adjustments||[])cash+=Number(adj.amount)||0;
 return {cash:cents(cash),pending:cents(pending),profit:cents(profit)};
}
function spentToday(ledger,now=new Date()){return cents((ledger.bets||[]).filter(x=>today(x.createdAt,now)&&x.status!=='void').reduce((sum,x)=>sum+(Number(x.stake)||0),0))}
function wholeStake(bankroll,rate,dailyLeft){
 const cash=Number(bankroll),pct=Number(rate),left=Number(dailyLeft);
 if(!Number.isFinite(cash)||!Number.isFinite(pct)||!Number.isFinite(left)||cash<=0||pct<=0)return 0;
 const maximum=Math.floor(Math.min(cash,left,cash*Math.max(pct,.01)));
 if(maximum<1)return 0;
 return Math.min(maximum,Math.max(1,Math.round(cash*pct)));
}
function suggestion({ledger,probability,odds,now=new Date(),eventTime,ageMs=0}){
 const {cash}=balances(ledger),p=Number(probability),value=ev(p,odds),edge=validOdds(odds)?p-implied(Number(odds)):null;
 if(!ledger.initialized)return {stake:0,reason:'Set your bankroll to begin.'};
 if(!validOdds(odds))return {stake:0,reason:'Enter the exact odds offered by your sportsbook.'};
 if(!Number.isFinite(Date.parse(eventTime))||Date.parse(eventTime)<=+now||!today(eventTime,now)||ageMs>5*60000)return {stake:0,reason:'This pick is no longer fresh and pregame today.'};
 if(!Number.isFinite(p)||p<=0||p>=1||value===null||value<.02||edge<.01)return {stake:0,reason:'Pass: no sufficient estimated edge at these odds.',ev:value};
 const left=Math.max(0,cents(cash*.02-spentToday(ledger,now)));
 const stake=wholeStake(cash,.005,left);
 return {stake,ev:value,edge,reason:stake>=1?'Whole dollar stake from available bankroll; $1 minimum and max 2% daily exposure.':'Bankroll or daily budget cannot support a $1 stake; pass.'};
}
function settle(ledger,id,status,time=new Date().toISOString()){
 if(!['won','lost','void'].includes(status))return false;
 const row=(ledger.bets||[]).find(x=>x.id===id&&x.status==='pending');if(!row)return false;
 row.status=status;row.returned=status==='won'?cents(row.stake*decimal(row.odds)):status==='void'?row.stake:0;
 row.settledAt=time;return true;
}
window.BANKROLL_CORE={cents,validMoney,validOdds,implied,ev,localDay,today,balances,spentToday,wholeStake,suggestion,settle};
})();
