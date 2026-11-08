/* 试卷质量分析：node tests/test_paper_quality.js
 * 离线几何、统计、通用综评，以及 Agent 交接协议（请求包 / 结果校验 / 合并）。 */
'use strict';

var assert = require('assert');
var pq = require('../assets/paper-quality.js');
var pa = require('../assets/paper-agent.js');

var passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok ' + passed + ' ' + name);
}

function image(w, h, paint) {
  var data = new Uint8ClampedArray(w * h * 4);
  var i;
  for (i = 0; i < data.length; i += 4) {
    data[i] = 250;
    data[i + 1] = 250;
    data[i + 2] = 250;
    data[i + 3] = 255;
  }
  function dot(x, y) {
    var p = (y * w + x) * 4;
    data[p] = 210;
    data[p + 1] = 30;
    data[p + 2] = 40;
  }
  paint(dot);
  return { width: w, height: h, data: data };
}

check('红笔色块会成为候选错题，零星红点忽略', function () {
  var img = image(64, 64, function (dot) {
    var x, y;
    for (y = 16; y < 48; y++) for (x = 16; x < 48; x++) dot(x, y);
    dot(0, 0);
    dot(1, 0);
  });
  var boxes = pq.findRedMarks(img);
  assert.strictEqual(boxes.length, 1);
  assert.strictEqual(boxes[0].x, 16);
  assert.strictEqual(boxes[0].y, 16);
  assert.ok(boxes[0].w >= 32 && boxes[0].w <= 48);
  assert.ok(boxes[0].h >= 32 && boxes[0].h <= 48);
});

check('整页都是红色时不当成一道错题', function () {
  var img = image(64, 64, function (dot) {
    var x, y;
    for (y = 0; y < 64; y++) for (x = 0; x < 64; x++) dot(x, y);
  });
  assert.deepStrictEqual(pq.findRedMarks(img), []);
});

check('没有试卷时方案是先导入', function () {
  var report = pq.analyze([], []);
  assert.strictEqual(report.paperCount, 0);
  assert.strictEqual(report.suggestions[0].title, '先导入一份试卷');
});

check('同一知识点多次没收口时优先回补', function () {
  var papers = [
    { id: 'a', title: '期中', subject: 'math', examDate: '2026-10-01', score: 80, total: 100 },
    { id: 'b', title: '单元', subject: 'math', examDate: '2026-11-01', score: 60, total: 100 }
  ];
  var items = [
    { paperId: 'a', knowledge: '分数加减', reason: '概念不清', status: 'open' },
    { paperId: 'b', knowledge: '分数加减', reason: '概念不清', status: 'open' },
    { paperId: 'b', knowledge: '分数加减', reason: '计算失误', status: 'mastered' }
  ];
  var report = pq.analyze(papers, items);
  assert.strictEqual(report.open, 2);
  assert.strictEqual(report.mastered, 1);
  assert.strictEqual(report.knowledge[0].name, '分数加减');
  assert.strictEqual(report.knowledge[0].open, 2);
  assert.ok(report.suggestions.some(function (s) { return s.title.indexOf('优先回补「分数加减」') === 0; }));
  var tip = report.suggestions.filter(function (s) { return s.diagnose; })[0];
  assert.strictEqual(tip.diagnose, './');
  assert.strictEqual(tip.diagnoseLabel, '去数学诊断');
  assert.ok(report.suggestions.some(function (s) { return s.title === '先回到定义和一道例题'; }));
  assert.ok(report.suggestions.some(function (s) { return s.title === '先补重复错点再做整卷'; }));
  assert.ok(Math.abs(report.masteryRate - 1 / 3) < 1e-9);
});

check('回看两次仍错时建议换讲法', function () {
  var papers = [{ id: 'a', subject: 'chinese', examDate: '2026-09-01' }];
  var items = [{
    paperId: 'a',
    knowledge: '概括段落大意',
    reason: '审题不清',
    status: 'open',
    reviews: [{ result: 'still' }, { result: 'still' }]
  }];
  var report = pq.analyze(papers, items);
  assert.ok(report.suggestions.some(function (s) { return s.title === '换一种讲法'; }));
  var back = report.suggestions.filter(function (s) { return s.title.indexOf('概括段落大意') >= 0; })[0];
  assert.strictEqual(back.diagnose, './?subject=chinese');
});

function sheet(w, h) {
  var data = new Uint8ClampedArray(w * h * 4);
  var i;
  for (i = 0; i < data.length; i += 4) {
    data[i] = 250; data[i + 1] = 250; data[i + 2] = 250; data[i + 3] = 255;
  }
  function at(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    var p = (y * w + x) * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b;
  }
  return {
    width: w, height: h, data: data,
    ink: function (x0, y0, x1, y1) {
      var x, y;
      for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) at(x, y, 30, 30, 30);
    },
    pen: function (x, y) { at(x, y, 210, 30, 40); },
    blue: function (x, y) { at(x, y, 30, 60, 210); }
  };
}

check('正放的文字保持原方向，右缘对齐的文字转正', function () {
  function lines(alignRight) {
    var page = sheet(240, 200);
    var lens = [150, 120, 170, 100, 160, 130, 180, 110];
    var i, y;
    for (i = 0; i < lens.length; i++) {
      y = 16 + i * 22;
      if (alignRight) page.ink(222 - lens[i], y, 222, y + 6);
      else page.ink(16, y, 16 + lens[i], y + 6);
    }
    return page;
  }
  assert.strictEqual(pq.suggestRotation(lines(false)), 0);
  assert.strictEqual(pq.suggestRotation(lines(true)), 2);
});

check('旋转 90 度后框跟着走，转四次回到原处', function () {
  var box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  var once = pq.rotateBox(box, 1);
  assert.ok(Math.abs(once.x - 0.4) < 1e-9);
  assert.ok(Math.abs(once.y - 0.1) < 1e-9);
  assert.ok(Math.abs(once.w - 0.4) < 1e-9);
  assert.ok(Math.abs(once.h - 0.3) < 1e-9);
  var back = box;
  var i;
  for (i = 0; i < 4; i++) back = pq.rotateBox(back, 1);
  assert.ok(Math.abs(back.x - box.x) < 1e-9);
  assert.ok(Math.abs(back.y - box.y) < 1e-9);
  assert.ok(Math.abs(back.w - box.w) < 1e-9);
  assert.ok(Math.abs(back.h - box.h) < 1e-9);
});

check('同一题上的两处红笔合成一道，没批改的题不记', function () {
  var page = sheet(160, 320);
  page.ink(16, 30, 120, 38);
  page.ink(16, 44, 110, 52);
  page.ink(16, 150, 120, 158);
  page.ink(16, 166, 100, 174);
  var x, y;
  for (x = 0; x < 24; x++) for (y = 0; y < 24; y++) page.pen(120 + x, 148 + y);
  for (x = 0; x < 16; x++) for (y = 0; y < 10; y++) page.pen(40 + x, 170 + y);
  var found = pq.analyzePage(page);
  assert.strictEqual(found.length, 1);
  assert.ok(found[0].prompt.indexOf('题目区域') >= 0 || found[0].prompt.indexOf('第') >= 0);
  assert.ok(found[0].y < 160 && found[0].y + found[0].h > 170);
  assert.strictEqual(found[0].source, 'offline');
  assert.strictEqual(found[0].correction, '');
  assert.strictEqual(found[0].knowledge, '');
});

check('细叉号和蓝笔也能收成错题，页角小分数章略过', function () {
  var page = sheet(160, 240);
  var t;
  for (t = 0; t < 28; t++) {
    page.pen(40 + t, 80 + t);
    page.pen(40 + t, 81 + t);
    page.pen(68 - t, 80 + t);
    page.pen(68 - t, 81 + t);
  }
  var y, x;
  for (y = 4; y < 16; y++) for (x = 130; x < 150; x++) page.pen(x, y);
  var blue = sheet(160, 240);
  for (y = 90; y < 112; y++) for (x = 30; x < 58; x++) blue.blue(x, y);
  var reds = pq.analyzePage(page);
  var blues = pq.analyzePage(blue);
  assert.strictEqual(reds.length, 1);
  assert.ok(reds[0].kind === '叉号' || reds[0].kind === '批改');
  assert.strictEqual(blues.length, 1);
});

check('红圈按圈出记，整页发红不当成错题', function () {
  var page = sheet(80, 80);
  var x, y;
  for (y = 16; y < 64; y++) for (x = 16; x < 64; x++) {
    var edge = x < 22 || y < 22 || x >= 58 || y >= 58;
    if (edge) page.pen(x, y);
  }
  var ring = pq.analyzePage(page);
  assert.strictEqual(ring.length, 1);
  assert.strictEqual(ring[0].kind, '圈出');
  assert.strictEqual(ring[0].correction, '');
  assert.strictEqual(ring[0].reasonNote, '');
  var flood = sheet(64, 64);
  for (y = 0; y < 64; y++) for (x = 0; x < 64; x++) flood.pen(x, y);
  assert.deepStrictEqual(pq.analyzePage(flood), []);
});

check('对勾和它上方的划线不算错题，圈出的答案仍然算', function () {
  var page = sheet(160, 220);
  page.ink(16, 24, 110, 32);
  page.ink(16, 150, 110, 158);
  var x, y, t;
  for (x = 24; x < 96; x++) page.pen(x, 46);
  for (t = 0; t < 18; t++) page.pen(36 + t, 56 + t);
  for (t = 0; t < 24; t++) page.pen(54 + t, 74 - t);
  for (y = 140; y < 178; y++) for (x = 112; x < 150; x++) {
    var edge = x < 118 || y < 146 || x >= 144 || y >= 172;
    if (edge) page.pen(x, y);
  }
  var found = pq.analyzePage(page);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].kind, '圈出');
});

check('只有图片、还没标错题时提示去标注', function () {
  var report = pq.analyze([{ id: 'a', subject: 'math' }], []);
  assert.strictEqual(report.suggestions[0].title, '把错题记下来');
  assert.strictEqual(report.subjects[0].label, '数学');
  assert.strictEqual(report.subjects[0].paperCount, 1);
});

/* ===== 通用综评 ===== */

check('任意新试卷的综评只按录入信息生成，不套具体卷子', function () {
  var summary = pq.summarizeExam(
    { title: '七年级期中', grade: '七上', subject: 'math', score: 72, total: 100 },
    [
      { number: '12', knowledge: '一次函数', reason: '概念不清', reasonNote: '把 k 当成截距', studentAnswer: 'B', rightAnswer: 'C' },
      { number: '18', knowledge: '一元一次不等式', reason: '计算失误', studentAnswer: 'x>3', rightAnswer: 'x<3' }
    ]
  );
  assert.strictEqual(summary.source, 'offline');
  assert.ok(summary.text.indexOf('七年级期中') >= 0);
  assert.ok(summary.text.indexOf('得分 72') >= 0);
  assert.ok(summary.text.indexOf('第 12、18 题') >= 0);
  assert.ok(summary.text.indexOf('一次函数') >= 0);
  assert.ok(summary.text.indexOf('孩子答 B') >= 0);
  assert.ok(summary.text.indexOf('订正 C') >= 0);
  assert.ok(summary.text.indexOf('卷面旁注「把 k 当成截距」') >= 0);
  assert.ok(summary.text.indexOf('概念不清 1 道') >= 0);
  ['9000', '×10=', '四年级数学', '17 是扣分', '25 是扣分', '第16题', '判断错误', '交换律'].forEach(function (word) {
    assert.ok(summary.text.indexOf(word) < 0, '综评里不该出现旧卷内容：' + word);
  });
});

check('卷头扣分按字段写，不写死某一份卷的分数', function () {
  var one = pq.summarizeExam({ title: '单元卷', score: 75, total: 100, deduction: 25 }, [{ number: '2' }]);
  assert.ok(one.text.indexOf('25 是扣分') >= 0);
  var two = pq.summarizeExam({ title: '另一份卷', score: 91, total: 100, deduction: 9 }, [{ number: '5' }]);
  assert.ok(two.text.indexOf('9 是扣分') >= 0);
  assert.ok(two.text.indexOf('25') < 0);
});

check('Agent 综评优先，且标明来源', function () {
  var summary = pq.summarizeExam({ title: '练习', agentSummary: 'Agent 写的综评' }, [{ number: '1' }]);
  assert.strictEqual(summary.source, 'agent');
  assert.strictEqual(summary.text, 'Agent 写的综评');
});

check('没有错题时综评先空着', function () {
  var summary = pq.summarizeExam({ title: '练习', score: '', total: '' }, []);
  assert.ok(summary.text.indexOf('综评先空着') >= 0);
  assert.strictEqual(summary.source, 'offline');
});

check('离线分析不再给任何试卷预填标题、得分或订正', function () {
  var page = sheet(160, 220);
  var x, y;
  for (y = 40; y < 70; y++) for (x = 20; x < 50; x++) page.pen(x, y);
  var found = pq.analyzePage(page);
  assert.ok(found.length >= 1);
  found.forEach(function (q) {
    assert.strictEqual(q.correction, '');
    assert.strictEqual(q.knowledge, '');
    assert.strictEqual(q.reason, '');
    assert.strictEqual(q.source, 'offline');
  });
  assert.ok(!found.sheet || !found.sheet.score, '离线不该猜得分');
  assert.ok(!found.sheet || !found.sheet.title, '离线不该写死试卷名');
});

/* ===== Agent 交接协议 ===== */

var BUNDLE = {
  title: '', grade: '', subject: 'math', score: '', total: '100',
  pages: [{
    id: 'g1', width: 800, height: 1000, sourceName: 'page1.jpg',
    marks: [
      { id: 'w1', number: '3', x: 0.1, y: 0.2, w: 0.2, h: 0.05, kind: '圈出', numberConfident: true, prompt: '自动标出：第3题，圈出', knowledge: '', reason: '', rightAnswer: '' },
      { id: 'w2', number: '7', x: 0.6, y: 0.5, w: 0.2, h: 0.05, kind: '叉号', numberConfident: false, prompt: '自动标出', knowledge: '', reason: '', rightAnswer: '' }
    ]
  }]
};

var AGENT_RESULT = {
  schemaVersion: 1,
  kind: 'paper-analysis-result',
  paper: {
    title: '新卷', grade: '七上', subject: 'math', score: 88, total: 100,
    summary: 'Agent 写的综评', suggestions: ['先补分数', '再做变式']
  },
  pages: [{
    index: 0,
    items: [
      { number: '3', prompt: '题目原文', knowledge: '分数加减', reason: '计算失误', reasonNote: '算错', studentAnswer: 'B', rightAnswer: 'A', x: 0.1, y: 0.2, w: 0.2, h: 0.05 },
      { number: '9', prompt: '离线漏掉的题', knowledge: '小数乘法', x: 0.3, y: 0.7, w: 0.2, h: 0.05 }
    ]
  }]
};

check('请求包含页、候选框、词表和输出格式，默认不带照片', function () {
  var req = pq.buildAgentRequest(BUNDLE, { knowledgeCatalog: ['分数加减', '小数乘法'] });
  assert.strictEqual(req.schemaVersion, pq.AGENT_SCHEMA_VERSION);
  assert.strictEqual(req.kind, 'paper-analysis-request');
  assert.strictEqual(req.pages.length, 1);
  assert.strictEqual(req.pages[0].image, null);
  assert.strictEqual(req.pages[0].candidates.length, 2);
  assert.strictEqual(req.pages[0].candidates[0].box.x, 0.1);
  assert.strictEqual(req.pages[0].candidates[0].numberConfident, true);
  assert.strictEqual(req.catalog.knowledgeHints[0], '分数加减');
  assert.ok(req.instructions.indexOf('JSON') >= 0);
  assert.ok(req.instructions.indexOf('概念不清') >= 0);
  assert.ok(req.outputSchema.pages[0].items[0].reason.indexOf('概念不清') >= 0);
});

check('勾选后才把照片放进请求包', function () {
  var withPhoto = {
    pages: [{ marks: BUNDLE.pages[0].marks, imageDataUrl: 'data:image/jpeg;base64,AAAA' }]
  };
  var req = pq.buildAgentRequest(withPhoto, { includeImages: true });
  assert.strictEqual(req.pages[0].image, 'data:image/jpeg;base64,AAAA');
  var req2 = pq.buildAgentRequest(withPhoto, { includeImages: false });
  assert.strictEqual(req2.pages[0].image, null);
});

check('解析 Agent 回复：代码块、前后说明和非法内容', function () {
  assert.strictEqual(pq.parseAgentText('```json\n{"a":1}\n```').a, 1);
  assert.strictEqual(pq.parseAgentText('以下是结果：\n{"a":2}\n以上').a, 2);
  assert.throws(function () { pq.parseAgentText('没有 JSON'); });
  assert.throws(function () { pq.parseAgentText('```json\n{bad json}\n```'); });
});

check('结果校验：清洗错因、夹住坐标、拒绝错格式', function () {
  var raw = {
    schemaVersion: 1, kind: 'paper-analysis-result',
    paper: { title: '新卷' },
    pages: [{ index: 0, items: [{ number: '3', reason: '外星人干扰', x: 2, y: -1, w: 0.2, h: 0.1 }] }]
  };
  var v = pq.validateAgentResult(raw);
  assert.ok(v.ok);
  assert.strictEqual(v.result.pages[0].items[0].reason, '');
  assert.ok(v.warnings.some(function (w) { return w.indexOf('错因') >= 0; }));
  assert.strictEqual(v.result.pages[0].items[0].box, null, '起点被夹到边界后框宽为 0，应视为没给框');
  var edge = pq.validateAgentResult({ pages: [{ items: [{ x: 0.8, y: 0.9, w: 0.6, h: 0.5 }] }] });
  assert.ok(Math.abs(edge.result.pages[0].items[0].box.w - 0.2) < 1e-9);
  assert.ok(Math.abs(edge.result.pages[0].items[0].box.h - 0.1) < 1e-9);
  assert.strictEqual(pq.validateAgentResult({ kind: 'not-a-result', pages: [] }).ok, false);
  assert.strictEqual(pq.validateAgentResult({ schemaVersion: 99 }).ok, false);
  assert.strictEqual(pq.validateAgentResult({ pages: 'oops' }).ok, false);
  assert.strictEqual(pq.validateAgentResult('```json\n' + JSON.stringify(raw) + '\n```').ok, true);
});

check('合并结果：按题号更新、漏掉的题新建、卷头字段与综评写入', function () {
  var out = pq.applyAgentResult(BUNDLE, AGENT_RESULT);
  assert.strictEqual(out.applied.updated, 1);
  assert.strictEqual(out.applied.created, 1);
  var page = out.bundle.pages[0];
  assert.strictEqual(page.marks.length, 2, '没被 Agent 对上的自动标记应清掉');
  assert.strictEqual(out.applied.pruned, 1);
  var q3 = page.marks.filter(function (m) { return m.number === '3'; })[0];
  assert.strictEqual(q3.knowledge, '分数加减');
  assert.strictEqual(q3.rightAnswer, 'A');
  assert.strictEqual(q3.prompt, '题目原文');
  assert.strictEqual(q3.reason, '计算失误');
  assert.ok(page.marks.some(function (m) { return m.number === '9' && m.agent; }));
  assert.strictEqual(out.bundle.title, '新卷');
  assert.strictEqual(out.bundle.score, '88');
  assert.strictEqual(out.bundle.agentSummary, 'Agent 写的综评');
  assert.deepStrictEqual(out.bundle.agentSuggestions, ['先补分数', '再做变式']);
  assert.strictEqual(pq.summarizeExam(out.bundle, page.marks).source, 'agent');
  assert.strictEqual(BUNDLE.pages[0].marks[0].knowledge, '', '入参不该被修改');
});

check('合并结果：默认不覆盖人工已填，可显式覆盖', function () {
  var manual = JSON.parse(JSON.stringify(BUNDLE));
  manual.pages[0].marks[0].knowledge = '人工填的知识点';
  var out = pq.applyAgentResult(manual, AGENT_RESULT);
  assert.strictEqual(out.bundle.pages[0].marks.filter(function (m) { return m.number === '3'; })[0].knowledge, '人工填的知识点');
  var forced = pq.applyAgentResult(manual, AGENT_RESULT, { overwrite: true });
  assert.strictEqual(forced.bundle.pages[0].marks.filter(function (m) { return m.number === '3'; })[0].knowledge, '分数加减');
});

check('合并结果：题号对不上时按框匹配，重复导入是幂等的', function () {
  var byBox = {
    schemaVersion: 1, kind: 'paper-analysis-result',
    paper: {}, pages: [{ index: 0, items: [{ prompt: '按框匹配', knowledge: '角的度量', x: 0.6, y: 0.5, w: 0.2, h: 0.05 }] }]
  };
  var out = pq.applyAgentResult(BUNDLE, byBox);
  assert.strictEqual(out.applied.updated, 1);
  assert.strictEqual(out.applied.created, 0);
  var q7 = out.bundle.pages[0].marks.filter(function (m) { return m.number === '7'; })[0];
  assert.strictEqual(q7.knowledge, '角的度量');
  var once = pq.applyAgentResult(BUNDLE, AGENT_RESULT);
  var twice = pq.applyAgentResult(once.bundle, AGENT_RESULT);
  assert.deepStrictEqual(twice.applied, { updated: 0, created: 0, paperFields: 0, pruned: 0 });
  assert.strictEqual(twice.bundle.pages[0].marks.length, once.bundle.pages[0].marks.length);
});

check('请求包带卷头线索，提示词能脱离请求包单独使用', function () {
  var bundle = JSON.parse(JSON.stringify(BUNDLE));
  bundle.headerHint = '83';
  bundle.deduction = '';
  var req = pq.buildAgentRequest(bundle, {});
  assert.strictEqual(req.paper.headerHint, '83');
  assert.ok(req.instructions.indexOf('共 2 个离线候选') >= 0, '候选总数不能写成每页 2 个');
  assert.ok(req.instructions.indexOf('#3*[0.1,0.2,0.2,0.05]') >= 0, '提示词要直接列出候选框');
  assert.ok(req.instructions.indexOf('一张照片可能拍到跨页') >= 0);
  assert.ok(req.instructions.indexOf('照片必须随请求一起提供') >= 0);
  assert.ok(req.instructions.indexOf('83') >= 0, '卷头读到的数字要作为线索交给 Agent');
  assert.ok(req.outputSchema.pages[0].items[0].match.indexOf('new') >= 0);
});

check('同题号但位置对不上时不误合并，未确认的自动标记被清掉', function () {
  var bundle = {
    pages: [{ marks: [
      { id: 'a', number: '12', x: 0.89, y: 0.46, w: 0.03, h: 0.04, prompt: '自动标出：第12题，圈出', source: 'offline', auto: true, knowledge: '', reason: '' },
      { id: 'b', number: '7', x: 0.6, y: 0.5, w: 0.2, h: 0.05, prompt: '人工补的题', knowledge: '分数加减' }
    ] }]
  };
  var result = { pages: [{ index: 0, items: [
    { number: '12', prompt: '真正的第12题', knowledge: '单位换算', x: 0.55, y: 0.37, w: 0.2, h: 0.1 }
  ] }] };
  var out = pq.applyAgentResult(bundle, result);
  assert.strictEqual(out.applied.created, 1);
  assert.strictEqual(out.applied.updated, 0);
  assert.strictEqual(out.applied.pruned, 1);
  assert.strictEqual(out.bundle.pages[0].marks.length, 2);
  var q12 = out.bundle.pages[0].marks.filter(function (m) { return m.number === '12'; })[0];
  assert.strictEqual(q12.x, 0.55, '新错题用 Agent 给的框，不要落到远处误认的框上');
  assert.ok(out.bundle.pages[0].marks.some(function (m) { return m.number === '7' && m.knowledge === '分数加减'; }), '人工标的不被清掉');
  var again = pq.applyAgentResult(out.bundle, result);
  assert.deepStrictEqual(again.applied, { updated: 0, created: 0, paperFields: 0, pruned: 0 });
  var forced = pq.applyAgentResult(bundle, { pages: [{ index: 0, items: [
    { number: '12', match: 'number', prompt: '强制按题号合并', x: 0.55, y: 0.37, w: 0.2, h: 0.1 }
  ] }] });
  assert.strictEqual(forced.applied.updated, 1, 'match:number 是显式逃生口');
  var kept = pq.applyAgentResult(bundle, result, { keepOffline: true });
  assert.strictEqual(kept.applied.pruned, 0);
  assert.strictEqual(kept.bundle.pages[0].marks.length, 3);
});

check('Agent 能改正默认的满分 100，人工改过的满分不被覆盖', function () {
  var res = { paper: { total: 120, score: 105 }, pages: [] };
  assert.strictEqual(pq.applyAgentResult({ total: '100', totalEdited: false, pages: [] }, res).bundle.total, '120');
  assert.strictEqual(pq.applyAgentResult({ total: '100', totalEdited: true, pages: [] }, res).bundle.total, '100');
  assert.strictEqual(pq.applyAgentResult({ total: '100', totalEdited: true, pages: [] }, res, { overwrite: true }).bundle.total, '120');
});

check('match:new 的错题重复导入仍然幂等', function () {
  var bundle = { title: '', pages: [{ marks: [
    { id: 'off1', x: 0.2, y: 0.2, w: 0.1, h: 0.05, auto: true, source: 'offline', number: '5', prompt: '自动标出：从上往下第5个题目区域，圈出' }
  ] }] };
  var res = { paper: {}, pages: [{ index: 0, items: [
    { number: '六(一)2', prompt: '补充思维导图', match: 'new', x: 0.4, y: 0.3, w: 0.2, h: 0.08 },
    { number: '六(二)1', prompt: '解释千辛万苦', match: 'new', x: 0.4, y: 0.5, w: 0.2, h: 0.08 }
  ] }] };
  var first = pq.applyAgentResult(bundle, res);
  assert.strictEqual(first.applied.created, 2);
  assert.strictEqual(first.applied.pruned, 1, '没被认领的自动标记要清掉');
  var second = pq.applyAgentResult(first.bundle, res);
  assert.strictEqual(second.applied.created, 0, '强制新建不能让重复导入一次多一批');
  assert.strictEqual(second.bundle.pages[0].marks.length, first.bundle.pages[0].marks.length);
  assert.deepStrictEqual(second.applied, { updated: 0, created: 0, paperFields: 0, pruned: 0 });
});

check('预填的年级学科可被卷面结果纠正，人工改过的不动', function () {
  var res = { paper: { grade: '四年级', subject: 'chinese' }, pages: [] };
  var prefilled = { grade: '五年级', subject: 'math', gradeEdited: false, subjectEdited: false, pages: [] };
  var fixed = pq.applyAgentResult(prefilled, res).bundle;
  assert.strictEqual(fixed.grade, '四年级');
  assert.strictEqual(fixed.subject, 'chinese');
  var manual = { grade: '五年级', subject: 'math', gradeEdited: true, subjectEdited: true, pages: [] };
  var kept = pq.applyAgentResult(manual, res).bundle;
  assert.strictEqual(kept.grade, '五年级');
  assert.strictEqual(kept.subject, 'math');
  var forced = pq.applyAgentResult(manual, res, { overwrite: true }).bundle;
  assert.strictEqual(forced.grade, '四年级');
});

check('综评的题号清单去重，重复小题仍逐条统计', function () {
  var marks = [
    { number: '24', knowledge: '多边形内角和', reason: '概念不清' },
    { number: '24', knowledge: '多边形内角和逆推', reason: '计算失误' },
    { number: '12', knowledge: '单位换算' }
  ];
  var s = pq.summarizeExam({ title: '阶段卷', score: 83, total: 100 }, marks);
  assert.ok(s.text.indexOf('共记下 3 道错题') >= 0);
  assert.ok(s.text.indexOf('第 12、24 题') >= 0);
  assert.ok(s.text.indexOf('24、24') < 0);
  assert.ok(s.text.indexOf('错因里概念不清 1 道，计算失误 1 道') >= 0);
});

check('非法结果不会被合并进去', function () {
  assert.throws(function () { pq.applyAgentResult(BUNDLE, { kind: 'wrong' }); });
  assert.throws(function () { pq.applyAgentResult(BUNDLE, '不是 JSON'); });
});

check('同一份照片判为重复试卷，另一份照片可以录入', function () {
  var stored = [{ id: 'p1', title: '五年级阶段巩固', pages: [{ sourceDigest: 'aaa' }, { sourceDigest: 'bbb' }] }];
  var again = pq.duplicateOf([{ sourceDigest: 'bbb' }], stored, '');
  assert.strictEqual(again.reason, 'stored');
  assert.strictEqual(again.title, '五年级阶段巩固');
  assert.ok(pq.duplicateMessage(again).indexOf('五年级阶段巩固') >= 0);
  assert.strictEqual(pq.duplicateOf([{ sourceDigest: 'ccc' }], stored, ''), null);
  var twice = pq.duplicateOf([{ sourceDigest: 'ccc' }, { sourceDigest: 'ccc' }], stored, '');
  assert.strictEqual(twice.reason, 'repeat');
  assert.strictEqual(pq.duplicateOf([{ sourceDigest: 'aaa' }], stored, 'p1'), null);
});

check('试卷导入页能渲染 Agent 交接卡片（无需浏览器）', function () {
  var fs = require('fs');
  var vm = require('vm');
  var path = require('path');
  var code = fs.readFileSync(path.join(__dirname, '../diagnose/papers.js'), 'utf8');
  var root = {
    innerHTML: '',
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  var sandbox = {
    window: { CnmPapers: pq, CnmPaperAgent: pa, addEventListener: function () {} },
    document: {
      getElementById: function (id) { return id === 'root' ? root : null; },
      querySelectorAll: function () { return []; },
      body: { classList: { toggle: function () {} } },
      addEventListener: function () {}
    },
    location: { hash: '#/new', search: '' },
    URLSearchParams: URLSearchParams,
    navigator: { clipboard: null },
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console,
    Promise: Promise,
    Date: Date,
    Blob: Blob,
    FileReader: function () {},
    Image: function () {},
    confirm: function () { return false; }
  };
  vm.runInNewContext(code, sandbox, { filename: 'papers.js' });
  assert.ok(root.innerHTML.indexOf('id="pa-card"') >= 0, '页面没有渲染 Agent 卡片');
  ['pa-copy', 'pa-download', 'pa-result', 'pa-paste', 'pa-paste-apply', 'pa-toggle', 'pa-analyze', 'pa-include-images', 'pa-overwrite', 'pa-msg'].forEach(function (id) {
    assert.ok(root.innerHTML.indexOf('id="' + id + '"') >= 0, '缺少界面元素 ' + id);
  });
  assert.ok(root.innerHTML.indexOf('照片默认不离开这台设备') >= 0);
});

check('直连模型默认关闭，端点自动补 chat/completions', function () {
  var cfg = pa.loadConfig();
  assert.strictEqual(cfg.enabled, false, '默认不能发送照片');
  assert.strictEqual(pa.endpointUrl('https://example.com/v1'), 'https://example.com/v1/chat/completions');
  assert.strictEqual(pa.endpointUrl('https://example.com/v1/chat/completions'), 'https://example.com/v1/chat/completions');
});

check('请求体带提示词和照片，没有照片的页跳过', function () {
  var req = pq.buildAgentRequest({
    pages: [
      { imageDataUrl: 'data:image/jpeg;base64,AAAA', sourceName: 'p1.jpg' },
      { imageDataUrl: null }
    ]
  }, { includeImages: true });
  var built = pa.buildRequestBody(req, { model: 'vision-x', jsonMode: false });
  assert.strictEqual(built.imageCount, 1);
  assert.strictEqual(built.body.model, 'vision-x');
  assert.ok(built.body.messages[0].content.indexOf('JSON') >= 0);
  assert.ok(built.body.messages[1].content.some(function (part) { return part.type === 'image_url'; }));
  assert.ok(!built.body.response_format);
});

Promise.resolve().then(function () {
  var one = new Blob(['page-a']);
  var two = new Blob(['page-a']);
  var other = new Blob(['page-b']);
  return pq.digestBlob(one).then(function (a) {
    return pq.digestBlob(two).then(function (b) {
      return pq.digestBlob(other).then(function (c) {
        assert.ok(a && a === b);
        assert.notStrictEqual(a, c);
        passed++;
        console.log('ok ' + passed + ' 同一张照片的摘要相同');
        return pq.blobToDataUrl(new Blob(['abc'], { type: 'image/jpeg' })).then(function (url) {
          assert.ok(url.indexOf('data:image/jpeg;base64,') === 0);
          passed++;
          console.log('ok ' + passed + ' 勾选后照片可以转成 data URL');
          var req = pq.buildAgentRequest({ pages: [{ imageDataUrl: 'data:image/png;base64,AAAA' }] }, { includeImages: true });
          return pa.analyze(req, { enabled: false, endpoint: 'https://x/v1', model: 'vision-x' }, function () {
            throw new Error('默认关闭时不该发起请求');
          }).then(function () {
            throw new Error('默认关闭时应该拒绝');
          }, function (err) {
            assert.ok(err.message.indexOf('没有开启') >= 0);
          });
        }).then(function () {
          passed++;
          console.log('ok ' + passed + ' 直连默认关闭时不发送照片');
          var req = pq.buildAgentRequest({ pages: [{ imageDataUrl: 'data:image/png;base64,AAAA' }] }, { includeImages: true });
          var cfg = { enabled: true, endpoint: 'https://x/v1', model: 'vision-x', apiKey: 'k', timeoutMs: 2000, jsonMode: false };
          var seen = null;
          var fake = function (url, init) {
            seen = { url: url, init: init };
            return Promise.resolve({
              ok: true,
              json: function () {
                return Promise.resolve({ choices: [{ message: { content: '```json\n' + JSON.stringify(AGENT_RESULT) + '\n```' } }] });
              }
            });
          };
          return pa.analyze(req, cfg, fake).then(function (out) {
            assert.ok(seen.url.indexOf('/chat/completions') >= 0);
            assert.ok(seen.init.headers.Authorization.indexOf('Bearer k') >= 0);
            assert.strictEqual(out.imageCount, 1);
            assert.ok(pq.validateAgentResult(out.result).ok);
            passed++;
            console.log('ok ' + passed + ' 直连返回的结果可以直接通过协议校验');
          });
        }).then(function () {
          var noPhoto = pq.buildAgentRequest({ pages: [{}] }, { includeImages: true });
          return pa.analyze(noPhoto, { enabled: true, endpoint: 'https://x/v1', model: 'vision-x' }, function () {
            throw new Error('没有照片时不该发起请求');
          }).then(function () {
            throw new Error('没有照片时应该拒绝');
          }, function (err) {
            assert.ok(err.message.indexOf('没有照片') >= 0);
            passed++;
            console.log('ok ' + passed + ' 请求包没有照片时拒绝发送');
          });
        }).then(function () {
          console.log(passed + ' passed');
        });
      });
    });
  });
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
