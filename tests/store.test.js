'use strict';
/* 无依赖的数据库故障/并发回归：node tests/store.test.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var source = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function failure(name) { return { error: true, name: name, message: name }; }
function harness(withPromises) {
  var docs = Object.create(null), values = Object.create(null), revision = 0;
  var env = { docs: docs, values: values, puts: 0, removes: 0, beforePut: null, beforeSet: null };
  var database = {
    get: function (id) { return docs[id] ? clone(docs[id]) : null; },
    allDocs: function () { return Object.keys(docs).map(function (id) { return clone(docs[id]); }); },
    put: function (doc) {
      env.puts++;
      if (env.beforePut) { var injected = env.beforePut(doc); if (injected) return injected; }
      var current = docs[doc._id];
      if ((current && current._rev !== doc._rev) || (!current && doc._rev)) return failure('conflict');
      var stored = clone(doc);
      stored._rev = (++revision) + '-test';
      docs[doc._id] = stored;
      return { ok: true, id: doc._id, rev: stored._rev };
    },
    remove: function (doc) {
      env.removes++;
      var current = docs[doc._id];
      if (!current) return failure('not_found');
      if (current._rev !== doc._rev) return failure('conflict');
      delete docs[doc._id];
      return { ok: true, id: doc._id };
    }
  };
  if (withPromises) {
    database.promises = {};
    ['get', 'allDocs', 'put', 'remove'].forEach(function (method) {
      database.promises[method] = function (arg) { return Promise.resolve().then(function () { return database[method](arg); }); };
    });
  }
  env.database = database;
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? clone(values[key]) : null; },
    setItem: function (key, value) { if (env.beforeSet) env.beforeSet(key, value); values[key] = clone(value); },
    removeItem: function (key) { delete values[key]; }
  };
  var sandbox = { window: { utools: { db: database, dbStorage: storage } } };
  vm.runInNewContext(source, sandbox);
  env.store = sandbox.window.SBStore;
  env.remoteEdit = function (id, fields) {
    var doc = clone(docs[id]);
    Object.keys(fields).forEach(function (key) { doc[key] = fields[key]; });
    doc._rev = (++revision) + '-remote';
    docs[id] = doc;
  };
  return env;
}
function snippet(id, content) { return { id: id, name: '测试片段', content: content || '原内容', group: '', useCount: 0 }; }
function backup(snippets, extra) {
  var value = { app: 'snippet-box', version: 1, snippets: snippets, groups: [] };
  Object.keys(extra || {}).forEach(function (key) { value[key] = extra[key]; });
  return value;
}
async function rejects(promise, pattern) {
  var error;
  try { await promise; } catch (err) { error = err; }
  assert.ok(error, '操作应拒绝');
  if (pattern) assert.match(error.message, pattern);
  return error;
}

test('默认活力橙与旧设置白名单迁移，不清除片段', async function () {
  var env = harness();
  await env.store.saveSnippet(snippet('s1'));
  env.values.settings = { style: 'cyberink', theme: 'dark', layout: 'invalid', output: 'copy', unexpected: true };
  var settings = env.store.getSettings();
  assert.strictEqual(settings.style, 'orange');
  assert.strictEqual(settings.layout, 'quick');
  assert.strictEqual(settings.theme, 'dark');
  assert.strictEqual(settings.output, 'copy');
  assert.strictEqual(settings.unexpected, undefined);
  assert.strictEqual((await env.store.loadAll()).snippets.length, 1);
  env.store.saveSettings({ theme: 'light', __unused: true });
  assert.strictEqual(env.values.settings.output, 'copy');
  assert.strictEqual(env.values.settings.__unused, undefined);
});

test('新片段白名单持久化，20,000 字符边界', async function () {
  var env = harness();
  var s = { name: ' 边界 ', content: 'x'.repeat(20000), untrusted: '丢弃' };
  await env.store.saveSnippet(s);
  assert.ok(s.id && s._rev);
  assert.strictEqual(env.docs['snip:' + s.id].untrusted, undefined);
  assert.strictEqual(s.name, '边界');
  await rejects(env.store.saveSnippet({ name: '超长', content: 'x'.repeat(20001) }), /20,000/);
  assert.strictEqual(env.puts, 1);
});

test('陈旧编辑拒绝覆盖远端内容且不修改草稿版本', async function () {
  var env = harness(true);
  var s = snippet('s1');
  await env.store.saveSnippet(s);
  var oldRev = s._rev;
  env.remoteEdit('snip:s1', { name: '远端名称', content: '远端内容' });
  s.content = '旧窗口编辑';
  await rejects(env.store.saveSnippet(s), /刷新/);
  assert.strictEqual(env.docs['snip:s1'].content, '远端内容');
  assert.strictEqual(s._rev, oldRev);
  assert.strictEqual(env.puts, 2);
});

test('touchUse读取最新文档、仅更新使用字段并同步调用者', async function () {
  var env = harness();
  var s = snippet('s1');
  await env.store.saveSnippet(s);
  var updated = '2026-09-01T00:00:00.000Z';
  env.remoteEdit('snip:s1', { content: '同步的新内容', name: '同步名称', useCount: 8, updatedAt: updated, extension: '保留' });
  await env.store.touchUse(s);
  assert.strictEqual(s.content, '同步的新内容');
  assert.strictEqual(s.name, '同步名称');
  assert.strictEqual(s.useCount, 9);
  assert.strictEqual(env.docs['snip:s1'].updatedAt, updated);
  assert.strictEqual(env.docs['snip:s1'].extension, '保留');
  assert.ok(s.lastUsedAt);
});

test('touchUse重试冲突，重新读取最新次数与内容', async function () {
  var env = harness(true);
  var s = snippet('s1');
  await env.store.saveSnippet(s);
  var attempts = 0;
  env.beforePut = function (doc) {
    if (doc._id !== 'snip:s1') return;
    attempts++;
    if (attempts === 1) env.remoteEdit('snip:s1', { content: '并发修改', useCount: 20 });
  };
  await env.store.touchUse(s);
  assert.strictEqual(attempts, 2);
  assert.strictEqual(s.content, '并发修改');
  assert.strictEqual(s.useCount, 21);
});

test('touchUse持续冲突最多尝试3次，失败不虚增本地次数', async function () {
  var env = harness();
  var s = snippet('s1');
  await env.store.saveSnippet(s);
  var oldRev = s._rev, attempts = 0;
  env.beforePut = function () { attempts++; return failure('conflict'); };
  await rejects(env.store.touchUse(s), /刷新/);
  assert.strictEqual(attempts, 3);
  assert.strictEqual(s.useCount, 0);
  assert.strictEqual(s._rev, oldRev);
  assert.strictEqual(env.docs['snip:s1'].useCount, 0);
});

test('陈旧删除不能删除同步后的片段', async function () {
  var env = harness();
  var s = snippet('s1');
  await env.store.saveSnippet(s);
  env.remoteEdit('snip:s1', { content: '新内容' });
  await rejects(env.store.deleteSnippet(s), /刷新/);
  assert.strictEqual(env.docs['snip:s1'].content, '新内容');
  assert.strictEqual(env.removes, 0);
});

test('分组陈旧版本与写入期间冲突均拒绝覆盖', async function () {
  var env = harness();
  await env.store.loadGroups();
  await env.store.saveGroups([{ id: 'g1', name: '原分组' }]);
  env.remoteEdit('meta:groups', { groups: [{ id: 'g1', name: '远端分组' }] });
  await rejects(env.store.saveGroups([{ id: 'g1', name: '旧窗口分组' }]), /刷新/);
  assert.strictEqual(env.docs['meta:groups'].groups[0].name, '远端分组');
  await env.store.loadGroups();
  var attempts = 0;
  env.beforePut = function () { attempts++; return failure('conflict'); };
  await rejects(env.store.saveGroups([{ id: 'g1', name: '更新' }]), /刷新/);
  assert.strictEqual(attempts, 1);
});

test('完整导入预校验：尾部坏记录不能留下前面的新增', async function () {
  var invalidRecords = [
    { id: '__proto__', name: 'x', content: 'x' },
    { id: 's2', name: '', content: 'x' },
    { id: 's2', name: 'x', content: 'x'.repeat(20001) },
    { id: 's2', name: 'x', content: 'x', useCount: -1 },
    { id: 's2', name: 'x', content: 'x', group: {} },
    { id: 's2', name: 'x', content: 'x', direct: true, keyword: 'a' },
    { id: 's2', name: 'x', content: 'x', createdAt: '2026-02-30T12:00:00Z' },
    { id: 's2', name: 'x', content: 'x', updatedAt: 'not-a-date' }
  ];
  for (var i = 0; i < invalidRecords.length; i++) {
    var env = harness();
    await rejects(env.store.importObject(backup([snippet('s1'), invalidRecords[i]])));
    assert.strictEqual(env.puts, 0);
    assert.strictEqual(Object.keys(env.docs).length, 0);
  }
  var env = harness();
  await rejects(env.store.importObject(backup([snippet('s1')], { settings: { output: 'unsafe' } })));
  await rejects(env.store.importObject(backup([snippet('s1')], { groups: [{ id: 'g1', name: 'x', color: 'url(x)' }] })));
  await rejects(env.store.importObject(backup([snippet('s1')], { version: 2 })));
  assert.strictEqual(env.puts, 0);
});

test('导入计划读取最新DB，相同ID内容跳过，冲突创建副本', async function () {
  var env = harness(true);
  await env.store.saveSnippet(snippet('s1', '当前内容'));
  var imported = backup([snippet('s1', '当前内容'), snippet('s1', '不同内容'), snippet('s2', '新增内容')]);
  var plan = await env.store.planImport(imported, { snippets: [] });
  assert.strictEqual(plan.added, 2);
  assert.strictEqual(plan.skipped, 1);
  assert.strictEqual(plan.copies, 1);
  assert.strictEqual(env.puts, 1);
  var result = await env.store.importObject(imported, { snippets: [] });
  assert.strictEqual(result.updated, 0);
  assert.strictEqual(result.added, 2);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(result.copies, 1);
  assert.strictEqual(env.docs['snip:s1'].content, '当前内容');
  var records = (await env.store.loadAll()).snippets;
  assert.ok(records.some(function (s) { return s.id !== 's1' && s.content === '不同内容' && /副本$/.test(s.name); }));
});

test('导入合并分组不覆盖，映射冲突分组并恢复合法设置', async function () {
  var env = harness();
  await env.store.saveGroups([{ id: 'g1', name: '原分组', color: '#fff' }]);
  var s = snippet('s1'); s.group = 'g1';
  var result = await env.store.importObject(backup([s], {
    groups: [{ id: 'g1', name: '导入分组', color: '#ff8800' }, { id: 'g2', name: '新分组' }],
    settings: { theme: 'dark', style: 'native', delimiter: 'dollar', colorTokens: false, unsafe: '丢弃' }
  }));
  var data = await env.store.loadAll();
  assert.strictEqual(result.groupsAdded, 2);
  assert.strictEqual(result.restoredSettings, true);
  assert.strictEqual(data.groups.length, 3);
  assert.strictEqual(data.groups[0].name, '原分组');
  assert.notStrictEqual(data.snippets[0].group, 'g1');
  assert.strictEqual(env.store.getSettings().style, 'orange');
  assert.strictEqual(env.store.getSettings().delimiter, 'dollar');
  assert.strictEqual(env.values.settings.unsafe, undefined);
});

test('同批重复ID按内容跳过/副本，直达关键字重复关闭', async function () {
  var env = harness();
  var a = snippet('s1', 'a'); a.direct = true; a.keyword = 'key';
  var b = snippet('s2', 'b'); b.direct = true; b.keyword = 'key';
  var c = clone(a); c.content = 'c';
  var result = await env.store.importObject(backup([a, clone(a), b, c]));
  assert.strictEqual(result.added, 3);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(result.copies, 1);
  assert.strictEqual(result.disabledDirect, 2);
  assert.strictEqual((await env.store.loadAll()).snippets.filter(function (s) { return s.direct; }).length, 1);
});

test('未定义分组引用在写入前拒绝', async function () {
  var env = harness();
  var s = snippet('s1'); s.group = 'missing';
  await rejects(env.store.importObject(backup([s])), /分组不存在/);
  assert.strictEqual(env.puts, 0);
});

test('导入中途失败撤销本次新增，保留所有原有数据', async function () {
  var env = harness();
  await env.store.saveSnippet(snippet('existing'));
  env.beforePut = function (doc) { if (doc._id === 'snip:s2') return failure('disk_full'); };
  var error = await rejects(env.store.importObject(backup([snippet('s1'), snippet('s2')])), /disk_full/);
  assert.strictEqual(error.rollbackIncomplete, false);
  assert.strictEqual(env.docs['snip:s1'], undefined);
  assert.ok(env.docs['snip:existing']);
});

test('回滚不能删除本次新增后被并发修改的记录，并明确报告', async function () {
  var env = harness();
  env.beforePut = function (doc) {
    if (doc._id === 'snip:s2') {
      env.remoteEdit('snip:s1', { content: '他人后续编辑' });
      return failure('disk_full');
    }
  };
  var error = await rejects(env.store.importObject(backup([snippet('s1'), snippet('s2')])), /未撤销/);
  assert.strictEqual(error.rollbackIncomplete, true);
  assert.strictEqual(env.docs['snip:s1'].content, '他人后续编辑');
  assert.ok(error.retainedChanges.length);
});

test('设置写入失败撤销片段和新增分组，恢复原设置/分组', async function () {
  var env = harness();
  await env.store.saveGroups([{ id: 'original', name: '原分组' }]);
  env.values.settings = { output: 'copy', theme: 'light' };
  env.beforeSet = function () { throw new Error('settings disk failure'); };
  var error = await rejects(env.store.importObject(backup([snippet('s1')], {
    groups: [{ id: 'new', name: '新分组' }], settings: { output: 'paste', theme: 'dark' }
  })), /settings disk failure/);
  assert.strictEqual(error.rollbackIncomplete, false);
  assert.strictEqual(env.docs['snip:s1'], undefined);
  assert.strictEqual(env.docs['meta:groups'].groups.length, 1);
  assert.strictEqual(env.values.settings.output, 'copy');
});

test('回滚保留并发片段时也保留其新分组，避免悬空引用', async function () {
  var env = harness();
  var s = snippet('s1'); s.group = 'g1';
  env.beforeSet = function () {
    env.remoteEdit('snip:s1', { content: '后续修改' });
    throw new Error('settings failure');
  };
  var error = await rejects(env.store.importObject(backup([s], {
    groups: [{ id: 'g1', name: '新增分组' }], settings: { theme: 'dark' }
  })), /新增分组/);
  assert.strictEqual(error.rollbackIncomplete, true);
  assert.strictEqual(env.docs['snip:s1'].content, '后续修改');
  assert.strictEqual(env.docs['meta:groups'].groups[0].id, 'g1');
});

test('导出/导入保留数据与主题且剔除未知字段、版本元数据', async function () {
  var first = harness();
  await first.store.saveGroups([{ id: 'g-work', name: '工作' }, { id: 'g-life', name: '个人' }]);
  await first.store.saveSnippet(Object.assign(snippet('s1'), { group: 'g-work' }));
  var state = await first.store.loadAll();
  state.settings = first.store.getSettings();
  state.snippets[0].unknown = true;
  var exported = first.store.exportObject(state);
  assert.strictEqual(exported.snippets[0]._rev, undefined);
  assert.strictEqual(exported.snippets[0].unknown, undefined);
  var second = harness(true);
  await second.store.importObject(exported);
  var restored = await second.store.loadAll();
  assert.strictEqual(restored.snippets.length, 1);
  assert.strictEqual(restored.groups.length, 2);
  assert.strictEqual(second.store.getSettings().style, 'orange');
});

function legacySample(id) {
  var t = '2026-10-02T12:00:00.000Z';
  return { id: id, name: 'git commit 模板', group: 'g-work', pinned: true, direct: true, keyword: 'commit', searchKey: 'commit git', content: 'feat({{?scope}}): {{?改动}}\n\n#{{date:YYYY-MM-DD}} by {{user}}', useCount: 84, lastUsedAt: t, createdAt: t, updatedAt: t, type: 'snippet', _id: 'snip:' + id, _rev: '1-legacy' };
}
test('首次安装只读取空库，不创建片段、默认分组或演示统计', async function () {
  var env = harness();
  env.store.getSettings();
  var state = await env.store.loadAll();
  assert.strictEqual(state.snippets.length, 0);
  assert.strictEqual(state.groups.length, 0);
  assert.strictEqual(env.puts, 0);
  assert.strictEqual(env.store.seedSnippets, undefined);
});
test('清理重复旧示例与空默认分组，不依赖重装后丢失的标记', async function () {
  var env = harness(true);
  env.docs['snip:old1'] = legacySample('old1');
  env.docs['snip:old2'] = legacySample('old2');
  await env.store.saveGroups([{id:'g-work',name:'工作'},{id:'g-life',name:'个人'}]);
  var plan = await env.store.planLegacyCleanup();
  assert.strictEqual(plan.snippets.length, 2);
  var result = await env.store.clearLegacySamples(plan);
  assert.strictEqual(result.removed, 2);
  var data = await env.store.loadAll();
  assert.strictEqual(data.snippets.length, 0);
  assert.strictEqual(data.groups.length, 0);
});
test('旧seededIds污染用户ID时，自己的片段和使用中的分组仍保留', async function () {
  var env = harness();
  env.docs['snip:old1'] = legacySample('old1');
  await env.store.saveGroups([{id:'g-work',name:'工作'},{id:'g-life',name:'个人'},{id:'g-own',name:'我的分组'}]);
  await env.store.saveSnippet(Object.assign(snippet('own','我的真实模板'),{group:'g-work'}));
  env.values.seededIds = ['old1','own'];
  await env.store.clearLegacySamples(await env.store.planLegacyCleanup());
  var data = await env.store.loadAll();
  assert.strictEqual(data.snippets.length, 1);
  assert.strictEqual(data.snippets[0].id, 'own');
  assert.deepStrictEqual(Array.from(data.groups, function (g) { return g.id; }), ['g-work','g-own']);
});
test('改过名称、内容、分组、配置或已保存过的旧示例不清理', async function () {
  var env = harness();
  var changes = [{name:'我的commit'}, {content:'真实模板'}, {group:''}, {pinned:false}, {updatedAt:'2026-10-02T12:00:05.000Z'}, {useCount:0}];
  changes.forEach(function (change, i) { var s = legacySample('edited'+i); Object.assign(s, change); env.docs[s._id] = s; });
  var plan = await env.store.planLegacyCleanup();
  assert.strictEqual(plan.snippets.length, 0);
  await env.store.clearLegacySamples(plan);
  assert.strictEqual(Object.keys(env.docs).length, changes.length);
});
test('确认清理期间被同步更新的片段和分组不覆盖', async function () {
  var env = harness();
  env.docs['snip:old1'] = legacySample('old1');
  await env.store.saveGroups([{id:'g-work',name:'工作'},{id:'g-life',name:'个人'}]);
  var plan = await env.store.planLegacyCleanup();
  env.remoteEdit('snip:old1', {content:'远端改好的模板'});
  env.remoteEdit('meta:groups', {groups:[{id:'g-work',name:'新工作'},{id:'g-life',name:'个人'}]});
  var result = await env.store.clearLegacySamples(plan);
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(result.preserved, 1);
  assert.strictEqual(env.docs['snip:old1'].content, '远端改好的模板');
  assert.strictEqual(env.docs['meta:groups'].groups[0].name, '新工作');
});

(async function () {
  for (var i = 0; i < tests.length; i++) {
    await tests[i].fn();
    process.stdout.write('✓ ' + tests[i].name + '\n');
  }
  process.stdout.write('通过 ' + tests.length + ' 项存储测试。\n');
})().catch(function (err) { console.error(err); process.exitCode = 1; });
