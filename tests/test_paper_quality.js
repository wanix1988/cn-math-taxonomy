/* 试卷质量分析：node tests/test_paper_quality.js */
'use strict';

var assert = require('assert');
var pq = require('../assets/paper-quality.js');

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
  assert.strictEqual(found[0].number, '2');
  assert.ok(found[0].y < 160 && found[0].y + found[0].h > 170);
  assert.ok(found[0].prompt.indexOf('第2个题目区域') >= 0);
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
  assert.strictEqual(found[0].number, '2');
  assert.strictEqual(found[0].kind, '圈出');
});

check('只有图片、还没标错题时提示去标注', function () {
  var report = pq.analyze([{ id: 'a', subject: 'math' }], []);
  assert.strictEqual(report.suggestions[0].title, '把错题记下来');
  assert.strictEqual(report.subjects[0].label, '数学');
  assert.strictEqual(report.subjects[0].paperCount, 1);
});

check('认出这份练习时，圈出的 17 按扣分计，满分默认 100', function () {
  var marks = [
    { number: '8', knowledge: '积的变化规律', reason: '概念不清', reasonNote: '以为可以拼在一起', studentAnswer: 'D.×6=', rightAnswer: 'C' },
    { number: '1', knowledge: '乘法估算', reason: '计算失误', reasonNote: '计算错误', studentAnswer: 'C.180000', rightAnswer: 'D' },
    { number: '6', knowledge: '乘法运算律', reason: '计算失误', reasonNote: '计算错误', studentAnswer: 'C.3', rightAnswer: 'B' }
  ];
  var summary = pq.summarizeExam({ title: '四年级数学·乘法与运算律', grade: '四年级', score: '83', total: '100' }, marks);
  assert.strictEqual(summary.title, '综评结论');
  assert.ok(summary.text.indexOf('第 1、6、8 题') >= 0);
  assert.ok(summary.text.indexOf('得分 83') >= 0);
  assert.ok(summary.text.indexOf('满分 100') >= 0);
  assert.ok(summary.text.indexOf('17 是扣分') >= 0);
  assert.ok(summary.text.indexOf('等级 A') >= 0);
  assert.ok(summary.text.indexOf('×10=') >= 0);
  assert.ok(summary.text.indexOf('35×100+1×') >= 0);
  assert.ok(summary.text.indexOf('1×35') < 0);
});

check('第3、4页按圈出的题写综评', function () {
  var marks = [
    { number: '15', rightAnswer: '交换', knowledge: '乘法交换律' },
    { number: '17', rightAnswer: '1000；100', reasonNote: '判断错误' },
    { number: '20', rightAnswer: '75' },
    { number: '23', rightAnswer: '1072' },
    { number: '26', rightAnswer: '1620人' }
  ];
  var summary = pq.summarizeExam({ title: '四年级数学·乘法与运算律', score: '83', total: '100' }, marks);
  assert.ok(summary.text.indexOf('第15、17、20、23、26题') >= 0);
  assert.ok(summary.text.indexOf('第16题的括号已经按先求和') >= 0);
  assert.ok(summary.text.indexOf('原因是判断错误') >= 0);
  assert.ok(summary.text.indexOf('交换律') >= 0);
  assert.ok(summary.text.indexOf('1072') >= 0);
  assert.ok(summary.text.indexOf('9000不是这道题的得数') >= 0);
  assert.ok(summary.text.indexOf('1620') >= 0);
  assert.ok(summary.text.indexOf('2044') >= 0);
  assert.ok(summary.text.indexOf('%') < 0);
});

check('没有错题时综评先空着', function () {
  var summary = pq.summarizeExam({ title: '练习', score: '', total: '' }, []);
  assert.ok(summary.text.indexOf('综评先空着') >= 0);
});

check('其他试卷按错题和错因写综评', function () {
  var summary = pq.summarizeExam({ title: '期中', grade: '五年级', subject: 'math', score: 18, total: '' }, [
    { number: '2', knowledge: '分数加减', reason: '概念不清', rightAnswer: 'A' }
  ]);
  assert.ok(summary.text.indexOf('五年级 期中') >= 0);
  assert.ok(summary.text.indexOf('得分 18') >= 0);
  assert.ok(summary.text.indexOf('满分 100') >= 0);
  assert.ok(summary.text.indexOf('第 2 题') >= 0);
  assert.ok(summary.text.indexOf('概念不清 1 道') >= 0);
  assert.ok(summary.text.indexOf('分数加减') >= 0);
  var rated = pq.summarizeExam({ title: '期末', subject: 'math', score: 80, total: 100 }, [
    { number: '3', knowledge: '小数乘法', reason: '计算失误' }
  ]);
  assert.ok(rated.text.indexOf('满分 100') >= 0);
});

check('认识更大的数按扣分 25 计，不套乘法卷的 83 分', function () {
  var marks = [
    { number: '2', knowledge: '线与角', reason: '概念不清', reasonNote: '不是自己试', studentAnswer: 'A.一定互相垂直', rightAnswer: 'C' },
    { number: '5', knowledge: '大数的写法', reason: '概念不清', reasonNote: '不分段', studentAnswer: 'B', rightAnswer: 'C' },
    { number: '7', knowledge: '大数与单位', reason: '计算失误', reasonNote: '认真算', studentAnswer: 'C.50吨', rightAnswer: 'A' },
    { number: '11', knowledge: '四舍五入', reason: '计算失误', reasonNote: '忘记四舍五入', studentAnswer: '713万', rightAnswer: '714万' }
  ];
  var summary = pq.summarizeExam({ title: '四年级数学·大数与线角', grade: '四年级', score: '75', total: '100' }, marks);
  assert.ok(summary.text.indexOf('得分 75') >= 0);
  assert.ok(summary.text.indexOf('25 是扣分') >= 0);
  assert.ok(summary.text.indexOf('第2、5、7、11题') >= 0);
  assert.ok(summary.text.indexOf('714万') >= 0);
  assert.ok(summary.text.indexOf('得分 83') < 0);
  assert.ok(summary.text.indexOf('第15') < 0);
});

check('认识更大的数第3、4页按这6道错题写，整份合在一起', function () {
  var back = [
    { number: '19', knowledge: '周角和平角', rightAnswer: '2；4', studentAnswer: '2；8' },
    { number: '20', knowledge: '角的度量', rightAnswer: '度，记作1°', studentAnswer: '角度' },
    { number: '22', knowledge: '画线段和垂线', rightAnswer: '按题画出3厘米线段、垂线和平行线' },
    { number: '23', knowledge: '大数的数位', rightAnswer: '（1）标出约34万；（2）标在33万右侧很近的位置' },
    { number: '24', knowledge: '零的读法', rightAnswer: '没有下划线的不连' },
    { number: '26', knowledge: '角的计算', rightAnswer: '写出过程', studentAnswer: '∠1=20°' }
  ];
  var only = pq.summarizeExam({ score: '75', total: '100' }, back);
  assert.ok(only.text.indexOf('第3、4页') >= 0);
  assert.ok(only.text.indexOf('第19、20、22、23、24、26题') >= 0);
  assert.ok(only.text.indexOf('25 是扣分') >= 0);
  assert.ok(only.text.indexOf('得分 75') >= 0);
  assert.ok(only.text.indexOf('4个直角') >= 0);
  var front = [
    { number: '2', knowledge: '线与角', rightAnswer: 'C' },
    { number: '5', knowledge: '大数的写法', rightAnswer: 'C' },
    { number: '7', knowledge: '大数与单位', rightAnswer: 'A' },
    { number: '11', knowledge: '四舍五入', rightAnswer: '714万' }
  ];
  var both = pq.summarizeExam({ score: '75', total: '100' }, front.concat(back));
  assert.ok(both.text.indexOf('第2、5、7、11题和第19、20、22、23、24、26题') >= 0);
  assert.ok(both.text.indexOf('得分 83') < 0);
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
        console.log(passed + ' passed');
      });
    });
  });
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
