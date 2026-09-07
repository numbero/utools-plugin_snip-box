'use strict';
/* Snippet Box · 界面层：渲染与交互绑定（动作经 window.SB.* 回调交给 app.js） */
window.SBUI = (function () {
  var E = window.SnippetEngine;
  var esc = E.escapeHtml;

  function el(id) { return document.getElementById(id); }

  var ICO = {
    copy: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5v-1a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    pin: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M9.5 1.5l5 5-2 .7-3.2 3.2-.5 3.6-2.3-2.3L3 15l-.5-.5 3.3-3.5-2.3-2.3 3.6-.5L10.3 5l-.8-3.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    edit: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.2 2.3l2.5 2.5L5.5 13H3v-2.5l8.2-8.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    bolt: '<svg width="9" height="10" viewBox="0 0 10 12" fill="none"><path d="M6 1L2 7h3l-1 4 4-6H5l1-4z" fill="currentColor"/></svg>',
    clip: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 3.5V3a1.5 1.5 0 013 0v.5" stroke="currentColor" stroke-width="1.4"/></svg>',
    link: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5l3-3M7 4.5l1.7-1.7a2.6 2.6 0 013.7 3.7L10.7 8.2M9.3 11.5l-1.7 1.7a2.6 2.6 0 01-3.7-3.7L5.6 7.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    refresh: '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 1.5v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    all: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    recent: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.2l2.2 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    ungrouped: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2.5"/></svg>',
    warn: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2l6.5 11.5h-13L8 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.6v.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  var GROUP_COLORS = ['#8290F5', '#5CC98C', '#E3AC4A', '#7FB2F5', '#C79BF7', '#62CCD8', '#F5837C'];

  function groupColor(gid, groups) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === gid) return GROUP_COLORS[i % GROUP_COLORS.length];
    return '#7A7A84';
  }
  function groupName(gid, groups) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === gid) return groups[i].name;
    return '未分组';
  }

  /* ---------- 搜索与排序 ---------- */
  function relevance(s, q) {
    if (!q) return 0;
    var ql = q.toLowerCase();
    if (s.name.toLowerCase().indexOf(ql) >= 0) return 3;
    if ((s.searchKey + ' ' + s.keyword).toLowerCase().indexOf(ql) >= 0) return 2;
    if (s.content.toLowerCase().indexOf(ql) >= 0) return 1;
    return 0;
  }

  function smartScore(s) {
    var rec = 0;
    if (s.lastUsedAt) {
      var days = Math.floor((Date.now() - new Date(s.lastUsedAt).getTime()) / 86400000);
      rec = Math.max(0, 1000000 - days * 1000);
    }
    return (s.pinned ? 1e12 : 0) + (s.useCount || 0) * 1e6 + rec;
  }

  function searchSort(state) {
    var q = (state.query || '').trim();
    var f = state.filter;
    var items = state.snippets.filter(function (s) {
      if (f.type === 'pinned') return s.pinned;
      if (f.type === 'recent') return s.lastUsedAt && (Date.now() - new Date(s.lastUsedAt).getTime()) < 30 * 86400000;
      if (f.type === 'group') return s.group === f.id;
      if (f.type === 'ungrouped') return !s.group;
      return true;
    });
    if (q) {
      items = items.filter(function (s) { return relevance(s, q) > 0; });
      items.sort(function (a, b) {
        var d = relevance(b, q) - relevance(a, q);
        return d !== 0 ? d : smartScore(b) - smartScore(a);
      });
    } else {
      items.sort(function (a, b) { return smartScore(b) - smartScore(a); });
    }
    return items;
  }

  function markHit(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return safe;
    return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
  }

  function renderOpts(state, maxLines) {
    return { context: state.ctx, delimiter: state.settings.delimiter, maxLines: maxLines || 0 };
  }

  function previewHtml(r, state) {
    return state.settings.colorTokens ? r.html : esc(r.text);
  }

  /* ---------- 侧栏 ---------- */
  function renderSidebar(state) {
    var counts = { all: state.snippets.length, pinned: 0, recent: 0, ungrouped: 0 };
    var perGroup = {};
    state.snippets.forEach(function (s) {
      if (s.pinned) counts.pinned++;
      if (s.lastUsedAt && (Date.now() - new Date(s.lastUsedAt).getTime()) < 30 * 86400000) counts.recent++;
      if (!s.group) counts.ungrouped++;
      perGroup[s.group] = (perGroup[s.group] || 0) + 1;
    });
    var f = state.filter;
    function item(type, id, ico, name, count) {
      var cur = f.type === type && (f.id || '') === (id || '');
      return '<button class="side-item" data-filter="' + type + '" data-id="' + esc(id || '') + '" aria-current="' + cur + '">' +
        '<span class="ico">' + ico + '</span><span class="nm">' + esc(name) + '</span><span class="ct">' + count + '</span></button>';
    }
    var html = '';
    html += item('all', '', ICO.all, '全部', counts.all);
    html += item('pinned', '', ICO.pin, '置顶', counts.pinned);
    html += item('recent', '', ICO.recent, '最近使用', counts.recent);
    html += '<div class="side-sep"></div><div class="side-sec">分组</div>';
    state.groups.forEach(function (g) {
      var cur = f.type === 'group' && f.id === g.id;
      html += '<button class="side-item" data-filter="group" data-id="' + esc(g.id) + '" aria-current="' + cur + '">' +
        '<span class="side-dot" style="background:' + groupColor(g.id, state.groups) + '"></span>' +
        '<span class="nm">' + esc(g.name) + '</span><span class="ct">' + (perGroup[g.id] || 0) + '</span></button>';
    });
    html += item('ungrouped', '', ICO.ungrouped, '未分组', counts.ungrouped);
    html += '<button class="side-item side-add" data-filter="__addgroup">+ 新建分组</button>';
    el('sidebar').innerHTML = html;
  }

  /* ---------- 列表 ---------- */
  function issuePills(r) {
    var n = { unknown: 0, invalid: 0, missing: 0 };
    r.issues.forEach(function (i) { n[i.level] = (n[i.level] || 0) + 1; });
    var html = '';
    if (n.unknown) html += '<span class="pill pill--warn" title="未知占位符将原样输出">未知 ×' + n.unknown + '</span>';
    if (n.invalid) html += '<span class="pill pill--warn" title="参数非法，将原样输出">非法 ×' + n.invalid + '</span>';
    if (n.missing) html += '<span class="pill pill--grp" title="上下文缺失，输出为空">缺失 ×' + n.missing + '</span>';
    if (r.variables.length) html += '<span class="pill pill--var">' + r.variables.length + ' 个待填变量</span>';
    if (!html) html = '<span class="issue issue--ok">占位符全部可解析</span>';
    return html;
  }

  function renderList(state) {
    var items = searchSort(state);
    var activeOk = false;
    for (var j = 0; j < items.length; j++) if (items[j].id === state.activeId) activeOk = true;
    if (!activeOk) state.activeId = (items[0] || {}).id || null;
    var q = (state.query || '').trim();
    var opts = renderOpts(state);
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      var active = s.id === state.activeId;
      opts.maxLines = active ? 0 : (state.settings.showPreviewInList ? 1 : 0);
      var r = E.render(s.content, opts);
      var hasIssue = r.issues.some(function (x) { return x.level === 'unknown' || x.level === 'invalid'; });

      html += '<div class="list-item" role="option" data-id="' + s.id + '" aria-selected="' + active + '">';
      html += '<div class="li-top">';
      html += '<span class="li-name">' + markHit(s.name, q) + '</span>';
      html += '<span class="li-badges">';
      if (s.pinned) html += '<span class="pill pill--pin">' + ICO.pin + '置顶</span>';
      if (s.direct && s.keyword) html += '<span class="pill pill--key">' + ICO.bolt + esc(s.keyword) + '</span>';
      else if (s.searchKey) html += '<span class="pill pill--grp">' + esc(s.searchKey.split(/\s+/)[0]) + '</span>';
      if (r.variables.length) html += '<span class="pill pill--var" title="' + r.variables.length + ' 个待填变量">? ×' + r.variables.length + '</span>';
      if (hasIssue) html += '<span class="pill pill--warn" title="含未知或非法占位符">!</span>';
      html += '</span></div>';

      if (state.settings.showPreviewInList && !active) {
        html += '<div class="li-preview">' + previewHtml(r, state) + '</div>';
      }

      html += '<div class="li-meta">';
      if (s.group) html += '<span><span class="side-dot" style="display:inline-block;background:' + groupColor(s.group, state.groups) + ';vertical-align:0"></span> ' + esc(groupName(s.group, state.groups)) + '</span>';
      if (s.useCount) html += '<span>×' + s.useCount + (s.lastUsedAt ? ' · ' + esc(s.lastUsedAt.slice(5, 16).replace('T', ' ')) : '') + '</span>';
      html += '</div>';

      html += '<span class="li-actions">' +
        '<button class="icon-btn" data-act="copy" title="仅复制">' + ICO.copy + '</button>' +
        '<button class="icon-btn' + (s.pinned ? ' on' : '') + '" data-act="pin" title="' + (s.pinned ? '取消置顶' : '置顶') + '">' + ICO.pin + '</button>' +
        '<button class="icon-btn" data-act="edit" title="编辑 ⌘E">' + ICO.edit + '</button>' +
        '</span>';

      if (active) {
        html += '<div class="render-block">' +
          '<div class="render-label"><span class="live"></span>渲染结果 · 实时</div>' +
          '<div class="render-out">' + previewHtml(r, state) + '</div>' +
          '<div class="render-foot">' + issuePills(r) +
          '<span class="render-hint">' + r.text.length + ' 字符' +
          (r.variables.length ? ' · 回车先弹填值表单' : ' · 回车直接输出') +
          '</span></div></div>';
      }
      html += '</div>';
    }
    if (!items.length) {
      html = '<div class="empty" style="padding:var(--sp-6)"><p class="empty-desc">' +
        (q ? '没有匹配「' + esc(q) + '」的片段' : '这个视图下还没有片段') + '</p></div>';
    }
    el('list').innerHTML = html;
  }

  /* ---------- 状态栏 ---------- */
  function renderCtxStat(state) {
    var t = el('ctxStat');
    var ctx = state.ctx || {};
    var clip = ctx.clipboard ? ctx.clipboard.replace(/\n/g, ' ') : '';
    if (clip.length > 18) clip = clip.slice(0, 18) + '…';
    var bits = [];
    bits.push('<span title="剪贴板快照">' + ICO.clip + ' <b>' + (clip ? esc(clip) : '空') + '</b></span>');
    if (ctx.url && ctx.url.url) {
      var u = ctx.url.url.length > 22 ? ctx.url.url.slice(0, 22) + '…' : ctx.url.url;
      bits.push('<span title="' + esc(ctx.url.url) + '">' + ICO.link + ' <b>' + esc(u) + '</b></span>');
    } else {
      bits.push('<span style="opacity:.55" title="唤起时焦点不在浏览器">' + ICO.link + ' <b>无</b></span>');
    }
    bits.push('<button class="btn btn--sm btn--ghost" id="ctxRefresh" style="height:18px;padding:0 5px">' + ICO.refresh + ' 刷新快照</button>');
    t.innerHTML = bits.join('<span style="opacity:.3">·</span>');
  }

  /* ---------- 空状态 ---------- */
  function renderEmptyDemo(state) {
    var tpl = '{{date:MM月DD日}} {{time}} · {{user}} 提交了 {{random:100-999}} 行改动';
    var r = E.render(tpl, renderOpts(state));
    el('emptyDemo').innerHTML =
      '<div style="color:var(--text-3)">模板&nbsp;&nbsp;' + esc(tpl) + '</div>' +
      '<div style="margin-top:4px">结果&nbsp;&nbsp;' + (state.settings.colorTokens ? r.html : esc(r.text)) + '</div>';
  }

  /* ---------- 视图切换 ---------- */
  function showView(name) {
    el('viewList').hidden = name !== 'list';
    el('viewEditor').hidden = name !== 'editor';
    el('viewSettings').hidden = name !== 'settings';
  }

  /* ---------- 编辑器 ---------- */
  function fillGroupSelect(state, current) {
    var html = '<option value="">未分组</option>';
    state.groups.forEach(function (g) {
      html += '<option value="' + esc(g.id) + '"' + (g.id === current ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    });
    el('edGroup').innerHTML = html;
  }

  function syncEditorFields(state) {
    var d = state.editing;
    el('edTitle').textContent = d.id ? '编辑片段' : '新建片段';
    el('edName').value = d.name || '';
    fillGroupSelect(state, d.group || '');
    el('edSearchKey').value = d.searchKey || '';
    el('edDirectKey').value = d.keyword || '';
    el('edDirectKey').disabled = !d.direct;
    el('edPinned').setAttribute('aria-checked', String(!!d.pinned));
    el('edDirect').setAttribute('aria-checked', String(!!d.direct));
    el('edTpl').value = d.content || '';
    renderEditorPreview(state);
  }

  function renderLineNumbers() {
    var lines = el('edTpl').value.split('\n').length;
    var html = '';
    for (var i = 1; i <= lines; i++) html += '<span>' + i + '</span>';
    el('edLines').innerHTML = html;
  }

  function renderEditorPreview(state) {
    var tpl = el('edTpl').value;
    renderLineNumbers();
    var r = E.render(tpl, renderOpts(state));
    var pv = el('edPreview');
    if (!tpl) {
      pv.innerHTML = '<span class="preview-empty">写下模板，占位符会在这里实时渲染…</span>';
    } else {
      pv.innerHTML = previewHtml(r, state);
    }
    var bar = el('edIssues');
    var parts = [];
    r.issues.forEach(function (i) {
      parts.push('<span class="issue issue--' + i.level + '" title="' + esc(i.raw) + '">' + ICO.warn + ' ' +
        (i.level === 'unknown' ? '未知占位符' : i.level === 'invalid' ? '参数非法' : '上下文缺失') + '：' + esc(i.note) + '</span>');
    });
    if (r.variables.length) parts.push('<span class="issue issue--var">' + r.variables.length + ' 个待填变量</span>');
    if (!parts.length) parts.push('<span class="issue issue--ok">✓ 占位符全部可解析</span>');
    bar.innerHTML = parts.join('');
    el('edDegrade').hidden = !r.variables.length;
    return r;
  }

  function renderPop() {
    var html = '';
    E.CATALOG.forEach(function (g) {
      html += '<div class="pop-group">' + esc(g.group) + '</div>';
      g.items.forEach(function (item) {
        html += '<button class="pop-item" data-insert="' + esc(item.syntax) + '"><code>' + esc(item.syntax) + '</code><small>' + esc(item.desc) + '</small></button>';
      });
    });
    el('edPop').innerHTML = html;
  }

  /* ---------- 变量弹框 ---------- */
  function renderVarFields(state) {
    var m = state.modal;
    var html = '';
    m.fields.forEach(function (f, i) {
      var val = m.values[f.name] || '';
      html += '<div class="var-field"><label for="varinp-' + i + '" title="' + esc(f.name) + '">' + esc(f.name) + '</label>' +
        '<input class="input input--mono' + (val ? '' : ' is-empty') + '" id="varinp-' + i + '" name="var-' + esc(f.name) + '" data-var="' + esc(f.name) + '" value="' + esc(val) + '" placeholder="' + esc(f.defaultValue || '未填则输出空') + '"' + (i === 0 ? ' autofocus' : '') + '></div>';
    });
    el('varFields').innerHTML = html;
    el('varTitle').textContent = m.snippet.name;
    el('varSub').textContent = '这个片段有 ' + m.fields.length + ' 个待填变量 · 填完按 ⌥↵ 复制 / ↵ 粘贴';
  }

  function renderVarPreview(state) {
    var m = state.modal;
    var ctx = {
      now: state.ctx.now, clipboard: state.ctx.clipboard, folder: state.ctx.folder,
      url: state.ctx.url, sys: state.ctx.sys,
      variables: m.values
    };
    var r = E.render(m.snippet.content, { context: ctx, delimiter: state.settings.delimiter });
    el('varPreview').innerHTML = state.settings.colorTokens ? r.html : esc(r.text);
    var missing = m.fields.filter(function (f) { return !m.values[f.name]; }).length;
    el('varMissing').textContent = missing ? missing + ' 项未填 · 将输出为空' : '';
    return r;
  }

  /* ---------- 设置 ---------- */
  function segHtml(key, value, options) {
    var html = '<div class="seg" data-seg="' + key + '">';
    options.forEach(function (o) {
      html += '<button data-val="' + o[0] + '" aria-pressed="' + (value === o[0]) + '">' + o[1] + '</button>';
    });
    return html + '</div>';
  }
  function switchHtml(key, on) {
    return '<button class="switch" role="switch" aria-checked="' + !!on + '" data-switch="' + key + '"></button>';
  }
  function selectHtml(key, value, options) {
    var html = '<select class="select" name="' + key + '" data-select="' + key + '">';
    options.forEach(function (o) {
      html += '<option value="' + o[0] + '"' + (value === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    return html + '</select>';
  }
  function row(name, desc, ctl) {
    return '<div class="set-row"><div class="set-main"><div class="set-name">' + name + '</div><div class="set-desc">' + desc + '</div></div><div class="set-ctl">' + ctl + '</div></div>';
  }

  function renderSettings(state, about) {
    var s = state.settings;
    var html = '';
    html += '<div class="set-sec"><h3 class="set-sec-title">输出</h3>';
    html += row('默认输出方式', '回车时是把内容粘进上一个应用，还是只复制到剪贴板',
      selectHtml('output', s.output, [['paste', '自动粘贴到上一个应用'], ['copy', '仅复制到剪贴板']]));
    html += row('粘贴模式', '合成粘贴走 <code>hideMainWindowPasteText</code>；虚拟机窗口、安全输入框拒绝合成粘贴时改逐字输入 <code>hideMainWindowTypeString</code>',
      selectHtml('pasteMode', s.pasteMode, [['pasteText', '剪贴板粘贴 · pasteText'], ['typeString', '逐字输入 · typeString']]));
    html += row('修饰键临时反向', '<span class="kbd">⌥</span><span class="kbd">↵</span> 执行与上面相反的动作', switchHtml('invertModifier', s.invertModifier));
    html += row('直达关键字统一前缀', '避免片段关键字污染 uTools 全局指令空间，如设为 <code>;</code> 则 <code>sign</code> 注册为 <code>;sign</code>',
      '<input class="input input--mono" style="width:74px" placeholder="关闭" name="directPrefix" value="' + esc(s.directPrefix) + '" data-input="directPrefix">');
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">外观</h3>';
    html += row('主题', '跟随系统时会在 macOS 切换深浅色的瞬间同步',
      segHtml('theme', s.theme, [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']]));
    html += row('界面风格', '荧光墨是近黑底 + 琥珀荧光的全等宽终端美学；切换即时生效，浅/深各自适配',
      segHtml('style', s.style, [['native', '靛蓝原生'], ['cyberink', '荧光墨']]));
    html += row('列表项显示渲染预览', '关闭后列表更紧凑，但看不到占位符的实际输出', switchHtml('showPreviewInList', s.showPreviewInList));
    html += row('预览中给占位符着色', '按来源分类上色，仅影响预览，不影响输出内容', switchHtml('colorTokens', s.colorTokens));
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">语法</h3>';
    html += row('占位符定界符', '只影响解析不影响存储，随时可切、可随时切回，片段内容不会被改写',
      selectHtml('delimiter', s.delimiter, [['mustache', '{{ 双花括号 }}'], ['dollar', '${ 美元括号 }'], ['bracket', '[[ 双方括号 ]]']]));
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">数据</h3>';
    html += '<div class="callout callout--warn" style="margin-bottom:var(--sp-3)">' + ICO.warn +
      '<span>片段存于 uTools 数据库，<b>可能随 uTools 云同步</b>。不要把密码、密钥写进片段；敏感内容请用其他工具保管。（PRD 风险 R4）</span></div>';
    html += row('导出 / 导入', '导出为 JSON 文件备份；导入按片段 id 合并（同 id 覆盖）',
      '<button class="btn btn--sm" id="btnExport">导出</button><button class="btn btn--sm" id="btnImport">导入</button>');
    html += row('清空示例数据', '删除首次启动时导入的 4 条示例片段（自己建的片段不受影响）',
      '<button class="btn btn--sm btn--danger" id="btnClearSeed">清空示例</button>');
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">关于</h3>';
    html += '<div class="about-grid">' +
      '<div class="about-cell"><div class="about-k">插件版本</div><div class="about-v">' + esc(about.pluginVersion || '-') + '</div></div>' +
      '<div class="about-cell"><div class="about-k">uTools</div><div class="about-v">' + esc(about.appVersion || '-') + '</div></div>' +
      '<div class="about-cell"><div class="about-k">Chromium</div><div class="about-v">' + esc(about.chrome || '-') + '</div></div>' +
      '<div class="about-cell"><div class="about-k">Node</div><div class="about-v">' + esc(about.node || '-') + '</div></div>' +
      '</div>';
    html += '<div class="set-row"><div class="set-main"><div class="set-name">复制诊断信息</div><div class="set-desc">反馈问题时把它粘给我，一次说清环境</div></div><div class="set-ctl"><button class="btn btn--sm" id="btnDiag">复制</button></div></div>';
    html += '</div>';

    el('settingsBody').innerHTML = html;
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg, kind) {
    var zone = el('toastZone');
    zone.innerHTML = '<div class="toast toast--' + (kind || 'info') + '"><span class="dot"></span>' + esc(msg) + '</div>';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { zone.innerHTML = ''; }, 2200);
  }

  return {
    ICO: ICO,
    el: el,
    groupColor: groupColor,
    groupName: groupName,
    searchSort: searchSort,
    renderOpts: renderOpts,
    previewHtml: previewHtml,
    issuePills: issuePills,
    renderSidebar: renderSidebar,
    renderList: renderList,
    renderCtxStat: renderCtxStat,
    renderEmptyDemo: renderEmptyDemo,
    showView: showView,
    syncEditorFields: syncEditorFields,
    renderEditorPreview: renderEditorPreview,
    renderLineNumbers: renderLineNumbers,
    renderPop: renderPop,
    renderVarFields: renderVarFields,
    renderVarPreview: renderVarPreview,
    renderSettings: renderSettings,
    toast: toast
  };
})();
