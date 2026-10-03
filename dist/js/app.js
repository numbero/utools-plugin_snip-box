'use strict';
/* Snippet Box · 应用层：引导、上下文快照、动作、动态指令、键盘 */
(function () {
  var E = window.SnippetEngine;
  var Store = window.SBStore;
  var UI = window.SBUI;
  var el = UI.el;
  var Dialog = window.SBDialog;

  var LIST_HEIGHT = 544;
  var EDITOR_HEIGHT = 620;

  var state = {
    snippets: [],
    groups: [],
    settings: null,
    ctx: null,
    view: 'list',
    activeId: null,
    query: '',
    filter: { type: 'all' },
    editing: null,
    modal: null,
    about: {},
    sort: 'smart', detailTab: 'preview', renderCache: Object.create(null)
  };

  var booted = false;
  var pendingEnter = null;
  var searchTimer = null;
  var outputBusy = false;
  var saving = false;
  var draftBaseline = null;
  var lastError = null;

  function U() { return window.utools; }

  /* ---------- 主题 / 窗口 ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    document.documentElement.setAttribute('data-style', 'orange');
    document.documentElement.setAttribute('data-layout', state.settings.layout || 'quick');
    var manage = state.settings.layout === 'manage';
    el('btnLayout').setAttribute('aria-pressed', String(manage));
    el('btnLayout').setAttribute('title', manage ? '切换快速调用' : '切换管理视图');
    el('btnLayout').querySelector('span').textContent = manage ? '快捷' : '管理';
  }
  function setHeight(px) {
    try { if (U() && U().setExpendHeight) U().setExpendHeight(px); } catch (e) { /* 预览环境无窗口 API */ }
  }
  function onResize() {
    document.body.classList.toggle('narrow', window.innerWidth < 660);
  }

  /* ---------- 上下文快照（D1：进入时捕获并冻结） ---------- */
  function attempt(fn) {
    try { return Promise.resolve(fn()); } catch (e) { return Promise.resolve(null); }
  }

  function captureContext() {
    var clipP = window.api
      ? window.api.readClipboard().catch(function () { return ''; })
      : Promise.resolve('');
    var sysP = window.api
      ? window.api.getSys().catch(function () { return {}; })
      : Promise.resolve({});
    /* 这两个 API 返回 Promise<string>，且活动窗口不是文件管理器/浏览器时会 reject */
    var folderP = attempt(function () { return U().readCurrentFolderPath(); }).catch(function () { return null; });
    var urlP = attempt(function () { return U().readCurrentBrowserUrl(); }).catch(function () { return null; });
    return Promise.all([clipP, sysP, folderP, urlP]).then(function (res) {
      var u = res[3];
      var url = null;
      if (u) {
        url = {
          url: typeof u === 'string' ? u : (u.url || ''),
          title: (u && u.title) || (typeof u === 'string' ? u : '')
        };
      }
      state.ctx = {
        now: new Date(),
        clipboard: res[0] || '',
        folder: res[2] || null,
        url: url,
        sys: res[1] || {},
        variables: {}
      };
      state.renderCache = Object.create(null);
      return state.ctx;
    });
  }

  function renderOptsFor(snippet) {
    return { context: state.ctx, delimiter: state.settings.delimiter };
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    var isEmpty = state.snippets.length === 0;
    if (state.view === 'list') {
      el('listBody').hidden = isEmpty;
      el('emptyState').hidden = !isEmpty;
      el('searchInput').disabled = isEmpty;
      UI.renderList(state);
      UI.renderCtxStat(state);
    }
  }

  /* ---------- 输出 ---------- */
  function effectiveMode(copyOnly) {
    var base = state.settings.output; // 'paste' | 'copy'
    var invert = !!copyOnly && state.settings.invertModifier !== false;
    var mode = base === 'paste' ? 'paste' : 'copy';
    if (invert) mode = mode === 'paste' ? 'copy' : 'paste';
    return mode;
  }

  function reportError(label, err) {
    lastError = { message: label + '：' + (err && err.message || err), at: new Date().toISOString() };
    UI.toast(lastError.message, 'info');
  }
  function outputApi(mode, text) {
    return Promise.resolve().then(function () {
      var fn = mode === 'copy' ? 'copyText' : (state.settings.pasteMode === 'typeString' ? 'hideMainWindowTypeString' : 'hideMainWindowPasteText');
      if (!U() || typeof U()[fn] !== 'function') throw new Error('当前环境不支持此输出方式');
      return U()[fn](text);
    }).then(function (result) { if (result === false) throw new Error('输出未成功'); });
  }
  function doOutput(snippet, mode, text) {
    if (!snippet || outputBusy) return Promise.resolve(false);
    outputBusy = true;
    return outputApi(mode, text).then(function () {
      if (mode === 'copy') UI.toast('已复制 ' + text.length + ' 字符', 'ok');
      return Store.touchUse(snippet).catch(function (err) { reportError('内容已输出，使用记录更新失败', err); }).then(function () {
        if (state.view === 'list') UI.renderList(state);
        if (mode === 'copy') { try { U().outPlugin(); } catch (e) {} }
        return true;
      });
    }, function (err) {
      if (mode === 'copy') { reportError('复制失败', err); return false; }
      return outputApi('copy', text).then(function () {
        UI.toast('粘贴失败，内容已复制，请手动粘贴', 'info');
        try { U().showNotification('粘贴失败，内容已复制到剪贴板，请手动粘贴。'); } catch (e) {}
        lastError = { message: String(err.message || err), at: new Date().toISOString() };
        return false;
      }, function (copyErr) { reportError('粘贴和备用复制均失败', copyErr); return false; });
    }).then(function (ok) { outputBusy = false; return ok; }, function (err) { outputBusy = false; reportError('输出失败', err); return false; });
  }
  function enterOutput(snippet, invert, exactMode) {
    if (!snippet || outputBusy) return;
    var mode = exactMode || effectiveMode(invert);
    var r = UI.renderSnippet(state, snippet);
    if (r.variables.length) { openModal(snippet, mode); return; }
    return doOutput(snippet, mode, r.text);
  }

  /* ---------- 变量弹框 ---------- */
  function openModal(snippet, mode) {
    var fields = UI.renderSnippet(state, snippet).variables;
    var values = Object.create(null);
    fields.forEach(function (f) { values[f.name] = f.defaultValue || ''; });
    state.modal = { snippet: snippet, fields: fields, values: values, mode: mode || effectiveMode(false), previousFocus: document.activeElement };
    el('varScrim').hidden = false;
    el('viewList').setAttribute('aria-hidden', 'true');
    UI.renderVarFields(state); UI.renderVarPreview(state);
    var first = el('varFields').querySelector('input');
    if (first) first.focus();
  }
  function closeModal() {
    var previous = state.modal && state.modal.previousFocus;
    state.modal = null; el('varScrim').hidden = true;
    el('viewList').removeAttribute('aria-hidden');
    if (previous && previous.isConnected && previous.getClientRects().length) previous.focus();
    else if (state.view === 'list') el('list').focus();
  }
  function modalOutput(alternate) {
    if (!state.modal) return;
    var m = state.modal;
    var inputs = el('varFields').querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) m.values[inputs[i].getAttribute('data-var')] = inputs[i].value;
    var mode = alternate ? (m.mode === 'copy' ? 'paste' : 'copy') : m.mode;
    var text = UI.renderSnippet(state, m.snippet, m.values).text;
    doOutput(m.snippet, mode, text).then(function (ok) { if (ok && state.modal === m) closeModal(); });
  }

  /* ---------- 编辑器 ---------- */
  function openEditor(draft) {
    if (!el('varScrim').hidden) closeModal();
    state.editing = draft;
    state.view = 'editor';
    UI.showView('editor');
    UI.syncEditorFields(state);
    draftBaseline = draftSignature(readDraft());
    updateDirty();
    el('edError').hidden = true;
    UI.renderPop();
    setHeight(EDITOR_HEIGHT);
    el('edDelete').hidden = !draft.id;
    el('edName').focus();
  }

  function backToList(force) {
    if (state.view === 'editor' && force !== true && isDirty()) {
      return Dialog.open({title:'保存本次修改？', message:'离开编辑器前，可以保存修改或放弃本次修改。', actions:[
        {value:'cancel',label:'继续编辑'}, {value:'discard',label:'放弃修改'}, {value:'save',label:'保存并返回',primary:true}
      ]}).then(function (choice) { if (choice === 'discard') backToList(true); if (choice === 'save') saveDraft(); });
    }
    state.view = 'list';
    state.editing = null;
    UI.showView('list');
    setHeight(LIST_HEIGHT);
    renderAll();
    el('searchInput').focus();
  }

  function draftSignature(d) { return JSON.stringify([d.name,d.content,d.group,d.searchKey,d.keyword,d.direct,d.pinned]); }
  function isDirty() { return state.editing && draftSignature(readDraft()) !== draftBaseline; }
  function updateDirty() { if (state.editing) el('edDirty').textContent = isDirty() ? '未保存' : '未修改'; }

  function readDraft() {
    var d = state.editing;
    d.name = el('edName').value.trim();
    d.group = el('edGroup').value;
    d.searchKey = el('edSearchKey').value.trim();
    d.keyword = el('edDirectKey').value.trim();
    d.direct = el('edDirect').getAttribute('aria-checked') === 'true';
    d.pinned = el('edPinned').getAttribute('aria-checked') === 'true';
    d.content = el('edTpl').value;
    return d;
  }

  function keywordProblem(d, prefix) {
    if (!d.direct) return '';
    if (d.keyword.length < 2) return '直达关键字至少需要 2 个字符';
    var key = (prefix + d.keyword).toLowerCase();
    if (state.snippets.some(function (x) { return x.id !== d.id && x.direct && (prefix + x.keyword).toLowerCase() === key; })) return '直达关键字与其他片段重复';
    var features = [];
    try { features = U().getFeatures() || []; } catch (e) {}
    var conflict = features.some(function (f) {
      if (f.code === 'snip:' + d.id || (f.code || '').indexOf('snip:') === 0) return false;
      return (f.cmds || []).some(function (c) { return typeof c === 'string' && c.toLowerCase() === key; });
    });
    return conflict ? '直达关键字与已有入口指令冲突' : '';
  }
  function saveDraft() {
    if (saving || !state.editing) return Promise.resolve(false);
    var d = readDraft();
    var problem = !d.name ? '请填写片段名称' : !d.content.trim() ? '请填写模板内容' : d.content.length > 20000 ? '模板内容不能超过 20,000 字符' : keywordProblem(d, state.settings.directPrefix);
    if (problem) {
      el('edError').textContent = problem; el('edError').hidden = false;
      (!d.name ? el('edName') : el('edTpl')).focus();
      return Promise.resolve(false);
    }
    saving = true; el('edSave').disabled = true;
    return Store.saveSnippet(d).then(function (saved) {
      replaceSnippet(saved);
      state.activeId = saved.id;
      syncFeatures(); UI.toast('已保存', 'ok'); backToList(true); return true;
    }).catch(function (err) {
      el('edError').textContent = '保存失败：' + (err.message || err); el('edError').hidden = false;
      reportError('保存失败', err); return false;
    }).then(function (ok) { saving = false; el('edSave').disabled = false; return ok; });
  }

  function deleteSnippet(id) {
    var s = findById(id);
    if (!s) return;
    Store.deleteSnippet(s).then(function () {
      state.snippets = state.snippets.filter(function (x) { return x.id !== id; });
      syncFeatures();
      UI.toast('已删除', 'ok');
      backToList(true);
    }).catch(function (err) {
      UI.toast('删除失败：' + (err && err.message || err), 'info');
    });
  }

  function confirmDelete(s) {
    return Dialog.open({title:'删除「' + s.name + '」？', message:'删除后无法撤销。',actions:[{value:'cancel',label:'取消'},{value:'delete',label:'删除片段',danger:true}]}).then(function (choice) {
      if (choice) deleteSnippet(s.id);
    });
  }
  function snippetAction(action, id) {
    var s = findById(id);
    if (!s) return;
    if (action === 'copy') return enterOutput(s, false, 'copy');
    if (action === 'output') return enterOutput(s, false);
    if (action === 'edit') return openEditor(cloneSnippet(s));
    if (action === 'delete') return confirmDelete(s);
    if (action === 'duplicate') {
      var draft = cloneSnippet(s);
      delete draft.id; delete draft._rev;
      draft.name = (s.name + ' 副本').slice(0, 200);
      draft.direct = false; draft.keyword = ''; draft.useCount = 0; draft.lastUsedAt = '';
      delete draft.createdAt; delete draft.updatedAt;
      return openEditor(draft);
    }
    if (action === 'pin') {
      var changed = cloneSnippet(s); changed.pinned = !changed.pinned;
      return Store.saveSnippet(changed).then(function (saved) { replaceSnippet(saved); renderAll(); }).catch(function (err) { reportError('置顶更新失败', err); });
    }
    if (action === 'more') {
      return Dialog.open({title:s.name,actions:[{value:'cancel',label:'取消'},{value:'duplicate',label:'创建副本'},{value:'delete',label:'删除片段',danger:true}]}).then(function (choice) { if (choice) snippetAction(choice, id); });
    }
  }
  function editGroup(group) {
    return Dialog.open({title:group ? '重命名分组' : '新建分组',label:'分组名称',input:group ? group.name : '',maxLength:200,
      validate:function (name) { return !name ? '请输入分组名称' : state.groups.some(function (g) { return (!group || g.id !== group.id) && g.name === name; }) ? '已有同名分组' : ''; },
      actions:[{value:'cancel',label:'取消'},{value:'save',label:'保存分组',primary:true}]
    }).then(function (name) {
      if (name === null) return;
      var groups = state.groups.map(function (g) { return group && g.id === group.id ? Object.assign({}, g, {name:name}) : g; });
      if (!group) groups.push({id:'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),name:name});
      return Store.saveGroups(groups).then(function () { state.groups = groups; renderAll(); }).catch(function (err) { reportError('分组保存失败', err); });
    });
  }
  function groupMenu(id) {
    var group = state.groups.filter(function (g) { return g.id === id; })[0];
    if (!group) return;
    Dialog.open({title:group.name,actions:[{value:'cancel',label:'取消'},{value:'rename',label:'重命名'},{value:'delete',label:'删除分组',danger:true}]}).then(function (choice) {
      if (choice === 'rename') editGroup(group);
      if (choice === 'delete') Dialog.open({title:'删除「' + group.name + '」分组？',message:'组内片段会保留，并移到未分组。',actions:[{value:'cancel',label:'取消'},{value:'delete',label:'删除分组',danger:true}]}).then(function (confirm) {
        if (!confirm) return;
        var ledger = [];
        var chain = Promise.resolve();
        state.snippets.filter(function (s) { return s.group === id; }).forEach(function (s) {
          chain = chain.then(function () { var changed = cloneSnippet(s); changed.group = ''; return Store.saveSnippet(changed).then(function (saved) { ledger.push({before:s,after:saved}); }); });
        });
        var groups = state.groups.filter(function (g) { return g.id !== id; });
        chain.then(function () { return Store.saveGroups(groups); }).then(function () {
          ledger.forEach(function (x) { replaceSnippet(x.after); }); state.groups = groups;
          if (state.filter.id === id) state.filter = {type:'all'};
          renderAll(); UI.toast('分组已删除，片段已移到未分组', 'ok');
        }).catch(function (err) {
          var rollback = Promise.resolve();
          ledger.reverse().forEach(function (x) { rollback = rollback.then(function () { var restored = cloneSnippet(x.before); restored._rev = x.after._rev; return Store.saveSnippet(restored); }).catch(function () {}); });
          rollback.then(function () { return Store.loadAll(); }).then(function (data) { state.snippets = data.snippets; state.groups = data.groups; renderAll(); reportError('分组删除未完成，请检查分组后重试', err); });
        });
      });
    });
  }

  function findById(id) {
    for (var i = 0; i < state.snippets.length; i++) if (state.snippets[i].id === id) return state.snippets[i];
    return null;
  }

  /* ---------- 动态指令（直达关键字） ---------- */
  function syncFeatures() {
    if (!U() || !U().setFeature) return;
    var want = {};
    state.snippets.forEach(function (s) {
      if (!s.direct || !s.keyword) return;
      var code = 'snip:' + s.id;
      var hasVar = E.render(s.content, renderOptsFor(s)).variables.length > 0;
      want[code] = {
        code: code,
        explain: s.name,
        cmds: [state.settings.directPrefix + s.keyword],
        icon: 'icon.svg',
        mainHide: !hasVar   // 含变量时静默直达无法弹表单，必须显窗（FR-77）
      };
    });
    var existing = [];
    try { existing = U().getFeatures() || []; } catch (e) { existing = []; }
    existing.forEach(function (f) {
      if (f && f.code && f.code.indexOf('snip:') === 0 && !want[f.code]) {
        try { if (U().removeFeature(f.code) === false) throw new Error(f.code); } catch (e) { reportError('直达指令清理失败', e); }
      }
    });
    Object.keys(want).forEach(function (code) {
      try { if (U().setFeature(want[code]) === false) throw new Error(want[code].explain); } catch (e) { reportError('直达指令注册失败', e); }
    });
  }

  /* ---------- 设置 ---------- */
  function patchSettings(obj) {
    var next = Object.assign({}, state.settings, obj);
    var problem = state.snippets.map(function (x) { return keywordProblem(x, next.directPrefix); }).filter(Boolean)[0];
    if (problem && Object.prototype.hasOwnProperty.call(obj, 'directPrefix')) { UI.toast(problem, 'info'); refreshAboutThenSettings(); return; }
    try { Store.saveSettings(next); state.settings = Store.getSettings(); } catch (e) { reportError('设置保存失败', e); return; }
    state.renderCache = Object.create(null);
    applyTheme();
    syncFeatures();
    if (state.view === 'settings') refreshAboutThenSettings();
    renderAll();
  }

  function refreshAboutThenSettings() {
    loadAbout().then(function () { UI.renderSettings(state, state.about); });
  }

  function loadAbout() {
    var sysP = window.api ? window.api.getSys().catch(function () { return {}; }) : Promise.resolve({});
    var rtP = window.api ? window.api.getRuntime().catch(function () { return {}; }) : Promise.resolve({});
    return Promise.all([sysP, rtP]).then(function (res) {
      state.about = {
        pluginVersion: (res[0] && res[0].pluginVersion) || '1.0.7',
        appVersion: (res[0] && res[0].appVersion) || '',
        chrome: (res[1] && res[1].chrome) || '',
        node: (res[1] && res[1].node) || ''
      };
      return state.about;
    });
  }

  /* ---------- 导入导出 / 诊断 ---------- */
  function exportData() {
    var path = null;
    try {
      path = U().showSaveDialog({
        title: '导出 Snippet Box',
        defaultPath: 'snippet-box.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
    } catch (e) { UI.toast('当前环境不支持文件对话框', 'info'); return; }
    if (!path) return;
    if (Array.isArray(path)) path = path[0];
    var json = JSON.stringify(Store.exportObject(state), null, 2);
    window.api.writeFile(path, json).then(function () {
      UI.toast('已导出到 ' + path, 'ok');
    }).catch(function (err) { UI.toast('导出失败：' + err.message, 'info'); });
  }

  function importData() {
    var path = null;
    try {
      path = U().showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
    } catch (e) { UI.toast('当前环境不支持文件对话框', 'info'); return; }
    if (!path) return;
    if (Array.isArray(path)) path = path[0];
    window.api.readFile(path).then(function (text) {
      var obj = JSON.parse(text);
      return Store.planImport(obj, state).then(function (plan) {
        return Dialog.open({title:'导入备份',message:'新增 ' + plan.added + ' 条（含冲突副本 ' + plan.copies + ' 条），跳过 ' + plan.skipped + ' 条。' + (plan.restoreSettings ? '\n同时恢复备份中的设置。' : ''), actions:[{value:'cancel',label:'取消'},{value:'import',label:'确认导入',primary:true}]}).then(function (choice) { return choice ? Store.importObject(obj, state) : null; });
      });
    }).then(function (res) {
      if (!res) return;
      return Store.loadAll().then(function (data) {
        state.snippets = data.snippets;
        state.groups = data.groups;
        state.settings = Store.getSettings(); state.renderCache = Object.create(null); applyTheme();
        syncFeatures(); renderAll(); refreshAboutThenSettings();
        UI.toast('导入完成：新增 ' + res.added + ' · 副本 ' + res.copies + ' · 跳过 ' + res.skipped, 'ok');
      });
    }).catch(function (err) {
      Store.loadAll().then(function (data) { state.snippets = data.snippets; state.groups = data.groups; state.settings = Store.getSettings(); applyTheme(); syncFeatures(); renderAll(); });
      Dialog.open({title:'导入未完成',message:err.message,actions:[{value:'ok',label:'知道了',primary:true}]});
    });
  }

  function copyDiagnostics() {
    var info = {
      plugin: state.about,
      settings: state.settings,
      counts: { snippets: state.snippets.length, groups: state.groups.length },
      ctx: {
        clipboardLen: state.ctx && state.ctx.clipboard ? state.ctx.clipboard.length : 0,
        hasFolder: !!(state.ctx && state.ctx.folder),
        hasUrl: !!(state.ctx && state.ctx.url)
      },
      lastError: lastError,
      ua: navigator.userAgent
    };
    U().copyText(JSON.stringify(info, null, 2));
    UI.toast('诊断信息已复制，粘给我即可', 'ok');
  }

  function reloadLibrary() {
    return Store.loadAll().then(function (data) {
      state.snippets = data.snippets; state.groups = data.groups;
      if (state.filter.type === 'group' && !data.groups.some(function (g) { return g.id === state.filter.id; })) state.filter = { type: 'all' };
      state.renderCache = Object.create(null); syncFeatures(); renderAll();
      if (state.view === 'settings') refreshAboutThenSettings();
    });
  }
  function clearSeed() {
    return Store.planLegacyCleanup().then(function (plan) {
      return Dialog.open({ title:'清理旧版示例？', message:'识别到 ' + plan.snippets.length + ' 条未修改的旧示例。会同时移除已空的默认分组，自己创建或修改过的片段会保留。', actions:[{value:'cancel',label:'取消'},{value:'delete',label:'清理旧示例',danger:true}] }).then(function (choice) {
        if (!choice) return;
        return Store.clearLegacySamples(plan).then(function (result) {
          return reloadLibrary().then(function () { UI.toast('已清理 ' + result.removed + ' 条旧示例' + (result.preserved ? ' · 保留 ' + result.preserved + ' 条刚更新的记录' : ''), 'ok'); });
        });
      });
    }).catch(function (err) { return reloadLibrary().then(function () { reportError('示例清理未完成', err); }); });
  }

  function addExamples() {
    return Store.addExamples().then(function (result) {
      state.query = ''; state.filter = { type: 'all' };
      el('searchInput').value = ''; el('searchClear').hidden = true;
      return reloadLibrary().then(function () { backToList(true); UI.toast(result.added ? '已添加 ' + result.added + ' 个范例' : '范例已存在，可在片段列表查看', 'ok'); });
    }).catch(function (err) { return reloadLibrary().then(function () { reportError('添加范例未完成', err); }); });
  }

  function mainQuery(arg) {
    if (!arg || arg.type !== 'text' || typeof arg.payload !== 'string') return '';
    var text = arg.payload.trim();
    return text.replace(/^(?:snippet|snip|片段)(?:\s+|$)/i, '').trim();
  }

  /* ---------- 进入分发 ---------- */
  function handleEnter(arg) {
    captureContext().then(function () {
      if (state.view === 'editor' && isDirty()) { UI.toast('已保留未保存的修改', 'info'); return; }
      var code = arg && arg.code;
      if (code && code.indexOf('snip:') === 0) {
        var s = findById(code.slice(5));
        if (!s) { UI.toast('片段不存在或已删除', 'info'); return; }
        var r = E.render(s.content, renderOptsFor(s));
        if (r.variables.length) {
          state.view = 'list';
          UI.showView('list');
          renderAll();
          openModal(s, effectiveMode(false));
        } else {
          enterOutput(s, false);
        }
        return;
      }
      if (state.view === 'editor' && isDirty()) { UI.toast('已保留未保存的修改', 'info'); return; }
      state.view = 'list';
      state.query = mainQuery(arg); el('searchInput').value = state.query; el('searchClear').hidden = !state.query;
      UI.showView('list');
      renderAll();
      el('searchInput').focus();
    });
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    el('searchInput').addEventListener('input', function () {
      state.query = this.value;
      el('searchClear').hidden = !this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { UI.renderList(state); }, 80);
    });
    el('searchInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' && !ev.isComposing) { el('list').focus(); }
    });
    el('searchClear').addEventListener('click', function () {
      state.query = '';
      el('searchInput').value = '';
      this.hidden = true;
      UI.renderList(state);
      el('searchInput').focus();
    });
    el('btnNew').addEventListener('click', function () { openEditor(blankDraft()); });
    el('btnEmptyNew').addEventListener('click', function () { openEditor(blankDraft()); });
    el('btnEmptyExamples').addEventListener('click', addExamples);
    el('btnSettings').addEventListener('click', function () {
      state.view = 'settings';
      UI.showView('settings');
      refreshAboutThenSettings();
    });

    function filterClick(ev) {
      var menu = ev.target.closest('[data-group-act]');
      if (menu) { groupMenu(menu.getAttribute('data-id')); return; }
      var btn = ev.target.closest('[data-filter]');
      if (!btn) return;
      var f = btn.getAttribute('data-filter');
      if (f === '__addgroup') { editGroup(); return; }
      if (f === '__managegroups') {
        Dialog.open({title:'管理分组',actions:[{value:'cancel',label:'取消'}].concat(state.groups.map(function (g) { return {value:g.id,label:g.name}; }))}).then(function (id) { if (id) groupMenu(id); }); return;
      }
      state.filter = {type:f,id:btn.getAttribute('data-id') || ''};
      UI.renderList(state);
    }
    el('sidebar').addEventListener('click', filterClick);
    el('filterBar').addEventListener('click', filterClick);
    el('btnLayout').addEventListener('click', function () { patchSettings({layout:state.settings.layout === 'manage' ? 'quick' : 'manage'}); });
    el('sortSelect').addEventListener('change', function () { state.sort = this.value; UI.renderList(state); });
    el('detailPane').addEventListener('click', function (ev) {
      var tab = ev.target.closest('[data-detail-tab]');
      if (tab) { state.detailTab = tab.getAttribute('data-detail-tab'); UI.renderDetail(state); return; }
      var action = ev.target.closest('[data-detail-act]');
      if (action) snippetAction(action.getAttribute('data-detail-act'), state.activeId);
    });

    var list = el('list');
    list.addEventListener('click', function (ev) {
      var empty = ev.target.closest('[data-list-act]');
      if (empty) {
        var todo = empty.getAttribute('data-list-act');
        if (todo === 'new') openEditor(blankDraft());
        else { if (todo === 'all') state.filter = {type:'all'}; state.query = ''; el('searchInput').value = ''; el('searchClear').hidden = true; renderAll(); }
        return;
      }
      var act = ev.target.closest('[data-act]');
      var row = ev.target.closest('.list-item');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (act) { snippetAction(act.getAttribute('data-act'), id); return; }
      state.activeId = id;
      UI.renderList(state);
    });
    list.addEventListener('dblclick', function (ev) {
      if (ev.target.closest('button')) return;
      var row = ev.target.closest('.list-item');
      if (!row) return;
      enterOutput(findById(row.getAttribute('data-id')));
    });

    el('ctxStat').addEventListener('click', function (ev) {
      if (!ev.target.closest('#ctxRefresh')) return;
      captureContext().then(function () {
        UI.renderCtxStat(state);
        UI.renderList(state);
        UI.toast('上下文快照已刷新', 'ok');
      });
    });

    /* 编辑器 */
    el('edBack').addEventListener('click', backToList);
    el('edCancel').addEventListener('click', backToList);
    el('edSave').addEventListener('click', saveDraft);
    el('edDelete').addEventListener('click', function () {
      var d = state.editing;
      if (d && d.id) confirmDelete(d);
    });
    el('edPinned').addEventListener('click', function () {
      this.setAttribute('aria-checked', this.getAttribute('aria-checked') !== 'true');
      updateDirty();
    });
    el('edDirect').addEventListener('click', function () {
      var on = this.getAttribute('aria-checked') !== 'true';
      this.setAttribute('aria-checked', String(on));
      el('edDirectKey').disabled = !on;
      if (on) el('edDirectKey').focus();
      updateDirty();
    });
    el('viewEditor').addEventListener('input', function () { updateDirty(); el('edError').hidden = true; UI.renderEditorPreview(state); });
    el('edGroup').addEventListener('change', updateDirty);
    el('edRefreshCtx').addEventListener('click', function () {
      captureContext().then(function () {
        UI.renderEditorPreview(state);
        UI.toast('上下文快照已刷新', 'ok');
      });
    });
    el('edPopBtn').addEventListener('click', function () {
      el('edPop').hidden = !el('edPop').hidden;
    });
    el('edPop').addEventListener('click', function (ev) {
      var item = ev.target.closest('[data-insert]');
      if (!item) return;
      insertAtCursor(el('edTpl'), item.getAttribute('data-insert'));
      el('edPop').hidden = true;
      updateDirty();
      UI.renderEditorPreview(state);
    });

    /* 设置 */
    el('settingsBody').addEventListener('click', function (ev) {
      var sw = ev.target.closest('[data-switch]');
      if (sw) {
        var on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(on));
        var patch = {};
        patch[sw.getAttribute('data-switch')] = on;
        patchSettings(patch);
        sw.setAttribute('aria-checked', String(state.settings[sw.getAttribute('data-switch')]));
        return;
      }
      var segBtn = ev.target.closest('[data-val]');
      if (segBtn) {
        var patch2 = {};
        patch2[segBtn.parentNode.getAttribute('data-seg')] = segBtn.getAttribute('data-val');
        patchSettings(patch2);
        return;
      }
      if (ev.target.closest('#btnExport')) return exportData();
      if (ev.target.closest('#btnImport')) return importData();
      if (ev.target.closest('#btnClearSeed')) return clearSeed();
      if (ev.target.closest('#btnAddExamples')) return addExamples();
      if (ev.target.closest('#btnDiag')) return copyDiagnostics();
    });
    el('settingsBody').addEventListener('change', function (ev) {
      var sel = ev.target.closest('[data-select]');
      if (sel) {
        var patch = {};
        patch[sel.getAttribute('data-select')] = sel.value;
        patchSettings(patch);
        return;
      }
      var inp = ev.target.closest('[data-input]');
      if (inp) {
        var patch3 = {};
        patch3[inp.getAttribute('data-input')] = inp.value;
        patchSettings(patch3);
      }
    });
    el('setBack').addEventListener('click', backToList);
    el('setReset').addEventListener('click', function () {
      Dialog.open({title:'恢复默认设置？',message:'片段和分组会保留。',actions:[{value:'cancel',label:'取消'},{value:'reset',label:'恢复默认',primary:true}]}).then(function (choice) {
        if (choice) { patchSettings(Object.assign({}, Store.DEFAULT_SETTINGS)); UI.toast('已恢复默认', 'ok'); }
      });
    });

    /* 变量弹框 */
    el('varFields').addEventListener('input', function (ev) {
      var inp = ev.target.closest('[data-var]');
      if (!inp) return;
      state.modal.values[inp.getAttribute('data-var')] = inp.value;
      inp.classList.toggle('is-empty', !inp.value);
      UI.renderVarPreview(state);
    });
    el('varCancel').addEventListener('click', closeModal);
    el('varPaste').addEventListener('click', function () { modalOutput(false); });
    el('varCopy').addEventListener('click', function () { modalOutput(true); });
    el('varScrim').addEventListener('click', function (ev) {
      if (ev.target === this) closeModal();
    });

    /* 全局键盘 */
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (ev.isComposing || ev.keyCode === 229 || Dialog.active()) return;
      if (!el('varScrim').hidden) {
        Dialog.trap(ev, el('varScrim'));
        if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); }
        if (ev.key === 'Enter' && (ev.target.tagName === 'INPUT' || ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault();
          var fields = Array.prototype.slice.call(el('varFields').querySelectorAll('input'));
          var position = fields.indexOf(ev.target);
          if (!ev.metaKey && !ev.ctrlKey && !ev.altKey && position >= 0 && position < fields.length - 1) fields[position + 1].focus();
          else modalOutput(ev.altKey && state.settings.invertModifier !== false);
        }
        return;
      }
      if (state.view === 'editor') {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); saveDraft(); }
        if (ev.key === 'Escape') { ev.preventDefault(); backToList(); }
        return;
      }
      if (state.view === 'settings') {
        if (ev.key === 'Escape') { ev.preventDefault(); backToList(); }
        return;
      }
      /* 列表视图 */
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'n') { ev.preventDefault(); openEditor(blankDraft()); return; }
      if (tag === 'button' || tag === 'select') return;
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'e') {
        if (state.activeId) { ev.preventDefault(); openEditor(cloneSnippet(findById(state.activeId))); }
        return;
      }
      if (ev.key === 'Escape' && !typing) {
        ev.preventDefault();
        try { U().outPlugin(); } catch (e) {}
        return;
      }
      var items = UI.searchSort(state);
      if (!items.length) return;
      var idx = -1;
      for (var i = 0; i < items.length; i++) if (items[i].id === state.activeId) idx = i;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        state.activeId = items[Math.min(items.length - 1, idx + 1)].id;
        UI.renderList(state);
        scrollActiveIntoView();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        state.activeId = items[Math.max(0, idx <= 0 ? 0 : idx - 1)].id;
        UI.renderList(state);
        scrollActiveIntoView();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (idx < 0) state.activeId = items[0].id;
        enterOutput(findById(state.activeId), ev.altKey);
      }
    });

    window.addEventListener('resize', onResize);
    document.addEventListener('focusin', function (ev) {
      if (state.modal && !el('varScrim').contains(ev.target) && !Dialog.active()) { var first = el('varFields').querySelector('input'); if (first) first.focus(); }
    });
    window.addEventListener('beforeunload', function (ev) { if (state.view === 'editor' && isDirty()) { ev.preventDefault(); ev.returnValue = ''; } });
  }

  function scrollActiveIntoView() {
    var node = el('list').querySelector('[aria-selected="true"]');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  function insertAtCursor(ta, text) {
    var start = ta.selectionStart || 0;
    var end = ta.selectionEnd || 0;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.focus();
  }

  function blankDraft() {
    return { id: null, name: '', content: '', group: state.filter.type === 'group' ? state.filter.id : '', searchKey: '', direct: false, keyword: '', pinned: false };
  }
  function cloneSnippet(s) {
    return JSON.parse(JSON.stringify(s));
  }
  function replaceSnippet(saved) {
    for (var i = 0; i < state.snippets.length; i++) {
      if (state.snippets[i].id === saved.id) { state.snippets[i] = saved; return; }
    }
    state.snippets.push(saved);
  }

  /* ---------- 引导 ---------- */
  function bootstrap() {
    state.settings = Store.getSettings();
    applyTheme();
    onResize();
    bindEvents();
    setInterval(function () { if (state.ctx && state.view === 'list' && !state.modal && !Dialog.active()) { state.ctx.now = new Date(); state.renderCache = Object.create(null); UI.renderList(state); } }, 60000);
    try {
      U().onPluginEnter(function (arg) {
        if (!booted) { pendingEnter = arg; return; }
        handleEnter(arg);
      });
    } catch (e) { /* 预览环境 */ }

    Store.addExamples({ onlyIfEmpty: true }).catch(function (err) { reportError('范例初始化未完成', err); }).then(function () { return Store.loadAll(); }).then(function (data) {
      state.snippets = data.snippets;
      state.groups = data.groups;
    }).then(function () {
      return loadAbout();
    }).then(function () {
      return captureContext();
    }).then(function () {
      booted = true;
      syncFeatures();
      if (!state.snippets.length && state.filter.type === 'all') state.activeId = null;
      else state.activeId = (UI.searchSort(state)[0] || {}).id || null;
      if (pendingEnter) {
        var arg = pendingEnter;
        pendingEnter = null;
        handleEnter(arg);
      } else {
        handleEnter({ code: 'main' });
      }
    }).catch(function (err) {
      document.body.innerHTML = '<div style="padding:24px;font-family:monospace">Snippet Box 启动失败：' +
        String(err && err.message || err).replace(/</g, '&lt;') + '</div>';
    });
  }

  function waitAndBoot() {
    if (window.utools || window.__SB_SHIM__) return bootstrap();
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (window.utools) { clearInterval(t); bootstrap(); }
      else if (tries > 100) { clearInterval(t); /* 10 秒仍无 utools：不装兜底，直接报错可见 */
        document.body.innerHTML = '<div style="padding:24px;font-family:monospace">未检测到 window.utools，请在 uTools 内打开本插件。</div>';
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndBoot);
  } else {
    waitAndBoot();
  }
})();
