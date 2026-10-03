(function () {
  'use strict';
  const E = window.SnippetEngine;
  const esc = E.escapeHtml;
  const $ = id => document.getElementById(id);
  const key = 'snippet-box-interaction-preview-v1';
  const palettes = ['azure','emerald','orange','blue','jade','sand'];
  const paths = {
    search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>',
    copy: '<rect x="5" y="5" width="9" height="9" rx="2"/><path d="M10 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    star: '<path d="m8 1.5 2 4 4.5.7-3.2 3.1.8 4.5L8 11.7l-4.1 2.1.8-4.5L1.5 6.2 6 5.5z"/>',
    settings: '<circle cx="8" cy="8" r="2.5"/><path d="m6 2 .5-1h3L10 2l2 1 .9-.1 1.5 2.6-.6.8V9l.6.8-1.5 2.6-.9-.1-2 1-.5 1h-3L6 13l-2-1-.9.1L1.6 9.5l.6-.8V6l-.6-.8L3.1 2.6 4 3z"/>',
    close: '<path d="m4 4 8 8M12 4l-8 8"/>',
    refresh: '<path d="M13 7a5 5 0 1 0 0 4M13 2v5H8"/>',
    arrow: '<path d="M2 8h12m-4-4 4 4-4 4"/>',
    back: '<path d="m10 3-5 5 5 5"/>',
    edit: '<path d="m10.5 2.5 3 3L6 13H3v-3z"/>',
    more: '<circle cx="3" cy="8" r=".8"/><circle cx="8" cy="8" r=".8"/><circle cx="13" cy="8" r=".8"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
    folder: '<path d="M2 4h4l2 2h6v7H2z"/>',
    layers: '<path d="m8 2 6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/>',
    check: '<path d="m3 8 3 3 7-7"/>',
    clip: '<rect x="3" y="3" width="10" height="11" rx="2"/><rect x="6" y="1" width="4" height="4" rx="1"/>',
    code: '<path d="m5 4-4 4 4 4m6-8 4 4-4 4M9 2 7 14"/>',
    alert: '<path d="m8 2 7 12H1zM8 6v4m0 2v.3"/>'
  };
  function icon(name) { return '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.code) + '</svg>'; }
  function uid() { return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function seed() {
    const stamp = new Date().toISOString();
    return {
      groups: [{id:'work',name:'开发工作',color:'#7861d9'},{id:'writing',name:'写作与记录',color:'#59958b'},{id:'reply',name:'回复话术',color:'#cc9554'}],
      snippets: [
        {id:'commit',name:'Git commit 模板',group:'work',searchKey:'commit git 提交',keyword:'commit',direct:true,pinned:true,useCount:84,content:'feat({{?scope=parser}}): {{?改动说明}}\n\n# {{date}} · {{user}}'},
        {id:'sign',name:'邮箱签名',group:'writing',searchKey:'sign email 签名',keyword:'sign',direct:true,pinned:true,useCount:61,content:'祝好，\n{{user}}\n产品与开发\n\n{{date:YYYY年MM月DD日}} · {{weekday:short}}'},
        {id:'fixed',name:'工单处理回复',group:'reply',searchKey:'fixed 客服 修复',keyword:'',direct:false,pinned:false,useCount:45,content:'您好 {{?客户称呼=张先生}}，\n\n您反馈的「{{?问题描述=登录异常}}」已于 {{date:MM月DD日}} 修复，工单号为 {{?工单号=T-1024}}。\n\n请刷新页面后重试。如有其他问题，欢迎随时联系。\n\n{{user}}'},
        {id:'daily',name:'工作日报',group:'writing',searchKey:'daily 日报',keyword:'',direct:false,pinned:false,useCount:37,content:'# 工作日报 · {{date}}\n记录人：{{user}}\n\n## 今日完成\n- {{?完成事项}}\n\n## 明日计划\n- {{?计划事项}}'},
        {id:'quote',name:'引用剪贴板',group:'writing',searchKey:'quote 引用',keyword:'',direct:false,pinned:false,useCount:29,content:'> {{clipboard:trim}}\n\n记录于 {{date}}'},
        {id:'mock',name:'测试数据 JSON',group:'work',searchKey:'mock json uuid',keyword:'',direct:false,pinned:false,useCount:22,content:'{\n  "id": "{{uuid}}",\n  "name": "{{user}}",\n  "score": {{random:1-100}},\n  "createdAt": "{{iso}}"\n}'},
        {id:'link',name:'Markdown 链接',group:'writing',searchKey:'mdlink link 链接',keyword:'',direct:false,pinned:false,useCount:18,content:'[{{?标题=参考资料}}]({{clipboard:trim}})'},
        {id:'folder',name:'进入当前目录',group:'work',searchKey:'cd folder 目录',keyword:'',direct:false,pinned:false,useCount:12,content:'cd "{{folder}}"\nls -la'},
        {id:'meeting',name:'会议通知',group:'reply',searchKey:'meet meeting 会议',keyword:'',direct:false,pinned:false,useCount:9,content:'主题：{{?会议主题=项目评审}}\n时间：{{date:+1d|MM月DD日}} {{?时间=14:00}}\n地点：{{?地点=线上会议}}\n\n请提前准备相关材料，谢谢。'},
        {id:'issue',name:'占位符检查示例',group:'',searchKey:'error 未知 错误',keyword:'',direct:false,pinned:false,useCount:0,content:'未知占位符：{{foobar}}\n参数错误：{{random:abc}}\n正常日期：{{date}}'}
      ].map((s,i) => Object.assign(s,{lastUsedAt:i===9?'':stamp,createdAt:stamp})),
      settings: {output:'paste',theme:'light',delimiter:'mustache',palette:'azure'}
    };
  }
  function validate(data) {
    if (!data || !Array.isArray(data.groups) || !Array.isArray(data.snippets) || data.snippets.length>2000 || data.groups.length>100) throw new Error('文件结构不正确，或超过 2,000 条片段 / 100 个分组。');
    const ids = new Set(), gids = new Set(), words = new Set();
    data.groups.forEach(g => { if(!g || typeof g.id!=='string' || !g.id || ['all','pinned','recent','ungrouped'].includes(g.id) || gids.has(g.id) || typeof g.name!=='string' || !g.name.trim() || !/^#[0-9a-f]{6}$/i.test(g.color)) throw new Error('分组数据无效。'); gids.add(g.id); });
    data.snippets.forEach(s => {
      if(!s || typeof s.id!=='string' || !s.id || ids.has(s.id) || typeof s.name!=='string' || !s.name.trim() || typeof s.content!=='string' || !s.content.trim() || s.content.length>20000 || typeof s.group!=='string' || (s.group && !gids.has(s.group)) || typeof s.searchKey!=='string' || typeof s.keyword!=='string' || typeof s.direct!=='boolean' || typeof s.pinned!=='boolean') throw new Error('片段数据无效：请检查名称、内容、分组、ID 与关键字。');
      if(s.direct && (s.keyword.trim().length<2 || words.has(s.keyword.trim().toLowerCase()))) throw new Error('直达关键字过短或重复。');
      if(!Number.isSafeInteger(s.useCount) || s.useCount<0 || !['lastUsedAt','createdAt'].every(k=>typeof s[k]==='string'&&(!s[k]||Number.isFinite(Date.parse(s[k]))))) throw new Error('使用次数或日期字段无效。');
      if(s.direct) words.add(s.keyword.trim().toLowerCase());
      ids.add(s.id);
    });
    const settings = data.settings || {};
    if(!['paste','copy'].includes(settings.output) || !['light','dark'].includes(settings.theme) || !['mustache','dollar','bracket'].includes(settings.delimiter)) throw new Error('设置数据无效。');
    const palette=settings.palette==null?'blue':settings.palette;
    if(!palettes.includes(palette)) throw new Error('配色设置无效。');
    return {
      groups:data.groups.map(g=>({id:g.id,name:g.name,color:g.color})),
      snippets:data.snippets.map(s=>({id:s.id,name:s.name,content:s.content,group:s.group,searchKey:s.searchKey,keyword:s.keyword,direct:s.direct,pinned:s.pinned,useCount:s.useCount,lastUsedAt:s.lastUsedAt,createdAt:s.createdAt})),
      settings:{output:settings.output,theme:settings.theme,delimiter:settings.delimiter,palette}
    };
  }
  let saved;
  try { saved=validate(JSON.parse(localStorage.getItem(key))); } catch (_) { saved=seed(); }
  const state = {groups:saved.groups,snippets:saved.snippets,settings:saved.settings,layout:'quick',view:'list',filter:'all',query:'',selected:'commit',tab:'preview',sort:'smart',draft:null,modal:null,ctxVersion:0,failNext:false};
  const previewParams=new URLSearchParams(location.search);
  if(['light','dark'].includes(previewParams.get('theme')))state.settings.theme=previewParams.get('theme');
  if(palettes.includes(previewParams.get('palette')))state.settings.palette=previewParams.get('palette');
  let cache = new Map(), toastTimer, modalFocus;
  let context = {now:new Date(),clipboard:'把重复的事情交给工具，把时间留给创造。',folder:'/Users/demo/Projects/snippet-box',url:{url:'https://www.u-tools.cn',title:'uTools'},sys:{user:'demo',platform:'macOS',arch:'arm64',os:'darwin',home:'/Users/demo',appVersion:'演示环境'},variables:{}};
  function persist() { try {localStorage.setItem(key,JSON.stringify({groups:state.groups,snippets:state.snippets,settings:state.settings}));} catch(_){toast('浏览器存储不可用，本次更改只保留在当前页面。');} }
  function group(id) { return state.groups.find(g=>g.id===id); }
  function groupTint(g) { return g.color.toLowerCase()==='#7861d9'?'var(--accent)':g.color; }
  function selected() { return state.snippets.find(s=>s.id===state.selected); }
  function tokens(content) {
    const ck = state.ctxVersion+'|'+state.settings.delimiter+'|'+content;
    if(!cache.has(ck)) {
      const parsed=E.parse(content,{context:context,delimiter:state.settings.delimiter});
      const seen=new Set();
      parsed.variables=parsed.segments.filter(s=>s.category==='variable'&&s.state==='variable'&&!seen.has(s.name)&&seen.add(s.name)).map(s=>({name:s.name,defaultValue:s.defaultValue}));
      cache.set(ck,parsed);
    }
    return cache.get(ck);
  }
  // Cache resolved segments so random values in the preview remain the exact output values.
  function result(content,values,emptyVariables) {
    const parsed=tokens(content), parts=[];
    let text='', html='';
    parsed.segments.forEach(seg=>{
      if(seg.type==='text') {text+=seg.value;html+=esc(seg.value);return;}
      let value=seg.state==='ok'?String(seg.value):seg.raw;
      let cls='tok tok--'+(seg.state==='ok'?seg.category:seg.state);
      if(seg.category==='variable' && seg.state==='variable') {
        if(values && Object.prototype.hasOwnProperty.call(values,seg.name)) {value=String(values[seg.name]);cls='tok tok--variable';}
        else if(emptyVariables) {value='';cls='tok tok--variable';}
      }
      if(seg.state==='missing') value='';
      text+=value;
      html+='<span class="'+cls+'" title="'+esc(seg.note||seg.raw)+'">'+(value?esc(value):seg.state==='missing'?'<span class="missing-label">（上下文为空）</span>':'')+'</span>';
      parts.push(seg);
    });
    return {text,html,variables:parsed.variables,issues:parsed.issues,parts};
  }
  function rank(s,q) {const n=s.name.toLowerCase(),k=s.keyword.toLowerCase(),sk=s.searchKey.toLowerCase();return n.startsWith(q)?5:k===q?4:n.includes(q)?3:sk.includes(q)||k.includes(q)?2:s.content.toLowerCase().includes(q)?1:0;}
  function filtered() {
    const q=state.query.trim().toLowerCase();
    return state.snippets.filter(s=>{
      if(state.filter==='pinned'&&!s.pinned) return false;
      if(state.filter==='recent'&&!s.lastUsedAt) return false;
      if(state.filter==='ungrouped'&&s.group) return false;
      if(!['all','pinned','recent','ungrouped'].includes(state.filter)&&s.group!==state.filter) return false;
      return !q||rank(s,q)>0;
    }).sort((a,b)=>{
      if(q&&rank(a,q)!==rank(b,q)) return rank(b,q)-rank(a,q);
      if(state.sort==='name') return a.name.localeCompare(b.name,'zh-CN');
      if(state.sort==='recent'||state.filter==='recent') return (b.lastUsedAt||'').localeCompare(a.lastUsedAt||'');
      return Number(b.pinned)-Number(a.pinned) || (b.useCount||0)-(a.useCount||0);
    });
  }
  function highlight(s) {const q=state.query.trim(),i=s.toLowerCase().indexOf(q.toLowerCase());return !q||i<0?esc(s):esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+q.length))+'</mark>'+esc(s.slice(i+q.length));}
  function filterLabel() {const labels={all:'全部片段',pinned:'已置顶',recent:'最近使用',ungrouped:'未分组'};return Object.prototype.hasOwnProperty.call(labels,state.filter)?labels[state.filter]:(group(state.filter)||{}).name||'全部片段';}
  function btn(label,action,cls,extra) {return '<button type="button" class="btn '+(cls||'')+'" data-action="'+action+'" '+(extra||'')+'>'+label+'</button>';}
  function toast(message) {$('toast').innerHTML='<span class="toast-icon">'+icon('check')+'</span>'+esc(message);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function theme() {
    document.body.dataset.theme=state.settings.theme;document.documentElement.dataset.theme=state.settings.theme;document.body.dataset.palette=state.settings.palette;
    $('themeButton').textContent=state.settings.theme==='light'?'切换深色':'切换浅色';
    const notes={azure:'电光蓝 · 清爽鲜明，适合高频操作',emerald:'翡翠绿 · 明亮通透，轻快有活力',orange:'活力橙 · 温暖鲜亮，主操作更突出',blue:'石墨灰 + 雾蓝 · 清晰、克制，适合高频操作',jade:'石墨灰 + 青绿 · 柔和、安静，适合长时间使用',sand:'石墨灰 + 暖砂 · 温暖、沉稳，适合文字与记录'};
    $('paletteNote').textContent=state.settings.theme==='dark'?notes[state.settings.palette]:'点击配色，进入深色模式比较';
    document.querySelectorAll('button[data-palette]').forEach(b=>{const active=state.settings.theme==='dark'&&state.settings.palette===b.dataset.palette;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  function navigation() {
    const navs=[{id:'all',name:'全部片段',ico:'layers'},{id:'pinned',name:'置顶',ico:'star'},{id:'recent',name:'最近使用',ico:'clock'}];
    function count(id) {return state.snippets.filter(s=>id==='all'||id==='pinned'&&s.pinned||id==='recent'&&s.lastUsedAt||id==='ungrouped'&&!s.group||s.group===id).length;}
    const attrs=id=>' data-filter="'+esc(id)+'" aria-current="'+(state.filter===id?'true':'false')+'"';
    $('filterBar').innerHTML=navs.slice(0,2).map(g=>'<button type="button" class="filter-chip '+(state.filter===g.id?'active':'')+'"'+attrs(g.id)+'>'+icon(g.ico)+g.name+' <span>'+count(g.id)+'</span></button>').join('')+state.groups.map(g=>'<button type="button" class="filter-chip '+(state.filter===g.id?'active':'')+'"'+attrs(g.id)+'><span class="group-dot" style="background:'+groupTint(g)+'"></span>'+esc(g.name)+'</button>').join('')+'<button type="button" class="filter-chip" data-action="groups" aria-label="管理分组">'+icon('more')+'</button>';
    $('sidebar').innerHTML='<div class="sidebar-label">片段库</div>'+navs.map(g=>'<button type="button" class="nav-item '+(state.filter===g.id?'active':'')+'"'+attrs(g.id)+'>'+icon(g.ico)+'<span>'+g.name+'</span><span class="nav-count">'+count(g.id)+'</span></button>').join('')+'<div class="sidebar-label">我的分组 '+btn('＋','groups','ghost small')+'</div>'+state.groups.concat([{id:'ungrouped',name:'未分组',color:'#95959d'}]).map(g=>'<button type="button" class="nav-item '+(state.filter===g.id?'active':'')+'"'+attrs(g.id)+'><span class="group-dot" style="background:'+groupTint(g)+'"></span><span>'+esc(g.name)+'</span><span class="nav-count">'+count(g.id)+'</span></button>').join('')+'<div class="sidebar-bottom">'+btn(icon('folder')+' 管理分组','groups','ghost')+'</div>';
  }
  function renderList() {
    const focus=document.activeElement;
    const focusInList=focus&&focus.closest('#listView');
    const focusRow=focusInList&&focus.closest('[data-snippet]');
    const focusFilter=focusInList&&focus.closest('[data-filter]');
    const focusAction=focusInList&&focus.closest('[data-action]');
    const restore=focusRow?'row':focusFilter?'filter':focusAction?'action':null;
    const restoreFilter=focusFilter&&focusFilter.dataset.filter,restoreAction=focusAction&&focusAction.dataset.action;
    navigation();
    const list=filtered();
    if(!list.some(s=>s.id===state.selected)) state.selected=list.length?list[0].id:null;
    $('libraryTitle').innerHTML=esc(filterLabel())+' <span class="list-count">'+list.length+'</span>';
    $('searchClear').hidden=!state.query;
    $('snippetList').innerHTML=list.map((s,i)=>{
      const r=result(s.content),g=group(s.group),active=s.id===state.selected;
      return '<div id="snippet-option-'+i+'" class="snippet-row '+(active?'active':'')+'" role="option" aria-selected="'+active+'" tabindex="'+(active?'0':'-1')+'" data-snippet="'+esc(s.id)+'"><div class="snippet-row-top"><span class="snippet-glyph">'+icon(s.id==='sign'?'edit':s.id==='fixed'?'clip':'code')+'</span><span class="snippet-name">'+highlight(s.name)+'</span><button type="button" class="row-copy icon-button" data-action="row-copy" data-id="'+esc(s.id)+'" aria-label="复制 '+esc(s.name)+'" title="仅复制">'+icon('copy')+'</button></div><div class="snippet-summary">'+esc(r.text.split('\n').find(t=>t.trim())||'空输出')+'</div><div class="snippet-row-meta">'+(s.pinned?'<span class="pin-mark">'+icon('star')+'</span>':'')+'<span>'+(g?esc(g.name):'未分组')+'</span>'+(s.direct?'<span class="tag violet">'+esc(s.keyword)+'</span>':'')+(r.variables.length?'<span class="tag">'+r.variables.length+' 个变量</span>':'')+(r.issues.length?'<span class="tag amber">需检查</span>':'')+'</div></div>';
    }).join('') || '<div class="empty-view"><span class="empty-symbol">'+icon('search')+'</span><strong>'+(state.query?'没有找到匹配片段':'这个分组还没有片段')+'</strong><p>'+(state.query?'试试其他关键字，或把它存成新片段。':'新建一个片段，让下一次输入更轻松。')+'</p>'+btn('新建片段','new','primary')+(state.query?btn('清空搜索','clear-search','ghost'):'')+(state.filter!=='all'?btn('搜索全部分组','search-all','ghost'):'')+'</div>';
    const active=$('snippetList').querySelector('[aria-selected="true"]');
    if(active) {$('searchInput').setAttribute('aria-controls','snippetList');$('searchInput').setAttribute('aria-activedescendant',active.id);} else $('searchInput').removeAttribute('aria-activedescendant');
    renderDetail();
    $('contextButton').innerHTML=icon('clip')+'<span>'+(context.clipboard?'剪贴板快照已就绪':'剪贴板为空')+'</span><span class="live-dot"></span>';
    if(restore==='row'&&active)active.focus({preventScroll:true});
    else if(restore==='filter'){const target=Array.from(document.querySelectorAll('#listView [data-filter]')).find(x=>x.dataset.filter===restoreFilter&&x.getClientRects().length);if(target)target.focus({preventScroll:true});}
    else if(restore==='action'){const target=Array.from(document.querySelectorAll('#listView [data-action]')).find(x=>x.dataset.action===restoreAction&&x.getClientRects().length);if(target)target.focus({preventScroll:true});}
  }
  function issues(r) {
    return r.issues.map(i=>'<div class="issue-box">'+icon('alert')+'<span><strong>'+esc(i.raw)+'</strong> '+esc(i.note)+'；'+(i.level==='missing'?'输出为空':'将原样保留')+'</span></div>').join('');
  }
  function mainLabel(s,mode) {return (tokens(s.content).variables.length?'填变量并':'')+(mode==='paste'?'粘贴':'复制');}
  function renderDetail() {
    const s=selected();
    if(!s) {$('detailPane').innerHTML='<div class="empty-view"><span class="empty-symbol">{ }</span><strong>你的下一条好用片段</strong><p>选中片段，即可查看完整输出预览。</p></div>';return;}
    const r=result(s.content),g=group(s.group),mode=state.settings.output;
    $('detailPane').innerHTML='<div class="detail-header"><div class="detail-eyebrow">'+esc(g?g.name:'未分组')+' <span> / </span> 片段详情</div><div class="detail-title"><h2>'+esc(s.name)+'</h2><div class="detail-actions"><button type="button" class="icon-button '+(s.pinned?'is-pinned':'')+'" data-action="pin" aria-label="'+(s.pinned?'取消置顶':'置顶')+'" title="'+(s.pinned?'取消置顶':'置顶')+'">'+icon('star')+'</button><button type="button" class="icon-button" data-action="edit" aria-label="编辑片段" title="编辑 ⌘E">'+icon('edit')+'</button><button type="button" class="icon-button" data-action="more" aria-label="更多片段操作" title="更多操作">'+icon('more')+'</button></div></div></div><div class="detail-tabs" role="tablist" aria-label="查看片段"><button type="button" role="tab" aria-controls="detailContent" id="previewTab" aria-selected="'+(state.tab==='preview')+'" class="'+(state.tab==='preview'?'active':'')+'" data-tab="preview">输出预览</button><button type="button" role="tab" aria-controls="detailContent" id="templateTab" aria-selected="'+(state.tab==='template')+'" class="'+(state.tab==='template'?'active':'')+'" data-tab="template">模板源码</button></div><div class="preview-panel" id="detailContent" role="tabpanel" aria-labelledby="'+(state.tab==='preview'?'previewTab':'templateTab')+'"><div class="preview-heading"><span><span class="live-dot"></span>'+(state.tab==='preview'?'所见即所出':'原始模板')+'</span><span>'+r.text.length+' 字符</span></div><div class="'+(state.tab==='preview'?'rendered-text':'template-text')+'">'+(state.tab==='preview'?r.html:esc(s.content))+'</div>'+issues(r)+(r.parts.some(p=>p.volatile)?'<p class="helper random-note">随机值已固定；刷新上下文可生成下一组。</p>':'')+'</div><div class="detail-info"><div class="meta-line"><span>使用 '+s.useCount+' 次</span><span>'+(s.direct?'直达指令 <code>'+esc(s.keyword)+'</code>':'未开启直达指令')+'</span></div></div><div class="detail-footer"><div class="output-note">'+(r.variables.length?'<span class="variable-dot">?</span> '+r.variables.length+' 项待填写 · 输出前会询问':'<span class="live-dot"></span> 已准备好输出')+'</div><div class="output-actions">'+btn(icon('copy')+' 仅复制','copy')+btn(mainLabel(s,mode)+' <kbd>↵</kbd>','output','primary')+'</div></div>';
  }
  function render() {theme();$('prototypeWindow').dataset.layout=state.layout;$('windowDimension').textContent=state.layout==='quick'?'680 × 544':'1040 × 650';$('listView').hidden=state.view!=='list';$('editorView').hidden=state.view!=='editor';$('settingsView').hidden=state.view!=='settings';if(state.view==='list') renderList();}
  function setFilter(id) {state.filter=id;state.query='';$('searchInput').value='';renderList();}
  function changeSelection(delta) {const l=filtered();if(!l.length)return;let i=l.findIndex(s=>s.id===state.selected);i=Math.max(0,Math.min(l.length-1,i+delta));state.selected=l[i].id;renderList();$('snippetList').querySelector('[aria-selected="true"]').scrollIntoView({block:'nearest'});}
  function showModal(kind,html,info) {
    modalFocus=document.activeElement;
    state.modal=Object.assign({kind},info||{});$('overlay').innerHTML=html;$('overlay').hidden=false;
    const first=$('overlay').querySelector('[autofocus]')||$('overlay').querySelector('input:not([type=checkbox]),select,textarea')||$('overlay').querySelector('button');if(first) first.focus();
  }
  function closeModal() {if(state.modal&&state.modal.kind==='discard')state.afterSave=null;state.modal=null;$('overlay').hidden=true;$('overlay').innerHTML='';if(modalFocus&&modalFocus.isConnected)modalFocus.focus();else if(state.view==='list')$('searchInput').focus();}
  function modalShell(title,sub,body,foot,compact) {return '<section class="modal '+(compact?'compact':'')+'" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><header class="modal-header"><div><h2 id="modalTitle">'+title+'</h2><p>'+sub+'</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="关闭弹窗">'+icon('close')+'</button></header><div class="modal-body">'+body+'</div><footer class="modal-footer">'+foot+'</footer></section>';}
  function requestOutput(s,mode) {
    if(!s) return;
    const r=result(s.content);
    if(!r.variables.length) {output(s,mode,r.text);return;}
    const values=Object.create(null);r.variables.forEach(v=>values[v.name]=v.defaultValue||'');
    const fields=r.variables.map((v,i)=>'<div class="field"><label for="var-'+i+'">'+esc(v.name)+(v.defaultValue?'<span class="field-optional">预填默认值</span>':'')+'</label><input id="var-'+i+'" data-variable="'+esc(v.name)+'" value="'+esc(values[v.name])+'" placeholder="可留空" autocomplete="off" '+(i===0?'autofocus':'')+'></div>').join('');
    showModal('variables',modalShell('填好变量，再'+(mode==='paste'?'粘贴':'复制'),esc(s.name)+' · '+r.variables.length+' 项变量','<div class="variable-fields">'+fields+'</div><div class="variable-preview"><div class="preview-heading"><span><span class="live-dot"></span>最终输出</span><span id="variableEmpty"></span></div><div class="rendered-text" id="variablePreview"></div>'+issues(r)+'</div>','<span class="modal-key-hint"><kbd>Tab</kbd> 切换 · <kbd>⌘ ↵</kbd> 确认</span>'+btn('取消','close-modal','ghost')+btn('仅复制','variable-copy')+btn((mode==='paste'?'粘贴':'复制')+' '+icon('arrow'),'variable-output','primary')), {snippet:s,values,mode});
    updateVariablePreview();
  }
  function updateVariablePreview() {if(!state.modal||state.modal.kind!=='variables')return;const m=state.modal,r=result(m.snippet.content,m.values,true);$('variablePreview').innerHTML=r.html;$('variableEmpty').textContent=Object.values(m.values).some(v=>!v)?'留空字段将输出为空':'';}
  function completeVariables(mode) {const m=state.modal;if(!m||m.kind!=='variables')return;const text=result(m.snippet.content,m.values,true).text;closeModal();output(m.snippet,mode||m.mode,text);}
  async function copyText(text) {
    try {if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}} catch(_){}
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(_){}ta.remove();return ok;
  }
  async function output(s,mode,text) {
    $('outputText').textContent=text;$('outputLog').open=true;
    if(mode==='paste'&&state.failNext) {state.failNext=false;$('outputSummary').textContent='模拟粘贴失败 · 内容已保留';showModal('failure',modalShell('这次没有粘贴成功','模拟目标应用拒绝粘贴。输出全文已保留。','<div class="rendered-text">'+esc(text)+'</div>',''+btn('返回检查','close-modal','ghost')+btn('仅复制','failure-copy','primary')), {snippet:s,text});return;}
    let success=true;
    if(mode==='copy') success=await copyText(text);
    $('outputSummary').textContent=(mode==='paste'?'已模拟粘贴':success?'已复制到剪贴板':'复制未获授权')+' · '+s.name+' · '+text.length+' 字符';
    if(!success) {toast('浏览器未授权复制，已展开全文，可手动复制。');return;}
    s.useCount=(s.useCount||0)+1;s.lastUsedAt=new Date().toISOString();persist();
    if(state.view==='list')renderList();
    toast(mode==='paste'?'已模拟粘贴 '+text.length+' 字符，可在下方核对全文。':'已复制 '+text.length+' 字符到剪贴板。');
    // Each subsequent output gets new volatile values; the visible preview updates first.
    cache=new Map();if(state.view==='list')renderList();
  }
  function newDraft() {return {id:'',name:state.query.trim(),group:group(state.filter)?state.filter:'',searchKey:'',keyword:'',direct:false,pinned:false,content:'',useCount:0,lastUsedAt:''};}
  function openEditor(s) {state.afterSave=null;state.draft=Object.assign({},s||newDraft());state.original=JSON.stringify(state.draft);state.view='editor';renderEditor();render();$('draftName').focus();}
  function field(label,id,value,placeholder) {return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" value="'+esc(value||'')+'" placeholder="'+esc(placeholder||'')+'" autocomplete="off"></div>';}
  function renderEditor() {
    const d=state.draft;
    $('editorView').innerHTML='<header class="editor-header"><button type="button" class="icon-button" data-action="leave-editor" aria-label="返回列表">'+icon('back')+'</button><strong>'+(d.id?'编辑片段':'新建片段')+'</strong><span class="editor-dirty" id="editorDirty">未修改</span><span class="spacer"></span>'+btn('取消','leave-editor','ghost')+btn('保存 <kbd>⌘ ↵</kbd>','save','primary')+'</header><div class="editor-content"><div class="editor-form"><div class="form-row">'+field('片段名称 <span class="required">*</span>','draftName',d.name,'例如：工单处理回复')+'<div class="field"><label for="draftGroup">分组</label><select id="draftGroup"><option value="">未分组</option>'+state.groups.map(g=>'<option value="'+esc(g.id)+'" '+(g.id===d.group?'selected':'')+'>'+esc(g.name)+'</option>').join('')+'</select></div></div><div class="editor-template"><div class="template-toolbar"><label for="draftContent">模板内容 <span class="required">*</span>'+btn('{ } 插入占位符','catalog','ghost small')+'</div><textarea id="draftContent" spellcheck="false" placeholder="您好 {{?姓名}}，今天是 {{date}}。">'+esc(d.content)+'</textarea><div class="template-meta"><span>Enter 换行 · 变量在输出时填写</span><span id="characterCount">'+d.content.length+' / 20,000</span></div><div class="catalog-menu" id="catalogMenu" hidden></div></div>'+field('搜索关键字','draftSearch',d.searchKey,'多个关键字用空格分隔')+'<details class="advanced-options" '+(d.direct?'open':'')+'><summary>快捷调用与置顶</summary><label class="toggle-row"><span>置顶此片段</span><input type="checkbox" id="draftPinned" '+(d.pinned?'checked':'')+'></label><label class="toggle-row"><span>开启 uTools 直达关键字</span><input type="checkbox" id="draftDirect" '+(d.direct?'checked':'')+'></label>'+field('直达关键字','draftKeyword',d.keyword,'例如：sign')+'<p class="helper" id="directHint"></p></details><div class="modal-error" id="draftError" role="alert" hidden></div><p class="helper storage-note">正式插件使用 uTools 数据存储。避免保存密码或密钥。</p></div><div class="editor-preview"><div class="preview-heading"><span><span class="live-dot"></span>实时预览</span><span id="draftVariableCount"></span></div><div class="rendered-text" id="draftPreview"></div><div id="draftIssues"></div><div class="preview-bottom-note">编辑的是模板，输出的是这里的结果。</div></div></div>';
    updateEditorPreview();
  }
  function readDraft() {const d=state.draft;d.name=$('draftName').value;d.group=$('draftGroup').value;d.content=$('draftContent').value;d.searchKey=$('draftSearch').value;d.pinned=$('draftPinned').checked;d.direct=$('draftDirect').checked;d.keyword=$('draftKeyword').value;return d;}
  function updateEditorPreview() {const d=readDraft(),r=result(d.content);$('draftPreview').innerHTML=r.html||'<span class="preview-placeholder">开始写模板，预览会同步出现在这里。</span>';$('draftIssues').innerHTML=issues(r);$('draftVariableCount').textContent=r.variables.length?r.variables.length+' 项待填':'';$('characterCount').textContent=d.content.length+' / 20,000';$('draftKeyword').disabled=!d.direct;$('directHint').textContent=d.direct?(r.variables.length?'含待填变量，直达时会打开窗口填写。':'输入关键字即可直接输出；此处仅模拟配置。'):'开启后，可以从 uTools 搜索框直接调用。';$('editorDirty').textContent=JSON.stringify(d)===state.original?'未修改':'有未保存更改';}
  function saveDraft() {
    const d=readDraft(),err=!d.name.trim()?'请填写片段名称。':!d.content.trim()?'请填写模板内容。':d.content.length>20000?'模板内容最多 20,000 字符。':d.direct&&d.keyword.trim().length<2?'直达关键字至少 2 个字符。':d.direct&&['snippet','snip','片段'].includes(d.keyword.trim().toLowerCase())?'此关键字与插件主入口冲突。':d.direct&&state.snippets.some(s=>s.id!==d.id&&s.direct&&s.keyword.trim().toLowerCase()===d.keyword.trim().toLowerCase())?'该直达关键字已被其他片段使用。':'';
    if(err){$('draftError').textContent=err;$('draftError').hidden=false;return;}
    const item=Object.assign({},d,{id:d.id||uid(),name:d.name.trim(),keyword:d.keyword.trim(),createdAt:d.createdAt||new Date().toISOString()});
    const i=state.snippets.findIndex(s=>s.id===item.id);if(i>=0)state.snippets[i]=item;else state.snippets.push(item);
    state.selected=item.id;state.filter='all';state.query='';$('searchInput').value='';state.view='list';state.draft=null;persist();render();toast('片段已保存。');$('searchInput').focus();
    const next=state.afterSave;state.afterSave=null;if(next)next();
  }
  function leaveEditor(next) {
    const action=next||(()=>{state.afterSave=null;state.view='list';state.draft=null;render();$('searchInput').focus();});
    if(state.view==='editor'&&JSON.stringify(readDraft())!==state.original){showModal('discard',modalShell('有更改尚未保存','离开后，本次编辑将被丢弃。','<p>你可以继续编辑，或保存后再离开。</p>',btn('放弃更改','discard','danger')+btn('继续编辑','close-modal')+btn('保存','save','primary'),true),{next:action});return;}
    action();
  }
  function showCatalog() {
    const menu=$('catalogMenu');menu.hidden=!menu.hidden;if(menu.hidden)return;
    const delimiter=E.DELIMITERS[state.settings.delimiter];
    menu.innerHTML='<div class="catalog-heading"><strong>插入占位符</strong><button class="icon-button" type="button" data-action="catalog" aria-label="关闭占位符">'+icon('close')+'</button></div>'+E.CATALOG.map(cat=>'<div class="catalog-label">'+esc(cat.group)+'</div>'+cat.items.map(it=>{const syntax=delimiter.open+it.syntax.slice(2,-2)+delimiter.close;return '<button type="button" class="catalog-item" data-insert="'+esc(syntax)+'"><code>'+esc(syntax)+'</code><span>'+esc(it.desc)+'</span></button>';}).join('')).join('');
  }
  function insertPlaceholder(value) {const t=$('draftContent'),a=t.selectionStart,b=t.selectionEnd;t.value=t.value.slice(0,a)+value+t.value.slice(b);t.focus();t.setSelectionRange(a+value.length,a+value.length);$('catalogMenu').hidden=true;updateEditorPreview();}
  function more() {const s=selected();if(!s)return;showModal('more',modalShell('管理片段',esc(s.name),'<div class="more-actions">'+btn(icon('edit')+' 编辑片段','edit')+btn(icon('copy')+' 创建副本','duplicate')+btn(icon('star')+(s.pinned?' 取消置顶':' 置顶片段'),'pin')+btn('删除片段','delete-confirm','danger')+'</div>',''+btn('返回','close-modal','ghost'),true));}
  function confirmDelete() {const s=selected();closeModal();showModal('delete',modalShell('删除这个片段？',esc(s.name),'删除后，它的直达关键字也会一并移除。',btn('取消','close-modal')+btn('删除片段','delete','danger'),true),{id:s.id});}
  function groupsModal() {showModal('groups',modalShell('管理分组','删除分组时，片段会保留并移到「未分组」。','<div class="group-list">'+state.groups.map(g=>'<div class="group-manage-row"><span class="group-dot" style="background:'+groupTint(g)+'"></span><span>'+esc(g.name)+'</span><span class="spacer"></span>'+btn('改名','rename-group','ghost small','data-group="'+esc(g.id)+'"')+btn('删除','delete-group-confirm','danger small','data-group="'+esc(g.id)+'"')+'</div>').join('')+'</div>',''+btn('完成','close-modal')+btn('＋ 新建分组','add-group','primary')));}
  function groupForm(id) {const g=group(id);closeModal();showModal('group-form',modalShell(g?'重命名分组':'新建分组','用一个容易识别的名字，组织你的片段。',field('分组名称','groupName',g?g.name:'','例如：常用回复')+'<div class="modal-error" id="groupError" role="alert" hidden></div>',btn('取消','close-modal')+btn('保存分组','save-group','primary'),true),{id:g?g.id:null});}
  function saveGroup() {const name=$('groupName').value.trim(),id=state.modal.id;if(!name||state.groups.some(g=>g.id!==id&&g.name===name)){$('groupError').textContent=name?'已存在同名分组。':'请输入分组名称。';$('groupError').hidden=false;return;}if(id)group(id).name=name;else state.groups.push({id:uid(),name,color:'#7861d9'});closeModal();persist();renderList();groupsModal();}
  function settings() {
    state.view='settings';render();
    $('settingsView').innerHTML='<header class="settings-header"><button type="button" class="icon-button" data-action="back-list" aria-label="返回列表">'+icon('back')+'</button><strong>设置</strong><span class="spacer"></span><span class="tag">演示环境</span></header><div class="settings-scroll"><div class="settings-section"><h3>输出与外观</h3><div class="settings-row"><div><label for="settingOutput">默认输出方式</label><p>回车使用默认方式，⌥ 回车临时反向。</p></div><select id="settingOutput"><option value="paste" '+(state.settings.output==='paste'?'selected':'')+'>自动粘贴</option><option value="copy" '+(state.settings.output==='copy'?'selected':'')+'>仅复制</option></select></div><div class="settings-row"><div><label for="settingTheme">界面主题</label><p>列表、编辑器和弹窗使用同一套主题。</p></div><select id="settingTheme"><option value="light" '+(state.settings.theme==='light'?'selected':'')+'>浅色</option><option value="dark" '+(state.settings.theme==='dark'?'selected':'')+'>深色</option></select></div><div class="settings-row"><div><label for="settingDelimiter">占位符定界符</label><p>只改变解析方式，不会改写已保存模板。</p></div><select id="settingDelimiter"><option value="mustache" '+(state.settings.delimiter==='mustache'?'selected':'')+'>{{ }}</option><option value="dollar" '+(state.settings.delimiter==='dollar'?'selected':'')+'>${ }</option><option value="bracket" '+(state.settings.delimiter==='bracket'?'selected':'')+'>[[ ]]</option></select></div></div><div class="settings-section"><h3>备份与数据</h3><div class="settings-row"><div><strong>导出演示数据</strong><p>包含片段、分组和设置的 JSON 文件。</p></div>'+btn('导出 JSON','export')+'</div><div class="settings-row"><div><strong>导入备份</strong><p>完整校验后，再确认替换本设计稿的数据。</p></div>'+btn('选择文件','import')+'<input id="importFile" type="file" accept=".json,application/json" hidden></div><div class="settings-row"><div><strong>重置演示数据</strong><p>恢复最初的 10 条示例，不涉及正式插件。</p></div>'+btn('重置','reset-confirm','danger')+'</div></div><div class="settings-section"><h3>键盘快捷操作</h3><div class="shortcut-grid"><span>聚焦搜索 <kbd>⌘ K</kbd></span><span>新建片段 <kbd>⌘ N</kbd></span><span>编辑选中片段 <kbd>⌘ E</kbd></span><span>保存 / 确认 <kbd>⌘ ↵</kbd></span></div><p class="helper">Esc 关闭弹窗或清空搜索；填写变量时，Enter 跳到下一项，最后一项确认输出。</p></div><div class="settings-section about-note"><h3>关于此设计稿</h3><p>纯本地示例数据，不接入 uTools。复制使用浏览器剪贴板；自动粘贴与失败反馈均为模拟。正式插件的跨应用输出仍需在 uTools 内验证。</p></div></div>';
  }
  function contextModal() {showModal('context',modalShell('本次上下文快照','刷新后，预览和下一次输出会一起更新。','<div class="field"><label for="contextClipboard">剪贴板文本</label><textarea id="contextClipboard" rows="3">'+esc(context.clipboard)+'</textarea></div>'+field('当前目录','contextFolder',context.folder||'','留空可查看上下文缺失状态')+'<label class="toggle-row"><span>模拟下一次粘贴失败</span><input type="checkbox" id="contextFailure" '+(state.failNext?'checked':'')+'></label>',btn('取消','close-modal')+btn(icon('refresh')+' 更新快照','save-context','primary')));}
  function resetConfirm() {showModal('reset',modalShell('恢复初始演示？','本设计稿里新增和修改的内容将被替换。','正式插件中的片段不会受到影响。',btn('取消','close-modal')+btn('恢复演示数据','reset','danger'),true));}
  function exportData() {const data={format:'snippet-box-prototype',version:1,exportedAt:new Date().toISOString(),groups:state.groups,snippets:state.snippets,settings:state.settings};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='snippet-box-design-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('演示数据已导出。');}
  async function importData(file) {if(!file)return;try{if(file.size>5*1024*1024)throw new Error('文件大小不能超过 5 MB。');const data=validate(JSON.parse(await file.text()));showModal('import',modalShell('导入这份演示备份？','文件已完成校验。确认后将替换当前演示数据。','<p>'+data.snippets.length+' 条片段 · '+data.groups.length+' 个分组 · 同时恢复设置</p>',btn('取消','close-modal')+btn('确认替换','confirm-import','primary'),true),{data});}catch(e){showModal('import-error',modalShell('这份文件无法导入','当前数据保持原样。','<p class="modal-error">'+esc(e.message)+'</p>',btn('知道了','close-modal','primary'),true));}}
  function doAction(action,el) {
    const s=selected();
    switch(action) {
      case 'new': openEditor();break;
      case 'clear-search':state.query='';$('searchInput').value='';renderList();$('searchInput').focus();break;
      case 'search-all':state.filter='all';renderList();break;
      case 'row-copy':requestOutput(state.snippets.find(x=>x.id===el.dataset.id),'copy');break;
      case 'copy':requestOutput(s,'copy');break;
      case 'output':requestOutput(s,state.settings.output);break;
      case 'pin':if(state.modal)closeModal();if(s){s.pinned=!s.pinned;persist();renderList();}break;
      case 'edit':if(state.modal)closeModal();if(s)openEditor(s);break;
      case 'more':more();break;
      case 'duplicate':closeModal();if(s){const d=Object.assign({},s,{id:'',name:s.name+' 副本',direct:false,keyword:'',useCount:0,lastUsedAt:''});openEditor(d);}break;
      case 'delete-confirm':confirmDelete();break;
      case 'delete':{const id=state.modal.id;state.snippets=state.snippets.filter(x=>x.id!==id);closeModal();persist();renderList();toast('片段已删除。');break;}
      case 'groups':groupsModal();break;
      case 'add-group':groupForm();break;
      case 'rename-group':groupForm(el.dataset.group);break;
      case 'save-group':saveGroup();break;
      case 'delete-group-confirm':{const g=group(el.dataset.group);closeModal();showModal('delete-group',modalShell('删除「'+esc(g.name)+'」分组？','分组内的片段会保留，移到「未分组」。','<p>这不会删除任何片段。</p>',btn('取消','close-modal')+btn('删除分组','delete-group','danger'),true),{id:g.id});break;}
      case 'delete-group':{const id=state.modal.id;state.groups=state.groups.filter(g=>g.id!==id);state.snippets.forEach(x=>{if(x.group===id)x.group='';});state.filter='all';closeModal();persist();renderList();toast('分组已删除，片段已保留。');break;}
      case 'close-modal':closeModal();break;
      case 'variable-copy':completeVariables('copy');break;
      case 'variable-output':completeVariables();break;
      case 'failure-copy':{const m=state.modal;closeModal();output(m.snippet,'copy',m.text);break;}
      case 'save-context':context.clipboard=$('contextClipboard').value;context.folder=$('contextFolder').value||null;context.now=new Date();state.failNext=$('contextFailure').checked;state.ctxVersion++;cache=new Map();closeModal();renderList();toast('上下文快照已更新。');break;
      case 'leave-editor':leaveEditor();break;
      case 'discard':{const next=state.modal.next;closeModal();next();break;}
      case 'save':{const next=state.modal&&state.modal.kind==='discard'?state.modal.next:state.afterSave;if(state.modal)closeModal();state.afterSave=next;saveDraft();break;}
      case 'catalog':showCatalog();break;
      case 'back-list':state.view='list';render();$('searchInput').focus();break;
      case 'export':exportData();break;
      case 'import':$('importFile').click();break;
      case 'confirm-import':{const data=state.modal.data;state.snippets=data.snippets;state.groups=data.groups;state.settings=data.settings;state.selected=null;state.filter='all';state.query='';cache=new Map();closeModal();persist();settings();toast('备份已恢复。');break;}
      case 'reset-confirm':resetConfirm();break;
      case 'reset':{const data=seed();state.groups=data.groups;state.snippets=data.snippets;state.settings=data.settings;state.filter='all';state.query='';state.selected='commit';state.view='list';state.draft=null;state.tab='preview';state.failNext=false;$('searchInput').value='';cache=new Map();closeModal();persist();render();toast('已恢复初始演示。');break;}
    }
  }
  $('prototypeApp').addEventListener('click',e=>{
    const action=e.target.closest('[data-action]');if(action){doAction(action.dataset.action,action);return;}
    const f=e.target.closest('[data-filter]');if(f){setFilter(f.dataset.filter);return;}
    const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;renderDetail();$('detailPane').querySelector('[aria-selected="true"]').focus();return;}
    const insert=e.target.closest('[data-insert]');if(insert){insertPlaceholder(insert.dataset.insert);return;}
    const row=e.target.closest('[data-snippet]');if(row){state.selected=row.dataset.snippet;renderList();$('snippetList').querySelector('[aria-selected="true"]').focus();}
  });
  $('snippetList').addEventListener('dblclick',e=>{const row=e.target.closest('[data-snippet]');if(row&&!e.target.closest('button'))requestOutput(selected(),state.settings.output);});
  $('searchInput').addEventListener('input',e=>{state.query=e.target.value;renderList();});
  $('searchClear').addEventListener('click',()=>doAction('clear-search'));
  $('sortSelect').addEventListener('change',e=>{state.sort=e.target.value;renderList();});
  $('newButton').addEventListener('click',()=>openEditor());
  $('settingsButton').addEventListener('click',settings);
  $('contextButton').addEventListener('click',contextModal);
  $('themeButton').addEventListener('click',()=>{state.settings.theme=state.settings.theme==='light'?'dark':'light';persist();theme();if(state.view==='settings')settings();});
  document.querySelectorAll('button[data-palette]').forEach(b=>b.addEventListener('click',()=>{state.settings.palette=b.dataset.palette;state.settings.theme='dark';persist();theme();if(state.view==='settings')settings();}));
  $('resetButton').addEventListener('click',resetConfirm);
  document.querySelectorAll('[data-layout]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.addEventListener('click',()=>{state.layout=b.dataset.layout;document.querySelectorAll('button[data-layout]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render();});});
  document.querySelectorAll('[data-journey]').forEach(b=>b.addEventListener('click',()=>leaveEditor(()=>{
    if(state.modal)closeModal();state.view='list';state.query='';state.filter='all';$('searchInput').value='';render();
    if(b.dataset.journey==='search'){state.query='sign';$('searchInput').value='sign';renderList();$('searchInput').focus();}
    if(b.dataset.journey==='variables'){state.selected='commit';renderList();requestOutput(selected(),state.settings.output);}
    if(b.dataset.journey==='editor'){openEditor(Object.assign(newDraft(),{name:'客户跟进消息',content:'您好 {{?姓名}}，\n\n关于您在 {{date}} 提出的需求，我们已经开始处理。\n\n{{user}}'}));}
  })));
  $('prototypeApp').addEventListener('input',e=>{
    if(e.target.dataset.variable!==undefined&&state.modal&&state.modal.kind==='variables'){state.modal.values[e.target.dataset.variable]=e.target.value;updateVariablePreview();}
    if(state.view==='editor'&&e.target.closest('#editorView'))updateEditorPreview();
  });
  $('prototypeApp').addEventListener('change',e=>{
    if(state.view==='editor'&&e.target.closest('#editorView'))updateEditorPreview();
    if(e.target.id==='settingOutput'){state.settings.output=e.target.value;persist();}
    if(e.target.id==='settingTheme'){state.settings.theme=e.target.value;persist();theme();}
    if(e.target.id==='settingDelimiter'){state.settings.delimiter=e.target.value;cache=new Map();persist();toast('解析定界符已更新，现有模板内容保持原样。');}
    if(e.target.id==='importFile')importData(e.target.files[0]);
  });
  document.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(!e.target.closest('#prototypeApp')&&!state.modal)return;
    const mod=e.metaKey||e.ctrlKey;
    if(state.modal){
      if(e.key==='Escape'){e.preventDefault();closeModal();return;}
      if(e.key==='Tab'){const f=Array.from($('overlay').querySelectorAll('button,input,select,textarea,a[href]')).filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length);const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
      if(state.modal.kind==='variables'&&e.key==='Enter'&&(mod||e.altKey||e.target.hasAttribute('data-variable'))){
        e.preventDefault();if(mod||e.altKey){completeVariables(e.altKey?(state.modal.mode==='paste'?'copy':'paste'):undefined);return;}
        const f=Array.from($('overlay').querySelectorAll('[data-variable]')),i=f.indexOf(document.activeElement);if(i>=0&&i<f.length-1)f[i+1].focus();else if(i===f.length-1)completeVariables();return;
      }
      if(state.modal.kind==='group-form'&&e.key==='Enter'){e.preventDefault();saveGroup();}
      return;
    }
    if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();leaveEditor(()=>openEditor());return;}
    if(mod&&['k','f'].includes(e.key.toLowerCase())){e.preventDefault();leaveEditor(()=>{state.view='list';render();$('searchInput').focus();$('searchInput').select();});return;}
    if(state.view==='editor'){if(mod&&e.key==='Enter'){e.preventDefault();saveDraft();}else if(e.key==='Escape'){e.preventDefault();if(!$('catalogMenu').hidden)$('catalogMenu').hidden=true;else leaveEditor();}return;}
    if(state.view==='settings'){if(e.key==='Escape'){state.view='list';render();$('searchInput').focus();}return;}
    if(e.target.closest('select')||e.target.closest('.detail-tabs'))return;
    if(mod&&e.key.toLowerCase()==='e'){e.preventDefault();if(selected())openEditor(selected());return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();changeSelection(e.key==='ArrowDown'?1:-1);return;}
    if(e.key==='Enter'&&(e.target.id==='searchInput'||e.target.closest('[role=option]'))&&!e.target.closest('button')){e.preventDefault();requestOutput(selected(),e.altKey?(state.settings.output==='paste'?'copy':'paste'):state.settings.output);return;}
    if(e.key==='Escape'){e.preventDefault();if(state.query)doAction('clear-search');else{$('searchInput').focus();toast('正式插件会返回上一个应用；此处保留设计稿。');}}
  });
  $('searchIcon').innerHTML=icon('search');$('searchClear').innerHTML=icon('close');$('settingsButton').innerHTML=icon('settings');$('resetButton').innerHTML=icon('refresh');
  render();
})();
