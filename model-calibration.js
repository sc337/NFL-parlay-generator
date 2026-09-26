(()=>{'use strict';
const clamp=(p)=>Math.min(.97,Math.max(.03,p));
function apply(sport,group,raw,market){
  const rule=window.MODEL_CALIBRATION_DATA?.sports?.[sport]?.[group];
  if(!rule?.active||!Number.isFinite(raw)||!Number.isFinite(market))return raw;
  return clamp(market+rule.alpha*(raw-market)+rule.bias);
}
window.MODEL_CALIBRATION={apply,rules:sport=>window.MODEL_CALIBRATION_DATA?.sports?.[sport]||{}};
})();
