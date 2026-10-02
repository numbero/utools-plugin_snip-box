'use strict';
/* Accessible in-plugin dialogs; no native browser prompt/confirm dependency. */
(function () {
  var current = null;
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('button,input,select,textarea,[tabindex="0"]'), function (n) {
      return !n.disabled && !n.hidden && n.getClientRects().length;
    });
  }
  function trap(ev, root) {
    if (ev.key !== 'Tab') return;
    var nodes = focusables(root);
    if (!nodes.length) { ev.preventDefault(); return; }
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
      ev.preventDefault(); last.focus();
    } else if (!ev.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
      ev.preventDefault(); first.focus();
    }
  }
  function open(opts) {
    if (current) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var previous = document.activeElement;
      var scrim = document.createElement('div');
      scrim.className = 'sb-dialog-scrim';
      var box = document.createElement('section');
      box.className = 'sb-dialog';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'sbDialogTitle');
      var title = document.createElement('h2'); title.id = 'sbDialogTitle'; title.textContent = opts.title;
      box.appendChild(title);
      if (opts.message) {
        var message = document.createElement('p'); message.textContent = opts.message;
        message.id = 'sbDialogMessage'; box.setAttribute('aria-describedby', message.id); box.appendChild(message);
      }
      var input, error;
      if (opts.input !== undefined) {
        var label = document.createElement('label'); label.textContent = opts.label || '名称'; label.htmlFor = 'sbDialogInput'; box.appendChild(label);
        input = document.createElement('input'); input.id = 'sbDialogInput'; input.className = 'input'; input.value = opts.input; input.maxLength = opts.maxLength || 200;
        box.appendChild(input);
        error = document.createElement('p'); error.className = 'sb-dialog-error'; error.id = 'sbDialogError'; error.setAttribute('role', 'alert'); input.setAttribute('aria-describedby', error.id); box.appendChild(error);
      }
      var actions = document.createElement('div'); actions.className = 'sb-dialog-actions';
      (opts.actions || []).forEach(function (a) {
        var b = document.createElement('button'); b.className = 'btn' + (a.primary ? ' btn--primary' : '') + (a.danger ? ' btn--danger' : '');
        b.textContent = a.label; b.setAttribute('data-dialog-value', a.value);
        b.addEventListener('click', function () { finish(a.value); }); actions.appendChild(b);
      });
      box.appendChild(actions); scrim.appendChild(box); document.body.appendChild(scrim);
      var app = document.getElementById('app'); var oldHidden = app && app.getAttribute('aria-hidden');
      if (app) app.setAttribute('aria-hidden', 'true');
      function finish(value) {
        if (input && value !== null && value !== 'cancel') {
          var text = input.value.trim(); var problem = opts.validate ? opts.validate(text) : (!text ? '请输入名称' : '');
          if (problem) { error.textContent = problem; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
          value = text;
        }
        current = null; scrim.remove();
        if (app) { if (oldHidden === null) app.removeAttribute('aria-hidden'); else app.setAttribute('aria-hidden', oldHidden); }
        if (previous && previous.isConnected && previous.getClientRects().length) previous.focus();
        resolve(value === 'cancel' ? null : value);
      }
      scrim.addEventListener('click', function (ev) { if (ev.target === scrim) finish(null); });
      current = { box: box, finish: finish };
      if (input) { input.focus(); input.select(); }
      else { var nodes = focusables(box); if (nodes.length) nodes[0].focus(); }
    });
  }
  document.addEventListener('keydown', function (ev) {
    if (!current) return;
    ev.stopImmediatePropagation();
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Escape') { ev.preventDefault(); current.finish(null); }
    else if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); current.finish('submit'); }
    else trap(ev, current.box);
  }, true);
  document.addEventListener('focusin', function (ev) {
    if (current && !current.box.contains(ev.target)) { var nodes = focusables(current.box); if (nodes.length) nodes[0].focus(); }
  });
  window.SBDialog = { open: open, trap: trap, active: function () { return !!current; } };
})();
