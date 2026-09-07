/*
 * Snippet Box · 设计稿交互装配
 *
 * 这不是 mock：列表、搜索、排序、实时预览、变量表单全部走真实的 SnippetEngine。
 * 阶段三会把「读取 MOCK 上下文」换成「preload + utools API 抓取真实快照」，
 * 其余渲染逻辑原样搬过去。
 *
 * 环境红线：不使用 ES module / ??= / Array.at / replaceAll / structuredClone。
 */
(function () {
  'use strict';

  var E = window.SnippetEngine;
  var D = window.SBData;

  function el(id) { return document.getElementById(id); }
  function esc(s) { return E.escapeHtml(s); }

  /* ------------------------------------------------------------------ *
   * 全局状态
   * ------------------------------------------------------------------ */
  var state = {
    theme: 'dark',
    width: '680',
    ctxMode: 'full',
    delimiter: 'mustache',
    group: 'all',
    query: '',
    activeId: null,
    snippets: D.SEED_SNIPPETS.slice(),
    groups: D.GROUPS.slice(),
    showPreviewInList: true
  };

  /* 上下文快照：真实插件在进入插件时抓取一次并冻结；这里用 mock，但 now 走实时时钟 */
  function currentContext() {
    var base = state.ctxMode === 'empty' ? D.MOCK_CONTEXT_EMPTY : D.MOCK_CONTEXT;
    var ctx = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) ctx[k] = base[k];
    ctx.now = new Date();
    ctx.variables = state.variables || {};
    return ctx;
  }

  function renderOpts() {
    return { context: currentContext(), delimiter: state.delimiter };
  }

  /* ------------------------------------------------------------------ *
   * 图标
   * ------------------------------------------------------------------ */
  var ICO = {
    all: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 4h11M2.5 8h11M2.5 12h7"/></svg>',
    pin: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 1.5l5 5-2 .5-3 3-.5 3-5-5 3-.5 3-3z"/><path d="M6 10L2.5 13.5"/></svg>',
    clock: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.2 1.4"/></svg>',
    copy: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.2A1.7 1.7 0 0 0 8.8 2.5H4a1.5 1.5 0 0 0-1.5 1.5v4.8c0 .7.3 1.3.7 1.7"/></svg>',
    edit: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.2 2.6l2.2 2.2L6 12.2l-2.8.6.6-2.8z"/></svg>',
    trash: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2"/></svg>',
    folder: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 4.2A1.2 1.2 0 0 1 3.2 3h3l1.4 1.8h5.2A1.2 1.2 0 0 1 14 6v6a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 12z"/></svg>',
    ungrouped: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="5.6" stroke-dasharray="2 2.4"/></svg>',
    bolt: '<svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1L4 9h3.5L7 15l5.5-8H9z"/></svg>',
    clip: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="4" width="10" height="9" rx="1.5"/><path d="M6 4V2.8h4V4"/></svg>',
    link: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6.5 9.5l3-3"/><path d="M8.8 4.6l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1"/><path d="M7.2 11.4l-1 1a2.6 2.6 0 0 1-3.7-3.7l1-1"/></svg>',
    refresh: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.7-4"/><path d="M13.5 1.5V4H11"/></svg>'
  };

  /* ------------------------------------------------------------------ *
   * 搜索 / 排序（PRD FR-22 FR-23）
   * ------------------------------------------------------------------ */
  function parseTs(s) {
    if (!s) return 0;
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }

  function smartScore(s) {
    var age = (currentContext().now.getTime() - parseTs(s.lastUsedAt)) / 86400000;
    var recency = age < 30 ? Math.max(0, 30 - age) / 30 : 0;
    var freq = Math.min(s.useCount, 100) / 100;
    return (s.pinned ? 1000 : 0) + freq * 60 + recency * 40;
  }

  function relevance(s, q) {
    if (!q) return -1;
    var ql = q.toLowerCase();
    var n = s.name.toLowerCase();
    var k = (s.keyword || '').toLowerCase();
    var c = s.content.toLowerCase();
    if (k === ql) return 100;
    if (n.indexOf(ql) === 0) return 90;
    if (k.indexOf(ql) === 0) return 80;
    if (n.indexOf(ql) >= 0) return 60;
    if (k.indexOf(ql) >= 0) return 50;
    if (c.indexOf(ql) >= 0) return 30;
    return -1;
  }

  function visibleSnippets() {
    var q = state.query.trim();
    var items = state.snippets.filter(function (s) {
      if (state.group === 'pin' && !s.pinned) return false;
      if (state.group === 'recent') return !!s.lastUsedAt;
      if (state.group === 'none' && s.group) return false;
      if (state.group.indexOf('g-') === 0 && s.group !== state.group) return false;
      if (!q) return true;
      return relevance(s, q) >= 0;
    });

    if (q) {
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
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' +
           esc(text.slice(i + q.length));
  }

  function groupName(id) {
    for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === id) return state.groups[i].name;
    return '';
  }
  function groupColor(id) {
    for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === id) return state.groups[i].color;
    return 'var(--text-3)';
  }

  /* ------------------------------------------------------------------ *
   * 侧栏
   * ------------------------------------------------------------------ */
  function countOf(gid) {
    return state.snippets.filter(function (s) {
      if (gid === 'all') return true;
      if (gid === 'pin') return !!s.pinned;
      if (gid === 'recent') return !!s.lastUsedAt;
      if (gid === 'none') return !s.group;
      return s.group === gid;
    }).length;
  }

  function sideItem(id, ico, name, count, color) {
    var dot = color
      ? '<span class="side-dot" style="background:' + color + '"></span>'
      : '<span class="ico">' + ico + '</span>';
    return '<button class="side-item" data-group="' + id + '" aria-current="' + (state.group === id) + '">' +
             dot + '<span class="nm">' + esc(name) + '</span><span class="ct">' + count + '</span>' +
           '</button>';
  }

  function renderSidebar(target) {
    if (!target) return;
    var html = '';
    html += sideItem('all', ICO.all, '全部', countOf('all'));
    html += sideItem('pin', ICO.pin, '置顶', countOf('pin'));
    html += sideItem('recent', ICO.clock, '最近使用', countOf('recent'));
    html += '<div class="side-sep"></div>';
    html += '<div class="side-sec">分组</div>';
    for (var i = 0; i < state.groups.length; i++) {
      var g = state.groups[i];
      html += sideItem(g.id, '', g.name, countOf(g.id), g.color);
    }
    html += sideItem('none', ICO.ungrouped, '未分组', countOf('none'));
    html += '<button class="side-item side-add">' +
              '<span class="ico">+</span><span class="nm">新建分组</span></button>';
    target.innerHTML = html;

    var btns = target.querySelectorAll('[data-group]');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        state.group = this.getAttribute('data-group');
        state.activeId = null;
        renderSidebar(el('sidebar1'));
        renderList();
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * 列表
   * ------------------------------------------------------------------ */
  function renderList() {
    var list = el('list1');
    if (!list) return;
    var items = visibleSnippets();
    var q = state.query.trim();

    if (!items.length) {
      list.innerHTML = '<div class="empty" style="padding:40px 24px">' +
        '<div class="empty-art" style="width:40px;height:40px">' + ICO.all + '</div>' +
        '<h3 class="empty-title">' + (q ? '没有匹配「' + esc(q) + '」的片段' : '这个分组是空的') + '</h3>' +
        '<p class="empty-desc">' + (q ? '试试搜名称、内容或关键字' : '新建一个片段，或在左侧换个分组') + '</p></div>';
      return;
    }

    if (!state.activeId || !items.some(function (s) { return s.id === state.activeId; })) {
      state.activeId = items[0].id;
    }

    var opts = renderOpts();

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      var active = s.id === state.activeId;
      opts.maxLines = active ? 0 : (state.showPreviewInList ? 1 : 0);
      var r = E.render(s.content, opts);
      var hasVar = r.variables.length > 0;
      var hasIssue = r.issues.some(function (x) { return x.level === 'unknown' || x.level === 'invalid'; });

      html += '<div class="list-item" role="option" data-id="' + s.id + '" aria-selected="' + active + '">';

      html += '<div class="li-top">';
      html += '<span class="li-name">' + markHit(s.name, q) + '</span>';
      html += '<span class="li-badges">';
      if (s.pinned) html += '<span class="pill pill--pin">' + ICO.pin + '置顶</span>';
      if (s.direct && s.keyword) html += '<span class="pill pill--key">' + ICO.bolt + esc(s.keyword) + '</span>';
      else if (s.keyword) html += '<span class="pill pill--grp">' + esc(s.keyword) + '</span>';
      if (hasVar) html += '<span class="pill pill--var" title="' + r.variables.length + ' 个待填变量">? ×' + r.variables.length + '</span>';
      if (hasIssue) html += '<span class="pill pill--warn" title="含未知或非法占位符">!</span>';
      html += '</span></div>';

      if (state.showPreviewInList && !active) {
        html += '<div class="li-preview">' + r.html + '</div>';
      }

      html += '<div class="li-meta">';
      if (s.group) html += '<span><span class="side-dot" style="display:inline-block;background:' + groupColor(s.group) + ';vertical-align:0"></span> ' + esc(groupName(s.group)) + '</span>';
      if (s.useCount) html += '<span>×' + s.useCount + (s.lastUsedAt ? ' · ' + esc(s.lastUsedAt.slice(5)) : '') + '</span>';
      html += '</div>';

      html += '<span class="li-actions">' +
                '<button class="icon-btn" data-act="copy" title="仅复制">' + ICO.copy + '</button>' +
                '<button class="icon-btn" data-act="pin" title="' + (s.pinned ? '取消置顶' : '置顶') + '">' + ICO.pin + '</button>' +
                '<button class="icon-btn" data-act="edit" title="编辑 ⌘E">' + ICO.edit + '</button>' +
              '</span>';

      if (active) {
        html += '<div class="render-block">' +
                  '<div class="render-label"><span class="live"></span>渲染结果 · 实时</div>' +
                  '<div class="render-out">' + r.html + '</div>' +
                  '<div class="render-foot">' + issuePills(r) +
                    '<span class="render-hint">' + r.text.length + ' 字符' +
                    (hasVar ? ' · 回车先弹填值表单' : ' · 回车直接粘贴') + '</span>' +
                  '</div>' +
                '</div>';
      }

      html += '</div>';
    }
    list.innerHTML = html;
    bindListEvents(list);
    updateCtxStat();
  }

  function issuePills(r) {
    var counts = { unknown: 0, invalid: 0, missing: 0 };
    for (var i = 0; i < r.issues.length; i++) if (counts[r.issues[i].level] !== undefined) counts[r.issues[i].level]++;
    var h = '';
    if (counts.unknown) h += '<span class="issue issue--unknown">' + counts.unknown + ' 个未知占位符</span>';
    if (counts.invalid) h += '<span class="issue issue--invalid">' + counts.invalid + ' 个参数非法</span>';
    if (counts.missing) h += '<span class="issue issue--missing">' + counts.missing + ' 处上下文缺失</span>';
    if (r.variables.length) h += '<span class="issue issue--var">' + r.variables.length + ' 个待填变量</span>';
    if (!h) h = '<span class="issue issue--ok">✓ 全部占位符解析正常</span>';
    return h;
  }

  function findSnippet(id) {
    for (var i = 0; i < state.snippets.length; i++) if (state.snippets[i].id === id) return state.snippets[i];
    return null;
  }

  function bindListEvents(list) {
    var rows = list.querySelectorAll('.list-item');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('mouseenter', function () {
        state.activeId = this.getAttribute('data-id');
        renderList();
      });
      rows[i].addEventListener('click', function (ev) {
        var actBtn = ev.target.closest ? ev.target.closest('[data-act]') : null;
        var id = this.getAttribute('data-id');
        if (actBtn) {
          ev.stopPropagation();
          var act = actBtn.getAttribute('data-act');
          var s = findSnippet(id);
          if (act === 'copy') { doOutput(s, 'copy'); }
          if (act === 'pin') { s.pinned = !s.pinned; toast('toast1', s.pinned ? '已置顶「' + s.name + '」' : '已取消置顶', 'info'); renderList(); }
          if (act === 'edit') { toast('toast1', '设计稿里编辑态见 S2', 'info'); }
          return;
        }
        state.activeId = id;
        renderList();
      });
      rows[i].addEventListener('dblclick', function () {
        doOutput(findSnippet(this.getAttribute('data-id')), 'paste');
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * 输出与 Toast
   * ------------------------------------------------------------------ */
  function doOutput(s, mode) {
    if (!s) return;
    var r = E.render(s.content, renderOpts());
    if (r.variables.length) {
      toast('toast1', '「' + s.name + '」有 ' + r.variables.length + ' 个待填变量 · 见 S3', 'info');
      return;
    }
    s.useCount++;
    var d = new Date();
    s.lastUsedAt = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
                   ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (mode === 'copy') {
      toast('toast1', '已复制 ' + r.text.length + ' 字符到剪贴板', 'ok');
    } else {
      toast('toast1', '已粘贴到上一个应用 · ' + r.text.length + ' 字符', 'ok');
    }
    renderSidebar(el('sidebar1'));
    renderList();
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  var toastTimers = {};
  function toast(zoneId, msg, kind) {
    var zone = el(zoneId);
    if (!zone) return;
    zone.innerHTML = '<div class="toast toast--' + (kind || 'ok') + '"><span class="dot"></span>' + esc(msg) + '</div>';
    if (toastTimers[zoneId]) clearTimeout(toastTimers[zoneId]);
    toastTimers[zoneId] = setTimeout(function () { zone.innerHTML = ''; }, 2200);
  }

  function updateCtxStat() {
    var t = el('ctxStat1');
    if (!t) return;
    var ctx = currentContext();
    var clip = ctx.clipboard ? ctx.clipboard.replace(/\n/g, ' ') : '';
    if (clip.length > 18) clip = clip.slice(0, 18) + '…';
    var bits = [];
    bits.push('<span title="剪贴板快照">' + ICO.clip + ' <b>' + (clip ? esc(clip) : '空') + '</b></span>');
    if (ctx.url) {
      var ti = ctx.url.title.length > 14 ? ctx.url.title.slice(0, 14) + '…' : ctx.url.title;
      bits.push('<span title="' + esc(ctx.url.url) + '">' + ICO.link + ' <b>' + esc(ti) + '</b></span>');
    } else {
      bits.push('<span style="opacity:.55" title="唤起时焦点不在浏览器">' + ICO.link + ' <b>无</b></span>');
    }
    bits.push('<button class="btn btn--sm btn--ghost" id="refreshCtx1" style="height:18px;padding:0 5px">' + ICO.refresh + ' 刷新快照</button>');
    t.innerHTML = bits.join('<span style="opacity:.3">·</span>');
    var rb = el('refreshCtx1');
    if (rb) rb.addEventListener('click', function () {
      toast('toast1', '已重新抓取上下文快照', 'info');
      renderList();
    });
  }

  /* ------------------------------------------------------------------ *
   * 键盘（PRD FR-26）
   * ------------------------------------------------------------------ */
  function moveActive(delta) {
    var items = visibleSnippets();
    if (!items.length) return;
    var idx = 0;
    for (var i = 0; i < items.length; i++) if (items[i].id === state.activeId) idx = i;
    idx = Math.max(0, Math.min(items.length - 1, idx + delta));
    state.activeId = items[idx].id;
    renderList();
    var row = document.querySelector('.list-item[data-id="' + state.activeId + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function bindKeyboard() {
    var q = el('q1');
    q.addEventListener('input', function () {
      state.query = q.value;
      el('clear1').hidden = !q.value;
      renderList();
    });
    q.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); moveActive(1); el('list1').focus(); }
      if (ev.key === 'Enter') { ev.preventDefault(); doOutput(findSnippet(state.activeId), ev.altKey ? 'copy' : 'paste'); }
      if (ev.key === 'Escape') { q.value = ''; state.query = ''; el('clear1').hidden = true; renderList(); }
    });
    el('clear1').addEventListener('click', function () {
      q.value = ''; state.query = ''; this.hidden = true; renderList(); q.focus();
    });

    var list = el('list1');
    list.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); moveActive(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveActive(-1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); doOutput(findSnippet(state.activeId), ev.altKey ? 'copy' : 'paste'); }
      else if (ev.key === 'e' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); toast('toast1', '编辑态见 S2', 'info'); }
    });

    el('newBtn1').addEventListener('click', function () { toast('toast1', '新建态见 S2', 'info'); });
    el('setBtn1').addEventListener('click', function () { location.hash = '#s4'; });
  }

  /* ------------------------------------------------------------------ *
   * S2 · 编辑器
   * ------------------------------------------------------------------ */
  function initEditor() {
    var ta = el('tpl');
    var seed = findSnippet('s-commit');
    ta.value = seed ? seed.content : '';

    function update() {
      var r = E.render(ta.value, renderOpts());
      el('preview2').innerHTML = r.text.trim() === '' ? '<span class="preview-empty">模板为空，先写点什么…</span>' : r.html;
      el('issues2').innerHTML = issuePills(r);
      el('directWarn').hidden = r.variables.length === 0;

      var lines = ta.value.split('\n').length;
      var nums = '';
      for (var i = 1; i <= Math.max(lines, 6); i++) nums += '<span>' + i + '</span>';
      el('tplLines').innerHTML = nums;
    }

    ta.addEventListener('input', update);
    ta.addEventListener('scroll', function () { el('tplLines').scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        toast('toast2', '已保存「' + (el('edName').value || '未命名') + '」', 'ok');
      }
      if (ev.key === 'Tab') {
        ev.preventDefault();
        var s = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + 2;
        update();
      }
    });

    // 直达开关联动
    var tg = el('tgDirect');
    tg.addEventListener('click', function () {
      var on = tg.getAttribute('aria-checked') !== 'true';
      tg.setAttribute('aria-checked', String(on));
      el('edDirectKey').disabled = !on;
    });
    el('tgPin').addEventListener('click', function () {
      this.setAttribute('aria-checked', String(this.getAttribute('aria-checked') !== 'true'));
    });

    // 占位符弹层
    var pop = el('phPop');
    var html = '';
    for (var g = 0; g < E.CATALOG.length; g++) {
      html += '<div class="pop-group">' + esc(E.CATALOG[g].group) + '</div>';
      var items = E.CATALOG[g].items;
      for (var i = 0; i < items.length; i++) {
        html += '<button class="pop-item" data-ins="' + esc(items[i].syntax) + '">' +
                  '<code>' + esc(items[i].syntax) + '</code><small>' + esc(items[i].desc) + '</small></button>';
      }
    }
    pop.innerHTML = html;

    el('phBtn').addEventListener('click', function (ev) {
      ev.stopPropagation();
      pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', function (ev) {
      if (!pop.hidden && !pop.contains(ev.target) && ev.target !== el('phBtn')) pop.hidden = true;
    });
    pop.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-ins]') : null;
      if (!btn) return;
      var ins = btn.getAttribute('data-ins');
      var s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + ins.length;
      ta.focus();
      pop.hidden = true;
      update();
    });

    el('refreshCtx2').addEventListener('click', function () {
      toast('toast2', '已重新抓取上下文快照', 'info');
      update();
    });
    el('saveBtn2').addEventListener('click', function () { toast('toast2', '已保存', 'ok'); });
    el('cancelBtn2').addEventListener('click', function () { toast('toast2', '已取消', 'info'); });
    el('backBtn2').addEventListener('click', function () { location.hash = '#s1'; });

    update();
    return update;
  }

  /* ------------------------------------------------------------------ *
   * S3 · 变量填值
   * ------------------------------------------------------------------ */
  function initVarModal() {
    var s = findSnippet('s-reply-fix');
    if (!s) return;
    var base = E.render(s.content, renderOpts());
    var vars = base.variables;

    el('modalTitle3').textContent = s.name;
    document.querySelector('#s3 .modal-sub').innerHTML =
      '这个片段有 <b>' + vars.length + '</b> 个待填变量 · 填完按 <span class="kbd">⌘</span><span class="kbd">↵</span> 输出';

    var html = '';
    for (var i = 0; i < vars.length; i++) {
      html += '<div class="var-field">' +
                '<label for="vf' + i + '">' + esc(vars[i].name) + '</label>' +
                '<input class="input input--mono" id="vf' + i + '" data-var="' + esc(vars[i].name) + '" ' +
                  'value="' + esc(vars[i].defaultValue) + '" placeholder="' +
                  (vars[i].defaultValue ? '' : '未填则输出空') + '" autocomplete="off" spellcheck="false">' +
              '</div>';
    }
    el('varFields3').innerHTML = html;

    var inputs = el('varFields3').querySelectorAll('input');

    function refresh() {
      var filled = {};
      var empties = 0;
      for (var k = 0; k < inputs.length; k++) {
        var name = inputs[k].getAttribute('data-var');
        filled[name] = inputs[k].value;
        if (inputs[k].value === '') empties++;
        inputs[k].classList.toggle('is-empty', inputs[k].value === '');
      }
      state.variables = filled;
      var r = E.render(s.content, renderOpts());
      el('preview3').innerHTML = r.html;
      el('varCount3').textContent = empties ? empties + ' 项未填 · 将输出为空' : '✓ 全部已填 · ' + r.text.length + ' 字符';
    }

    for (var j = 0; j < inputs.length; j++) {
      inputs[j].addEventListener('input', refresh);
      inputs[j].addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey || ev.altKey)) {
          ev.preventDefault();
          toast('toast3', ev.altKey ? '已复制 ' + el('preview3').textContent.length + ' 字符' : '已粘贴到上一个应用', 'ok');
        }
        if (ev.key === 'Enter' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
          ev.preventDefault();
          var all = Array.prototype.slice.call(inputs);
          var idx = all.indexOf(this);
          if (idx < all.length - 1) all[idx + 1].focus();
          else toast('toast3', '已粘贴到上一个应用', 'ok');
        }
      });
    }

    el('pasteBtn3').addEventListener('click', function () { toast('toast3', '已粘贴到上一个应用', 'ok'); });
    el('copyBtn3').addEventListener('click', function () { toast('toast3', '已复制到剪贴板', 'ok'); });

    refresh();

    // S3 背景里那份被遮住的列表
    renderSidebar(el('sidebar3'));
    var l3 = el('list3');
    if (l3) {
      var items = visibleSnippets().slice(0, 5);
      var h2 = '';
      for (var n = 0; n < items.length; n++) {
        var rr = E.render(items[n].content, renderOpts());
        h2 += '<div class="list-item" aria-selected="' + (items[n].id === s.id) + '">' +
              '<div class="li-top"><span class="li-name">' + esc(items[n].name) + '</span></div>' +
              '<div class="li-preview">' + esc(rr.text.split('\n')[0]) + '</div></div>';
      }
      l3.innerHTML = h2;
    }
    return refresh;
  }

  /* ------------------------------------------------------------------ *
   * S4 · 设置页联动
   * ------------------------------------------------------------------ */
  function initSettings() {
    var toggles = document.querySelectorAll('[data-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', function () {
        this.setAttribute('aria-checked', String(this.getAttribute('aria-checked') !== 'true'));
      });
    }
    var seg = el('setTheme');
    if (seg) seg.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      setTheme(b.getAttribute('data-v'));
      syncSeg(seg, b.getAttribute('data-v'));
      syncSeg(el('themeSeg'), b.getAttribute('data-v'));
    });
    var delim = el('setDelim');
    if (delim) delim.addEventListener('change', function () {
      state.delimiter = delim.value;
      renderList();
      if (window.__editorUpdate) window.__editorUpdate();
      if (window.__varUpdate) window.__varUpdate();
    });
  }

  /* ------------------------------------------------------------------ *
   * S5 · 空状态活例子
   * ------------------------------------------------------------------ */
  function initEmptyDemo() {
    var box = el('emptyDemo');
    if (!box) return;
    var tpl = '{{date:MM月DD日}} {{time}} · {{user}} 提交了 {{random:100-999}} 行改动';
    function tick() {
      var r = E.render(tpl, renderOpts());
      box.innerHTML = '<div style="color:var(--text-3)">模板 &nbsp;' + esc(tpl) + '</div>' +
                      '<div style="margin-top:5px">结果 &nbsp;' + r.html + '</div>';
    }
    tick();
    setInterval(tick, 2000);
  }

  /* ------------------------------------------------------------------ *
   * 设计令牌展板
   * ------------------------------------------------------------------ */
  var TOKEN_GROUPS = [
    { title: '表面 Surface', items: [
      ['--surface', '窗口底'], ['--surface-2', '侧栏/状态栏'], ['--surface-3', '输入框/代码底'],
      ['--surface-sunken', '预览区'], ['--titlebar', '标题栏'] ] },
    { title: '文字 Text', items: [
      ['--text', '主要'], ['--text-2', '次要'], ['--text-3', '辅助/禁用'] ] },
    { title: '描边 Border', items: [
      ['--border', '常规'], ['--border-strong', '强调/控件'], ['--border-faint', '分隔线'] ] },
    { title: '主色 Accent', items: [
      ['--accent', '主色'], ['--accent-strong', '悬停'], ['--accent-soft', '浅底'], ['--accent-border', '描边'] ] },
    { title: '语义 Semantic', items: [
      ['--success', '成功'], ['--warning', '警告'], ['--danger', '危险'] ] },
    { title: '占位符分类色', items: [
      ['--tok-time-fg', '时间'], ['--tok-clip-fg', '剪贴板'], ['--tok-rand-fg', '随机'],
      ['--tok-sys-fg', '系统'], ['--tok-var-fg', '待填变量'],
      ['--tok-unknown-fg', '未知'], ['--tok-invalid-fg', '非法'], ['--tok-missing-fg', '缺失'] ] }
  ];

  function renderTokens() {
    var cs = getComputedStyle(document.documentElement);
    var html = '';
    for (var g = 0; g < TOKEN_GROUPS.length; g++) {
      html += '<div class="token-card"><h4>' + esc(TOKEN_GROUPS[g].title) + '</h4>';
      var items = TOKEN_GROUPS[g].items;
      for (var i = 0; i < items.length; i++) {
        var v = cs.getPropertyValue(items[i][0]).trim();
        html += '<div class="swatch-row">' +
                  '<span class="swatch" style="background:' + v + '"></span>' +
                  '<span class="nm">' + esc(items[i][1]) + '</span>' +
                  '<code>' + esc(v || '—') + '</code>' +
                '</div>';
      }
      html += '</div>';
    }
    html += '<div class="token-card"><h4>字号 Type Scale</h4>' +
      '<div class="type-row"><span class="lbl">20 / 650</span><span style="font-size:20px;font-weight:650;letter-spacing:-.02em">Snippet Box</span></div>' +
      '<div class="type-row"><span class="lbl">14 / 620</span><span style="font-size:14px;font-weight:620">片段名称</span></div>' +
      '<div class="type-row"><span class="lbl">13 / 400</span><span style="font-size:13px">正文与输入框</span></div>' +
      '<div class="type-row"><span class="lbl">12 / 400</span><span style="font-size:12px;color:var(--text-2)">次要说明文字</span></div>' +
      '<div class="type-row"><span class="lbl">11 / 400</span><span style="font-size:11px;color:var(--text-3)">状态栏与提示</span></div>' +
      '<div class="type-row"><span class="lbl">mono 12</span><span style="font-family:var(--font-mono);font-size:12px">{{date:-1d|YYYY/MM/DD}}</span></div>' +
      '</div>';
    html += '<div class="token-card"><h4>间距与圆角</h4>' +
      '<div class="swatch-row"><span class="nm">基准栅格</span><code>4px</code></div>' +
      '<div class="swatch-row"><span class="nm">sp 1→8</span><code>4 8 12 16 20 24 32</code></div>' +
      '<div class="swatch-row"><span class="nm">圆角</span><code>3 / 5 / 7 / 10 / 14</code></div>' +
      '<div class="swatch-row"><span class="nm">侧栏宽</span><code>156px</code></div>' +
      '<div class="swatch-row"><span class="nm">标题栏高</span><code>38px</code></div>' +
      '<div class="swatch-row"><span class="nm">搜索栏高</span><code>46px</code></div>' +
      '<div class="swatch-row"><span class="nm">状态栏高</span><code>30px</code></div>' +
      '<div class="swatch-row"><span class="nm">窗口默认高</span><code>544px</code></div>' +
      '</div>';
    el('tokenGrid').innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * 工具栏
   * ------------------------------------------------------------------ */
  function syncSeg(seg, v) {
    if (!seg) return;
    var bs = seg.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(bs[i].getAttribute('data-v') === v));
  }

  function setTheme(v) {
    state.theme = v;
    document.documentElement.setAttribute('data-theme', v);
    renderTokens();
  }

  function initToolbar() {
    el('themeSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      setTheme(b.getAttribute('data-v'));
      syncSeg(el('themeSeg'), b.getAttribute('data-v'));
      syncSeg(el('setTheme'), b.getAttribute('data-v'));
    });
    el('widthSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      state.width = b.getAttribute('data-v');
      syncSeg(el('widthSeg'), state.width);
      var frames = document.querySelectorAll('.frame');
      for (var i = 0; i < frames.length; i++) frames[i].setAttribute('data-w', state.width);
      var tags = document.querySelectorAll('.titlebar-tag');
      for (var j = 0; j < tags.length; j++) {
        var txt = tags[j].textContent;
        if (/\d+ × \d+/.test(txt)) {
          tags[j].textContent = (state.width === 'fluid' ? '自适应' : state.width) + ' × ' + txt.split('× ')[1];
        } else if (state.width === 'fluid') {
          tags[j].textContent = '自适应';
        } else {
          tags[j].textContent = state.width + 'px 宽';
        }
      }
    });
    el('ctxSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      state.ctxMode = b.getAttribute('data-v');
      syncSeg(el('ctxSeg'), state.ctxMode);
      renderList();
      if (window.__editorUpdate) window.__editorUpdate();
      if (window.__varUpdate) window.__varUpdate();
    });
  }

  /* ------------------------------------------------------------------ *
   * URL 参数：便于分享某一特定状态，也便于无头浏览器分主题截图
   *   ?theme=light|dark|auto  &width=640|680|720|fluid
   *   &ctx=full|empty         &delim=mustache|dollar|bracket
   *   &screen=s1|s2|s3|s4|s5|tokens
   * ------------------------------------------------------------------ */
  function applyUrlParams() {
    var p;
    try { p = new URLSearchParams(location.search); } catch (e) { return null; }

    var theme = p.get('theme');
    if (theme === 'light' || theme === 'dark' || theme === 'auto') state.theme = theme;

    var width = p.get('width');
    if (width === '640' || width === '680' || width === '720' || width === 'fluid') state.width = width;

    var ctx = p.get('ctx');
    if (ctx === 'full' || ctx === 'empty') state.ctxMode = ctx;

    var delim = p.get('delim');
    if (delim === 'mustache' || delim === 'dollar' || delim === 'bracket') state.delimiter = delim;

    document.documentElement.setAttribute('data-theme', state.theme);
    var frames = document.querySelectorAll('.frame');
    for (var i = 0; i < frames.length; i++) frames[i].setAttribute('data-w', state.width);
    var ds = el('setDelim');
    if (ds) ds.value = state.delimiter;

    syncSeg(el('themeSeg'), state.theme);
    syncSeg(el('setTheme'), state.theme);
    syncSeg(el('widthSeg'), state.width);
    syncSeg(el('ctxSeg'), state.ctxMode);

    var only = p.get('only');
    if (only && el(only)) document.body.setAttribute('data-only', only);

    return p.get('screen');
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */
  function boot() {
    var screen = applyUrlParams();
    initToolbar();
    renderSidebar(el('sidebar1'));
    renderList();
    bindKeyboard();
    window.__editorUpdate = initEditor();
    window.__varUpdate = initVarModal();
    initSettings();
    initEmptyDemo();
    renderTokens();

    if (screen) {
      var target = el(screen);
      if (target && target.scrollIntoView) target.scrollIntoView();
    }

    // 列表预览每分钟刷新一次时间类占位符（PRD FR-49）
    setInterval(function () { if (!state.query) renderList(); }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
