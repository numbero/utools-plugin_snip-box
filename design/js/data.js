/*
 * Snippet Box · 演示数据与模拟上下文
 *
 * 设计稿用它驱动界面；阶段三会把 SEED_SNIPPETS 用作首次启动灌入的示例片段
 * （PRD §13 Q4），把 MOCK_CONTEXT 换成真实的上下文快照抓取。
 */
(function (global) {
  'use strict';

  /* 模拟「上下文快照」—— 真实插件里由 preload + utools API 在进入插件时一次性抓取并冻结 */
  var MOCK_CONTEXT = {
    now: new Date(2026, 8, 6, 22, 15, 3, 123),
    clipboard: 'feat(engine): 支持日期偏移语法',
    folder: '/Users/demo/Projects/snippet-box',
    url: {
      url: 'https://www.u-tools.cn/docs/developer/api-reference/utools/input.html',
      title: '输入 | uTools 开发者文档'
    },
    sys: {
      user: 'demo',
      home: '/Users/demo',
      hostname: 'MacBook-Pro.local',
      platform: 'macOS',
      os: 'darwin',
      arch: 'arm64',
      tmpdir: '/tmp',
      cwd: '/Users/demo/Projects/snippet-box',
      appVersion: '5.2.0',
      pluginVersion: '1.0.0'
    },
    variables: {}
  };

  /* 上下文缺失时的样子（用于演示 {{folder}} / {{url}} 的降级态） */
  var MOCK_CONTEXT_EMPTY = {
    now: MOCK_CONTEXT.now,
    clipboard: '',
    folder: null,
    url: null,
    sys: MOCK_CONTEXT.sys,
    variables: {}
  };

  var GROUPS = [
    { id: 'g-work', name: '工作', color: '#5B6BD6' },
    { id: 'g-life', name: '个人', color: '#1F8A54' },
    { id: 'g-reply', name: '回复话术', color: '#B0740F' }
  ];

  /* useCount / lastUsedAt 驱动智能排序（PRD FR-23） */
  var SEED_SNIPPETS = [
    {
      id: 's-commit',
      name: 'git commit 模板',
      group: 'g-work',
      keyword: 'commit',
      direct: true,
      pinned: true,
      useCount: 84,
      lastUsedAt: '2026-09-06 21:40',
      content: 'feat({{?scope}}): {{?改动}}\n\n#{{date:YYYY-MM-DD}} by {{user}}'
    },
    {
      id: 's-sign',
      name: '邮箱签名',
      group: 'g-work',
      keyword: 'sign',
      direct: true,
      pinned: true,
      useCount: 61,
      lastUsedAt: '2026-09-06 18:02',
      content: '——\n{{user}} · {{platform}} {{arch}}\n{{date:YYYY年MM月DD日}} {{weekday:short}}'
    },
    {
      id: 's-daily',
      name: '日报抬头',
      group: 'g-work',
      keyword: 'daily',
      direct: false,
      pinned: false,
      useCount: 37,
      lastUsedAt: '2026-09-05 19:30',
      content: '# 日报 {{date:-1d|YYYY/MM/DD}}（{{date:-1d|dddd}}）\n\n## 昨日完成\n- \n\n## 今日计划\n- \n\n## 风险\n- 无'
    },
    {
      id: 's-quote',
      name: '引用剪贴板',
      group: 'g-work',
      keyword: 'quote',
      direct: false,
      pinned: false,
      useCount: 29,
      lastUsedAt: '2026-09-06 14:11',
      content: '> {{clipboard:trim}}\n\n— 引自《{{url:title}}》 {{date:HH:mm}}\n  {{url}}'
    },
    {
      id: 's-mock',
      name: '测试数据 JSON',
      group: 'g-work',
      keyword: 'mock',
      direct: false,
      pinned: false,
      useCount: 22,
      lastUsedAt: '2026-09-04 11:20',
      content: '{ "id": "{{uuid:short}}", "token": "{{nanoid:12}}", "score": {{random:1-100}}, "role": "{{pick:admin|editor|viewer}}", "ts": "{{iso}}" }'
    },
    {
      id: 's-cd',
      name: '进入当前目录',
      group: 'g-work',
      keyword: '',
      direct: false,
      pinned: false,
      useCount: 12,
      lastUsedAt: '2026-09-03 09:15',
      content: 'cd {{folder}} && ls -la'
    },
    {
      id: 's-mdlink',
      name: 'Markdown 链接',
      group: 'g-life',
      keyword: 'mdlink',
      direct: false,
      pinned: false,
      useCount: 18,
      lastUsedAt: '2026-09-06 10:44',
      content: '[{{?标题}}]({{clipboard:trim}})'
    },
    {
      id: 's-vue',
      name: 'Vue 模板片段（转义演示）',
      group: 'g-life',
      keyword: 'vue',
      direct: false,
      pinned: false,
      useCount: 7,
      lastUsedAt: '2026-09-02 16:08',
      content: '<template>\n  <p>你好 \\{{ name }}，今天是 {{date}}</p>\n</template>'
    },
    {
      id: 's-reply-fix',
      name: '工单已修复回复',
      group: 'g-reply',
      keyword: 'fixed',
      direct: false,
      pinned: false,
      useCount: 45,
      lastUsedAt: '2026-09-06 17:25',
      content: '您好 {{?客户称呼}}，\n\n您反馈的「{{?问题描述=登录异常}}」已在 {{date:MM月DD日}} 修复上线，工单号 {{?工单号=T-}}。\n\n请清理缓存后重试，如仍有问题欢迎随时联系。\n\n{{user}}'
    },
    {
      id: 's-reply-wait',
      name: '需等待排期回复',
      group: 'g-reply',
      keyword: '',
      direct: false,
      pinned: false,
      useCount: 9,
      lastUsedAt: '2026-09-01 15:00',
      content: '您好 {{?客户称呼}}，\n\n该需求已记录（编号 {{?需求号}}），预计排期至 {{date:+2w|YYYY年MM月DD日}}（{{date:+2w|dddd}}）。\n\n我们会在上线后第一时间通知您。'
    },
    {
      id: 's-broken',
      name: '⚠ 错误态演示',
      group: '',
      keyword: '',
      direct: false,
      pinned: false,
      useCount: 0,
      lastUsedAt: '',
      content: '未知：{{foobar}}  非法格式：{{date:zzz}}  非法参数：{{random:abc}}  不成对：{{date'
    },
    {
      id: 's-ctx',
      name: '上下文缺失演示',
      group: '',
      keyword: '',
      direct: false,
      pinned: false,
      useCount: 0,
      lastUsedAt: '',
      content: '目录 {{folder}} · 链接 {{url}} · 剪贴板 {{clipboard}}'
    }
  ];

  global.SBData = {
    MOCK_CONTEXT: MOCK_CONTEXT,
    MOCK_CONTEXT_EMPTY: MOCK_CONTEXT_EMPTY,
    GROUPS: GROUPS,
    SEED_SNIPPETS: SEED_SNIPPETS
  };
})(typeof window !== 'undefined' ? window : globalThis);
