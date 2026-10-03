'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
function harness() {
  const nodes = Object.create(null);
  const events = {};
  const document = {readyState:'loading',addEventListener:(type, fn)=>{events[type]=fn;},getElementById:(id)=>nodes[id]};
  const logs = [], used = [];
  const c = {document,console,setTimeout,clearTimeout,setInterval,clearInterval,Date,Promise,navigator:{userAgent:'test'}};
  c.window = c;
  c.utools = {copyText:text=>{logs.push(['copy',text]);return true;},hideMainWindowPasteText:text=>logs.push(['paste',text]),hideMainWindowTypeString:text=>logs.push(['type',text]),outPlugin:()=>logs.push(['out']),showNotification:text=>logs.push(['notify',text])};
  c.SBStore = {touchUse:s=>{used.push(s.id);return Promise.resolve();}};
  c.SBDialog = {active:()=>false};
  vm.createContext(c);
  ['engine','ui'].forEach(name=>vm.runInContext(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'),c));
  c.SBUI.toast=(text)=>logs.push(['toast',text]); c.SBUI.renderList=()=>{};
  const source = fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace("  if (document.readyState === 'loading')", "  window.testApp = {state:state,doOutput:doOutput,effectiveMode:effectiveMode,enterOutput:enterOutput,modalOutput:modalOutput,mainQuery:mainQuery,bootstrap:bootstrap};\n  if (document.readyState === 'loading')");
  vm.runInContext(source,c);
  c.testApp.state.settings={output:'paste',pasteMode:'pasteText',invertModifier:true,delimiter:'mustache'};
  c.testApp.state.ctx={now:new Date(2026,9,3),clipboard:'snapshot'};
  return {c,nodes,logs,used,app:c.testApp};
}
(async()=>{
  let checks=0;
  async function check(name, fn){await fn();checks++;console.log('ok '+checks+' - '+name);}
  await check('output respects default and temporary inverse',async()=>{
    const {app}=harness(); assert.equal(app.effectiveMode(false),'paste');assert.equal(app.effectiveMode(true),'copy');
    app.state.settings.output='copy';assert.equal(app.effectiveMode(false),'copy');assert.equal(app.effectiveMode(true),'paste');
    app.state.settings.invertModifier=false;assert.equal(app.effectiveMode(true),'copy');
  });
  await check('successful copy counts only after API success',async()=>{
    const {app,logs,used}=harness();assert.equal(await app.doOutput({id:'one'},'copy','text'),true);
    assert.deepEqual(used,['one']);assert.deepEqual(logs[0],['copy','text']);assert.equal(logs[logs.length - 1][0],'out');
  });
  await check('paste failure falls back to clipboard and does not count',async()=>{
    const {app,c,logs,used}=harness();c.utools.hideMainWindowPasteText=()=>false;
    assert.equal(await app.doOutput({id:'one'},'paste','fallback'),false);assert.equal(used.length,0);
    assert(logs.some(x=>x[0]==='copy'&&x[1]==='fallback'));assert(logs.some(x=>x[0]==='notify'));
  });
  await check('copy rejection leaves count unchanged and permits retry',async()=>{
    const {app,c,used}=harness();c.utools.copyText=()=>Promise.reject(new Error('denied'));
    assert.equal(await app.doOutput({id:'one'},'copy','text'),false);assert.equal(used.length,0);
    c.utools.copyText=()=>true;assert.equal(await app.doOutput({id:'one'},'copy','text'),true);assert.equal(used.length,1);
  });
  await check('output is protected against duplicate submission',async()=>{
    const {app,c,used}=harness();let finish;c.utools.copyText=()=>new Promise(resolve=>{finish=resolve;});
    const first=app.doOutput({id:'one'},'copy','text');await Promise.resolve();
    assert.equal(await app.doOutput({id:'one'},'copy','text'),false);finish(true);await first;assert.equal(used.length,1);
  });
  await check('preview and output share UUID and literal variable values',async()=>{
    const {app,c,logs}=harness();const s={id:'uuid',content:'{{uuid}} {{?constructor}}'};
    const preview=c.SBUI.renderSnippet(app.state,s);const filled=c.SBUI.renderSnippet(app.state,s,JSON.parse('{"constructor":"{{date}}"}'));
    assert.equal(filled.text,preview.text+'{{date}}');await app.doOutput(s,'copy',filled.text);assert.equal(logs[0][1],filled.text);
  });
  await check('search ranks name prefix above exact keyword and substring',async()=>{
    const {app,c}=harness();app.state.query='sig';app.state.filter={type:'all'};
    app.state.snippets=[{id:'c',name:'邮箱 sig',content:'',keyword:'',searchKey:''},{id:'b',name:'邮件',content:'',keyword:'sig',searchKey:''},{id:'a',name:'signature',content:'',keyword:'',searchKey:''}];
    assert.equal(c.SBUI.searchSort(app.state).map(x=>x.id).join(','),'a,b,c');
  });
  await check('main command payload is excluded from search; actual arguments remain',async()=>{
    const {app}=harness();
    ['snippet','snip','片段','SNIPPET'].forEach(payload=>assert.equal(app.mainQuery({type:'text',payload}),''));
    assert.equal(app.mainQuery({type:'text',payload:'snippet 邮件'}),'邮件');
    assert.equal(app.mainQuery({type:'text',payload:'邮件'}),'邮件');
    assert.equal(app.mainQuery({type:'text',payload:'snippetbox'}),'snippetbox');
    assert.equal(app.mainQuery({type:'cmd',payload:'snippet'}),'');
  });
  await check('startup with a missing initialization flag performs no sample writes',async()=>{
    const {app,c,nodes}=harness();let reads=0;
    const node=()=>({hidden:false,value:'',classList:{toggle:()=>{}},addEventListener:()=>{},setAttribute:()=>{},querySelector:()=>({textContent:''}),focus:()=>{}});
    c.document.getElementById=id=>nodes[id]||(nodes[id]=node());
    c.document.documentElement=node();c.document.body=node();c.addEventListener=()=>{};c.setInterval=()=>1;
    c.utools.onPluginEnter=()=>{};
    c.SBStore.getSettings=()=>({output:'paste',theme:'auto',layout:'quick',directPrefix:'',delimiter:'mustache'});
    c.SBStore.loadAll=()=>{reads++;return Promise.resolve({snippets:[],groups:[]});};
    c.SBStore.getFlag=()=>{throw new Error('startup must not depend on an initialization flag');};
    c.SBUI.renderSidebar=()=>{};c.SBUI.renderCtxStat=()=>{};
    app.bootstrap();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(reads,1);assert.equal(app.state.snippets.length,0);assert.equal(app.state.groups.length,0);
    assert(!c.document.body.innerHTML,'startup should succeed without seeding');
  });
  console.log('Passed '+checks+' application checks.');
})().catch(err=>{console.error(err);process.exitCode=1;});
