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
