'use strict';
/* Snippet Box · 应用层：引导、上下文快照、动作、动态指令、键盘 */
(function () {
  var E = window.SnippetEngine;
  var Store = window.SBStore;
  var UI = window.SBUI;
  var el = UI.el;

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
    about: {}
  };

  var booted = false;
  var pendingEnter = null;
  var emptyTimer = null;

  function U() { return window.utools; }

  /* ---------- 主题 / 窗口 ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    document.documentElement.setAttribute('data-style', state.settings.style);
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
      if (isEmpty) {
        UI.renderEmptyDemo(state);
        if (!emptyTimer) emptyTimer = setInterval(function () { UI.renderEmptyDemo(state); }, 2000);
      } else if (emptyTimer) {
        clearInterval(emptyTimer);
        emptyTimer = null;
      }
      UI.renderSidebar(state);
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

  function doOutput(snippet, copyOnly, textOverride, exact) {
    var text = textOverride;
    if (text == null) {
      text = E.render(snippet.content, renderOptsFor(snippet)).text;
    }
    var mode = exact ? (copyOnly ? 'copy' : 'paste') : effectiveMode(copyOnly);
    if (mode === 'copy') {
      U().copyText(text);
      UI.toast('已复制 ' + text.length + ' 字符到剪贴板', 'ok');
      Store.touchUse(snippet).then(function () {
        if (state.view === 'list') UI.renderList(state);
        try { U().outPlugin(); } catch (e) {}
      });
      return Promise.resolve();
    }
    Store.touchUse(snippet);
    if (state.settings.pasteMode === 'typeString') {
      U().hideMainWindowTypeString(text);
    } else {
      U().hideMainWindowPasteText(text);
    }
    return Promise.resolve();
  }

  function enterOutput(snippet, copyOnly) {
    var r = E.render(snippet.content, renderOptsFor(snippet));
    if (r.variables.length) {
      openModal(snippet);
      return;
    }
    doOutput(snippet, !!copyOnly);
  }

  /* ---------- 变量弹框 ---------- */
  function openModal(snippet) {
    var r = E.render(snippet.content, renderOptsFor(snippet));
    var fields = [];
    var seen = {};
    r.variables.forEach(function (v) {
      if (!seen[v.name]) { seen[v.name] = true; fields.push(v); }
    });
    var values = {};
    fields.forEach(function (f) { if (f.defaultValue) values[f.name] = f.defaultValue; });
    state.modal = { snippet: snippet, fields: fields, values: values };
    el('varScrim').hidden = false;
    UI.renderVarFields(state);
    UI.renderVarPreview(state);
    var first = el('varFields').querySelector('input');
    if (first) first.focus();
  }

  function closeModal() {
    state.modal = null;
    el('varScrim').hidden = true;
  }

  function readModalValues() {
    var inputs = el('varFields').querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      state.modal.values[inputs[i].getAttribute('data-var')] = inputs[i].value;
    }
  }

  function modalOutput(copyOnly) {
    readModalValues();
    var ctx = {
      now: state.ctx.now, clipboard: state.ctx.clipboard, folder: state.ctx.folder,
      url: state.ctx.url, sys: state.ctx.sys, variables: state.modal.values
    };
    var text = E.render(state.modal.snippet.content, { context: ctx, delimiter: state.settings.delimiter }).text;
    var snippet = state.modal.snippet;
    closeModal();
    doOutput(snippet, copyOnly, text, true);
  }

  /* ---------- 编辑器 ---------- */
  function openEditor(draft) {
    if (!el('varScrim').hidden) closeModal();
    state.editing = draft;
    state.view = 'editor';
    UI.showView('editor');
    UI.syncEditorFields(state);
    UI.renderPop();
    setHeight(EDITOR_HEIGHT);
    el('edDelete').hidden = !draft.id;
    el('edName').focus();
  }

  function backToList() {
    state.view = 'list';
    state.editing = null;
    UI.showView('list');
    setHeight(LIST_HEIGHT);
    renderAll();
  }

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

  function saveDraft() {
    var d = readDraft();
    if (!d.name) {
      el('edName').classList.add('is-error');
      el('edName').focus();
      UI.toast('先给片段起个名字', 'info');
      return;
    }
    Store.saveSnippet(d).then(function (saved) {
      var idx = -1;
      for (var i = 0; i < state.snippets.length; i++) if (state.snippets[i].id === saved.id) idx = i;
      if (idx >= 0) state.snippets[idx] = saved; else state.snippets.push(saved);
      state.activeId = saved.id;
      syncFeatures();
      UI.toast('已保存', 'ok');
      backToList();
    }).catch(function (err) {
      UI.toast('保存失败：' + (err && err.message || err), 'info');
    });
  }

  function deleteSnippet(id) {
    var s = findById(id);
    if (!s) return;
    Store.deleteSnippet(s).then(function () {
      state.snippets = state.snippets.filter(function (x) { return x.id !== id; });
      syncFeatures();
      UI.toast('已删除', 'ok');
      backToList();
    }).catch(function (err) {
      UI.toast('删除失败：' + (err && err.message || err), 'info');
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
        try { U().removeFeature(f.code); } catch (e) {}
      }
    });
    Object.keys(want).forEach(function (code) {
      try { U().setFeature(want[code]); } catch (e) {}
    });
  }

  /* ---------- 设置 ---------- */
  function patchSettings(obj) {
    for (var k in obj) state.settings[k] = obj[k];
    Store.saveSettings(state.settings);
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
        pluginVersion: (res[0] && res[0].pluginVersion) || '1.0.0',
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
      return Store.importObject(obj, state);
    }).then(function (res) {
      return Store.loadAll().then(function (data) {
        state.snippets = data.snippets;
        state.groups = data.groups;
        syncFeatures();
        renderAll();
        UI.toast('导入完成：新增 ' + res.added + ' · 覆盖 ' + res.updated, 'ok');
      });
    }).catch(function (err) {
      UI.toast('导入失败：' + err.message, 'info');
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
      ua: navigator.userAgent
    };
    U().copyText(JSON.stringify(info, null, 2));
    UI.toast('诊断信息已复制，粘给我即可', 'ok');
  }

  function clearSeed() {
    var ids = Store.getFlag('seededIds') || [];
    if (!ids.length) { UI.toast('没有示例数据可清', 'info'); return; }
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        var s = findById(id);
        return s ? Store.deleteSnippet(s) : Promise.resolve();
      });
    });
    chain.then(function () {
      Store.setFlag('seededIds', []);
      return Store.loadAll();
    }).then(function (data) {
      state.snippets = data.snippets;
      state.groups = data.groups;
      syncFeatures();
      renderAll();
      UI.toast('示例已清空', 'ok');
    });
  }

  function seed() {
    return Store.seedSnippets().then(function () {
      return Store.loadAll();
    }).then(function (data) {
      state.snippets = data.snippets;
      state.groups = data.groups;
      var ids = state.snippets.map(function (s) { return s.id; });
      Store.setFlag('seededIds', ids);
      syncFeatures();
      renderAll();
      UI.toast('已导入 4 条示例', 'ok');
    });
  }

  /* ---------- 进入分发 ---------- */
  function handleEnter(arg) {
    captureContext().then(function () {
      var code = arg && arg.code;
      if (code && code.indexOf('snip:') === 0) {
        var s = findById(code.slice(5));
        if (!s) { UI.toast('片段不存在或已删除', 'info'); return; }
        var r = E.render(s.content, renderOptsFor(s));
        if (r.variables.length) {
          state.view = 'list';
          UI.showView('list');
          renderAll();
          openModal(s);
        } else {
          doOutput(s, false);
          try { U().outPlugin(); } catch (e) {}
        }
        return;
      }
      state.view = 'list';
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
      UI.renderList(state);
    });
    el('searchInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); el('list').focus(); }
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
    el('btnEmptySeed').addEventListener('click', seed);
    el('btnSettings').addEventListener('click', function () {
      state.view = 'settings';
      UI.showView('settings');
      refreshAboutThenSettings();
    });

    el('sidebar').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-filter]');
      if (!btn) return;
      var f = btn.getAttribute('data-filter');
      if (f === '__addgroup') {
        var name = window.prompt('新分组名称');
        if (name && name.trim()) {
          state.groups.push({ id: 'g' + Date.now().toString(36), name: name.trim() });
          Store.saveGroups(state.groups).then(function () { UI.renderSidebar(state); });
        }
        return;
      }
      state.filter = { type: f, id: btn.getAttribute('data-id') || '' };
      UI.renderSidebar(state);
      UI.renderList(state);
    });

    var list = el('list');
    list.addEventListener('click', function (ev) {
      var act = ev.target.closest('[data-act]');
      var row = ev.target.closest('.list-item');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'copy') doOutput(findById(id), true, null, true);
        if (a === 'pin') {
          var s = findById(id);
          s.pinned = !s.pinned;
          Store.saveSnippet(s).then(function (saved) {
            replaceSnippet(saved);
            syncFeatures();
            UI.renderList(state);
            UI.renderSidebar(state);
          });
        }
        if (a === 'edit') openEditor(cloneSnippet(findById(id)));
        return;
      }
      state.activeId = id;
      UI.renderList(state);
    });
    list.addEventListener('dblclick', function (ev) {
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
      if (d && d.id && window.confirm('删除片段「' + d.name + '」？此操作不可撤销。')) deleteSnippet(d.id);
    });
    el('edPinned').addEventListener('click', function () {
      this.setAttribute('aria-checked', this.getAttribute('aria-checked') !== 'true');
    });
    el('edDirect').addEventListener('click', function () {
      var on = this.getAttribute('aria-checked') !== 'true';
      this.setAttribute('aria-checked', String(on));
      el('edDirectKey').disabled = !on;
      if (on) el('edDirectKey').focus();
    });
    el('edTpl').addEventListener('input', function () { UI.renderEditorPreview(state); });
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
      if (!window.confirm('恢复全部默认设置？')) return;
      state.settings = JSON.parse(JSON.stringify(Store.DEFAULT_SETTINGS));
      Store.saveSettings(state.settings);
      applyTheme();
      syncFeatures();
      refreshAboutThenSettings();
      renderAll();
      UI.toast('已恢复默认', 'ok');
    });

    /* 变量弹框 */
    el('varFields').addEventListener('input', function (ev) {
      var inp = ev.target.closest('[data-var]');
      if (!inp) return;
      state.modal.values[inp.getAttribute('data-var')] = inp.value;
      inp.classList.toggle('is-empty', !inp.value);
      UI.renderVarPreview(state);
    });
    el('varPaste').addEventListener('click', function () { modalOutput(false); });
    el('varCopy').addEventListener('click', function () { modalOutput(true); });
    el('varScrim').addEventListener('click', function (ev) {
      if (ev.target === this) closeModal();
    });

    /* 全局键盘 */
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (!el('varScrim').hidden) {
        if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); }
        if (ev.key === 'Enter') { ev.preventDefault(); modalOutput(ev.altKey); }
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
  }

  /* ---------- 引导 ---------- */
  function bootstrap() {
    state.settings = Store.getSettings();
    applyTheme();
    onResize();
    bindEvents();
    try {
      U().onPluginEnter(function (arg) {
        if (!booted) { pendingEnter = arg; return; }
        handleEnter(arg);
      });
    } catch (e) { /* 预览环境 */ }

    Store.loadAll().then(function (data) {
      state.snippets = data.snippets;
      state.groups = data.groups;
      var seeded = Store.getFlag('seeded');
      var next = Promise.resolve();
      if (!seeded) {
        next = seed().then(function () { Store.setFlag('seeded', true); });
      }
      return next;
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
