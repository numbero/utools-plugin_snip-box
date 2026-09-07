'use strict';
/* Snippet Box · 存储层：页面层独占 utools.db / dbStorage（分层铁律） */
window.SBStore = (function () {
  var SNIP_PREFIX = 'snip:';
  var GROUPS_ID = 'meta:groups';

  var DEFAULT_SETTINGS = {
    output: 'paste',            // paste=自动粘贴到上一个应用 | copy=仅复制到剪贴板
    pasteMode: 'pasteText',     // pasteText=hideMainWindowPasteText | typeString=hideMainWindowTypeString
    invertModifier: true,       // ⌥ 临时反向
    directPrefix: '',           // 直达关键字统一前缀
    theme: 'auto',              // auto | light | dark
    style: 'native',            // native=靛蓝原生 | cyberink=荧光墨
    showPreviewInList: true,
    colorTokens: true,
    delimiter: 'mustache'       // mustache | dollar | bracket
  };

  function db() { return window.utools.db; }
  function kv() { return window.utools.dbStorage; }

  function newId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowIso() { return new Date().toISOString(); }

  function cleanSnippet(s) {
    return {
      id: s.id,
      name: s.name || '未命名片段',
      content: s.content || '',
      group: s.group || '',
      searchKey: s.searchKey || '',
      direct: !!s.direct,
      keyword: s.keyword || '',
      pinned: !!s.pinned,
      useCount: s.useCount || 0,
      lastUsedAt: s.lastUsedAt || '',
      createdAt: s.createdAt || nowIso(),
      updatedAt: s.updatedAt || nowIso()
    };
  }

  function toDoc(s) {
    var d = cleanSnippet(s);
    d._id = SNIP_PREFIX + s.id;
    d.type = 'snippet';
    if (s._rev) d._rev = s._rev;
    return d;
  }

  function fromDoc(d) {
    var s = cleanSnippet(d);
    s._id = d._id;
    s._rev = d._rev;
    return s;
  }

  /* uTools 的 db 是同步 API（Promise 风格挂在 db.promises），不支持回调风格；统一在此包成 Promise */
  /* DbResult: 成功 {ok:true,id,rev}；失败 {error:true,name,message}，不抛异常、无 status 字段 */
  function norm(res) {
    if (res && res.error) {
      var e = new Error(res.message || res.name || 'db error');
      e.dbName = res.name || '';
      if (/conflict/i.test((res.name || '') + ' ' + (res.message || ''))) e.conflict = true;
      throw e;
    }
    return res;
  }
  function dbCall(method, arg) {
    var d = db();
    if (d.promises && typeof d.promises[method] === 'function') {
      return d.promises[method](arg).then(norm);
    }
    return Promise.resolve().then(function () { return norm(d[method](arg)); });
  }

  function putWithRetry(doc) {
    return dbCall('put', doc).catch(function (err) {
      if (!err || !err.conflict) throw err;
      return dbCall('get', doc._id).then(function (cur) {
        if (!cur) throw err;
        doc._rev = cur._rev;
        return dbCall('put', doc);
      });
    });
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,

    loadAll: function () {
      /* allDocs([idStartsWith]) 直接返回文档数组，不是 PouchDB 的 {rows:[{doc}]} */
      return dbCall('allDocs').then(function (docs) {
        var snippets = [];
        var groups = [];
        var list = docs || [];
        for (var i = 0; i < list.length; i++) {
          var d = list[i];
          if (!d) continue;
          if (d.type === 'snippet') snippets.push(fromDoc(d));
          else if (d._id === GROUPS_ID && d.groups) groups = d.groups;
        }
        return { snippets: snippets, groups: groups };
      });
    },

    saveSnippet: function (s) {
      var isNew = !s.id;
      if (isNew) s.id = newId();
      s.updatedAt = nowIso();
      var doc = toDoc(s);
      if (isNew) delete doc._rev;
      return putWithRetry(doc).then(function (res) {
        s._id = res.id;
        s._rev = res.rev;
        return s;
      });
    },

    deleteSnippet: function (s) {
      var id = SNIP_PREFIX + s.id;
      return dbCall('get', id).then(function (cur) {
        if (!cur) return { ok: true, id: id };
        return dbCall('remove', cur);
      });
    },

    touchUse: function (s) {
      s.useCount = (s.useCount || 0) + 1;
      s.lastUsedAt = nowIso();
      var doc = toDoc(s);
      return putWithRetry(doc).then(function (res) { s._rev = res.rev; return s; });
    },

    loadGroups: function () {
      return dbCall('get', GROUPS_ID).catch(function () { return null; }).then(function (d) {
        return d && d.groups ? d.groups : [];
      });
    },

    saveGroups: function (groups) {
      function write(rev) {
        var doc = { _id: GROUPS_ID, type: 'meta', groups: groups };
        if (rev) doc._rev = rev;
        return dbCall('put', doc).catch(function (err) {
          if (!err || !err.conflict) throw err;
          return dbCall('get', GROUPS_ID).then(function (cur) { return write(cur && cur._rev); });
        });
      }
      return dbCall('get', GROUPS_ID).catch(function () { return null; }).then(function (cur) {
        return write(cur && cur._rev);
      });
    },

    getSettings: function () {
      var s = kv().getItem('settings');
      var out = {};
      for (var k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k];
      if (s && typeof s === 'object') {
        for (var k2 in s) out[k2] = s[k2];
      }
      return out;
    },

    saveSettings: function (s) {
      return kv().setItem('settings', s);
    },

    getFlag: function (key) { return kv().getItem(key); },
    setFlag: function (key, val) { return kv().setItem(key, val); },

    seedSnippets: function () {
      var t = nowIso();
      var seeds = [
        {
          id: newId(), name: 'git commit 模板', group: 'g-work', pinned: true,
          direct: true, keyword: 'commit', searchKey: 'commit git',
          content: 'feat({{?scope}}): {{?改动}}\n\n#{{date:YYYY-MM-DD}} by {{user}}',
          useCount: 84, lastUsedAt: t, createdAt: t, updatedAt: t
        },
        {
          id: newId(), name: '邮箱签名', group: 'g-work', pinned: true,
          direct: true, keyword: 'sign', searchKey: 'sign 签名',
          content: '--\n{{user}} · {{date:YYYY年MM月}}',
          useCount: 61, lastUsedAt: t, createdAt: t, updatedAt: t
        },
        {
          id: newId(), name: '日报抬头', group: 'g-work', pinned: false,
          direct: false, keyword: '', searchKey: 'daily 日报',
          content: '# 日报 {{date:-1d|YYYY/MM/DD}}（{{date:-1d|dddd}}）\n- 今日完成：\n- 明日计划：',
          useCount: 37, lastUsedAt: t, createdAt: t, updatedAt: t
        },
        {
          id: newId(), name: '引用剪贴板', group: '', pinned: false,
          direct: false, keyword: '', searchKey: 'quote 引用',
          content: '> {{clipboard}}\n>\n> —— 剪贴板于 {{time:HH:mm}} 捕获',
          useCount: 12, lastUsedAt: t, createdAt: t, updatedAt: t
        }
      ];
      var chain = Promise.resolve();
      seeds.forEach(function (s) {
        chain = chain.then(function () { return api.saveSnippet(s); });
      });
      return chain.then(function () {
        return api.saveGroups([
          { id: 'g-work', name: '工作' },
          { id: 'g-life', name: '个人' }
        ]);
      });
    },

    exportObject: function (state) {
      return {
        app: 'snippet-box',
        version: 1,
        exportedAt: nowIso(),
        settings: state.settings,
        groups: state.groups,
        snippets: state.snippets.map(function (s) { return cleanSnippet(s); })
      };
    },

    importObject: function (obj, state) {
      if (!obj || obj.app !== 'snippet-box' || !Array.isArray(obj.snippets)) {
        return Promise.reject(new Error('不是 Snippet Box 的导出文件'));
      }
      var chain = Promise.resolve();
      var byId = {};
      state.snippets.forEach(function (s) { byId[s.id] = s; });
      var added = 0, updated = 0;
      obj.snippets.forEach(function (raw) {
        chain = chain.then(function () {
          var existing = byId[raw.id];
          var s = cleanSnippet(raw);
          if (existing) {
            s._rev = existing._rev;
            updated++;
          } else {
            added++;
          }
          return api.saveSnippet(s).then(function (saved) {
            byId[saved.id] = saved;
          });
        });
      });
      return chain.then(function () {
        if (Array.isArray(obj.groups) && obj.groups.length) {
          return api.saveGroups(obj.groups).then(function () { return { added: added, updated: updated }; });
        }
        return { added: added, updated: updated };
      });
    }
  };

  return api;
})();
