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
  const logs = [], used = [], stored = Object.create(null), callbacks = {};
  const c = {document,console,setTimeout,clearTimeout,setInterval,clearInterval,Date,Promise,navigator:{userAgent:'test'}};
  c.window = c;
  c.utools = {copyText:text=>{logs.push(['copy',text]);return true;},hideMainWindowPasteText:text=>logs.push(['paste',text]),hideMainWindowTypeString:text=>logs.push(['type',text]),hideMainWindow:()=>logs.push(['hide']),outPlugin:()=>logs.push(['out']),showNotification:text=>logs.push(['notify',text]),onMainPush:(results,select)=>{callbacks.results=results;callbacks.select=select;},onPluginEnter:fn=>{callbacks.enter=fn;}};
  c.SBStore = {touchUse:s=>{used.push(s.id);s.useCount=(s.useCount||0)+1;return Promise.resolve();},getSnippetSync:id=>stored[id] ? Object.assign({},stored[id]) : null,getSettings:()=>Object.assign({},c.testApp.state.settings)};
  c.SBDialog = {active:()=>false};
  vm.createContext(c);
  ['engine','ui'].forEach(name=>vm.runInContext(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'),c));
  c.SBUI.toast=(text)=>logs.push(['toast',text]); c.SBUI.renderList=()=>{};
  vm.runInContext(fs.readFileSync(path.join(root,'js/direct.js'),'utf8'),c);
  const source = fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace("  if (document.readyState === 'loading')", "  window.testApp = {state:state,doOutput:doOutput,effectiveMode:effectiveMode,enterOutput:enterOutput,modalOutput:modalOutput,mainQuery:mainQuery,bootstrap:bootstrap,addExamples:addExamples,syncFeatures:syncFeatures,handleEnter:Direct.handleEnter,mainPushResults:Direct.mainPushResults,selectMainPush:Direct.selectMainPush};\n  if (document.readyState === 'loading')");
  vm.runInContext(source,c);
  c.testApp.state.settings={output:'paste',pasteMode:'pasteText',invertModifier:true,delimiter:'mustache'};
  c.testApp.state.ctx={now:new Date(2026,9,3),clipboard:'snapshot'};
  return {c,nodes,logs,used,stored,callbacks,app:c.testApp};
}
const flush = () => new Promise(resolve=>setImmediate(resolve));
function prepareBootstrap(env) {
  const {app,c,nodes,logs}=env;
  const node=()=>({hidden:false,value:'',classList:{toggle:()=>{}},addEventListener:()=>{},setAttribute:()=>{},removeAttribute:()=>{},querySelector:()=>({textContent:'',focus:()=>{}}),focus:()=>{}});
  c.document.getElementById=id=>nodes[id]||(nodes[id]=node());
  c.document.documentElement=node();c.document.body=node();c.addEventListener=()=>{};c.setInterval=()=>1;
  Object.assign(app.state.settings,{theme:'auto',layout:'quick',directPrefix:''});
  c.SBStore.addExamples=()=>Promise.resolve({added:0});
  c.SBStore.loadAll=()=>Promise.resolve({snippets:Object.values(env.stored),groups:[]});
  c.SBUI.showView=view=>logs.push(['view',view]);c.SBUI.renderList=()=>logs.push(['renderList']);c.SBUI.renderCtxStat=()=>{};
}
function directFixture(env, content='固定签名') {
  const snippet={id:'sign',name:'签名',content,keyword:'sgin',direct:true,useCount:0};
  env.stored.sign=snippet;
  return {snippet,action:{code:'snip:sign',type:'text',payload:';sgin',from:'main'}};
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
  await check('direct features enable push; only variables require a visible window',async()=>{
    const env=harness();const {app,c}=env;
    const {snippet}=directFixture(env);
    app.state.settings.directPrefix=';';
    app.state.snippets=[snippet,{id:'variable',name:'模板',content:'{{?姓名}}',keyword:'form',direct:true}];
    const features=[];c.utools.getFeatures=()=>[];c.utools.setFeature=f=>{features.push(f);return true;};
    app.syncFeatures();
    assert.equal(features[0].cmds[0],';sgin');assert.equal(features[0].mainPush,true);assert.equal(features[0].mainHide,true);
    assert.equal(features[1].mainPush,true);assert.equal(features[1].mainHide,false);
  });
  await check('cold push selection outputs without entering or rendering the plugin',async()=>{
    const env=harness();const {app,c,callbacks,logs,used}=env;
    const {action}=directFixture(env,'签名 {{clipboard}}');prepareBootstrap(env);
    let initialize;c.SBStore.addExamples=()=>new Promise(resolve=>{initialize=resolve;});
    c.api={readClipboard:()=>Promise.resolve('新剪贴板'),getSys:()=>Promise.resolve({}),getRuntime:()=>Promise.resolve({})};
    app.bootstrap();
    assert.equal(callbacks.results(action)[0].text,'签名');
    assert.equal(callbacks.select(action),false,'callback must return a boolean synchronously');
    await flush();
    assert(logs.some(x=>x[0]==='paste'&&x[1]==='签名 新剪贴板'));assert.deepEqual(used,['sign']);
    initialize({added:0});await flush();
    assert(!logs.some(x=>['view','renderList','out','toast'].includes(x[0])));
    assert.equal(app.state.ctx.clipboard,'snapshot','silent output must not overwrite the page preview snapshot');
  });
  await check('variable push selection enters the existing fill form without output',async()=>{
    const env=harness();const {app,callbacks,logs,used,nodes}=env;
    const {action}=directFixture(env,'你好 {{?姓名=朋友}}');prepareBootstrap(env);
    app.bootstrap();
    assert.equal(callbacks.select(action),true);
    callbacks.enter(action);await flush();
    assert.equal(app.state.modal.snippet.id,'sign');assert.equal(app.state.modal.values['姓名'],'朋友');
    assert.equal(nodes.varScrim.hidden,false);assert.equal(used.length,0);
    assert(!logs.some(x=>['paste','copy','type','hide'].includes(x[0])));
  });
  await check('push selection rechecks latest content and delimiter instead of a stale result',async()=>{
    const env=harness();const {app,stored,logs}=env;const {action}=directFixture(env);
    assert.equal(app.mainPushResults(action).length,1);
    stored.sign.content='[[?姓名]]';app.state.settings.delimiter='bracket';
    assert.equal(app.selectMainPush(action),true);await flush();assert.equal(logs.length,0);
    stored.sign.content='\\[[?姓名]]';
    assert.equal(app.selectMainPush(action),false);await flush();
    assert(logs.some(x=>x[0]==='paste'&&x[1]==='[[?姓名]]'));
  });
  await check('deleted or disabled direct commands cannot output stale pushed content',async()=>{
    const env=harness();const {app,stored,logs,used}=env;const {action}=directFixture(env);
    assert.equal(app.mainPushResults(action).length,1);stored.sign.direct=false;
    assert.equal(app.mainPushResults(action).length,0);assert.equal(app.selectMainPush(action),false);
    delete stored.sign;assert.equal(app.selectMainPush(action),false);await flush();
    assert.equal(used.length,0);assert.equal(logs.filter(x=>x[0]==='notify').length,2);
    assert(!logs.some(x=>['paste','copy','type'].includes(x[0])));
    assert.equal(app.mainPushResults({code:'main'}).length,0);assert.equal(app.selectMainPush({code:'main'}),true);
  });
  await check('duplicate push selections are blocked while context capture is pending',async()=>{
    const env=harness();const {app,c,logs,used}=env;const {action}=directFixture(env);
    let finish;c.utools.readCurrentFolderPath=()=>new Promise(resolve=>{finish=resolve;});
    assert.equal(app.selectMainPush(action),false);assert.equal(app.selectMainPush(action),false);
    await flush();assert.equal(logs.length,0);finish(null);await flush();
    assert.equal(logs.filter(x=>x[0]==='paste').length,1);assert.deepEqual(used,['sign']);
    c.utools.readCurrentFolderPath=()=>Promise.resolve(null);
    app.selectMainPush(action);await flush();assert.equal(used.length,2);
  });
  await check('silent output respects copy and type modes and preserves an editor draft',async()=>{
    for(const mode of ['copy','typeString']){
      const env=harness();const {app,logs,used}=env;const {action}=directFixture(env);
      const draft={name:'未保存',content:'草稿'};app.state.view='editor';app.state.editing=draft;
      app.state.settings.output=mode==='copy'?'copy':'paste';app.state.settings.pasteMode=mode;
      assert.equal(app.selectMainPush(action),false);await flush();
      assert(logs.some(x=>x[0]===(mode==='copy'?'copy':'type')&&x[1]==='固定签名'));
      if(mode==='copy') assert(logs.some(x=>x[0]==='hide'));
      assert.equal(app.state.view,'editor');assert.strictEqual(app.state.editing,draft);assert.deepEqual(used,['sign']);
      assert(!logs.some(x=>['toast','out'].includes(x[0])));
    }
  });
  await check('silent paste failure copies and notifies without counting or opening the plugin',async()=>{
    const env=harness();const {app,c,logs,used}=env;const {action}=directFixture(env);
    c.utools.hideMainWindowPasteText=()=>false;
    app.selectMainPush(action);await flush();
    assert(logs.some(x=>x[0]==='copy'&&x[1]==='固定签名'));assert(logs.some(x=>x[0]==='notify'));
    assert.equal(used.length,0);assert(!logs.some(x=>['toast','out'].includes(x[0])));
  });
  await check('silent copy failure notifies and releases the busy guard for retry',async()=>{
    const env=harness();const {app,c,logs,used}=env;const {action}=directFixture(env);
    app.state.settings.output='copy';c.utools.copyText=()=>Promise.reject(new Error('denied'));
    app.selectMainPush(action);await flush();assert.equal(used.length,0);assert(logs.some(x=>x[0]==='notify'));
    assert(!logs.some(x=>x[0]==='hide'||x[0]==='toast'));
    c.utools.copyText=text=>{logs.push(['copy',text]);return true;};
    app.selectMainPush(action);await flush();assert.deepEqual(used,['sign']);
  });
  await check('context capture failure cannot paste a stale snapshot and permits retry',async()=>{
    const env=harness();const {app,c,logs,used}=env;const {action}=directFixture(env,'{{clipboard}}');
    c.api={readClipboard:()=>{throw new Error('bridge failed');},getSys:()=>Promise.resolve({})};
    app.selectMainPush(action);await flush();
    assert(logs.some(x=>x[0]==='notify'));assert.equal(used.length,0);assert(!logs.some(x=>x[0]==='paste'));
    c.api.readClipboard=()=>Promise.resolve('新值');app.selectMainPush(action);await flush();
    assert(logs.some(x=>x[0]==='paste'&&x[1]==='新值'));assert.deepEqual(used,['sign']);
  });
  await check('push registration failure still permits normal plugin entry',async()=>{
    const env=harness();const {app,c,callbacks,logs}=env;prepareBootstrap(env);
    c.utools.onMainPush=()=>{throw new Error('unsupported');};
    app.bootstrap();callbacks.enter({code:'main',type:'text',payload:'snippet 邮箱'});await flush();
    assert(logs.some(x=>x[0]==='notify'));assert(logs.some(x=>x[0]==='view'&&x[1]==='list'));
    assert.equal(app.state.query,'邮箱');assert(!c.document.body.innerHTML);
  });
  await check('normal direct entry hides before async context reads finish',async()=>{
    const env=harness();const {app,c,logs,used}=env;const {action}=directFixture(env);
    let finish;c.utools.readCurrentFolderPath=()=>new Promise(resolve=>{finish=resolve;});
    const output=app.handleEnter(action);
    assert.deepEqual(logs,[['hide']]);finish(null);assert.equal(await output,true);
    assert(logs.some(x=>x[0]==='paste'));assert.deepEqual(used,['sign']);assert.equal(logs[logs.length-1][0],'out');
  });
  await check('startup requests idempotent example initialization and then loads its records',async()=>{
    const {app,c,nodes}=harness();let reads=0;
    const node=()=>({hidden:false,value:'',classList:{toggle:()=>{}},addEventListener:()=>{},setAttribute:()=>{},querySelector:()=>({textContent:''}),focus:()=>{}});
    c.document.getElementById=id=>nodes[id]||(nodes[id]=node());
    c.document.documentElement=node();c.document.body=node();c.addEventListener=()=>{};c.setInterval=()=>1;
    c.utools.onPluginEnter=()=>{};
    c.SBStore.getSettings=()=>({output:'paste',theme:'auto',layout:'quick',directPrefix:'',delimiter:'mustache'});
    c.SBStore.loadAll=()=>{reads++;return Promise.resolve({snippets:[],groups:[]});};
    let initializes=0;
    c.SBStore.addExamples=options=>{assert.equal(options.onlyIfEmpty,true);initializes++;return Promise.resolve({added:0});};
    c.SBUI.renderSidebar=()=>{};c.SBUI.renderCtxStat=()=>{};
    app.bootstrap();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(initializes,1);assert.equal(reads,1);assert.equal(app.state.snippets.length,0);assert.equal(app.state.groups.length,0);
    assert(!c.document.body.innerHTML,'startup should succeed without seeding');
  });
  await check('filter badges match the corresponding list under every search',async()=>{
    const {app,c}=harness();
    app.state.snippets=[
      {id:'commit',name:'commit 范例',content:'hello',keyword:'',searchKey:'git',group:'examples',pinned:true,lastUsedAt:''},
      {id:'sign',name:'邮箱签名',content:'hello',keyword:'sign',searchKey:'',group:'work',pinned:false,lastUsedAt:new Date().toISOString()},
      {id:'quote',name:'引用',content:'clipboard',keyword:'',searchKey:'',group:'',pinned:true,lastUsedAt:''}
    ];
    const filters=[{type:'all'},{type:'pinned'},{type:'recent'},{type:'ungrouped'},{type:'group',id:'examples'},{type:'group',id:'work'}];
    for(const query of ['','hello','git','clipboard','snippet','没有结果']){
      app.state.query=query;
      const counts=c.SBUI.filterCounts(app.state);
      for(const filter of filters){
        app.state.filter=filter;
        const expected=filter.type==='group' ? (counts.groups[filter.id]||0) : counts[filter.type];
        assert.equal(c.SBUI.searchSort(app.state).length,expected,query+' / '+JSON.stringify(filter));
      }
      if(query==='snippet'||query==='没有结果') assert.equal(counts.all,0);
      if(query==='git') {assert.equal(counts.all,1);assert.equal(counts.groups.examples,1);assert.equal(counts.pinned,1);assert.equal(counts.recent,0);}
    }
  });
  await check('adding examples clears stale search and filters and shows the list',async()=>{
    const {app,c,nodes}=harness();
    const node=()=>({hidden:false,value:'',focus:()=>{}});
    c.document.getElementById=id=>nodes[id]||(nodes[id]=node());
    app.state.view='settings';app.state.query='snippet';app.state.filter={type:'group',id:'old'};
    c.SBStore.addExamples=()=>Promise.resolve({added:4});
    c.SBStore.loadAll=()=>Promise.resolve({snippets:[{id:'example',name:'范例',content:'内容',direct:false}],groups:[]});
    c.SBUI.renderCtxStat=()=>{};c.SBUI.renderSettings=()=>{};
    await app.addExamples();
    assert.equal(app.state.query,'');assert.equal(app.state.filter.type,'all');assert.equal(app.state.view,'list');
    assert.equal(nodes.searchInput.value,'');assert.equal(nodes.searchClear.hidden,true);assert.equal(app.state.snippets.length,1);
  });
  console.log('Passed '+checks+' application checks.');
})().catch(err=>{console.error(err);process.exitCode=1;});
