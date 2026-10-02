'use strict';

var assert = require('assert');
require('../js/engine.js');
var E = global.SnippetEngine;
var checks = 0;

function test(name, run) {
  run();
  checks++;
  console.log('ok ' + checks + ' - ' + name);
}

test('reserved property names are ordinary variables and are deduplicated', function () {
  var parsed = E.parse('{{?constructor}}/{{?__proto__}}/{{?toString}}/{{?constructor}}');
  assert.deepStrictEqual(parsed.variables.map(function (v) { return v.name; }),
    ['constructor', '__proto__', 'toString']);
  var values = Object.create(null);
  values.constructor = 'a';
  values.__proto__ = 'b';
  values.toString = 'c';
  assert.strictEqual(E.render('{{?constructor}}/{{?__proto__}}/{{?toString}}',
    { context: { variables: values } }).text, 'a/b/c');
});

test('filled values are literal text and HTML is escaped', function () {
  var rendered = E.render('{{?value}}', { context: { variables: {
    value: '{{date}}<script>"&\''
  } } });
  assert.strictEqual(rendered.text, '{{date}}<script>"&\'');
  assert.ok(rendered.html.indexOf('{{date}}&lt;script&gt;&quot;&amp;&#39;') >= 0);
  assert.strictEqual(rendered.html.indexOf('<script>'), -1);
});

test('inherited variable values do not count as supplied values', function () {
  var values = Object.create({ constructor: 'inherited' });
  var rendered = E.render('{{?constructor}}', { context: { variables: values } });
  assert.strictEqual(rendered.text, '{{?constructor}}');
  assert.strictEqual(rendered.variables.length, 1);
});

test('one multiline text segment respects the line cap', function () {
  var rendered = E.render('one\ntwo\nthree\nfour', { maxLines: 2 });
  assert.strictEqual(rendered.text, 'one\ntwo');
  assert.strictEqual(rendered.html, 'one\ntwo');
  assert.strictEqual(rendered.truncated, true);
});

test('a final visible line includes subsequent segments without false truncation', function () {
  var rendered = E.render('one\n{{clipboard}}tail', {
    maxLines: 2, context: { clipboard: 'two' }
  });
  assert.strictEqual(rendered.text, 'one\ntwotail');
  assert.strictEqual(rendered.truncated, false);
});

test('multiline resolved tokens truncate inside a complete token span', function () {
  var rendered = E.render('first\n{{clipboard}}tail', {
    maxLines: 3, context: { clipboard: '<second>\nthird\nfourth' }
  });
  assert.strictEqual(rendered.text, 'first\n<second>\nthird');
  assert.ok(rendered.html.indexOf('&lt;second&gt;\nthird</span>') >= 0);
  assert.strictEqual(rendered.html.indexOf('fourth'), -1);
  assert.strictEqual(rendered.truncated, true);
});

test('variables and issues are collected beyond a truncated preview', function () {
  var rendered = E.render('visible\n{{?later}} {{invalidPlaceholder}}', { maxLines: 1 });
  assert.strictEqual(rendered.text, 'visible');
  assert.strictEqual(rendered.variables[0].name, 'later');
  assert.strictEqual(rendered.issues[0].level, 'unknown');
});

test('clipboard line extraction handles CRLF and CR without carriage returns', function () {
  assert.strictEqual(E.render('{{clipboard:line:2}}',
    { context: { clipboard: 'one\r\ntwo\r\nthree' } }).text, 'two');
  assert.strictEqual(E.render('{{clipboard:line|2}}',
    { context: { clipboard: 'one\rtwo\rthree' } }).text, 'two');
  assert.strictEqual(E.render('{{clipboard}}',
    { context: { clipboard: 'one\r\ntwo' } }).text, 'one\r\ntwo');
});

test('line caps count CRLF once and preserve original line endings', function () {
  var rendered = E.render('one\r\ntwo\r\nthree', { maxLines: 2 });
  assert.strictEqual(rendered.text, 'one\r\ntwo');
  assert.strictEqual(rendered.truncated, true);
  assert.strictEqual(E.render('one\rtwo\rthree', { maxLines: 2 }).text, 'one\rtwo');
});

test('escaped and incomplete placeholders remain literal', function () {
  assert.strictEqual(E.render('\\{{date}} {{unclosed').text, '{{date}} {{unclosed');
  assert.strictEqual(E.render('{{?line\nbreak}}').text, '{{?line\nbreak}}');
});

test('alternate delimiters parse variables and dates', function () {
  var context = { now: new Date(2026, 9, 2, 8, 9, 10), variables: { name: 'Lin' } };
  assert.strictEqual(E.render('${?name} ${date}', { delimiter: 'dollar', context: context }).text,
    'Lin 2026-10-02');
  assert.strictEqual(E.render('[[?name]] [[date]]', { delimiter: 'bracket', context: context }).text,
    'Lin 2026-10-02');
});

test('date formatting, offsets and system values retain their behavior', function () {
  var context = { now: new Date(2026, 9, 2, 8, 9, 10, 123), sys: { user: 'Lin' } };
  assert.strictEqual(E.render('{{datetime}} {{date:-1d|YYYY/MM/DD}} {{weekday:en}} {{user}}',
    { context: context }).text, '2026-10-02 08:09:10 2026/10/01 Friday Lin');
  assert.strictEqual(E._internals.formatDate(context.now, 'hh:mm:ss.SSS A [at] HH'),
    '08:09:10.123 AM at 08');
});

console.log('Passed ' + checks + ' engine checks.');
