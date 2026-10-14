const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('qol-ui.css','utf8');
test('expanded NHL filters override the legacy non-shrinking ID rule',()=>{
 assert.match(css,/#parlayControls \.smooth-control-row>#nhlMarketFilters\{flex:1 1 100%;width:100%;min-width:0;max-width:100%\}/);
 assert.match(css,/main,#parlayControls\{min-width:0;max-width:100%\}/);
});
test('phone NHL markets use bounded two-column tracks and wrapping touch targets',()=>{
 const phone=css.slice(css.lastIndexOf('@media (max-width:600px)'));
 assert.match(phone,/#nhlMarketChips\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(phone,/#nhlMarketChips \.chip\{width:100%;min-width:0;max-width:100%;min-height:44px!important;white-space:normal;overflow-wrap:anywhere\}/);
});
test('shared sport filters give their sole visible Lines field the full width',()=>{
 assert.match(css,/#parlayControls \.smooth-sport-filters \.nhl-filter-fields\{grid-template-columns:minmax\(0,1fr\)\}/);
});
