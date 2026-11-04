const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const document={readyState:'loading',addEventListener(){}};const window={};vm.runInNewContext(fs.readFileSync('gui-polish.js','utf8'),{document,window});return window.GUI_POLISH;}
test('empty actions distinguish missing dates, delayed feeds and a genuine eligibility pass',()=>{
 const ui=setup();assert.equal(ui.actionKind('No upcoming quoted events for this date'),'next');
 for(const text of ['Feed unavailable or delayed','NBA snapshot is refreshing','Data failed'])assert.equal(ui.actionKind(text),'refresh');
 assert.equal(ui.actionKind('No qualifying straight for this date · Pass'),'');assert.equal(ui.actionKind('Not enough qualified legs'),'');
});
