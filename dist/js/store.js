'use strict';
/* Snippet Box · 存储层：页面层独占 utools.db / dbStorage（分层铁律） */
window.SBStore = (function () {
  var SNIP_PREFIX = 'snip:';
  var GROUPS_ID = 'meta:groups';
  var MAX_CONTENT = 20000;
  var MAX_NAME = 200;
  var idSequence = 0;
  var groupsRevision; // 最近读取的版本；旧页面不能覆盖同步后的分组。
  var DEFAULT_SETTINGS = {
    output: 'paste', pasteMode: 'pasteText', invertModifier: true,
    directPrefix: '', theme: 'auto', style: 'orange', layout: 'quick',
    showPreviewInList: true, colorTokens: true, delimiter: 'mustache'
  };
  var SETTING_ENUMS = {
    output: ['paste', 'copy'], pasteMode: ['pasteText', 'typeString'],
    theme: ['auto', 'light', 'dark'], style: ['orange'],
    layout: ['quick', 'manage'], delimiter: ['mustache', 'dollar', 'bracket']
  };

  function db() { return window.utools.db; }
  function kv() { return window.utools.dbStorage; }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function object(value) { return value !== null && Object.prototype.toString.call(value) === '[object Object]'; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function nowIso() { return new Date().toISOString(); }
  function newId() {
    idSequence++;
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + idSequence.toString(36);
  }
  function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value); }
  function validDate(value) {
    if (typeof value !== 'string') return false;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!m || !isFinite(Date.parse(value))) return false;
    var year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var lastDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return month >= 1 && month <= 12 && day >= 1 && day <= lastDay &&
      Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60;
  }
  function invalid(label, detail) { throw new Error(label + '：' + detail); }
  function conflictError(label) {
    var err = new Error(label + '已被其他窗口或同步更新，请刷新后重试；没有覆盖较新的数据。');
    err.conflict = true;
    return err;
  }

  /* 只取白名单字段，不把任意文档元数据传回业务对象或备份。 */
  function cleanSnippet(s) {
    var t = nowIso();
    return {
      id: typeof s.id === 'string' ? s.id : '',
      name: typeof s.name === 'string' && s.name ? s.name : '未命名片段',
      content: typeof s.content === 'string' ? s.content : '',
      group: typeof s.group === 'string' ? s.group : '',
      searchKey: typeof s.searchKey === 'string' ? s.searchKey : '',
      direct: s.direct === true, keyword: typeof s.keyword === 'string' ? s.keyword : '',
      pinned: s.pinned === true,
      useCount: typeof s.useCount === 'number' && Number.isSafeInteger(s.useCount) && s.useCount >= 0 ? s.useCount : 0,
      lastUsedAt: validDate(s.lastUsedAt) ? s.lastUsedAt : '',
      createdAt: validDate(s.createdAt) ? s.createdAt : t,
      updatedAt: validDate(s.updatedAt) ? s.updatedAt : t
    };
  }
  var LEGACY_SAMPLES = [
    { name: 'git commit 模板', group: 'g-work', pinned: true, direct: true, keyword: 'commit', searchKey: 'commit git', content: 'feat({{?scope}}): {{?改动}}\n\n#{{date:YYYY-MM-DD}} by {{user}}', count: 84 },
    { name: '邮箱签名', group: 'g-work', pinned: true, direct: true, keyword: 'sign', searchKey: 'sign 签名', content: '--\n{{user}} · {{date:YYYY年MM月}}', count: 61 },
    { name: '日报抬头', group: 'g-work', pinned: false, direct: false, keyword: '', searchKey: 'daily 日报', content: '# 日报 {{date:-1d|YYYY/MM/DD}}（{{date:-1d|dddd}}）\n- 今日完成：\n- 明日计划：', count: 37 },
    { name: '引用剪贴板', group: '', pinned: false, direct: false, keyword: '', searchKey: 'quote 引用', content: '> {{clipboard}}\n>\n> —— 剪贴板于 {{time:HH:mm}} 捕获', count: 12 }
  ];
  var EXAMPLE_GROUP = { id: 'g-examples', name: '范例' };
  var EXAMPLES = [
    { id: 'example-commit', name: 'git commit 模板', searchKey: 'commit git 范例', pinned: true, content: 'feat({{?scope=ui}}): {{?改动说明}}\n\n# {{date:YYYY-MM-DD}}' },
    { id: 'example-signature', name: '邮箱签名', searchKey: 'sign 签名 范例', pinned: true, content: '祝好，\n{{?姓名}}\n{{?邮箱}}\n{{date:YYYY年MM月}}' },
    { id: 'example-daily', name: '日报抬头', searchKey: 'daily 日报 范例', content: '# 日报 {{date:YYYY/MM/DD}}（{{weekday}}）\n- 今日完成：\n- 明日计划：' },
    { id: 'example-clipboard', name: '引用剪贴板', searchKey: 'quote 引用 范例', content: '> {{clipboard}}\n>\n> —— 引用于 {{date:YYYY-MM-DD}}' }
  ];
  function isLegacySample(s) {
    // 不使用旧 seededIds：旧版曾把用户记录也写入该列表。
    // 示例的假使用次数 + 完整内容/配置 + 初始更新时间共同识别；已编辑的示例保留。
    var created = Date.parse(s.createdAt), updated = Date.parse(s.updatedAt);
    if (!isFinite(created) || !isFinite(updated) || updated < created || updated - created > 1000) return false;
    return LEGACY_SAMPLES.some(function (sample) {
      return s.useCount >= sample.count && ['name', 'content', 'group', 'searchKey', 'keyword', 'pinned', 'direct'].every(function (key) { return s[key] === sample[key]; });
    });
  }
  function validateSnippet(raw, label, requireId) {
    if (!object(raw)) invalid(label, '片段必须是对象');
    if (requireId && !validId(raw.id)) invalid(label, 'id 必须是 1–128 位字母、数字、点、横线或下划线');
    if (own(raw, 'id') && raw.id && !validId(raw.id)) invalid(label, 'id 不合法');
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > MAX_NAME) invalid(label, '名称必填且不能超过 200 字符');
    if (typeof raw.content !== 'string' || !raw.content.trim()) invalid(label, '内容必填');
    if (raw.content.length > MAX_CONTENT) invalid(label, '内容不能超过 20,000 字符');
    if (own(raw, 'group') && raw.group !== '' && !validId(raw.group)) invalid(label, '分组 id 不合法');
    ['searchKey', 'keyword'].forEach(function (key) {
      if (own(raw, key) && (typeof raw[key] !== 'string' || raw[key].length > 200 || /[\r\n\u0000]/.test(raw[key]))) invalid(label, key + ' 必须是最多 200 字符的单行文本');
    });
    ['direct', 'pinned'].forEach(function (key) {
      if (own(raw, key) && typeof raw[key] !== 'boolean') invalid(label, key + ' 必须是布尔值');
    });
    if (raw.direct === true && (!raw.keyword || raw.keyword.trim().length < 2)) invalid(label, '直达关键字至少需要 2 字符');
    if (own(raw, 'useCount') && (typeof raw.useCount !== 'number' || !Number.isSafeInteger(raw.useCount) || raw.useCount < 0)) invalid(label, '使用次数必须是非负整数');
    ['lastUsedAt', 'createdAt', 'updatedAt'].forEach(function (key) {
      if (own(raw, key) && !(key === 'lastUsedAt' && raw[key] === '') && !validDate(raw[key])) invalid(label, key + ' 必须是有效 ISO 日期');
    });
    var s = cleanSnippet(raw);
    s.name = raw.name.trim();
    s.keyword = s.keyword.trim();
    s.searchKey = s.searchKey.trim();
    return s;
  }
  function cleanGroups(groups, strict) {
    if (!Array.isArray(groups)) { if (strict) invalid('分组', '必须是数组'); return []; }
    var out = [], ids = Object.create(null);
    groups.forEach(function (g, i) {
      var label = '分组 ' + (i + 1);
      if (!object(g) || !validId(g.id) || typeof g.name !== 'string' || !g.name.trim() || g.name.length > MAX_NAME) {
        if (strict) invalid(label, 'id 或名称不合法');
        return;
      }
      if (ids[g.id]) { if (strict) invalid(label, 'id 重复'); return; }
      var item = { id: g.id, name: g.name.trim() };
      if (own(g, 'color')) {
        if (typeof g.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(g.color)) item.color = g.color;
        else if (strict) invalid(label, '颜色必须是十六进制颜色值');
      }
      ids[g.id] = true;
      out.push(item);
    });
    return out;
  }
  function settings(raw, strict, base) {
    if (raw !== undefined && raw !== null && !object(raw)) {
      if (strict) invalid('设置', '必须是对象');
      raw = null;
    }
    var out = {}, source = raw || {};
    for (var key in DEFAULT_SETTINGS) {
      if (!own(DEFAULT_SETTINGS, key)) continue;
      out[key] = base && own(base, key) ? base[key] : DEFAULT_SETTINGS[key];
      if (!own(source, key)) continue;
      var value = source[key];
      if (key === 'style' && (value === 'native' || value === 'cyberink')) value = 'orange';
      var valid;
      if (own(SETTING_ENUMS, key)) valid = SETTING_ENUMS[key].indexOf(value) >= 0;
      else if (key === 'directPrefix') valid = typeof value === 'string' && value.length <= 80 && !/[\r\n\u0000]/.test(value);
      else valid = typeof value === 'boolean';
      if (!valid) { if (strict) invalid('设置', key + ' 的值不合法'); continue; }
      out[key] = value;
    }
    return out;
  }
  function toDoc(s, rev) {
    var d = cleanSnippet(s);
    d._id = SNIP_PREFIX + s.id;
    d.type = 'snippet';
    if (rev) d._rev = rev;
    return d;
  }
  function fromDoc(d) {
    var s = cleanSnippet(d);
    if (typeof d._id === 'string' && d._id.indexOf(SNIP_PREFIX) === 0) s.id = d._id.slice(SNIP_PREFIX.length);
    s._id = d._id;
    s._rev = d._rev;
    return s;
  }
  function syncSnippet(target, source) {
    var clean = cleanSnippet(source);
    for (var key in clean) if (own(clean, key)) target[key] = clean[key];
    target._id = source._id;
    target._rev = source._rev;
    return target;
  }
  /* DbResult 成功 {ok:true,id,rev}，失败 {error:true,name,message}；get 缺失返回 null。 */
  function norm(res) {
    if (res && (res.error || res.ok === false)) {
      var e = new Error(res.message || res.name || 'db error');
      e.dbName = res.name || '';
      e.conflict = /conflict/i.test((res.name || '') + ' ' + (res.message || ''));
      e.notFound = /not_found|missing/i.test(res.name || '');
      throw e;
    }
    return res;
  }
  function dbCall(method, arg) {
    return Promise.resolve().then(function () {
      var d = db();
      if (d.promises && typeof d.promises[method] === 'function') return d.promises[method](arg);
      return d[method](arg);
    }).then(norm);
  }
  function getDoc(id) {
    return dbCall('get', id).catch(function (err) { if (err.notFound) return null; throw err; });
  }
  function readAll() {
    return dbCall('allDocs').then(function (docs) {
      if (!Array.isArray(docs)) throw new Error('数据库返回了无效的文档列表');
      var snippets = [], groups = [], groupDoc = null;
      docs.forEach(function (d) {
        if (!d) return;
        if (d.type === 'snippet' && typeof d._id === 'string' && d._id.indexOf(SNIP_PREFIX) === 0) snippets.push(fromDoc(d));
        else if (d._id === GROUPS_ID) { groupDoc = d; groups = cleanGroups(d.groups, false); }
      });
      return { snippets: snippets, groups: groups, groupDoc: groupDoc };
    });
  }
  function writeGroups(groups, current) {
    var doc = { _id: GROUPS_ID, type: 'meta', groups: copy(groups) };
    if (current && current._rev) doc._rev = current._rev;
    return dbCall('put', doc).then(function (res) { groupsRevision = res.rev; return res; });
  }
  function validateImport(obj) {
    if (!object(obj) || obj.app !== 'snippet-box' || !Array.isArray(obj.snippets)) invalid('导入文件', '不是 Snippet Box 的导出文件');
    if (obj.version !== 1) invalid('导入文件', '不支持此备份版本');
    if (own(obj, 'exportedAt') && !validDate(obj.exportedAt)) invalid('导入文件', '导出日期不合法');
    var out = { snippets: [], groups: cleanGroups(own(obj, 'groups') ? obj.groups : [], true), settings: null };
    obj.snippets.forEach(function (s, i) { out.snippets.push(validateSnippet(s, '片段 ' + (i + 1), true)); });
    if (own(obj, 'settings')) {
      if (!object(obj.settings)) invalid('设置', '必须是对象');
      out.settings = settings(obj.settings, true);
    }
    return out;
  }
  function createPlan(validated, current) {
    var byId = Object.create(null), groupIds = Object.create(null), remapGroups = Object.create(null), keys = Object.create(null);
    var groups = copy(current.groups), writes = [], skipped = 0, copies = 0, disabledDirect = 0;
    current.snippets.forEach(function (s) { byId[s.id] = s; if (s.direct) keys[s.keyword.toLowerCase()] = true; });
    current.groups.forEach(function (g) { groupIds[g.id] = g; });
    validated.groups.forEach(function (g) {
      var existing = groupIds[g.id];
      if (existing && existing.name === g.name) { remapGroups[g.id] = existing.id; return; }
      var addedGroup = copy(g);
      if (existing) do { addedGroup.id = 'g' + newId(); } while (own(groupIds, addedGroup.id));
      remapGroups[g.id] = addedGroup.id;
      groupIds[addedGroup.id] = addedGroup;
      groups.push(addedGroup);
    });
    validated.snippets.forEach(function (raw) {
      var s = copy(raw), existing = byId[s.id];
      if (s.group) {
        if (own(remapGroups, s.group)) s.group = remapGroups[s.group];
        else if (!own(groupIds, s.group)) invalid('片段「' + s.name + '」', '引用的分组不存在');
      }
      if (existing && existing.content === s.content) { skipped++; return; }
      if (existing) {
        do { s.id = newId(); } while (own(byId, s.id));
        s.name = s.name.slice(0, MAX_NAME - 3) + ' 副本';
        copies++;
        if (s.direct) { s.direct = false; disabledDirect++; }
      }
      if (s.direct && (own(keys, s.keyword.toLowerCase()) || ['snippet', 'snip', '片段'].indexOf(s.keyword.toLowerCase()) >= 0)) {
        s.direct = false;
        disabledDirect++;
      }
      if (s.direct) keys[s.keyword.toLowerCase()] = true;
      byId[s.id] = s;
      writes.push(s);
    });
    return {
      added: writes.length, updated: 0, skipped: skipped, copies: copies,
      disabledDirect: disabledDirect, restoreSettings: validated.settings !== null,
      settings: validated.settings, groups: groups,
      groupsAdded: groups.length - current.groups.length,
      snippets: writes, groupDoc: current.groupDoc
    };
  }
  /* utools.db 无事务。失败时只撤销本次仍保持原 rev 的写入，保留并发修改。 */
  function rollbackImport(ledger) {
    var retained = [], chain = Promise.resolve(), keepGroups = false;
    if (ledger.settings) {
      chain = chain.then(function () {
        try {
          var current = kv().getItem('settings');
          if (JSON.stringify(current) === JSON.stringify(ledger.settings.before)) return;
          if (JSON.stringify(current) !== JSON.stringify(ledger.settings.after)) { retained.push('设置已被其他操作更新'); return; }
          if (ledger.settings.before === null || ledger.settings.before === undefined) {
            if (typeof kv().removeItem === 'function') kv().removeItem('settings');
            else kv().setItem('settings', ledger.settings.before);
          } else kv().setItem('settings', ledger.settings.before);
        } catch (err) { retained.push('设置未能撤销：' + err.message); }
      });
    }
    ledger.snippets.slice().reverse().forEach(function (item) {
      chain = chain.then(function () {
        return getDoc(item.id).then(function (cur) {
          if (!cur) return;
          if (cur._rev !== item.rev) { keepGroups = true; retained.push('片段「' + item.name + '」已被其他操作更新'); return; }
          return dbCall('remove', cur);
        }).catch(function (err) { keepGroups = true; retained.push('片段「' + item.name + '」未能撤销：' + err.message); });
      });
    });
    if (ledger.groups) {
      chain = chain.then(function () {
        if (keepGroups) { retained.push('因部分片段未能撤销，保留本次新增分组'); return; }
        return getDoc(GROUPS_ID).then(function (cur) {
          if (!cur) { groupsRevision = null; return; }
          if (cur._rev !== ledger.groups.rev) { retained.push('分组已被其他操作更新'); return; }
          if (!ledger.groups.before) return dbCall('remove', cur).then(function () { groupsRevision = null; });
          var restore = copy(ledger.groups.before);
          restore._rev = cur._rev;
          return dbCall('put', restore).then(function (res) { groupsRevision = res.rev; });
        }).catch(function (err) { retained.push('分组未能撤销：' + err.message); });
      });
    }
    return chain.then(function () { return retained; });
  }

  var api = {
    DEFAULT_SETTINGS: copy(DEFAULT_SETTINGS),
    loadAll: function () {
      return readAll().then(function (data) {
        groupsRevision = data.groupDoc ? data.groupDoc._rev : null;
        return { snippets: data.snippets, groups: data.groups };
      });
    },
    saveSnippet: function (s) {
      return Promise.resolve().then(function () {
        var clean = validateSnippet(s, '片段', false);
        if (!clean.id) clean.id = newId();
        clean.updatedAt = nowIso();
        return dbCall('put', toDoc(clean, s.id ? s._rev : null)).then(function (res) {
          clean._id = res.id; clean._rev = res.rev;
          return syncSnippet(s, clean);
        }).catch(function (err) { if (err.conflict) throw conflictError('片段'); throw err; });
      });
    },
    deleteSnippet: function (s) {
      return getDoc(SNIP_PREFIX + s.id).then(function (cur) {
        if (!cur) return { ok: true, id: SNIP_PREFIX + s.id };
        if (s._rev && s._rev !== cur._rev) throw conflictError('片段');
        return dbCall('remove', cur).catch(function (err) { if (err.conflict) throw conflictError('片段'); throw err; });
      });
    },
    touchUse: function (s) {
      var usedAt = nowIso(), attempts = 0;
      function attempt() {
        attempts++;
        return getDoc(SNIP_PREFIX + s.id).then(function (cur) {
          if (!cur) throw new Error('片段已被删除，无法记录使用次数');
          var doc = copy(cur);
          var count = typeof cur.useCount === 'number' && Number.isSafeInteger(cur.useCount) && cur.useCount >= 0 ? cur.useCount : 0;
          if (count === Number.MAX_SAFE_INTEGER) throw new Error('片段使用次数已达到上限');
          doc.useCount = count + 1;
          doc.lastUsedAt = validDate(cur.lastUsedAt) && Date.parse(cur.lastUsedAt) > Date.parse(usedAt) ? cur.lastUsedAt : usedAt;
          return dbCall('put', doc).then(function (res) {
            doc._rev = res.rev;
            return syncSnippet(s, doc);
          });
        }).catch(function (err) {
          if (err.conflict && attempts < 3) return attempt();
          if (err.conflict) throw conflictError('片段使用记录');
          throw err;
        });
      }
      return attempt();
    },
    loadGroups: function () {
      return getDoc(GROUPS_ID).then(function (d) {
        groupsRevision = d ? d._rev : null;
        return cleanGroups(d && d.groups, false);
      });
    },
    saveGroups: function (groups) {
      return Promise.resolve().then(function () {
        var clean = cleanGroups(groups, true);
        return getDoc(GROUPS_ID).then(function (cur) {
          var revision = cur ? cur._rev : null;
          if (groupsRevision !== undefined && groupsRevision !== revision) throw conflictError('分组');
          return writeGroups(clean, cur).catch(function (err) { if (err.conflict) throw conflictError('分组'); throw err; });
        });
      });
    },
    getSettings: function () { return settings(kv().getItem('settings'), false); },
    saveSettings: function (s) {
      var clean = settings(s, true, api.getSettings());
      kv().setItem('settings', clean);
      return clean;
    },
    getFlag: function (key) { return kv().getItem(key); },
    setFlag: function (key, val) { return kv().setItem(key, val); },
    addExamples: function (options) {
      var ledger = { snippets: [], groups: null, settings: null };
      return readAll().then(function (data) {
        if (options && options.onlyIfEmpty && (data.snippets.length || kv().getItem('examplesInitializedV2'))) {
          if (data.snippets.length) kv().setItem('examplesInitializedV2', true);
          return { added: 0, skipped: EXAMPLES.length };
        }
        var pending = EXAMPLES.filter(function (example) { return !data.snippets.some(function (s) { return s.id === example.id; }); });
        var result = { added: 0, skipped: EXAMPLES.length - pending.length };
        var chain = Promise.resolve();
        if (pending.length && !data.groups.some(function (g) { return g.id === EXAMPLE_GROUP.id; })) {
          chain = writeGroups(data.groups.concat([EXAMPLE_GROUP]), data.groupDoc).then(function (res) { ledger.groups = { before: data.groupDoc, rev: res.rev }; });
        }
        pending.forEach(function (example) {
          chain = chain.then(function () {
            var t = nowIso();
            var draft = validateSnippet(Object.assign({}, example, { group: EXAMPLE_GROUP.id, direct: false, keyword: '', useCount: 0, lastUsedAt: '', createdAt: t, updatedAt: t }), '范例', true);
            return dbCall('put', toDoc(draft)).then(function (res) {
              ledger.snippets.push({ id: res.id, rev: res.rev, name: draft.name }); result.added++;
            }, function (err) { if (err.conflict) { result.skipped++; return; } throw err; });
          });
        });
        return chain.then(function () { kv().setItem('examplesInitializedV2', true); return result; });
      }).catch(function (err) {
        return readAll().then(function (data) {
          if (ledger.groups && data.snippets.some(function (s) { return s.group === EXAMPLE_GROUP.id && !ledger.snippets.some(function (item) { return item.id === SNIP_PREFIX + s.id; }); })) ledger.groups = null;
        }).catch(function () { ledger.groups = null; }).then(function () { return rollbackImport(ledger); }).then(function (retained) {
          throw new Error('范例添加失败：' + err.message + (retained.length ? '。' + retained.join('；') : '。本次新增已撤销，其他记录已保留。'));
        });
      });
    },
    // 旧版灌入的示例仅用于识别和清理；正式版本不再生成这些记录。
    planLegacyCleanup: function () {
      return readAll().then(function (data) {
        return { snippets: data.snippets.filter(isLegacySample), groupDoc: data.groupDoc };
      });
    },
    clearLegacySamples: function (plan) {
      var removed = 0, preserved = 0;
      var chain = Promise.resolve();
      (plan.snippets || []).forEach(function (sample) {
        chain = chain.then(function () {
          return getDoc(SNIP_PREFIX + sample.id).then(function (cur) {
            if (!cur) return;
            if (cur._rev !== sample._rev || !isLegacySample(fromDoc(cur))) { preserved++; return; }
            return dbCall('remove', cur).then(function () { removed++; });
          });
        });
      });
      return chain.then(function () {
        return readAll().then(function (data) {
          var groups = data.groups.filter(function (g) {
            var legacy = (g.id === 'g-work' && g.name === '工作') || (g.id === 'g-life' && g.name === '个人');
            return !legacy || data.snippets.some(function (item) { return item.group === g.id; });
          });
          // 分组被同步更新时保留，避免覆盖清理确认期间的改名或新分组。
          if (!data.groupDoc || !plan.groupDoc || data.groupDoc._rev !== plan.groupDoc._rev || groups.length === data.groups.length) return;
          return writeGroups(groups, data.groupDoc);
        });
      }).then(function () { return { removed: removed, preserved: preserved }; });
    },
    exportObject: function (state) {
      return {
        app: 'snippet-box', version: 1, exportedAt: nowIso(),
        settings: settings(state.settings, false), groups: cleanGroups(state.groups, false),
        snippets: state.snippets.map(function (s) { return cleanSnippet(s); })
      };
    },
    validateImport: validateImport,
    planImport: function (obj) {
      return Promise.resolve().then(function () { return validateImport(obj); }).then(function (validated) {
        return readAll().then(function (current) { return createPlan(validated, current); });
      });
    },
    importObject: function (obj) {
      var ledger = { snippets: [], groups: null, settings: null };
      return api.planImport(obj).then(function (plan) {
        var chain = Promise.resolve();
        plan.snippets.forEach(function (s) {
          chain = chain.then(function () {
            return dbCall('put', toDoc(s)).then(function (res) { ledger.snippets.push({ id: res.id, rev: res.rev, name: s.name }); });
          });
        });
        if (plan.groupsAdded) {
          chain = chain.then(function () {
            return writeGroups(plan.groups, plan.groupDoc).then(function (res) { ledger.groups = { before: plan.groupDoc, rev: res.rev }; });
          });
        }
        if (plan.restoreSettings) {
          chain = chain.then(function () {
            var previous = kv().getItem('settings');
            ledger.settings = { before: previous === undefined ? undefined : copy(previous), after: copy(plan.settings) };
            kv().setItem('settings', plan.settings);
          });
        }
        return chain.then(function () {
          return { added: plan.added, updated: 0, skipped: plan.skipped, copies: plan.copies, disabledDirect: plan.disabledDirect, groupsAdded: plan.groupsAdded, restoredSettings: plan.restoreSettings };
        });
      }).catch(function (err) {
        return rollbackImport(ledger).then(function (retained) {
          var failure = new Error(err.message + (retained.length ? '。以下变化未撤销：' + retained.join('；') : '。本次导入写入已撤销，原有数据未被覆盖。'));
          failure.cause = err;
          failure.rollbackIncomplete = retained.length > 0;
          failure.retainedChanges = retained;
          throw failure;
        });
      });
    }
  };
  return api;
})();
