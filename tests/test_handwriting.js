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
  assert.ok(report.dimensions.some(function (d) { return d.label === '行齐'; }), dump(report));
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

check('英文与中英混排不套用中文量表', function () {
  var report = hw.assess(englishPage());
  assert.ok(report.ok, dump(report));
  assert.strictEqual(report.script, 'en');
  assert.strictEqual(report.rubric, null);
  assert.deepStrictEqual(report.characters, []);
  assert.strictEqual(report.charAverage, null);
  assert.strictEqual(report.standardNote, '');
  assert.ok(report.dimensions.some(function (d) { return d.label === '行齐'; }));
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
  ['评价标准', '逐字评判', '共性问题', '优化建议', '在图上定位', 'data-filter', '书画等级考试',
    '本工具不评判的项目', '逐字平均'].forEach(function (text) {
    assert.ok(root.innerHTML.indexOf(text) >= 0, '页面缺少 ' + text);
  });
  assert.ok(root.innerHTML.indexOf('第 1 行 · 第 1 字') >= 0);
  assert.ok(root.innerHTML.indexOf('优秀 100') >= 0);
  var page = fs.readFileSync(path.join(__dirname, '../diagnose/writing.html'), 'utf8');
  assert.ok(page.indexOf('handwriting.js?v=58') >= 0);
  assert.ok(page.indexOf('writing.js?v=49') >= 0);
});
