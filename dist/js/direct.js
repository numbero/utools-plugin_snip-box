'use strict';
/* 无 DOM 的直达运行时：preload 提前注册，页面只接收需要交互的进入事件。 */
(function () {
  if (window.SBDirect) return;
  var E = window.SnippetEngine;
  var Store = window.SBStore;
  var busy = false;
  var registered = false;
  var pushRegistered = false;
  var enterHandler = null;
  var useHandler = null;
  var busyHandler = null;
  var pendingEnter = null;
  var history = [];

  function U() { return window.utools; }
  function isBusy() { return busy || !!(busyHandler && busyHandler()); }
  function trace(phase, arg) {
    history.push({ phase: phase, at: new Date().toISOString(), code: arg && arg.code || '', from: arg && arg.from || '' });
    if (history.length > 12) history.shift();
  }
  function notify(message) { try { U().showNotification(message); } catch (e) {} }
  function snippetFor(arg) {
    var code = arg && arg.code;
    if (typeof code !== 'string' || code.indexOf('snip:') !== 0) return null;
    var s = Store.getSnippetSync(code.slice(5));
    return s && s.direct && s.keyword ? s : null;
  }
  function hasVariables(s, settings) {
    return E.parse(s.content, { delimiter: settings.delimiter }).variables.length > 0;
  }
  function attempt(fn) {
    try { return Promise.resolve(fn()); } catch (e) { return Promise.resolve(null); }
  }
  function captureContext() {
    var api = window.api;
    var now = new Date();
    var clip = api ? api.readClipboard().catch(function () { return ''; }) : Promise.resolve('');
    var sys = api ? api.getSys().catch(function () { return {}; }) : Promise.resolve({});
    var folder = attempt(function () { return U().readCurrentFolderPath(); }).catch(function () { return null; });
    var url = attempt(function () { return U().readCurrentBrowserUrl(); }).catch(function () { return null; });
    return Promise.all([clip, sys, folder, url]).then(function (data) {
      var u = data[3];
      return {
        now: now, clipboard: data[0] || '', sys: data[1] || {}, folder: data[2] || null,
        url: u ? { url: typeof u === 'string' ? u : u.url || '', title: u.title || (typeof u === 'string' ? u : '') } : null,
        variables: {}
      };
    });
  }
  function outputApi(mode, text, settings) {
    return Promise.resolve().then(function () {
      var fn = mode === 'copy' ? 'copyText' : settings.pasteMode === 'typeString' ? 'hideMainWindowTypeString' : 'hideMainWindowPasteText';
      if (!U() || typeof U()[fn] !== 'function') throw new Error('当前环境不支持此输出方式');
      return U()[fn](text);
    }).then(function (result) { if (result === false) throw new Error('输出未成功'); });
  }
  function finish(entered, ok, arg) {
    trace(ok ? 'output-ok' : 'output-failed', arg);
    try { Store.setFlag('directTrace', history.slice()); } catch (e) {}
    busy = false;
    /* 隐藏只改变可见性；普通进入必须退出，防止再次唤起还停在片段入口。 */
    if (entered) { try { U().outPlugin(); } catch (e) {} }
    return ok;
  }
  function output(s, settings, entered, arg) {
    if (isBusy()) return Promise.resolve(false);
    busy = true;
    trace(entered ? 'enter-output' : 'push-output', arg);
    var context;
    try { context = captureContext(); } catch (err) { context = Promise.reject(err); }
    /* 先捕获宿主上下文，再隐藏；不等待 HTML、全库、主题或关于信息。 */
    if (entered) { try { U().hideMainWindow(); } catch (e) {} }
    return context.then(function (ctx) {
      var text = E.render(s.content, { context: ctx, delimiter: settings.delimiter }).text;
      var mode = settings.output === 'copy' ? 'copy' : 'paste';
      return outputApi(mode, text, settings).then(function () {
        if (mode === 'copy') { try { U().hideMainWindow(); } catch (e) {} }
        return Store.touchUse(s).catch(function (err) {
          notify('内容已输出，使用记录更新失败：' + err.message);
        }).then(function () {
          if (useHandler) useHandler(s);
          return true;
        });
      }, function (err) {
        if (mode === 'copy') { notify('复制失败：' + err.message); return false; }
        return outputApi('copy', text, settings).then(function () {
          notify('粘贴失败，内容已复制到剪贴板，请手动粘贴。');
          return false;
        }, function (copyErr) { notify('粘贴和备用复制均失败：' + copyErr.message); return false; });
      });
    }).then(function (ok) { return finish(entered, ok, arg); }, function (err) {
      notify('直达输出失败：' + err.message);
      return finish(entered, false, arg);
    });
  }
  function mainPushResults(arg) {
    try {
      var s = snippetFor(arg);
      return s ? [{ icon: 'icon.svg', text: s.name, title: '输出片段：' + s.name }] : [];
    } catch (e) { return []; }
  }
  function selectMainPush(arg) {
    if (!arg || typeof arg.code !== 'string' || arg.code.indexOf('snip:') !== 0) return true;
    if (isBusy()) return false;
    try {
      var settings = Store.getSettings();
      var s = snippetFor(arg);
      if (!s) { notify('直达输出失败：片段不存在或直达指令已关闭'); return false; }
      if (hasVariables(s, settings)) { trace('push-form', arg); return true; }
      output(s, settings, false, arg);
    } catch (err) { notify('直达输出失败：' + err.message); }
    /* 必须同步返回 false，不能把异步输出的 Promise 交给宿主做进入判定。 */
    return false;
  }
  function handleEnter(arg) {
    if (isBusy()) return Promise.resolve(false);
    if (arg && typeof arg.code === 'string' && arg.code.indexOf('snip:') === 0) {
      try {
        var settings = Store.getSettings();
        var s = snippetFor(arg);
        if (!s) {
          notify('直达输出失败：片段不存在或直达指令已关闭');
          try { U().hideMainWindow(); U().outPlugin(); } catch (e) {}
          return Promise.resolve(false);
        }
        if (!hasVariables(s, settings)) return output(s, settings, true, arg);
      } catch (err) {
        notify('直达输出失败：' + err.message);
        try { U().hideMainWindow(); } catch (e) {}
        return Promise.resolve(finish(true, false, arg));
      }
    }
    trace('enter-ui', arg);
    if (enterHandler) return enterHandler(arg);
    pendingEnter = arg;
  }
  window.SBDirect = {
    isBusy: isBusy,
    mainPushResults: mainPushResults,
    selectMainPush: selectMainPush,
    handleEnter: handleEnter,
    setEnterHandler: function (handler) {
      enterHandler = handler;
      if (pendingEnter) { var arg = pendingEnter; pendingEnter = null; return handleEnter(arg); }
    },
    setUseHandler: function (handler) { useHandler = handler; },
    setBusyHandler: function (handler) { busyHandler = handler; },
    getDiagnostics: function () {
      var previous = [];
      try { previous = Store.getFlag('directTrace') || []; } catch (e) {}
      return { registered: registered, pushRegistered: pushRegistered, busy: busy, previous: previous, current: history.slice() };
    },
    register: function () {
      if (registered || !U()) return;
      try {
        if (typeof U().onMainPush === 'function') { U().onMainPush(mainPushResults, selectMainPush); pushRegistered = true; }
      } catch (err) { notify('搜索框静默输出注册失败：' + err.message); }
      U().onPluginEnter(handleEnter);
      registered = true;
    }
  };
})();
