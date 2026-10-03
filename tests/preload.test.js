'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const flush = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
function harness(data) {
  const docs = data ? data.docs : Object.create(null);
  const values = data ? data.values : Object.create(null);
  const logs = [], callbacks = {}, registrations = { enter: 0, push: 0 };
  const db = {
    get: id => docs[id] ? clone(docs[id]) : null,
    put: doc => {
      const saved = clone(doc); saved._rev = '2-test'; docs[doc._id] = saved;
      logs.push(['writeUse', saved.useCount]);
      return { ok: true, id: doc._id, rev: saved._rev };
    }
  };
  const c = {
    console, Date, Promise, __dirname: root,
    process: { resourcesPath: '/test', platform: 'darwin', versions: {}, cwd: () => '/test' },
    setTimeout: () => { throw new Error('preload must not use timers'); },
    setInterval: () => { throw new Error('preload must not use timers'); }
  };
  c.window = c;
  c.utools = {
    db, dbStorage: { getItem: key => values[key] ? clone(values[key]) : null, setItem: (key, value) => { values[key] = clone(value); } },
    onPluginEnter: fn => { registrations.enter++; callbacks.enter = fn; },
    onMainPush: (results, select) => { registrations.push++; callbacks.results = results; callbacks.select = select; },
    hideMainWindow: () => logs.push(['hide']), outPlugin: () => logs.push(['out']),
    hideMainWindowPasteText: text => { logs.push(['paste', text]); return true; },
    copyText: text => { logs.push(['copy', text]); return true; },
    showNotification: text => logs.push(['notify', text]),
    readCurrentFolderPath: () => Promise.resolve(null), readCurrentBrowserUrl: () => Promise.resolve(null)
  };
  const loaded = new Set();
  c.require = name => {
    if (name === 'electron') return { clipboard: { readText: () => '源剪贴板' } };
    if (name === 'os') return { userInfo: () => ({ username: 'test' }), homedir: () => '/test', hostname: () => 'test', type: () => 'Darwin', release: () => 'test', arch: () => 'arm64', tmpdir: () => '/tmp' };
    if (name === 'path') return path;
    if (name === 'fs') return { readFileSync: () => '{"version":"test"}' };
    if (loaded.has(name)) return;
    loaded.add(name);
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), c);
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'preload.js'), 'utf8'), c);
  const env = { c, docs, values, db, logs, callbacks, registrations };
  env.addSnippet = content => {
    const s = { _id: 'snip:sign', _rev: '1-test', type: 'snippet', id: 'sign', name: '签名', content, keyword: 'sign', direct: true, useCount: 0 };
    docs[s._id] = s;
    return { code: 'snip:sign', type: 'text', payload: ';sign', from: 'main' };
  };
  return env;
}
(async () => {
  let checks = 0;
  async function check(name, run) { await run(); console.log('ok ' + (++checks) + ' - ' + name); }
  await check('preload registers direct handlers before a document or page exists', async () => {
    const env = harness();
    assert.equal(env.c.document, undefined);
    assert.deepEqual(env.registrations, { enter: 1, push: 1 });
    assert.equal(env.c.SBDirect.getDiagnostics().registered, true);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/direct.js'), 'utf8'), env.c);
    env.c.SBDirect.register();
    assert.deepEqual(env.registrations, { enter: 1, push: 1 }, 'page loading must not replace early handlers');
  });
  await check('cold normal entry hides immediately and exits only after recording usage', async () => {
    const env = harness(); const action = env.addSnippet('签名 {{clipboard}} {{user}}');
    let folderDone, writeDone;
    env.c.utools.readCurrentFolderPath = () => new Promise(resolve => { folderDone = resolve; });
    env.db.promises = { put: doc => new Promise(resolve => { writeDone = () => resolve(env.db.put(doc)); }) };
    const output = env.callbacks.enter(action);
    assert.deepEqual(env.logs, [['hide']]);
    folderDone(null); await flush();
    assert(env.logs.some(x => x[0] === 'paste' && x[1] === '签名 源剪贴板 test'));
    assert(!env.logs.some(x => x[0] === 'out'), 'do not exit and kill the process before touchUse finishes');
    writeDone(); assert.equal(await output, true);
    assert.equal(env.docs['snip:sign'].useCount, 1);
    assert.equal(env.logs[env.logs.length - 1][0], 'out');
    assert.equal(env.values.directTrace[0].phase, 'enter-output');
    const restarted = harness(env);
    assert.equal(restarted.c.SBDirect.getDiagnostics().previous[0].phase, 'enter-output');
  });
  await check('cold push selection outputs without entering, exiting, or touching a DOM', async () => {
    const env = harness(); const action = env.addSnippet('直接输出');
    assert.equal(env.callbacks.results(action)[0].text, '签名');
    assert.equal(env.callbacks.select(action), false);
    await flush();
    assert(env.logs.some(x => x[0] === 'paste' && x[1] === '直接输出'));
    assert(!env.logs.some(x => x[0] === 'out'));
    assert.equal(env.values.directTrace[0].phase, 'push-output');
  });
  await check('variable and main entries wait for the page without hiding or outputting', async () => {
    for (const variable of [true, false]) {
      const env = harness(); const action = variable ? env.addSnippet('{{?姓名}}') : { code: 'main', type: 'text', payload: 'snippet', from: 'main' };
      if (variable) assert.equal(env.callbacks.select(action), true);
      env.callbacks.enter(action);
      assert.equal(env.logs.length, 0);
      const delivered = [];
      env.c.SBDirect.setEnterHandler(arg => delivered.push(arg));
      assert.strictEqual(delivered[0], action);
      assert.equal(env.logs.length, 0);
    }
  });
  await check('failed normal output still leaves the plugin entry and does not count usage', async () => {
    const env = harness(); const action = env.addSnippet('失败兜底');
    env.c.utools.hideMainWindowPasteText = () => false;
    assert.equal(await env.callbacks.enter(action), false);
    assert(env.logs.some(x => x[0] === 'copy' && x[1] === '失败兜底'));
    assert(env.logs.some(x => x[0] === 'notify'));
    assert.equal(env.docs['snip:sign'].useCount, 0);
    assert.equal(env.logs[env.logs.length - 1][0], 'out');
  });
  await check('direct selection cannot overlap foreground output or strand a failed entry', async () => {
    const env = harness(); const action = env.addSnippet('直达内容');
    env.c.SBDirect.setBusyHandler(() => true);
    assert.equal(env.callbacks.select(action), false); await flush(); assert.equal(env.logs.length, 0);
    env.c.SBDirect.setBusyHandler(() => false);
    env.db.get = () => { throw new Error('database unavailable'); };
    assert.equal(await env.callbacks.enter(action), false);
    assert(env.logs.some(x => x[0] === 'notify')); assert.equal(env.logs[env.logs.length - 1][0], 'out');
  });
  console.log('Passed ' + checks + ' preload checks.');
})().catch(err => { console.error(err); process.exitCode = 1; });
