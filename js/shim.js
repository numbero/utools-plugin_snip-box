'use strict';
/* 仅开发预览用：在普通浏览器里模拟 window.utools 与 window.api（内存态，刷新即丢）。
   build.sh 不把本文件打进 dist。动作全部记录到 window.__SB_LOG__ 供自动化校验读取。 */
(function () {
  var LOG = [];
  window.__SB_LOG__ = LOG;
  function log(kind, detail) {
    LOG.push({ kind: kind, detail: detail, at: Date.now() });
    try { console.log('[shim] ' + kind, detail === undefined ? '' : detail); } catch (e) {}
  }

  /* ---------- 内存数据库（严格照抄 uTools 契约：DbResult 不抛异常、get 缺失返回 null、allDocs 返回文档数组） ---------- */
  var docs = {};
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nextRev(prev) {
    var n = prev ? parseInt(String(prev).split('-')[0], 10) + 1 : 1;
    return n + '-' + Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
  }
  function fail(name, message) { return { error: true, name: name, message: message }; }

  var db = {
    put: function (doc) {
      if (!doc || typeof doc._id !== 'string') return fail('bad_request', '_id is required');
      var cur = docs[doc._id];
      if ((cur && cur._rev !== doc._rev) || (!cur && doc._rev)) {
        return fail('conflict', 'Document update conflict');
      }
      var rev = nextRev(cur && cur._rev);
      var stored = clone(doc);
      stored._rev = rev;
      docs[doc._id] = stored;
      return { ok: true, id: doc._id, rev: rev };
    },
    get: function (id) {
      var d = docs[id];
      return d ? clone(d) : null;
    },
    remove: function (docOrId) {
      var id = typeof docOrId === 'string' ? docOrId : (docOrId && docOrId._id);
      var cur = docs[id];
      if (!cur) return fail('not_found', 'missing');
      if (typeof docOrId !== 'string' && docOrId._rev && docOrId._rev !== cur._rev) {
        return fail('conflict', 'Document update conflict');
      }
      delete docs[id];
      return { ok: true, id: id };
    },
    allDocs: function (arg) {
      var out = [];
      for (var k in docs) {
        if (!Object.prototype.hasOwnProperty.call(docs, k)) continue;
        if (typeof arg === 'string' && k.indexOf(arg) !== 0) continue;
        if (Array.isArray(arg) && arg.indexOf(k) < 0) continue;
        out.push(clone(docs[k]));
      }
      return out;
    }
  };

  db.promises = {
    put: function (doc) { return Promise.resolve().then(function () { return db.put(doc); }); },
    get: function (id) { return Promise.resolve().then(function () { return db.get(id); }); },
    remove: function (a) { return Promise.resolve().then(function () { return db.remove(a); }); },
    allDocs: function (a) { return Promise.resolve().then(function () { return db.allDocs(a); }); }
  };

  /* ---------- dbStorage（同步 KV） ---------- */
  var kvs = {};
  var dbStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(kvs, k) ? clone(kvs[k]) : null; },
    setItem: function (k, v) { kvs[k] = clone(v === undefined ? null : v); },
    removeItem: function (k) { delete kvs[k]; }
  };

  /* ---------- 动态指令 ---------- */
  var features = [{ code: 'main', explain: '快捷粘贴带占位符的文本片段', cmds: ['snippet', 'snip', '片段'] }];

  var enterCb = null;
  var pushCb = null;
  var selectPushCb = null;

  window.utools = {
    db: db,
    dbStorage: dbStorage,
    dbCryptoStorage: { getItem: function (k) { return dbStorage.getItem('crypto:' + k); }, setItem: function (k, v) { dbStorage.setItem('crypto:' + k, v); } },

    onPluginEnter: function (cb) { enterCb = cb; },
    onMainPush: function (cb, onSelect) { pushCb = cb; selectPushCb = onSelect; },
    onPluginOut: function () {},
    onPluginReady: function (cb) { setTimeout(cb, 0); },

    setExpendHeight: function (px) { log('setExpendHeight', px); },
    setSubInput: function () {},
    showNotification: function (body) { log('showNotification', body); },
    outPlugin: function () { log('outPlugin'); },
    isDarkColors: function () {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    },
    hideMainWindow: function () { log('hideMainWindow'); },
    showMainWindow: function () { log('showMainWindow'); },

    copyText: function (text) { log('copyText', text); return true; },
    copyImage: function () { return true; },
    copyFiles: function () { return true; },
    hideMainWindowPasteText: function (text) { log('hideMainWindowPasteText', text); },
    hideMainWindowTypeString: function (text) { log('hideMainWindowTypeString', text); },

    setFeature: function (f) {
      log('setFeature', f);
      for (var i = 0; i < features.length; i++) if (features[i].code === f.code) { features[i] = f; return true; }
      features.push(f);
      return true;
    },
    removeFeature: function (code) {
      log('removeFeature', code);
      features = features.filter(function (f) { return f.code !== code; });
      return true;
    },
    getFeatures: function () { return clone(features); },

    /* 官方 typings：这两个都返回 Promise<string> */
    readCurrentFolderPath: function () { return Promise.resolve(null); },
    readCurrentBrowserUrl: function () { return Promise.resolve(null); },

    showOpenDialog: function () { return ['/tmp/snippetbox-import.json']; },
    showSaveDialog: function () { return '/tmp/snippetbox-export.json'; },
    showMessageBox: function () { return 0; },
    getPath: function (n) { return '/tmp/' + n; },
    shellShowItemInFolder: function () {},
    redirect: function () { log('redirect', arguments[0]); }
  };

  /* ---------- window.api（preload 桥接层） ---------- */
  var files = {};
  window.__SB_FILES__ = files;

  window.api = {
    readClipboard: function () { return Promise.resolve(''); },
    getSys: function () { return Promise.resolve({ pluginVersion: '1.0.9' }); },
    getRuntime: function () { return Promise.resolve({}); },
    readFile: function (file) {
      return Object.prototype.hasOwnProperty.call(files, file)
        ? Promise.resolve(files[file])
        : Promise.reject(new Error('shim: 文件不存在 ' + file));
    },
    writeFile: function (file, text) { files[file] = text; return Promise.resolve(file); }
  };

  window.__SB_SHIM__ = true;
  window.__SB_SIMULATE__ = function (arg) { if (enterCb) enterCb(arg); };
  window.__SB_MAIN_PUSH__ = function (arg) { return pushCb ? pushCb(arg) : []; };
  window.__SB_SELECT_PUSH__ = function (arg, index) {
    var results = window.__SB_MAIN_PUSH__(arg);
    var option = results[index || 0];
    if (!option || !selectPushCb) return false;
    var action = Object.assign({}, arg, { from: 'main', option: option });
    var enter = selectPushCb(action) === true;
    log('selectMainPush', { code: arg.code, enter: enter });
    if (enter && enterCb) enterCb(action);
    return enter;
  };

  /* 模拟 uTools 唤起：?code=snip:xxx 可测直达关键字路径 */
  var q = location.search;
  var m = /code=([^&]*)/.exec(q);
  var code = m ? decodeURIComponent(m[1]) : 'main';
  var payload = code === 'main' ? 'snippet' : code.replace(/^snip:/, '');
  var waited = 0;
  setTimeout(function fire() {
    if (enterCb) return enterCb({ code: code, type: code === 'main' ? 'text' : 'cmd', payload: payload });
    if (++waited > 30) return log('onPluginEnter 未注册，丢弃唤起', code);
    setTimeout(fire, 100);
  }, 0);
})();
