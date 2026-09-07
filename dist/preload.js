'use strict';
// preload 跑在 Electron 渲染进程（nodeIntegration 开）。只做系统 I/O，经 window.api.*（全部 Promise）桥接给页面。
// 红线：渲染进程定时器没有 unref；本文件不使用任何定时器。

var electron = require('electron');
var os = require('os');
var fs = require('fs');
var path = require('path');

function promisify(fn) {
  return function () {
    var args = arguments;
    return new Promise(function (resolve, reject) {
      try { resolve(fn.apply(null, args)); } catch (e) { reject(e); }
    });
  };
}

function readUToolsVersion() {
  var bases = [process.resourcesPath];
  for (var i = 0; i < bases.length; i++) {
    var cands = [
      path.join(bases[i], 'app.asar', 'package.json'),
      path.join(bases[i], 'app', 'package.json')
    ];
    for (var j = 0; j < cands.length; j++) {
      try {
        var pkg = JSON.parse(fs.readFileSync(cands[j], 'utf8'));
        if (pkg && pkg.version) return pkg.version;
      } catch (e) { /* 换下一个候选 */ }
    }
  }
  return '';
}

function readPluginVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin.json'), 'utf8')).version || '';
  } catch (e) { return ''; }
}

window.api = {
  readClipboard: promisify(function () {
    return electron.clipboard.readText();
  }),

  getSys: promisify(function () {
    var info = os.userInfo();
    return {
      user: info.username,
      home: os.homedir(),
      hostname: os.hostname(),
      platform: process.platform,
      os: os.type() + ' ' + os.release(),
      arch: process.arch,
      tmpdir: os.tmpdir(),
      cwd: process.cwd(),
      appVersion: readUToolsVersion(),
      pluginVersion: readPluginVersion()
    };
  }),

  getRuntime: promisify(function () {
    return {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron
    };
  }),

  readFile: promisify(function (file) {
    return fs.readFileSync(file, 'utf8');
  }),

  writeFile: promisify(function (file, text) {
    fs.writeFileSync(file, text, 'utf8');
    return file;
  })
};
