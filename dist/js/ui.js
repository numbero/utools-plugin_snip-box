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

  var GROUP_COLORS = ['var(--group-1)', 'var(--group-2)', 'var(--group-3)', 'var(--group-4)', 'var(--group-5)', 'var(--group-6)', 'var(--group-7)'];
  ICO.more = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="13" cy="8" r="1.2"/></svg>';
  ICO.output = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function groupColor(gid, groups) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === gid) return GROUP_COLORS[i % GROUP_COLORS.length];
    return 'var(--text-3)';
  }
  function groupName(gid, groups) {
    for (var i = 0; i < groups.length; i++) if (groups[i].id === gid) return groups[i].name;
    return '未分组';
  }

  /* ---------- 搜索与排序 ---------- */
  function relevance(s, q) {
    if (!q) return 0;
    var ql = q.toLowerCase();
    if (s.name.toLowerCase().indexOf(ql) === 0) return 5;
    if ((s.keyword || '').toLowerCase() === ql || (s.searchKey || '').toLowerCase().split(/\s+/).indexOf(ql) >= 0) return 4;
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
    var f = state.filter || { type: 'all' };
    var sort = state.sort || state.settings.sort || 'smart';
    var items = state.snippets.filter(function (s) {
      if (f.type === 'pinned') return s.pinned;
      if (f.type === 'recent') return s.lastUsedAt && (Date.now() - new Date(s.lastUsedAt).getTime()) < 30 * 86400000;
      if (f.type === 'group') return s.group === f.id;
      if (f.type === 'ungrouped') return !s.group;
      return true;
    });
    if (q) items = items.filter(function (s) { return relevance(s, q) > 0; });
    items.sort(function (a, b) {
      if (q) {
        var score = relevance(b, q) - relevance(a, q);
        if (score) return score;
      }
      var pinned = Number(!!b.pinned) - Number(!!a.pinned);
      if (pinned) return pinned;
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'recent') return new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime();
      if (sort === 'updated') return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      return smartScore(b) - smartScore(a);
    });
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

  /* 同一上下文快照下，预览、变量表单与实际输出共享已解析的片段。
     values 只替换待填变量，因此输入变量不会重新生成 UUID / 随机值。 */
  function renderSnippet(state, snippet, values) {
    var content = String(snippet.content || '');
    var key = 'snippet:' + String(snippet.id || '__editor');
    var ctx = state.ctx || {};
    var delimiter = state.settings.delimiter || 'mustache';
    if (!state.renderCache) state.renderCache = Object.create(null);
    var entry = state.renderCache[key];
    if (!entry || entry.content !== content || entry.ctx !== ctx || entry.now !== ctx.now || entry.delimiter !== delimiter) {
      var parseCtx = {};
      Object.keys(ctx).forEach(function (name) { if (name !== 'variables') parseCtx[name] = ctx[name]; });
      parseCtx.variables = Object.create(null);
      var parsed;
      try { parsed = E.parse(content, { context: parseCtx, delimiter: delimiter }); }
      catch (error) { return { text: content, html: esc(content), variables: [], issues: [], fatal: true, truncated: false }; }
      entry = { content: content, ctx: ctx, now: ctx.now, delimiter: delimiter, parsed: parsed };
      state.renderCache[key] = entry;
    }
    var text = '';
    var html = '';
    entry.parsed.segments.forEach(function (seg) {
      if (seg.type === 'text') { text += seg.value; html += esc(seg.value); return; }
      if (seg.category === 'variable' && (seg.state === 'variable' || seg.state === 'ok')) {
        var filled = values && Object.prototype.hasOwnProperty.call(values, seg.name);
        var val = filled ? String(values[seg.name]) : '';
        text += val;
        html += filled ? '<span class="tok tok--variable" title="' + esc(seg.raw) + '">' + esc(val) + '</span>' :
          '<span class="tok tok--variable tok--pending" title="输出前填写变量">' + esc(seg.raw) + '</span>';
        return;
      }
      if (seg.state === 'ok') {
        text += String(seg.value);
        html += '<span class="tok tok--' + seg.category + '" title="' + esc(seg.raw + (seg.volatile ? ' · 刷新快照可生成新值' : '')) + '">' + esc(seg.value) + '</span>';
      } else if (seg.state === 'missing') {
        html += '<span class="tok tok--missing" title="' + esc(seg.note || '上下文缺失，输出为空') + '">[上下文为空]</span>';
      } else {
        text += seg.raw;
        html += '<span class="tok tok--' + seg.state + '" title="' + esc(seg.note || '') + '">' + esc(seg.raw) + '</span>';
      }
    });
    return { text: text, html: html, variables: entry.parsed.variables, issues: entry.parsed.issues, fatal: false, truncated: false };
  }

  /* ---------- 侧栏与快速筛选 ---------- */
  function renderSidebar(state) {
    var counts = { all: state.snippets.length, pinned: 0, recent: 0, ungrouped: 0 };
    var perGroup = Object.create(null);
    state.snippets.forEach(function (s) {
      if (s.pinned) counts.pinned++;
      if (s.lastUsedAt && (Date.now() - new Date(s.lastUsedAt).getTime()) < 30 * 86400000) counts.recent++;
      if (!s.group) counts.ungrouped++;
      perGroup[s.group] = (perGroup[s.group] || 0) + 1;
    });
    var f = state.filter || { type: 'all' };
    function item(type, id, ico, name, count, chip) {
      var cur = f.type === type && (f.id || '') === (id || '');
      return '<button class="' + (chip ? 'filter-chip' : 'side-item') + '" data-filter="' + type + '" data-id="' + esc(id || '') + '" aria-current="' + cur + '">' +
        (chip ? '' : '<span class="ico">' + ico + '</span>') + '<span class="nm">' + esc(name) + '</span><span class="ct">' + count + '</span></button>';
    }
    var html = '<div class="side-sec">片段库</div>';
    var chips = '';
    [['all', ICO.all, '全部'], ['pinned', ICO.pin, '置顶'], ['recent', ICO.recent, '最近使用']].forEach(function (v) {
      html += item(v[0], '', v[1], v[2], counts[v[0]], false);
      chips += item(v[0], '', '', v[2], counts[v[0]], true);
    });
    html += '<div class="side-sep"></div><div class="side-sec">分组</div>';
    state.groups.forEach(function (g) {
      var dot = '<span class="side-dot" style="background:' + groupColor(g.id, state.groups) + '"></span>';
      html += '<div class="side-group-row">' + item('group', g.id, dot, g.name, perGroup[g.id] || 0, false) +
        '<button class="group-menu" data-group-act="menu" data-id="' + esc(g.id) + '" aria-label="管理分组 ' + esc(g.name) + '" title="管理分组">' + ICO.more + '</button></div>';
      chips += item('group', g.id, '', g.name, perGroup[g.id] || 0, true);
    });
    html += item('ungrouped', '', ICO.ungrouped, '未分组', counts.ungrouped, false);
    chips += item('ungrouped', '', '', '未分组', counts.ungrouped, true);
    html += '<button class="side-item side-add" data-filter="__addgroup">+ 新建分组</button>';
    chips += '<button class="filter-chip" data-filter="__managegroups">管理分组</button>';
    chips += '<button class="filter-chip" data-filter="__addgroup" title="新建分组" aria-label="新建分组">+</button>';
    el('sidebar').innerHTML = html;
    el('filterBar').innerHTML = chips;
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

  function rowId(id) { return 'snippet-' + encodeURIComponent(String(id)).replace(/%/g, '_'); }
  function filterTitle(state) {
    var f = state.filter || { type: 'all' };
    if (f.type === 'group') return groupName(f.id, state.groups);
    return { all: '全部片段', pinned: '置顶片段', recent: '最近使用', ungrouped: '未分组' }[f.type] || '全部片段';
  }
  function renderList(state) {
    var list = el('list');
    var focused = document.activeElement;
    var keepFocus = focused && list.contains(focused);
    var focusedAction = keepFocus && focused.getAttribute('data-act');
    var focusedRow = keepFocus && focused.closest('.list-item');
    var focusedId = focusedRow && focusedRow.getAttribute('data-id');
    var items = searchSort(state);
    if (!items.some(function (s) { return s.id === state.activeId; })) state.activeId = (items[0] || {}).id || null;
    var q = (state.query || '').trim();
    var html = '';
    items.forEach(function (s) {
      var active = s.id === state.activeId;
      var r = renderSnippet(state, s);
      var hasIssue = r.issues.some(function (x) { return x.level === 'unknown' || x.level === 'invalid'; });
      html += '<div class="list-item' + (!state.settings.showPreviewInList ? ' list-item--compact' : '') + '" id="' + rowId(s.id) + '" role="option" tabindex="' + (active ? '0' : '-1') + '" data-id="' + esc(s.id) + '" aria-selected="' + active + '">';
      html += '<div class="li-top"><span class="li-glyph" aria-hidden="true">{ }</span><span class="li-name">' + markHit(s.name, q) + '</span><button class="icon-btn row-copy" data-act="copy" title="复制片段" aria-label="复制 ' + esc(s.name) + '">' + ICO.copy + '</button></div>';
      if (state.settings.showPreviewInList) html += '<div class="li-preview">' + (state.settings.colorTokens ? r.html : esc(r.text || s.content)) + '</div>';
      html += '<div class="li-meta">';
      if (s.group) html += '<span class="pill pill--grp" title="' + esc(groupName(s.group, state.groups)) + '">' + esc(groupName(s.group, state.groups)) + '</span>';
      if (s.pinned) html += '<span class="pin-mark" title="已置顶">' + ICO.pin + '</span>';
      if (r.variables.length) html += '<span class="pill pill--var" title="' + r.variables.length + ' 个待填变量">' + r.variables.length + ' 变量</span>';
      else if (s.direct && s.keyword) html += '<span class="pill pill--key" title="直达关键字">' + ICO.bolt + esc(s.keyword) + '</span>';
      if (hasIssue) html += '<span class="pill pill--warn" title="含未知或非法占位符">!</span>';
      if (s.useCount) html += '<span class="use-count">使用 ' + s.useCount + ' 次</span>';
      html += '</div></div>';
    });
    if (!items.length) {
      html = '<div class="empty list-empty"><h3>' + (q ? '没有匹配的片段' : '这里还没有片段') + '</h3><p>' + (q ? '试试其他关键字，或查看全部分组。' : '新建一个片段，或查看其他分组。') + '</p><div class="empty-actions">' +
        (q ? '<button class="btn btn--sm" data-list-act="clear">清除搜索</button>' : '') + '<button class="btn btn--sm" data-list-act="all">全部分组</button><button class="btn btn--sm btn--primary" data-list-act="new">新建片段</button></div></div>';
    }
    list.innerHTML = html;
    if (state.activeId) list.setAttribute('aria-activedescendant', rowId(state.activeId));
    else list.removeAttribute('aria-activedescendant');
    el('libraryTitle').textContent = q ? '搜索结果' : filterTitle(state);
    el('libraryCount').textContent = items.length;
    el('sortSelect').value = state.sort || state.settings.sort || 'smart';
    if (keepFocus) {
      var node = focusedId && el(rowId(focusedId));
      var target = node && focusedAction ? node.querySelector('[data-act="' + focusedAction + '"]') : null;
      if (!target) target = focusedRow ? el(rowId(state.activeId)) : list;
      if (target) target.focus({ preventScroll: true });
    }
    renderDetail(state);
  }

  function renderDetail(state) {
    var pane = el('detailPane');
    var focused = document.activeElement;
    var keepFocus = pane.contains(focused);
    var action = keepFocus && focused.getAttribute('data-detail-act');
    var tabFocus = keepFocus && focused.getAttribute('data-detail-tab');
    var s = null;
    state.snippets.some(function (item) { if (item.id === state.activeId) { s = item; return true; } return false; });
    if (!s) {
      pane.innerHTML = '<div class="empty detail-empty"><div class="empty-art">{ }</div><h2 class="empty-title">选择一个片段</h2><p class="empty-desc">预览输出内容，再复制或粘贴到原应用。</p></div>';
      return;
    }
    var r = renderSnippet(state, s);
    var tab = state.detailTab || 'preview';
    var copy = state.settings.output === 'copy';
    var label = copy ? '复制内容' : '粘贴到原应用';
    if (r.variables.length) label = copy ? '填写并复制' : '填写并粘贴';
    var html = '<header class="detail-head"><div class="detail-eyebrow">' + esc(groupName(s.group, state.groups)) + ' · ' + (s.pinned ? '已置顶' : '文本片段') + '</div><div class="detail-title"><h2>' + esc(s.name) + '</h2><div class="detail-actions">' +
      '<button class="icon-btn' + (s.pinned ? ' on' : '') + '" data-detail-act="pin" title="' + (s.pinned ? '取消置顶' : '置顶') + '" aria-label="' + (s.pinned ? '取消置顶' : '置顶') + '">' + ICO.pin + '</button><button class="icon-btn" data-detail-act="edit" title="编辑片段 ⌘E" aria-label="编辑片段">' + ICO.edit + '</button><button class="icon-btn" data-detail-act="more" title="更多操作" aria-label="更多操作">' + ICO.more + '</button></div></div></header>';
    html += '<div class="detail-tabs" role="tablist" aria-label="片段内容"><button id="detailPreviewTab" role="tab" data-detail-tab="preview" aria-selected="' + (tab === 'preview') + '" aria-controls="detailContent">输出预览</button><button id="detailTemplateTab" role="tab" data-detail-tab="template" aria-selected="' + (tab === 'template') + '" aria-controls="detailContent">原始模板</button></div>';
    html += '<div class="detail-content" id="detailContent" role="tabpanel" aria-labelledby="' + (tab === 'template' ? 'detailTemplateTab' : 'detailPreviewTab') + '"><div class="preview-heading"><span>' + (tab === 'template' ? '保存的模板' : '<span class="live-dot"></span>已渲染 · 快照') + '</span><span>' + r.text.length + ' 字符</span></div>';
    html += tab === 'template' ? '<pre class="template-text">' + esc(s.content) + '</pre>' : '<div class="render-out">' + previewHtml(r, state) + '</div>';
    html += '<div class="detail-issues">' + issuePills(r) + '</div></div>';
    html += '<div class="detail-info"><div class="meta-line"><span>分组</span><span class="pill pill--grp">' + esc(groupName(s.group, state.groups)) + '</span></div>';
    if (s.searchKey) html += '<div class="meta-line"><span>关键字</span><span title="' + esc(s.searchKey) + '">' + esc(s.searchKey) + '</span></div>';
    if (s.direct && s.keyword) html += '<div class="meta-line"><span>直达</span><span class="pill pill--key">' + esc((state.settings.directPrefix || '') + s.keyword) + '</span></div>';
    html += '<div class="meta-line"><span>使用</span><span>' + (s.useCount || 0) + ' 次' + (s.lastUsedAt ? ' · 最近 ' + esc(E._internals.formatDate(new Date(s.lastUsedAt), 'MM-DD HH:mm')) : '') + '</span></div></div>';
    html += '<footer class="detail-foot"><p class="output-note">' + (r.variables.length ? r.variables.length + ' 个变量待填 · 输出前会打开填写窗口' : copy ? '复制到剪贴板，随时粘贴到需要的地方' : '输出到打开插件之前使用的应用') + '</p><div class="output-actions"><button class="btn" data-detail-act="copy">' + ICO.copy + '仅复制</button><button class="btn btn--primary" data-detail-act="output">' + label + '<span class="kbd">↵</span>' + ICO.output + '</button></div></footer>';
    pane.innerHTML = html;
    if (keepFocus) {
      var selector = action ? '[data-detail-act="' + action + '"]' : tabFocus ? '[data-detail-tab="' + tabFocus + '"]' : '';
      var next = selector && pane.querySelector(selector);
      if (next) next.focus({ preventScroll: true });
    }
    if (el('outputHint')) el('outputHint').textContent = copy ? '复制' : '粘贴';
  }

  /* ---------- 状态栏 ---------- */
  function renderCtxStat(state) {
    var ctx = state.ctx || {};
    var clip = (ctx.clipboard || '').replace(/\n/g, ' ');
    var short = clip.length > 18 ? clip.slice(0, 18) + '…' : clip;
    el('ctxStat').innerHTML = '<span class="ctx-snapshot" title="剪贴板快照：' + esc(clip || '空') + '">' + ICO.clip + ' <b>' + esc(short || '剪贴板为空') + '</b></span><button class="btn btn--sm btn--ghost" id="ctxRefresh" title="刷新上下文快照" aria-label="刷新上下文快照">' + ICO.refresh + '</button>';
  }

  /* ---------- 空状态 ---------- */
  function renderEmptyDemo(state) {
    var tpl = '{{date:MM月DD日}} {{time}} · {{user}} 提交了 {{random:100-999}} 行改动';
    var r = renderSnippet(state, { id: '__empty', content: tpl });
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
    el('edDirty').textContent = '未修改';
    el('edError').hidden = true;
    el('edError').textContent = '';
    el('edAdvanced').open = !!d.direct;
    ['edName', 'edTpl', 'edDirectKey'].forEach(function (id) { el(id).classList.remove('is-error'); el(id).removeAttribute('aria-invalid'); });
    el('edPop').hidden = true;
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
    var r = renderSnippet(state, { id: '__editor', content: tpl });
    el('edCount').textContent = tpl.length + ' 字符';
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
      var val = Object.prototype.hasOwnProperty.call(m.values, f.name) ? String(m.values[f.name]) : '';
      html += '<div class="var-field"><label for="varinp-' + i + '">' + esc(f.name) + '</label><input class="input input--mono' + (val ? '' : ' is-empty') + '" id="varinp-' + i + '" data-var="' + esc(f.name) + '" value="' + esc(val) + '" placeholder="' + esc(f.defaultValue || '可留空') + '" autocomplete="off"></div>';
    });
    el('varFields').innerHTML = html;
    el('varTitle').textContent = '填写变量 · ' + m.snippet.name;
    var copy = m.mode === 'copy';
    el('varSub').textContent = m.fields.length + ' 个变量 · 填写后按回车' + (copy ? '复制' : '粘贴') + '，留空的变量不会输出内容。';
    el('varPaste').innerHTML = (copy ? '复制' : '粘贴') + ' <span class="kbd">↵</span>';
    el('varCopy').textContent = copy ? '改为粘贴' : '仅复制';
  }

  function renderVarPreview(state) {
    var m = state.modal;
    var r = renderSnippet(state, m.snippet, m.values);
    el('varPreview').innerHTML = previewHtml(r, state);
    var missing = m.fields.filter(function (f) { return !Object.prototype.hasOwnProperty.call(m.values, f.name) || !m.values[f.name]; }).length;
    el('varMissing').textContent = missing ? missing + ' 项留空' : '变量已填入';
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
    html += row('粘贴模式', '通常使用剪贴板粘贴；若目标应用不支持，可尝试逐字输入',
      selectHtml('pasteMode', s.pasteMode, [['pasteText', '剪贴板粘贴'], ['typeString', '逐字输入']]));
    html += row('修饰键临时反向', '<span class="kbd">⌥</span><span class="kbd">↵</span> 执行与上面相反的动作', switchHtml('invertModifier', s.invertModifier));
    html += row('直达关键字统一前缀', '避免片段关键字污染 uTools 全局指令空间，如设为 <code>;</code> 则 <code>sign</code> 注册为 <code>;sign</code>',
      '<input class="input input--mono" style="width:74px" placeholder="关闭" name="directPrefix" value="' + esc(s.directPrefix) + '" data-input="directPrefix">');
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">外观</h3>';
    html += row('主题', '跟随系统自动切换浅色与深色，使用活力橙配色',
      segHtml('theme', s.theme, [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']]));
    html += row('默认布局', '快速调用使用双栏；管理视图会显示分组侧栏',
      segHtml('layout', s.layout || 'quick', [['quick', '快速调用'], ['manage', '管理视图']]));
    html += row('列表项显示渲染预览', '关闭后列表更紧凑，但看不到占位符的实际输出', switchHtml('showPreviewInList', s.showPreviewInList));
    html += row('预览中给占位符着色', '按来源分类上色，仅影响预览，不影响输出内容', switchHtml('colorTokens', s.colorTokens));
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">语法</h3>';
    html += row('占位符定界符', '只影响解析不影响存储，随时可切、可随时切回，片段内容不会被改写',
      selectHtml('delimiter', s.delimiter, [['mustache', '{{ 双花括号 }}'], ['dollar', '${ 美元括号 }'], ['bracket', '[[ 双方括号 ]]']]));
    html += '</div>';

    html += '<div class="set-sec"><h3 class="set-sec-title">数据</h3>';
    html += '<div class="callout callout--warn" style="margin-bottom:var(--sp-3)">' + ICO.warn +
      '<span>片段保存在 uTools 数据库中，可能随 uTools 云同步。密码和密钥请使用专门的管理工具保存。</span></div>';
    html += row('导出 / 导入', '导出 JSON 备份；相同记录跳过，同 ID 内容冲突时创建副本',
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
    html += '<div class="set-row"><div class="set-main"><div class="set-name">复制诊断信息</div><div class="set-desc">包含版本、设置与数据数量，方便排查问题</div></div><div class="set-ctl"><button class="btn btn--sm" id="btnDiag">复制</button></div></div>';
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
    renderSnippet: renderSnippet,
    renderDetail: renderDetail,
    fillGroupSelect: fillGroupSelect,
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
