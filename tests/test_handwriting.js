/* 书写质量：node tests/test_handwriting.js */
'use strict';

var assert = require('assert');
var hw = require('../assets/handwriting.js');

var passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok ' + passed + ' ' + name);
  } catch (err) {
    console.error('FAIL ' + name);
    throw err;
  }
}

var INK = [28, 28, 32];

function blank(w, h, rgb) {
  rgb = rgb || [248, 246, 240];
  var data = new Uint8ClampedArray(w * h * 4);
  var i;
  for (i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { width: w, height: h, data: data };
}

function pixel(img, x, y, rgb) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  var p = (y * img.width + x) * 4;
  img.data[p] = rgb[0];
  img.data[p + 1] = rgb[1];
  img.data[p + 2] = rgb[2];
  img.data[p + 3] = 255;
}

function hLine(img, x, y, w, rgb) {
  var i, t;
  for (i = 0; i < w; i++) for (t = 0; t < 2; t++) pixel(img, x + i, y + t, rgb);
}

function vLine(img, x, y, h, rgb) {
  var i, t;
  for (i = 0; i < h; i++) for (t = 0; t < 2; t++) pixel(img, x + t, y + i, rgb);
}

function hanzi(img, x, y, size, rgb) {
  rgb = rgb || INK;
  hLine(img, x, y + (size >> 1) - 1, size, rgb);
  vLine(img, x + (size >> 1) - 1, y, size, rgb);
  hLine(img, x, y + 1, size, rgb);
  hLine(img, x, y + size - 3, size, rgb);
}

function hanziBox(img, x, y, w, h, rgb) {
  rgb = rgb || INK;
  hLine(img, x, y + (h >> 1) - 1, w, rgb);
  vLine(img, x + (w >> 1) - 1, y, h, rgb);
  hLine(img, x, y + 1, w, rgb);
  hLine(img, x, y + h - 3, w, rgb);
}

function letter(img, x, y, w, h, rgb) {
  rgb = rgb || INK;
  vLine(img, x, y, h, rgb);
  hLine(img, x, y + (h >> 1), w, rgb);
}

function skew(img, x, y, w, h, shift, rgb) {
  rgb = rgb || INK;
  hLine(img, x + shift, y + 1, w, rgb);
  hLine(img, x, y + h - 3, w, rgb);
  var mid = h >> 1;
  hLine(img, x, y + mid, shift + 2, rgb);
  vLine(img, x + shift, y + 1, mid, rgb);
  vLine(img, x, y + mid, h - mid, rgb);
}

function solid(img, x, y, w, h, rgb) {
  rgb = rgb || INK;
  var yy, xx;
  for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) pixel(img, x + xx, y + yy, rgb);
}

function neatChinese() {
  var img = blank(520, 420);
  var counts = [8, 6, 7, 5];
  var row, col, y;
  for (row = 0; row < 4; row++) {
    y = 28 + row * 90;
    for (col = 0; col < counts[row]; col++) hanzi(img, 28 + col * 28, y, 16);
  }
  return img;
}

function dump(report) {
  return JSON.stringify({
    ok: report.ok,
    message: report.message,
    script: report.script,
    score: report.score,
    verdict: report.verdict,
    marks: report.marks,
    dimensions: report.dimensions,
    lines: report.lineCount,
    glyphs: report.glyphCount,
    suggestions: report.suggestions
  });
}

check('空白页不打分', function () {
  var report = hw.assess(blank(200, 160));
  assert.strictEqual(report.ok, false);
});

check('红笔不当作手写', function () {
  var img = blank(240, 180);
  var y, x;
  for (y = 40; y < 80; y++) for (x = 40; x < 120; x++) pixel(img, x, y, [210, 40, 40]);
  assert.strictEqual(hw.assess(img).ok, false);
});

check('工整中文逐字表扬', function () {
  var report = hw.assess(neatChinese());
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'zh', dump(report));
  assert.ok(report.score >= 85, dump(report));
  assert.ok(report.marks.length >= 20, dump(report));
  report.marks.forEach(function (m) {
    assert.strictEqual(m.text, '写得工整', dump(report));
    assert.strictEqual(m.level, 'good');
  });
  assert.strictEqual(report.suggestions[0].title, '写得工整');
  assert.strictEqual(report.verdict, '工整');
  assert.deepStrictEqual(report.dimensions.map(function (d) { return d.label; }), ['笔画', '结构', '章法']);
});

check('中文字太挤时标出拉开字距', function () {
  var img = blank(420, 280);
  var row, col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 8; col++) hanzi(img, 24 + col * 17, 30 + row * 80, 16);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'zh', dump(report));
  assert.ok(report.marks.some(function (m) { return m.text === '拉开字距'; }), dump(report));
  assert.ok(report.suggestions.some(function (s) { return s.title === '拉开字距' && s.detail; }));
  report.marks.forEach(function (m) {
    assert.strictEqual(m.text.length, 4);
    assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.w <= 1.01 && m.y + m.h <= 1.01);
  });
});

check('逗号不参与字距', function () {
  var img = blank(560, 300);
  var row, col, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 30 + row * 90;
    for (col = 0; col < 8; col++) {
      if (col === 4) {
        solid(img, x + 10, y + 8, 4, 4);
        x += 28;
      }
      hanzi(img, x, y, 16);
      x += 28;
    }
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'zh', dump(report));
  assert.ok(!report.marks.some(function (m) {
    return m.text === '字距写匀' || m.text === '字距收拢' || m.text === '拉开字距';
  }), dump(report));
});

check('空出的标点格不算字距', function () {
  var img = blank(700, 300);
  var row, col, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 28 + row * 90;
    for (col = 0; col < 8; col++) {
      if (col === 4) x += 30;
      hanzi(img, x, y, 16);
      x += 30;
    }
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.ok(!report.marks.some(function (m) {
    return m.text === '字距写匀' || m.text === '字距收拢' || m.text === '拉开字距';
  }), dump(report));
});

check('中文大小不一时标出大小匀称', function () {
  var img = blank(460, 220);
  var heights = [10, 22, 11, 24, 12, 23, 10, 22];
  var bottom = 70;
  heights.forEach(function (h, i) {
    hanziBox(img, 24 + i * 32, bottom - h, 16, h);
  });
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.ok(report.marks.some(function (m) {
    return (m.text === '写大一些' || m.text === '写小一些') && m.place === 'char' && m.w < 0.2 && m.h < 0.3;
  }), dump(report));
});

check('中文字心不稳时标出字心成行', function () {
  var img = blank(460, 260);
  var offsets = [0, 6, -2, 8, 1, 7, -4, 5];
  var row;
  for (row = 0; row < 3; row++) {
    offsets.forEach(function (dy, i) {
      hanzi(img, 24 + i * 32, 24 + row * 80 + dy, 16);
    });
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.ok(report.marks.some(function (m) { return m.text === '字心成行' && m.place === 'char' && m.h < 0.25; }), dump(report));
  assert.ok(!report.marks.some(function (m) { return m.text === '底部对齐'; }), dump(report));
});

check('中文写斜时标出横平竖直', function () {
  var img = blank(520, 300);
  var row, col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 6; col++) skew(img, 24 + col * 36, 28 + row * 84, 14, 16, 6);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'zh', dump(report));
  assert.ok(report.marks.some(function (m) { return m.text === '横平竖直'; }), dump(report));
});

check('字太淡时标出用笔扎实', function () {
  var img = blank(420, 300);
  var row, col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 6; col++) hanzi(img, 24 + col * 32, 28 + row * 80, 16, [186, 186, 186]);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.ok(report.marks.some(function (m) { return m.text === '用笔扎实'; }), dump(report));
});

check('涂黑一块时标出笔画干净', function () {
  var img = neatChinese();
  solid(img, 40, 360, 28, 28);
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.ok(report.marks.some(function (m) { return m.text === '笔画干净'; }), dump(report));
});

check('行首不齐时标出行款整齐', function () {
  var img = blank(480, 420);
  var starts = [20, 48, 18, 52];
  var row, col;
  for (row = 0; row < 4; row++) {
    for (col = 0; col < 6; col++) hanzi(img, starts[row] + col * 30, 24 + row * 90, 16);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  var margin = report.marks.filter(function (m) { return m.text === '行款整齐'; })[0];
  assert.ok(margin, dump(report));
  assert.ok(margin.place === 'col' || margin.place === 'char', dump(report));
  assert.ok(margin.x > 0.02 && margin.x < 0.2, dump(report));
  assert.ok(margin.w < 0.28, dump(report));
});

check('行距太密时标出行距拉开', function () {
  var img = blank(420, 220);
  var row, col;
  for (row = 0; row < 4; row++) {
    for (col = 0; col < 6; col++) hanzi(img, 24 + col * 30, 16 + row * 20, 16);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  var lead = report.marks.filter(function (m) { return m.text === '行距拉开'; })[0];
  assert.ok(lead, dump(report));
  assert.strictEqual(lead.place, 'line');
  assert.ok(lead.h > 0.04, dump(report));
});

check('英文手写认成英文', function () {
  var img = blank(560, 280);
  var row, word, letterIndex, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 30 + row * 80;
    for (word = 0; word < 4; word++) {
      if (word) x += 16;
      for (letterIndex = 0; letterIndex < 4; letterIndex++) {
        letter(img, x, y, 5, 16);
        x += 8;
      }
    }
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'en', dump(report));
  assert.ok(report.score >= 80, dump(report));
  assert.ok(report.dimensions.some(function (d) { return d.label === '字母'; }), dump(report));
  assert.strictEqual(report.rubric.id, 'hengshui-print-hand-rubric-v1');
  assert.ok(report.characters.length >= 6, dump(report));
  assert.ok(!report.marks.some(function (m) { return m.text === '拉开字距'; }), dump(report));
});

check('英文词距不匀时标出词距写匀', function () {
  var img = blank(640, 280);
  var gaps = [10, 30, 9];
  var row, word, letterIndex, x, y, gi;
  for (row = 0; row < 3; row++) {
    x = 20;
    y = 28 + row * 80;
    gi = 0;
    for (word = 0; word < 4; word++) {
      if (word) { x += gaps[gi]; gi++; }
      for (letterIndex = 0; letterIndex < 4; letterIndex++) {
        letter(img, x, y, 5, 16);
        x += 8;
      }
    }
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'en', dump(report));
  assert.ok(report.marks.some(function (m) { return m.text === '词距写匀'; }), dump(report));
});

check('横竖照片会转正后再看', function () {
  var turned = hw.rotatePixels(neatChinese(), 1);
  var quarter = hw.suggestQuarter(turned);
  assert.strictEqual(quarter, 3);
  var back = hw.rotatePixels(turned, quarter);
  var report = hw.assess(back);
  assert.strictEqual(report.script, 'zh');
  assert.ok(report.score >= 85, dump(report));
  assert.strictEqual(hw.suggestQuarter(neatChinese()), 0);
});

check('标注贴在字行上且不互相压住', function () {
  var placed = hw.layoutMarks([
    { x: 0.08, y: 0.02, w: 0.08, h: 0.06, text: '底部对齐', level: 'bad', place: 'char' },
    { x: 0.55, y: 0.42, w: 0.16, h: 0.08, text: '拉开字距', level: 'warn', place: 'line' },
    { x: 0.12, y: 0.28, w: 0.06, h: 0.4, text: '左边对齐', level: 'bad', place: 'col' }
  ], 480, 640);
  assert.strictEqual(placed.length, 3);
  function hit(p, q) {
    return p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
  }
  placed.forEach(function (item) {
    assert.ok(item.chip, item.text);
    assert.ok(!hit(item.chip, item.box), item.text);
    assert.ok(item.chip.x >= 2);
    assert.ok(item.chip.y >= 2);
    assert.ok(item.chip.x + item.chip.w <= 480);
    assert.ok(item.chip.y + item.chip.h <= 640);
    assert.strictEqual(item.text.length, 4);
    var near = {
      x: item.box.x - item.chip.w,
      y: item.box.y - item.chip.h,
      w: item.box.w + item.chip.w * 2,
      h: item.box.h + item.chip.h * 2
    };
    assert.ok(hit(item.chip, near), item.text);
  });
  var a = placed[0].chip, b = placed[1].chip, c = placed[2].chip;
  assert.ok(!hit(a, b) && !hit(a, c) && !hit(b, c));
});

check('红格和竖边不当成手写', function () {
  var img = neatChinese();
  var red = [118, 32, 28];
  var y, x, t;
  for (y = 4; y < img.height - 4; y++) {
    for (t = 0; t < 6; t++) pixel(img, 2 + t, y, red);
  }
  var gridRows = [10, 70, 160, 250, 340, 354, 368, 382, 396, 410];
  gridRows.forEach(function (gy) {
    for (x = 0; x < img.width; x++) pixel(img, x, gy, [150, 48, 42]);
  });
  for (y = 6; y < img.height - 6; y++) pixel(img, img.width - 5, y, [20, 20, 20]);
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.ok(report.lineCount <= 6, dump(report));
  assert.ok(report.score >= 85, dump(report));
  assert.ok(report.marks.length >= 8, dump(report));
  report.marks.forEach(function (m) {
    assert.strictEqual(m.text, '写得工整', dump(report));
  });
});

check('画标注时不报错', function () {
  var placed = hw.layoutMarks([
    { x: 0.2, y: 0.2, w: 0.2, h: 0.1, text: '用笔扎实', level: 'bad' }
  ], 300, 200);
  var ctx = {
    canvas: { width: 300, height: 200 },
    save: function () {},
    restore: function () {},
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    stroke: function () {},
    fill: function () {},
    closePath: function () {},
    arcTo: function () {},
    strokeText: function () {},
    fillText: function (text) { ctx.texts.push(text); }
  };
  ctx.texts = [];
  hw.drawAnnotations(ctx, placed);
  assert.deepStrictEqual(ctx.texts, ['用笔扎实']);
});

/* ---- 硬笔楷书量表与逐字评判 ---- */

function unevenChinese() {
  var img = blank(460, 220);
  var heights = [10, 22, 11, 24, 12, 23, 10, 22];
  var bottom = 70;
  heights.forEach(function (h, i) {
    hanziBox(img, 24 + i * 32, bottom - h, 16, h);
  });
  return img;
}

function englishPage() {
  var img = blank(560, 280);
  var row, word, letterIndex, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 30 + row * 80;
    for (word = 0; word < 4; word++) {
      if (word) x += 16;
      for (letterIndex = 0; letterIndex < 4; letterIndex++) {
        letter(img, x, y, 5, 16);
        x += 8;
      }
    }
  }
  return img;
}

check('量表导出 CCPT 的 30/50/20 权重且外部改不动', function () {
  var rub = hw.getRubric();
  assert.strictEqual(rub.id, 'hardpen-kaishu-rubric-v1');
  assert.deepStrictEqual(rub.dimensions.map(function (d) { return d.weight; }), [30, 50, 20]);
  assert.strictEqual(rub.items.reduce(function (s, it) { return s + it.weight; }, 0), 100);
  assert.ok(rub.sources.length >= 3 && rub.sources[0].url.indexOf('neea.edu.cn') > 0);
  assert.ok(rub.unmeasurable.length >= 4, '必须写明不能离线评判的项目');
  assert.ok(rub.items.every(function (it) { return it.criterion && it.advice && it.train && it.code; }));
  rub.dimensions[0].weight = 999;
  assert.strictEqual(hw.getRubric().dimensions[0].weight, 30);
  assert.deepStrictEqual(['stroke', 'structure', 'layout'], rub.dimensions.map(function (d) { return d.key; }));
});

check('等级阈值按量表四档', function () {
  assert.strictEqual(hw.gradeOf(95).label, '优秀');
  assert.strictEqual(hw.gradeOf(82).label, '良好');
  assert.strictEqual(hw.gradeOf(70).label, '合格');
  assert.strictEqual(hw.gradeOf(40).label, '待改进');
});

check('中文每个字都有分项分、等级、评判和优化建议', function () {
  var report = hw.assess(neatChinese());
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.rubric.id, 'hardpen-kaishu-rubric-v1');
  assert.ok(report.standardNote.indexOf('不识别具体汉字') >= 0);
  assert.strictEqual(report.characters.length, report.goodCount + report.fixCount);
  assert.ok(report.charAverage >= 85, dump(report));
  assert.deepStrictEqual(report.dimensions.map(function (d) { return d.weight; }), [30, 50, 20]);
  report.characters.forEach(function (c, i) {
    assert.strictEqual(c.index, i);
    assert.ok(c.line >= 1 && c.column >= 1);
    assert.ok(c.verdict.indexOf('第' + c.line + '行第' + c.column + '字') >= 0, c.verdict);
    assert.ok(c.advice.length > 20, '优化建议不能是空话');
    assert.ok(c.grade && c.gradeNote && c.level);
    assert.ok(c.score >= 0 && c.score <= 100);
    assert.deepStrictEqual(Object.keys(c.scores).sort(), ['layout', 'stroke', 'structure']);
    assert.strictEqual(c.itemCount, report.rubric.items.length);
    assert.strictEqual(c.passedCount + c.findings.length, c.itemCount);
    assert.strictEqual(c.title.length, 4, '圈注短标签必须是四个字');
    assert.ok(c.box.x >= 0 && c.box.y >= 0 && c.box.x + c.box.w <= 1.01 && c.box.y + c.box.h <= 1.01);
    assert.ok(report.marks.some(function (m) { return m.charIndex === i; }), '逐字框要能对应到圈注');
  });
});

check('失度条款逐条给出判据、改法与练法', function () {
  var report = hw.assess(unevenChinese());
  assert.ok(report.ok, dump(report));
  assert.ok(report.characters.length >= 6, dump(report));
  var withIssues = report.characters.filter(function (c) { return c.findings.length; });
  assert.ok(withIssues.length >= 3, '应能定位到具体字');
  assert.ok(report.characters.some(function (c) {
    return c.findings.some(function (f) { return f.dimension === 'structure'; });
  }), '要能命中结构类条款');
  withIssues.forEach(function (c) {
    assert.ok(c.verdict.indexOf('主要问题') >= 0, c.verdict);
    assert.ok(c.advice.indexOf('优先改') >= 0);
    assert.strictEqual(c.title.length, 4);
    c.findings.forEach(function (f) {
      assert.ok(f.code && f.name && f.criterion && f.detail);
      assert.ok(f.action && f.train, '每条失度都要给改法与练法');
      assert.ok(f.score >= 0 && f.score <= 100);
      assert.ok(f.dimension === 'stroke' || f.dimension === 'structure' || f.dimension === 'layout');
    });
  });
});

check('单条明显失度不会被平均分成优秀', function () {
  var report = hw.assess(unevenChinese());
  var first = report.characters[0];
  assert.ok(first.findings.some(function (f) { return f.code === 'S3' && f.score < 62; }), dump(report));
  assert.notStrictEqual(first.grade, '优秀', dump(report));
  assert.strictEqual(first.level, 'bad');
  report.characters.forEach(function (c) {
    var charIssues = c.findings.filter(function (f) { return f.charLevel; });
    assert.ok(!(charIssues.length && c.level === 'good'), '字本身有问题的不能挂绿圈');
    assert.ok(!(charIssues.length && c.grade === '优秀'), '字本身有问题的不能评优秀');
  });
});

check('整行字距过挤只压低章法，不把每个字判成不及格', function () {
  var img = blank(420, 280);
  var row, col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 8; col++) hanzi(img, 24 + col * 17, 30 + row * 80, 16);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  var layout = report.dimensions.filter(function (d) { return d.key === 'layout'; })[0];
  assert.ok(layout.score < 70, '章法应反映整行过挤：' + JSON.stringify(report.dimensions));
  assert.ok(report.score < 85, dump(report));
  assert.ok(report.charAverage >= 90, '单字分不应被行款问题拉低');
  report.characters.forEach(function (c) {
    assert.ok(c.findings.some(function (f) { return f.dimension === 'layout'; }));
    assert.ok(c.verdict.indexOf('按本行评定') >= 0);
    assert.ok(c.advice.indexOf('优先改') >= 0);
    assert.strictEqual(c.level, 'good', '行级问题不应生成逐字红圈');
    assert.strictEqual(c.title, '写得工整');
  });
});

check('工整的字也给出保持意见与进阶建议', function () {
  var report = hw.assess(neatChinese());
  report.characters.forEach(function (c) {
    assert.strictEqual(c.findings.length, 0);
    assert.strictEqual(c.grade, '优秀');
    assert.strictEqual(c.level, 'good');
    assert.ok(c.advice.indexOf('进阶') >= 0, c.advice);
    assert.ok(c.verdict.indexOf('全部达标') >= 0);
  });
});

check('英文按衡水体量表逐字母评判，不套用中文量表', function () {
  var report = hw.assess(englishPage());
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'en');
  assert.strictEqual(report.rubric.id, 'hengshui-print-hand-rubric-v1');
  assert.deepStrictEqual(report.rubric.dimensions.map(function (d) { return d.weight; }), [30, 40, 30]);
  assert.strictEqual(report.rubric.items.length, 12);
  assert.ok(report.rubric.note.indexOf('不是国家或行业统一标准') >= 0);
  assert.strictEqual(report.characters.length, report.glyphCount);
  assert.ok(report.charAverage > 0);
  assert.ok(report.standardNote.indexOf('衡水体') >= 0);
  assert.deepStrictEqual(report.dimensions.map(function (d) { return d.key; }), ['stroke', 'structure', 'layout']);
  report.characters.forEach(function (c) {
    assert.ok(c.box && c.verdict && c.advice && c.grade);
    assert.ok(c.verdict.indexOf('个字母') >= 0, c.verdict);
    assert.strictEqual(c.itemCount, 12);
    assert.ok(c.scores.stroke >= 0 && c.scores.structure >= 0 && c.scores.layout >= 0);
  });
});

check('书写页能渲染量表、逐字评判与定位按钮（无需浏览器）', function () {
  var fs = require('fs');
  var vm = require('vm');
  var path = require('path');
  var code = fs.readFileSync(path.join(__dirname, '../diagnose/writing.js'), 'utf8')
    .replace('var report = null;', 'var report = FAKE_REPORT;');
  var root = {
    innerHTML: '',
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  var sandbox = {
    FAKE_REPORT: hw.assess(neatChinese()),
    window: { CnmHandwriting: hw, addEventListener: function () {} },
    document: {
      getElementById: function (id) { return id === 'root' ? root : null; },
      querySelectorAll: function () { return []; }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console
  };
  vm.runInNewContext(code, sandbox, { filename: 'writing.js' });
  ['评价标准', '逐字评判', '优先改', '优化建议', '在图上定位', 'data-filter', '书画等级考试',
    '本工具不评判的项目', '逐字平均'].forEach(function (text) {
    assert.ok(root.innerHTML.indexOf(text) >= 0, '页面缺少 ' + text);
  });
  assert.ok(root.innerHTML.indexOf('第 1 行 · 第 1 字') >= 0);
  assert.ok(root.innerHTML.indexOf('优秀 100') >= 0);
  var page = fs.readFileSync(path.join(__dirname, '../diagnose/writing.html'), 'utf8');
  assert.ok(page.indexOf('handwriting.js?v=61') >= 0);
  assert.ok(page.indexOf('writing.js?v=52') >= 0);
});

function flawedEnglishPage() {
  var img = blank(620, 300);
  var row, word, li, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 30 + row * 90;
    for (word = 0; word < 4; word++) {
      if (word) x += 16;
      for (li = 0; li < 4; li++) {
        if (row === 0 && word === 2 && li === 0) letter(img, x, y + 8, 5, 16);       // 基线偏下
        else if (row === 1 && word === 0 && li === 1) letter(img, x, y, 5, 16, [190, 190, 190]); // 淡墨
        else if (row === 1 && word === 2 && li === 2) skew(img, x, y, 6, 16, 9);     // 斜度不一致
        else if (row === 2 && word === 1 && li === 0) letter(img, x, y, 5, 10);      // 同类里偏小
        else letter(img, x, y, 5, 16);
        x += 8;
      }
    }
  }
  return img;
}

function looseWordGaps() {
  var gaps = [10, 44, 9];
  var img = blank(640, 280);
  var row, word, li, x, y, gi;
  for (row = 0; row < 3; row++) {
    x = 20;
    y = 28 + row * 80;
    gi = 0;
    for (word = 0; word < 4; word++) {
      if (word) { x += gaps[gi]; gi++; }
      for (li = 0; li < 4; li++) { letter(img, x, y, 5, 16); x += 8; }
    }
  }
  return img;
}

function englishHeightGroups() {
  var img = blank(620, 300);
  var row, col, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 30 + row * 90;
    for (col = 0; col < 16; col++) {
      letter(img, x, y, 5, col % 4 === 0 ? 22 : 16);
      x += 8;
    }
  }
  return img;
}

check('衡水体量表导出 30/40/30 权重且外部改不动', function () {
  var rub = hw.getRubric('en');
  assert.strictEqual(rub.id, 'hengshui-print-hand-rubric-v1');
  assert.deepStrictEqual(rub.dimensions.map(function (d) { return d.weight; }), [30, 40, 30]);
  assert.strictEqual(rub.items.length, 12);
  assert.strictEqual(rub.items.reduce(function (s, it) { return s + it.weight; }, 0), 100);
  assert.ok(rub.note.indexOf('不是国家或行业统一标准') >= 0);
  assert.ok(rub.unmeasurable.length >= 5);
  rub.items[0].weight = 0;
  assert.strictEqual(hw.getRubric('en').items[0].weight, 8);
  assert.strictEqual(hw.getRubric().id, 'hardpen-kaishu-rubric-v1', '不带参数仍是中文量表');
});

check('工整英文每个字母都有分项分、等级、评判和优化建议', function () {
  var report = hw.assess(englishPage());
  assert.ok(report.ok && report.characters.length >= 6, dump(report));
  report.characters.forEach(function (c) {
    assert.strictEqual(c.findings.length, 0);
    assert.strictEqual(c.grade, '优秀');
    assert.strictEqual(c.level, 'good');
    assert.strictEqual(c.score, 100);
    assert.ok(c.box && c.box.w > 0 && c.box.h > 0);
    assert.ok(c.verdict.indexOf('个字母') >= 0, c.verdict);
    assert.ok(c.advice.indexOf('进阶') >= 0 && c.advice.indexOf('衡水体') >= 0, c.advice);
    assert.strictEqual(c.passedCount, 12);
    assert.strictEqual(c.itemCount, 12);
  });
  assert.ok(report.summary.indexOf('衡水体量表') >= 0);
});

check('英文缺陷逐字母命中条款并给量化改法', function () {
  var report = hw.assess(flawedEnglishPage());
  assert.ok(report.ok && report.script === 'en', dump(report));
  var codes = {};
  report.characters.forEach(function (c) {
    c.findings.forEach(function (f) {
      codes[f.code] = true;
      assert.ok(f.criterion && f.detail && f.action && f.train, f.code);
      assert.ok(f.score >= 0 && f.score <= 100);
      assert.ok(['stroke', 'structure', 'layout'].indexOf(f.dimension) >= 0);
    });
  });
  ['E1', 'E5', 'E6', 'E7'].forEach(function (code) {
    assert.ok(codes[code], '应命中 ' + code + '：' + JSON.stringify(Object.keys(codes)));
  });
  var bad = report.characters.filter(function (c) {
    return c.findings.some(function (f) { return f.charLevel; });
  });
  assert.ok(bad.length >= 3);
  bad.forEach(function (c) {
    assert.notStrictEqual(c.grade, '优秀', c.verdict);
    assert.ok(c.verdict.indexOf('主要问题') >= 0, c.verdict);
    assert.ok(c.advice.indexOf('优先改') >= 0, c.advice);
    assert.strictEqual(c.title.length, 4);
  });
});

check('大小写／上伸字母的高度差不会被误判成大小不匀', function () {
  var report = hw.assess(englishHeightGroups());
  assert.ok(report.ok && report.script === 'en', dump(report));
  assert.ok(report.characters.length >= 6);
  assert.ok(!report.characters.some(function (c) {
    return c.findings.some(function (f) { return f.code === 'E5'; });
  }), '合法的两组高度不应判为大小不匀');
});

check('英文词距不匀只压低章法，不生成逐字母红圈', function () {
  var report = hw.assess(looseWordGaps());
  assert.ok(report.ok && report.script === 'en', dump(report));
  var layout = report.dimensions.filter(function (d) { return d.key === 'layout'; })[0];
  assert.ok(layout.score < 75, JSON.stringify(report.dimensions));
  assert.ok(report.characters.some(function (c) {
    return c.findings.some(function (f) { return f.code === 'E10'; });
  }), '词距问题应写进逐字母评判');
  report.characters.forEach(function (c) {
    assert.strictEqual(c.level, 'good', '行级问题不应生成逐字母红圈');
    assert.strictEqual(c.title, '写得规范');
    assert.ok(c.advice.indexOf('优先改') >= 0, c.advice);
  });
});

check('连写与涂黑会标出不连笔、笔画洁净', function () {
  var joined = blank(620, 300);
  var row, col, x, y;
  for (row = 0; row < 3; row++) {
    x = 24;
    y = 30 + row * 90;
    for (col = 0; col < 16; col++) {
      letter(joined, x, y, 5, 16);
      x += (row === 1 && col >= 4 && col <= 6) ? 3 : 8;
    }
  }
  var r1 = hw.assess(joined);
  assert.ok(r1.ok, dump(r1));
  assert.ok(r1.characters.some(function (c) {
    return c.findings.some(function (f) { return f.code === 'E4'; });
  }), '连写并块应命中 E4');
  var blot = englishPage();
  solid(blot, 300, 120, 14, 14);
  var r2 = hw.assess(blot);
  assert.ok(r2.ok, dump(r2));
  assert.ok(r2.characters.some(function (c) {
    return c.findings.some(function (f) { return f.code === 'E3'; });
  }), '行内涂黑应命中 E3');
});

check('书写页能渲染衡水体量表与逐字母评判（无需浏览器）', function () {
  var fs = require('fs');
  var vm = require('vm');
  var path = require('path');
  var code = fs.readFileSync(path.join(__dirname, '../diagnose/writing.js'), 'utf8')
    .replace('var report = null;', 'var report = FAKE_REPORT;');
  var root = {
    innerHTML: '',
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  var sandbox = {
    FAKE_REPORT: hw.assess(englishPage()),
    window: { CnmHandwriting: hw, addEventListener: function () {} },
    document: {
      getElementById: function (id) { return id === 'root' ? root : null; },
      querySelectorAll: function () { return []; }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console
  };
  vm.runInNewContext(code, sandbox, { filename: 'writing.js' });
  ['评价标准', '逐字母评判', '衡水体', '优化建议', '在图上定位', '本工具不评判的项目',
    '查看依据', '逐字母平均', '笔画', '字母'].forEach(function (text) {
    assert.ok(root.innerHTML.indexOf(text) >= 0, '页面缺少 ' + text);
  });
  assert.ok(root.innerHTML.indexOf('第 1 行 · 第 1 字母') >= 0);
  assert.ok(root.innerHTML.indexOf('优秀 100') >= 0);
  assert.ok(root.innerHTML.indexOf('自动识别') >= 0, '页面应显示语种自动识别依据');
});

/* 四线格英语作业纸：贯穿整页的浅灰横线、压在横线上的深色手写字母、
 * 顶部一行蓝色印刷标题。旧版会把「横线 + 整行字母」当格线丢掉，只剩印刷标题。 */
function ruledEnglishSheet(withTitle) {
  var img = blank(520, 440);
  var RULE = [150, 150, 152];
  var row, col, x, y;
  for (y = 42; y < 430; y += 28) hLine(img, 0, y, 520, RULE);
  for (row = 0; row < 10; row++) {
    x = 24;
    y = 58 + row * 28;
    for (col = 0; col < 22; col++) {
      letter(img, x, y, 5, 14);
      x += 9;
      if (col % 6 === 5) x += 12;
    }
  }
  if (withTitle !== false) {
    for (col = 0; col < 5; col++) hanziBox(img, 150 + col * 30, 8, 20, 20, [60, 100, 170]);
  }
  return img;
}

/* 田字格中文：横线竖线都成排，汉字写在格子内部。 */
function gridChineseSheet() {
  var img = blank(520, 440);
  var RULE = [150, 150, 152];
  var row, col, x, y;
  for (y = 30; y < 430; y += 40) hLine(img, 0, y, 520, RULE);
  for (x = 20; x < 520; x += 40) vLine(img, x, 0, 440, RULE);
  for (row = 0; row < 9; row++) {
    y = 36 + row * 40;
    for (col = 0; col < 11; col++) hanzi(img, 24 + col * 40, y, 16);
  }
  return img;
}

function renderWriting(report) {
  var fs = require('fs');
  var vm = require('vm');
  var path = require('path');
  var code = fs.readFileSync(path.join(__dirname, '../diagnose/writing.js'), 'utf8')
    .replace('var report = null;', 'var report = FAKE_REPORT;');
  var root = {
    innerHTML: '',
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  var sandbox = {
    FAKE_REPORT: report,
    window: { CnmHandwriting: hw, addEventListener: function () {} },
    document: {
      getElementById: function (id) { return id === 'root' ? root : null; },
      querySelectorAll: function () { return []; }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console
  };
  vm.runInNewContext(code, sandbox, { filename: 'writing.js' });
  return root.innerHTML;
}

check('四线格英文作业纸判成英文，正文进入逐字母评判', function () {
  var report = hw.assess(ruledEnglishSheet());
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'en', dump(report));
  assert.strictEqual(report.detectedScript, 'en');
  assert.ok(report.scriptEvidence.reason.indexOf('四线格') >= 0, dump(report.scriptEvidence));
  assert.ok(report.ruling.hLines >= 8, dump(report.ruling));
  assert.ok(report.ruling.vLines < 3, dump(report.ruling));
  assert.ok(report.ruling.removed > 100, '格线应被剔除');
  assert.ok(report.characters.length >= 40, '正文应进入逐字母评判：' + report.characters.length);
  var bands = {};
  report.marks.forEach(function (m) { bands[Math.floor(m.y * 440 / 28)] = 1; });
  assert.ok(Object.keys(bands).length >= 5, '标注应覆盖多行正文');
});

check('印刷标题被跳过且不被批注', function () {
  var report = hw.assess(ruledEnglishSheet());
  assert.ok(report.ok, dump(report));
  assert.ok(report.skippedPrinted >= 3, '应跳过蓝色印刷标题：' + report.skippedPrinted);
  assert.ok(report.summary.indexOf('印刷字') >= 0, dump(report));
  var top = report.marks.filter(function (m) { return m.y < 0.09; });
  assert.strictEqual(top.length, 0, '标题区不应有圈注：' + JSON.stringify(top));
});

check('田字格中文仍判成中文，不被横线证据带偏', function () {
  var report = hw.assess(gridChineseSheet());
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'zh', dump(report));
  assert.ok(report.ruling.vLines >= 4, dump(report.ruling));
  assert.ok(report.characters.length >= 20, dump(report));
});

check('整页彩色墨水手写不会被当成印刷标题跳过', function () {
  var img = blank(520, 300);
  var row, col;
  for (row = 0; row < 4; row++) {
    for (col = 0; col < 10; col++) hanzi(img, 24 + col * 44, 30 + row * 70, 16, [60, 100, 170]);
  }
  var report = hw.assess(img);
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.skippedPrinted, 0, dump(report));
  assert.ok(report.characters.length >= 20, dump(report));
});

check('页面显示语种依据与跳过的印刷字（无需浏览器）', function () {
  var html = renderWriting(hw.assess(ruledEnglishSheet()));
  ['自动识别', '四线格', '已跳过', '印刷标题字', '衡水体', '逐字母评判'].forEach(function (text) {
    assert.ok(html.indexOf(text) >= 0, '页面缺少 ' + text);
  });
});

/* ---------- 行级判据修正：四线格真实照片暴露的四类误差 ---------- */

/* 临时把纯函数 visualRows 注入导出，避免为测试污染公开 API。 */
function handwritingInternals() {
  var fs = require('fs');
  var path = require('path');
  var vm = require('vm');
  var src = fs.readFileSync(path.join(__dirname, '../assets/handwriting.js'), 'utf8');
  var patched = src.replace(/(\r?\n  return \{\r?\n)(    assess: assess,)/,
    '$1    __internals: { visualRows: visualRows },\n$2');
  if (patched === src) throw new Error('无法注入内部函数导出');
  var mod = { exports: {} };
  vm.runInNewContext(patched, { module: mod, exports: mod.exports, console: console },
    { filename: 'handwriting-internals.js' });
  return mod.exports;
}

function makeLine(cy, n, x0) {
  var glyphs = [], i;
  for (i = 0; i < n; i++) glyphs.push({ punct: false });
  return { cy: cy, x0: x0 || 24, y0: cy - 8, y1: cy + 8, glyphs: glyphs };
}

check('行距按视觉行还原，格线切出的半行不再误判成行距过挤', function () {
  var visualRows = handwritingInternals().__internals.visualRows;
  var em = 16;
  var lines = [makeLine(100, 12), makeLine(108, 12), makeLine(180, 12), makeLine(260, 2, 400)];
  var naive = (lines[1].cy - lines[0].cy) / em;
  assert.ok(naive < 1.45, '相邻半行的中心距确实会被旧算法判成太挤');
  var view = visualRows(lines, em);
  assert.ok(view.pitchOf(1) / em >= 1.45, '半行应并回同一视觉行：' + view.pitchOf(1));
  assert.ok(view.pitchOf(2) / em >= 1.45, '真正的下一行仍应得到完整行距：' + view.pitchOf(2));
  assert.ok(view.isBody(0) && view.isBody(1) && view.isBody(2));
  assert.ok(!view.isBody(3), '只有 2 个字母的短行不与正文比行首');
  assert.strictEqual(view.head0, 24, '短行不得污染行首中位数');
});

check('真的行距密仍能报出行距过挤，不会被视觉行合并吞掉', function () {
  var img = blank(560, 200);
  var row, col, x, y;
  for (row = 0; row < 4; row++) {
    x = 24; y = 20 + row * 20;
    for (col = 0; col < 14; col++) { letter(img, x, y, 5, 16); x += 12; }
  }
  var report = hw.assess(img, { script: 'en' });
  assert.ok(report.ok && report.script === 'en', dump(report));
  assert.ok(report.characters.some(function (c) {
    return c.findings.some(function (f) {
      return f.code === 'E11' && f.detail.indexOf('行与行太挤') >= 0;
    });
  }), '真实密行仍应命中 E11：' + JSON.stringify(report.rowAdvice));
});

check('短行与题注行不再产生行首异常值', function () {
  var img = blank(560, 400);
  var row, col, x, y;
  for (row = 0; row < 4; row++) {
    x = 24; y = 40 + row * 84;
    for (col = 0; col < 14; col++) { letter(img, x, y, 5, 16); x += 10; }
  }
  letter(img, 440, 24, 5, 16);
  letter(img, 452, 24, 5, 16);
  var report = hw.assess(img, { script: 'en' });
  assert.ok(report.ok, dump(report));
  var headDetails = [];
  report.characters.forEach(function (c) {
    c.findings.forEach(function (f) {
      if (!f.charLevel && f.detail.indexOf('行首') >= 0) headDetails.push(f.detail);
    });
  });
  assert.ok(headDetails.every(function (d) {
    var m = /错开 (\d+)%/.exec(d);
    return m && Number(m[1]) <= 300;
  }), '行首偏差不得出现千分比异常值：' + headDetails.join(' | '));
  assert.ok(report.score >= 95, '正文行首一致不应被短行拖低：' + dump(report));
});

check('合规下伸字母不再被误判成没贴线', function () {
  var img = blank(560, 300);
  var row, col, x, y;
  for (row = 0; row < 3; row++) {
    x = 24; y = 30 + row * 90;
    for (col = 0; col < 14; col++) {
      letter(img, x, y, 5, col % 5 === 2 ? 20 : 16);
      x += 12;
    }
  }
  var report = hw.assess(img, { script: 'en' });
  assert.ok(report.ok && report.characters.length >= 30, dump(report));
  var e6 = report.characters.filter(function (c) {
    return c.findings.some(function (f) { return f.code === 'E6'; });
  });
  assert.strictEqual(e6.length, 0, 'g/j/p/q/y 式下伸是规则内写法：' +
    JSON.stringify(e6.map(function (c) { return c.verdict; })));
});

check('行级章法提醒独立成栏，优秀字不再列进改进建议', function () {
  var report = hw.assess(looseWordGaps(), { script: 'en' });
  assert.ok(report.ok, dump(report));
  assert.ok(Array.isArray(report.rowAdvice));
  var e10 = report.rowAdvice.filter(function (x) { return x.code === 'E10'; })[0];
  assert.ok(e10 && e10.lineCount >= 1 && e10.detail.indexOf('共 ' + e10.lineCount + ' 行') >= 0,
    '行级问题应按条款聚合：' + JSON.stringify(report.rowAdvice));
  assert.ok(e10.criterion && e10.lines.length === e10.lineCount);
  var good = report.suggestions.filter(function (s) { return s.title === '写得规范'; });
  assert.ok(good.length && good[0].scope === 'good', '表扬类不是改进建议');
  var html = renderWriting(report);
  assert.ok(html.indexOf('整行章法提醒') >= 0, '页面应有独立的行级区块');
  assert.ok(html.indexOf('优先改') >= 0);
  assert.ok(html.indexOf('<h3>写得规范') < 0, '优秀字母不应作为改进条目出现');
  assert.ok(html.indexOf('共 ' + e10.lineCount + ' 行') >= 0);
});

check('中文工整页不报行首不齐，表扬仍归为 good', function () {
  var report = hw.assess(neatChinese());
  assert.ok(report.ok, dump(report));
  assert.ok(Array.isArray(report.rowAdvice));
  assert.ok(!report.rowAdvice.some(function (x) { return x.code === 'L3'; }),
    '工整中文不应报行款不齐：' + JSON.stringify(report.rowAdvice));
  assert.strictEqual(report.suggestions[0].title, '写得工整');
  assert.strictEqual(report.suggestions[0].scope, 'good');
});
