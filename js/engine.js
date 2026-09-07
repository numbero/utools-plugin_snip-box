/*
 * Snippet Box · 模板渲染引擎
 * 纯函数、无依赖、无 DOM 访问。设计稿与阶段三插件共用同一份。
 *
 * 环境红线（见 PRD §10.3）：渲染层 Chromium ~91 / preload Node ~14。
 * 禁用 structuredClone、crypto.randomUUID、String.replaceAll、Array.at、??=、ES module。
 * 本文件仅使用 var/function/正则/可选链，可在浏览器与纯 Node 下直接运行。
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- *
   * 定界符预设
   * ---------------------------------------------------------------- */
  var DELIMITERS = {
    mustache: { open: '{{', close: '}}', label: '{{ }}' },
    dollar: { open: '${', close: '}', label: '${ }' },
    bracket: { open: '[[', close: ']]', label: '[ ]' }
  };

  /* ---------------------------------------------------------------- *
   * 占位符分类 —— 决定预览里的着色
   * ---------------------------------------------------------------- */
  var CATEGORY = {
    clipboard: 'clipboard',
    time: 'time',
    random: 'random',
    system: 'system',
    variable: 'variable'
  };

  /* ---------------------------------------------------------------- *
   * 随机源：优先 crypto.getRandomValues，退化到 Math.random
   * （crypto.randomUUID 在 Chromium 91 不可用，故手写 v4）
   * ---------------------------------------------------------------- */
  function randomBytes(n) {
    var out = new Array(n);
    var c = global.crypto || global.msCrypto;
    if (c && typeof c.getRandomValues === 'function') {
      var buf = new Uint8Array(n);
      c.getRandomValues(buf);
      for (var i = 0; i < n; i++) out[i] = buf[i];
      return out;
    }
    for (var j = 0; j < n; j++) out[j] = Math.floor(Math.random() * 256);
    return out;
  }

  function uuid4(upper) {
    var b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var hex = [];
    for (var i = 0; i < 16; i++) hex.push((b[i] + 0x100).toString(16).slice(1));
    var s = hex.join('');
    var v = s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) +
            '-' + s.slice(16, 20) + '-' + s.slice(20);
    return upper ? v.toUpperCase() : v;
  }

  var NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

  function nanoid(len) {
    var b = randomBytes(len);
    var s = '';
    for (var i = 0; i < len; i++) s += NANOID_ALPHABET[b[i] & 63];
    return s;
  }

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /* ---------------------------------------------------------------- *
   * 日期：格式化 + 偏移
   * ---------------------------------------------------------------- */
  var WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var WEEKDAY_CN_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n, len) {
    var s = String(n);
    while (s.length < (len || 2)) s = '0' + s;
    return s;
  }

  // 顺序很重要：长 token 必须排在短 token 前面
  var FORMAT_RE = /YYYY|YY|dddd|ddd|DD|D|MM|M|HH|hh|mm|ss|SSS|A|a|X|x|\[([^\]]*)\]/g;

  function formatDate(d, fmt) {
    var h24 = d.getHours();
    var h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    var ms = d.getMilliseconds();
    return fmt.replace(FORMAT_RE, function (token, escaped) {
      if (escaped !== undefined) return escaped;
      switch (token) {
        case 'YYYY': return String(d.getFullYear());
        case 'YY': return pad(d.getFullYear() % 100);
        case 'dddd': return WEEKDAY_CN[d.getDay()];
        case 'ddd': return WEEKDAY_CN_SHORT[d.getDay()];
        case 'DD': return pad(d.getDate());
        case 'D': return String(d.getDate());
        case 'MM': return pad(d.getMonth() + 1);
        case 'M': return String(d.getMonth() + 1);
        case 'HH': return pad(h24);
        case 'hh': return pad(h12);
        case 'mm': return pad(d.getMinutes());
        case 'ss': return pad(d.getSeconds());
        case 'SSS': return pad(ms, 3);
        case 'A': return h24 < 12 ? 'AM' : 'PM';
        case 'a': return h24 < 12 ? 'am' : 'pm';
        case 'X': return String(Math.floor(d.getTime() / 1000));
        case 'x': return String(d.getTime());
        default: return token;
      }
    });
  }

  var OFFSET_RE = /^([+-])(\d+)([yMwdhms])$/;
  var SPECIAL_RE = /^@(startOfDay|endOfDay|startOfWeek|endOfWeek|startOfMonth|endOfMonth)$/;

  function applyOffset(base, spec) {
    var d = new Date(base.getTime());
    var sp = SPECIAL_RE.exec(spec);
    if (sp) {
      switch (sp[1]) {
        case 'startOfDay': d.setHours(0, 0, 0, 0); break;
        case 'endOfDay': d.setHours(23, 59, 59, 999); break;
        case 'startOfWeek':
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - d.getDay());
          break;
        case 'endOfWeek':
          d.setHours(23, 59, 59, 999);
          d.setDate(d.getDate() + (6 - d.getDay()));
          break;
        case 'startOfMonth': d.setDate(1); d.setHours(0, 0, 0, 0); break;
        case 'endOfMonth':
          d.setMonth(d.getMonth() + 1, 1);
          d.setDate(0);
          d.setHours(23, 59, 59, 999);
          break;
      }
      return d;
    }
    var m = OFFSET_RE.exec(spec);
    if (!m) return null;
    var sign = m[1] === '-' ? -1 : 1;
    var n = parseInt(m[2], 10) * sign;
    switch (m[3]) {
      case 'y': d.setFullYear(d.getFullYear() + n); break;
      case 'M': d.setMonth(d.getMonth() + n); break;
      case 'w': d.setDate(d.getDate() + n * 7); break;
      case 'd': d.setDate(d.getDate() + n); break;
      case 'h': d.setHours(d.getHours() + n); break;
      case 'm': d.setMinutes(d.getMinutes() + n); break;
      case 's': d.setSeconds(d.getSeconds() + n); break;
    }
    return d;
  }

  function isOffsetSpec(s) {
    return s.charAt(0) === '+' || s.charAt(0) === '-' || s.charAt(0) === '@';
  }

  var DEFAULT_FORMAT = {
    date: 'YYYY-MM-DD',
    time: 'HH:mm:ss',
    datetime: 'YYYY-MM-DD HH:mm:ss',
    today: 'YYYY-MM-DD',
    yesterday: 'YYYY-MM-DD',
    tomorrow: 'YYYY-MM-DD',
    now: 'YYYY-MM-DD HH:mm:ss'
  };

  var TIME_ALIASES = {
    today: 'date',
    yesterday: 'date',
    tomorrow: 'date',
    now: 'datetime'
  };

  /* ---------------------------------------------------------------- *
   * 占位符求值
   * 返回 { value, state, note } —— state: ok | missing | invalid | variable
   * ---------------------------------------------------------------- */
  function resolveDate(name, params, now) {
    var baseName = TIME_ALIASES[name] || name;
    var base = new Date(now.getTime());

    if (name === 'yesterday') base = applyOffset(base, '-1d');
    if (name === 'tomorrow') base = applyOffset(base, '+1d');

    if (name === 'timestamp') return { value: String(Math.floor(base.getTime() / 1000)), state: 'ok' };
    if (name === 'timestamp_ms') return { value: String(base.getTime()), state: 'ok' };
    if (name === 'iso') return { value: base.toISOString(), state: 'ok' };

    var offsetSpec = null;
    var fmt = DEFAULT_FORMAT[baseName] || 'YYYY-MM-DD';

    if (params.length >= 1 && params[0] !== '') {
      if (isOffsetSpec(params[0])) {
        offsetSpec = params[0];
        if (params.length >= 2) fmt = params[1];
      } else {
        fmt = params[0];
        // 允许 {{date:YYYY-MM-DD:-1d}} 这种把偏移写在第二段的写法
        if (params.length >= 2 && isOffsetSpec(params[1])) offsetSpec = params[1];
      }
    }

    if (offsetSpec) {
      var shifted = applyOffset(base, offsetSpec);
      if (!shifted) {
        return { value: null, state: 'invalid', note: '偏移量无法解析：' + offsetSpec + '（示例 -1d / +2h / @startOfMonth）' };
      }
      base = shifted;
    }

    var single = { year: 'YYYY', month: 'MM', day: 'DD', hour: 'HH', minute: 'mm', second: 'ss' };
    if (single[baseName]) fmt = single[baseName];

    if (baseName === 'weekday') {
      var mode = (params[0] || '').toLowerCase();
      var idx = base.getDay();
      if (mode === 'short') return { value: WEEKDAY_CN_SHORT[idx], state: 'ok' };
      if (mode === 'en') return { value: WEEKDAY_EN[idx], state: 'ok' };
      if (mode === 'num') return { value: String(idx), state: 'ok' };
      if (mode === '') return { value: WEEKDAY_CN[idx], state: 'ok' };
      return { value: null, state: 'invalid', note: 'weekday 只接受 short / en / num' };
    }

    var out = formatDate(base, fmt);
    // 格式串里有 ASCII 字母却一个记号都没命中 —— 大概率是拼写错误（如 zzz、YYY）
    if (/[A-Za-z]/.test(fmt) && out === fmt) {
      return {
        value: null, state: 'invalid',
        note: '格式串 "' + fmt + '" 里没有可识别的记号（可用：YYYY MM DD HH mm ss ddd SSS A X 等）'
      };
    }
    return { value: out, state: 'ok' };
  }

  function resolveClipboard(params, ctx) {
    var text = ctx.clipboard;
    if (text === null || text === undefined) {
      return { value: '', state: 'missing', note: '剪贴板为空或读取失败' };
    }
    var mode = (params[0] || '').toLowerCase();
    if (mode === '') return { value: text, state: 'ok' };
    if (mode === 'trim') return { value: text.replace(/^\s+|\s+$/g, ''), state: 'ok' };
    if (mode === 'upper') return { value: text.toUpperCase(), state: 'ok' };
    if (mode === 'lower') return { value: text.toLowerCase(), state: 'ok' };
    if (/^\d+$/.test(mode)) return { value: text.slice(0, parseInt(mode, 10)), state: 'ok' };
    // 支持 {{clipboard:line:2}} 与 {{clipboard:line|2}} 两种写法
    var lineNo = null;
    if (mode.indexOf('line:') === 0) lineNo = parseInt(mode.slice(5), 10);
    else if (mode === 'line') lineNo = parseInt(params[1], 10);
    if (lineNo !== null) {
      if (!lineNo || lineNo < 1) return { value: null, state: 'invalid', note: 'line 需要一个从 1 开始的行号' };
      var lines = text.split('\n');
      return { value: lineNo > lines.length ? '' : lines[lineNo - 1], state: 'ok' };
    }
    return { value: null, state: 'invalid', note: 'clipboard 只接受 trim / upper / lower / 数字 / line:n' };
  }

  function resolveSystem(name, params, ctx) {
    var sys = ctx.sys || {};
    var v;
    switch (name) {
      case 'user': v = sys.user; break;
      case 'home': v = sys.home; break;
      case 'hostname': v = sys.hostname; break;
      case 'platform': v = sys.platform; break;
      case 'os': v = sys.os; break;
      case 'arch': v = sys.arch; break;
      case 'tmpdir': v = sys.tmpdir; break;
      case 'cwd': v = sys.cwd; break;
      case 'appversion': v = sys.appVersion; break;
      case 'pluginversion': v = sys.pluginVersion; break;
      case 'folder': v = ctx.folder; break;
      case 'url':
        if (!ctx.url) return { value: '', state: 'missing', note: '唤起时焦点不在浏览器，无可用 URL' };
        v = (params[0] || '').toLowerCase() === 'title' ? ctx.url.title : ctx.url.url;
        break;
      default: return null;
    }
    if (v === null || v === undefined || v === '') {
      return { value: '', state: 'missing', note: '无可用上下文' };
    }
    return { value: String(v), state: 'ok' };
  }

  function resolveRandom(name, params) {
    if (name === 'uuid') {
      var mode = (params[0] || '').toLowerCase();
      if (mode === '' || mode === 'v4') return { value: uuid4(false), state: 'ok', volatile: true };
      if (mode === 'upper') return { value: uuid4(true), state: 'ok', volatile: true };
      if (mode === 'short') return { value: uuid4(false).replace(/-/g, '').slice(0, 16), state: 'ok', volatile: true };
      return { value: null, state: 'invalid', note: 'uuid 只接受 upper / short' };
    }
    if (name === 'nanoid') {
      var len = params[0] ? parseInt(params[0], 10) : 16;
      if (!len || len < 1 || len > 128) return { value: null, state: 'invalid', note: 'nanoid 长度需在 1-128 之间' };
      return { value: nanoid(len), state: 'ok', volatile: true };
    }
    if (name === 'random') {
      var spec = params[0] || '';
      var sep = spec.indexOf('~') >= 0 ? '~' : '-';
      var parts = spec.split(sep);
      if (parts.length === 2 && parts[0] !== '' && parts[1] !== '') {
        var lo = parseInt(parts[0], 10);
        var hi = parseInt(parts[1], 10);
        if (isNaN(lo) || isNaN(hi)) return { value: null, state: 'invalid', note: 'random 区间需为两个整数' };
        if (lo > hi) { var t = lo; lo = hi; hi = t; }
        return { value: String(randomInt(lo, hi)), state: 'ok', volatile: true };
      }
      if (/^\d+$/.test(spec) && spec !== '') {
        var n = parseInt(spec, 10);
        if (n < 1 || n > 64) return { value: null, state: 'invalid', note: 'random 位数需在 1-64 之间' };
        var digits = '';
        for (var i = 0; i < n; i++) digits += String(Math.floor(Math.random() * 10));
        return { value: digits, state: 'ok', volatile: true };
      }
      return { value: null, state: 'invalid', note: 'random 需要 min-max 或位数，如 1-100 / 6' };
    }
    if (name === 'pick') {
      if (params.length < 2) return { value: null, state: 'invalid', note: 'pick 至少需要两项，用 | 分隔' };
      return { value: params[randomInt(0, params.length - 1)], state: 'ok', volatile: true };
    }
    if (name === 'shuffle') {
      var items = (params[0] || '').split(',');
      if (items.length < 2) return { value: null, state: 'invalid', note: 'shuffle 至少需要两项，用逗号分隔' };
      var arr = items.slice();
      for (var k = arr.length - 1; k > 0; k--) {
        var r = randomInt(0, k);
        var tmp = arr[k]; arr[k] = arr[r]; arr[r] = tmp;
      }
      return { value: arr.join(','), state: 'ok', volatile: true };
    }
    return null;
  }

  var DATE_NAMES = ['date', 'time', 'datetime', 'iso', 'timestamp', 'timestamp_ms',
    'year', 'month', 'day', 'hour', 'minute', 'second', 'weekday',
    'today', 'yesterday', 'tomorrow', 'now'];
  var SYSTEM_NAMES = ['user', 'home', 'hostname', 'platform', 'os', 'arch', 'tmpdir',
    'cwd', 'folder', 'url', 'appversion', 'pluginversion'];
  var RANDOM_NAMES = ['uuid', 'nanoid', 'random', 'pick', 'shuffle'];

  function categoryOf(name) {
    if (name === 'clipboard') return CATEGORY.clipboard;
    if (DATE_NAMES.indexOf(name) >= 0) return CATEGORY.time;
    if (RANDOM_NAMES.indexOf(name) >= 0) return CATEGORY.random;
    if (SYSTEM_NAMES.indexOf(name) >= 0) return CATEGORY.system;
    return null;
  }

  /* ---------------------------------------------------------------- *
   * 解析模板 -> segments
   * ---------------------------------------------------------------- */
  function parse(tpl, options) {
    var opts = options || {};
    var delim = DELIMITERS[opts.delimiter || 'mustache'] || DELIMITERS.mustache;
    var open = delim.open;
    var close = delim.close;
    var ctx = opts.context || {};
    var now = ctx.now instanceof Date ? ctx.now : new Date();
    var filled = ctx.variables || {};

    var segments = [];
    var variables = [];
    var seenVars = {};
    var issues = [];
    var i = 0;
    var buf = '';

    function flush() {
      if (buf !== '') { segments.push({ type: 'text', value: buf }); buf = ''; }
    }

    while (i < tpl.length) {
      // 转义：\{{ -> 字面量 {{
      if (tpl.charAt(i) === '\\' && tpl.substr(i + 1, open.length) === open) {
        buf += open;
        i += 1 + open.length;
        continue;
      }
      if (tpl.substr(i, open.length) === open) {
        var end = tpl.indexOf(close, i + open.length);
        if (end < 0) { buf += tpl.charAt(i); i++; continue; }   // 不成对，当普通文本

        var inner = tpl.substring(i + open.length, end);
        var raw = tpl.substring(i, end + close.length);

        if (inner.indexOf(open) >= 0 || inner.indexOf('\n') >= 0) {
          // 嵌套或跨行：不解析
          buf += raw;
          i = end + close.length;
          continue;
        }

        flush();
        segments.push(evalPlaceholder(inner, raw));
        i = end + close.length;
        continue;
      }
      buf += tpl.charAt(i);
      i++;
    }
    flush();

    function evalPlaceholder(inner, raw) {
      var body = inner.replace(/^\s+|\s+$/g, '');

      // 待填变量 {{?name}} / {{?name=default}}
      if (body.charAt(0) === '?') {
        var vbody = body.slice(1);
        var eq = vbody.indexOf('=');
        var vname = (eq >= 0 ? vbody.slice(0, eq) : vbody).replace(/^\s+|\s+$/g, '');
        var vdefault = eq >= 0 ? vbody.slice(eq + 1) : '';
        if (vname === '' || /[\s={}]/.test(vname)) {
          issues.push({ raw: raw, level: 'invalid', note: '变量名不能为空，且不能含空格或 = { }' });
          return { type: 'ph', raw: raw, name: body, category: CATEGORY.variable, state: 'invalid', note: '变量名非法' };
        }
        if (!seenVars[vname]) {
          seenVars[vname] = true;
          variables.push({ name: vname, defaultValue: vdefault });
        }
        var hasFill = Object.prototype.hasOwnProperty.call(filled, vname);
        return {
          type: 'ph', raw: raw, name: vname, category: CATEGORY.variable,
          state: hasFill ? 'ok' : 'variable',
          value: hasFill ? String(filled[vname]) : null,
          defaultValue: vdefault,
          note: hasFill ? null : '输出时弹框询问'
        };
      }

      var colon = body.indexOf(':');
      var name = (colon >= 0 ? body.slice(0, colon) : body).replace(/^\s+|\s+$/g, '').toLowerCase();
      var paramStr = colon >= 0 ? body.slice(colon + 1) : '';
      var params = paramStr === '' ? [] : paramStr.split('|').map(function (p) {
        return p.replace(/^\s+|\s+$/g, '');
      });

      var cat = categoryOf(name);
      if (!cat) {
        issues.push({ raw: raw, level: 'unknown', note: '未知占位符' });
        return { type: 'ph', raw: raw, name: name, category: null, state: 'unknown', note: '未知占位符' };
      }

      var r = null;
      try {
        if (cat === CATEGORY.clipboard) r = resolveClipboard(params, ctx);
        else if (cat === CATEGORY.time) r = resolveDate(name, params, now);
        else if (cat === CATEGORY.random) r = resolveRandom(name, params);
        else if (cat === CATEGORY.system) r = resolveSystem(name, params, ctx);
      } catch (e) {
        r = { value: null, state: 'invalid', note: '渲染异常：' + (e && e.message ? e.message : e) };
      }

      if (!r) {
        issues.push({ raw: raw, level: 'unknown', note: '未知占位符' });
        return { type: 'ph', raw: raw, name: name, category: cat, state: 'unknown', note: '未知占位符' };
      }
      if (r.state === 'invalid') issues.push({ raw: raw, level: 'invalid', note: r.note });
      if (r.state === 'missing') issues.push({ raw: raw, level: 'missing', note: r.note });

      return {
        type: 'ph', raw: raw, name: name, params: params, category: cat,
        state: r.state, value: r.value, note: r.note, volatile: !!r.volatile
      };
    }

    return { segments: segments, variables: variables, issues: issues };
  }

  /* ---------------------------------------------------------------- *
   * 渲染 -> { text, html, variables, issues }
   * text 用于实际输出（纯文本），html 用于预览着色
   * ---------------------------------------------------------------- */
  var CATEGORY_LABEL = {
    clipboard: '剪贴板', time: '时间', random: '随机', system: '系统', variable: '待填变量'
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 单个占位符的着色 HTML。valueOverride 用于按行截断时只输出片段的一部分。
  function tokenSpan(seg, valueOverride) {
    if (seg.state === 'ok') {
      var val = valueOverride !== undefined ? valueOverride : String(seg.value);
      var cls = 'tok tok--' + seg.category;
      if (seg.volatile) cls += ' tok--volatile';
      var tip = seg.raw + (seg.volatile ? ' · 每次输出都不同' : '');
      return '<span class="' + cls + '" title="' + escapeHtml(tip) + '">' + escapeHtml(val) + '</span>';
    }
    if (seg.state === 'variable') {
      return '<span class="tok tok--variable tok--pending" title="输出时弹框询问">' + escapeHtml(seg.raw) + '</span>';
    }
    return '<span class="tok tok--' + seg.state + '" title="' + escapeHtml(seg.note || '') + '">' +
           escapeHtml(seg.raw) + '</span>';
  }

  function segText(seg) {
    if (seg.type === 'text') return seg.value;
    return seg.state === 'ok' ? String(seg.value) : seg.raw;
  }

  function render(tpl, options) {
    var opts = options || {};
    var limit = opts.maxLines || 0;
    var parsed;
    try {
      parsed = parse(tpl, options);
    } catch (e) {
      return { text: String(tpl), html: escapeHtml(tpl), variables: [], issues: [], fatal: true, truncated: false };
    }

    var text = '';
    var html = '';
    var line = 1;
    var truncated = false;

    for (var i = 0; i < parsed.segments.length; i++) {
      var seg = parsed.segments[i];
      var txt = segText(seg);

      // 按行截断只影响 text/html；variables 与 issues 始终覆盖整个模板
      if (limit > 0) {
        var nl = txt.indexOf('\n');
        if (nl >= 0) {
          if (line >= limit) {
            var cut = txt.slice(0, nl);
            if (cut !== '') {
              text += cut;
              html += seg.type === 'text' ? escapeHtml(cut) : tokenSpan(seg, cut);
            }
            truncated = true;
            break;
          }
          line += txt.split('\n').length - 1;
          text += txt;
          html += seg.type === 'text' ? escapeHtml(txt) : tokenSpan(seg);
          if (line >= limit) { truncated = true; break; }
          continue;
        }
      }

      text += txt;
      html += seg.type === 'text' ? escapeHtml(txt) : tokenSpan(seg);
    }

    return {
      text: text,
      html: html,
      variables: parsed.variables,
      issues: parsed.issues,
      fatal: false,
      truncated: truncated
    };
  }

  /* 列表项紧凑预览：只取渲染输出的前 n 行，按 segment 边界截断，不会产生半截 HTML 标签 */
  function renderLine(tpl, options, maxLines) {
    var o = {};
    var src = options || {};
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k];
    o.maxLines = maxLines || 1;
    return render(tpl, o).html;
  }

  /* ---------------------------------------------------------------- *
   * 占位符速查目录 —— 供编辑器「可用占位符」面板使用
   * ---------------------------------------------------------------- */
  var CATALOG = [
    {
      group: '剪贴板', category: CATEGORY.clipboard,
      items: [
        { syntax: '{{clipboard}}', desc: '当前剪贴板文本（进入插件时快照）' },
        { syntax: '{{clipboard:20}}', desc: '前 20 个字符' },
        { syntax: '{{clipboard:line:2}}', desc: '第 2 行' },
        { syntax: '{{clipboard:trim}}', desc: '去首尾空白' },
        { syntax: '{{clipboard:upper}}', desc: '转大写（另有 lower）' }
      ]
    },
    {
      group: '日期时间', category: CATEGORY.time,
      items: [
        { syntax: '{{date}}', desc: '2026-09-06' },
        { syntax: '{{time}}', desc: '22:15:03' },
        { syntax: '{{datetime}}', desc: '2026-09-06 22:15:03' },
        { syntax: '{{iso}}', desc: 'ISO 8601 完整时间' },
        { syntax: '{{timestamp}}', desc: 'Unix 秒（另有 timestamp_ms）' },
        { syntax: '{{weekday}}', desc: '星期日（另有 short / en / num）' },
        { syntax: '{{date:YYYY年MM月DD日}}', desc: '自定义格式' },
        { syntax: '{{date:-1d}}', desc: '昨天（单位 y M w d h m s）' },
        { syntax: '{{date:-1d|YYYY/MM/DD}}', desc: '偏移 + 自定义格式' },
        { syntax: '{{date:@startOfWeek}}', desc: '本周起始日' },
        { syntax: '{{yesterday}}', desc: '等价于 {{date:-1d}}' },
        { syntax: '{{tomorrow}}', desc: '等价于 {{date:+1d}}' }
      ]
    },
    {
      group: '随机与唯一值', category: CATEGORY.random,
      items: [
        { syntax: '{{uuid}}', desc: 'RFC4122 v4（另有 upper / short）' },
        { syntax: '{{nanoid}}', desc: '16 位随机 ID（可指定长度）' },
        { syntax: '{{random:1-100}}', desc: '区间随机整数' },
        { syntax: '{{random:6}}', desc: '6 位随机数字串' },
        { syntax: '{{pick:红|绿|蓝}}', desc: '随机取一项' },
        { syntax: '{{shuffle:a,b,c}}', desc: '打乱顺序' }
      ]
    },
    {
      group: '系统上下文', category: CATEGORY.system,
      items: [
        { syntax: '{{user}}', desc: '系统用户名' },
        { syntax: '{{home}}', desc: '用户主目录' },
        { syntax: '{{hostname}}', desc: '主机名' },
        { syntax: '{{platform}}', desc: 'macOS（原始值用 {{os}}）' },
        { syntax: '{{arch}}', desc: 'arm64' },
        { syntax: '{{folder}}', desc: '唤起时的访达目录' },
        { syntax: '{{url}}', desc: '唤起时的浏览器标签页 URL' },
        { syntax: '{{url:title}}', desc: '标签页标题' },
        { syntax: '{{appVersion}}', desc: 'uTools 版本' }
      ]
    },
    {
      group: '待填变量', category: CATEGORY.variable,
      items: [
        { syntax: '{{?姓名}}', desc: '输出时弹框询问' },
        { syntax: '{{?工单号=T-}}', desc: '带默认值 / 前缀' }
      ]
    }
  ];

  global.SnippetEngine = {
    DELIMITERS: DELIMITERS,
    CATEGORY: CATEGORY,
    CATEGORY_LABEL: CATEGORY_LABEL,
    CATALOG: CATALOG,
    parse: parse,
    render: render,
    renderLine: renderLine,
    escapeHtml: escapeHtml,
    // 导出内部工具便于阶段三冒烟验证
    _internals: { formatDate: formatDate, applyOffset: applyOffset, uuid4: uuid4, nanoid: nanoid }
  };
})(typeof window !== 'undefined' ? window : globalThis);
