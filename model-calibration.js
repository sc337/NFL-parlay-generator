(()=>{'use strict';
const clamp=(p)=>Math.min(.97,Math.max(.03,p));
function validated(sport,group){
 const rule=window.MODEL_CALIBRATION_DATA?.sports?.[sport]?.[group];
 const at=Date.parse(window.MODEL_CALIBRATION_DATA?.updated_at||'');
 return !!(rule?.active&&rule.trainingCount>=30&&rule.validationCount>=20&&rule.distinctEvents>=50&&
  Number.isFinite(at)&&at<=Date.now()+300000&&Date.now()-at<=7*86400000&&
  Number.isFinite(rule.adjustedBrier)&&Number.isFinite(rule.marketBrier)&&Number.isFinite(rule.rawBrier)&&
  rule.adjustedBrier<=rule.marketBrier-.002&&rule.adjustedBrier<=rule.rawBrier-.002);
}
function apply(sport,group,raw,market){
  const rule=window.MODEL_CALIBRATION_DATA?.sports?.[sport]?.[group];
  if(!validated(sport,group)||!Number.isFinite(raw)||!Number.isFinite(market))return raw;
  return clamp(market+rule.alpha*(raw-market)+rule.bias);
}
window.MODEL_CALIBRATION={apply,validated,rules:sport=>window.MODEL_CALIBRATION_DATA?.sports?.[sport]||{}};
})();
