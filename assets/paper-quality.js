/* 试卷质量分析：错题、表单和原始试卷照片存在本机 IndexedDB（库名 cnmPaperQuality）。
 * 这些是个人数据，不写入本仓库；以后若放到 GitHub，使用单独的仓库。
 * 离线只做通用几何（红笔、分栏、题目带、印刷题号、去重）与结构化统计；
 * 题目文字、手写订正、知识点归因和综评通过 Agent 交接协议导入，不针对具体试卷写模板。
 * 质量分析、Agent 协议和红笔候选都是纯函数，浏览器与 Node 共用。window.CnmPapers。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CnmPapers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DB_NAME = 'cnmPaperQuality';
  var DB_VERSION = 1;

  var SUBJECTS = [
    ['math', '数学'],
    ['chinese', '语文'],
    ['science', '科学'],
    ['morality', '道法'],
    ['history', '历史'],
    ['geography', '地理'],
    ['biology', '生物'],
    ['chemistry', '化学'],
    ['english', '英语'],
    ['physics', '物理']
  ];

  var REASONS = ['概念不清', '计算失误', '审题不清', '步骤不完整', '记忆不牢', '时间不够', '其他'];

  var REASON_TIP = {
    '概念不清': { title: '先回到定义和一道例题', detail: '把这个知识点的定义用自己的话说一遍，再做一道变式，最后才回到错题。' },
    '计算失误': { title: '演算单独练，做完验一次', detail: '每天少量竖式或草稿，做完用逆运算或估算对一遍，不要和新知识混在同一轮。' },
    '审题不清': { title: '先圈条件和问句', detail: '读题时圈出数量、单位和最后问的是什么，做完再对一遍问句，确认答的是所问。' },
    '步骤不完整': { title: '先对步骤，再对结果', detail: '要求写出关键步骤。核对时先看步骤是否缺了，再看最后一格的得数。' },
    '记忆不牢': { title: '把易错结论收成短句', detail: '每条错题留下一句结论，隔天先复述这几句，再做原题。' },
    '时间不够': { title: '先做会的，留下回查', detail: '整卷先完成有把握的题，拿不准的做标记，最后用留出的时间回查这些标记。' },
    '其他': { title: '把错因写具体', detail: '「其他」太多时，方案对不上做法。改成概念、计算、审题、步骤、记忆或时间中的一种。' },
    '未判断': { title: '错因可以之后再补', detail: '自动记下的错题已经能按题目跟踪。想让方案更准时，再把错因改成概念、计算或审题。' }
  };

  function subjectLabel(id) {
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i][0] === id) return SUBJECTS[i][1];
    return id || '未分学科';
  }

  function diagnoseHref(subject) {
    if (!subject || subject === 'math') return './';
    return './?subject=' + encodeURIComponent(subject);
  }

  function num(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function findRedMarks(image) {
    var w = image && image.width || 0;
    var h = image && image.height || 0;
    var data = image && image.data;
    if (!w || !h || !data) return [];
    var cell = 16;
    var cols = Math.ceil(w / cell);
    var rows = Math.ceil(h / cell);
    var hot = new Uint8Array(cols * rows);
    var y, x, yy, xx, i, r, g, b, red, total, y0, x0, y1, x1;
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        red = 0;
        total = 0;
        y0 = y * cell;
        x0 = x * cell;
        y1 = Math.min(h, y0 + cell);
        x1 = Math.min(w, x0 + cell);
        for (yy = y0; yy < y1; yy += 2) {
          for (xx = x0; xx < x1; xx += 2) {
            i = (yy * w + xx) * 4;
            r = data[i];
            g = data[i + 1];
            b = data[i + 2];
            total++;
            if (r > 150 && r - g > 50 && r - b > 50 && g < 160) red++;
          }
        }
        if (total && red >= 4 && red / total >= 0.12) hot[y * cols + x] = 1;
      }
    }
    var seen = new Uint8Array(hot.length);
    var boxes = [];
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        var start = y * cols + x;
        if (!hot[start] || seen[start]) continue;
        var stack = [start];
        seen[start] = 1;
        var minX = x, maxX = x, minY = y, maxY = y, n = 0;
        while (stack.length) {
          var cur = stack.pop();
          var cy = Math.floor(cur / cols);
          var cx = cur - cy * cols;
          n++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          var d;
          for (d = 0; d < 4; d++) {
            var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
            var ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            var ni = ny * cols + nx;
            if (!hot[ni] || seen[ni]) continue;
            seen[ni] = 1;
            stack.push(ni);
          }
        }
        if (n < 2) continue;
        var bw = (maxX - minX + 1) * cell;
        var bh = (maxY - minY + 1) * cell;
        if (bw * bh > w * h * 0.35) continue;
        boxes.push({
          x: minX * cell,
          y: minY * cell,
          w: Math.min(bw, w - minX * cell),
          h: Math.min(bh, h - minY * cell)
        });
      }
    }
    boxes.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    return boxes.slice(0, 40);
  }

  function isPenPixel(r, g, b) {
    if (r >= 102 && r - Math.max(g, b) >= 8 && g < 230 && b < 220) return true;
    if (b >= 130 && b - r >= 28 && b - g >= 12 && r < 190) return true;
    return false;
  }

  function isInkPixel(r, g, b) {
    if (isPenPixel(r, g, b)) return false;
    return (r * 3 + g * 6 + b) / 10 < 150;
  }

  function rotateBox(box, quarter) {
    var q = ((quarter % 4) + 4) % 4;
    var x = box.x, y = box.y, w = box.w, h = box.h;
    if (q === 1) return { x: 1 - (y + h), y: x, w: h, h: w };
    if (q === 2) return { x: 1 - (x + w), y: 1 - (y + h), w: w, h: h };
    if (q === 3) return { x: y, y: 1 - (x + w), w: h, h: w };
    return { x: x, y: y, w: w, h: h };
  }

  function classifyPen(image, box) {
    var cols = 9;
    var rows = 9;
    var border = 0, borderN = 0, center = 0, centerN = 0, diag = 0, diagN = 0, anti = 0, antiN = 0, mid = 0, midN = 0;
    var j, i, x, y, p, pen, edge, ctr;
    if (!box.w || !box.h) return '批改';
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        x = Math.min(image.width - 1, Math.max(0, Math.floor(box.x + (i + 0.5) * box.w / cols)));
        y = Math.min(image.height - 1, Math.max(0, Math.floor(box.y + (j + 0.5) * box.h / rows)));
        p = (y * image.width + x) * 4;
        pen = isPenPixel(image.data[p], image.data[p + 1], image.data[p + 2]);
        edge = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
        ctr = i >= 3 && i <= 5 && j >= 3 && j <= 5;
        if (edge) { borderN++; if (pen) border++; }
        if (ctr) { centerN++; if (pen) center++; }
        if (i === j) { diagN++; if (pen) diag++; }
        if (i + j === cols - 1) { antiN++; if (pen) anti++; }
        if (j === 4) { midN++; if (pen) mid++; }
      }
    }
    if (borderN && centerN && border / borderN > 0.35 && center / centerN < 0.2) return '圈出';
    if (diagN && antiN && diag / diagN > 0.45 && anti / antiN > 0.45) return '叉号';
    if (box.h * 2.4 < box.w && midN && mid / midN > 0.45) return '划线';
    return '批改';
  }

  function penGrid(image, box, n) {
    var grid = [];
    var j, i, x, y, p, r, g, b, yy, xx, x0, y0, x1, y1;
    for (j = 0; j < n; j++) {
      grid[j] = [];
      y0 = Math.max(0, Math.floor(box.y + j * box.h / n));
      y1 = Math.min(image.height, Math.max(y0 + 1, Math.floor(box.y + (j + 1) * box.h / n)));
      for (i = 0; i < n; i++) {
        x0 = Math.max(0, Math.floor(box.x + i * box.w / n));
        x1 = Math.min(image.width, Math.max(x0 + 1, Math.floor(box.x + (i + 1) * box.w / n)));
        var on = false;
        for (yy = y0; yy < y1 && !on; yy++) {
          for (xx = x0; xx < x1; xx++) {
            p = (yy * image.width + xx) * 4;
            r = image.data[p];
            g = image.data[p + 1];
            b = image.data[p + 2];
            if (isPenPixel(r, g, b)) { on = true; break; }
          }
        }
        grid[j][i] = on;
      }
    }
    return grid;
  }

  /* 圈在答案上的才是错题。对勾，以及对勾上方那道横线，表示这一页有错题，不针对某一题。 */
  function penRole(image, box, col) {
    var pageH = image.height;
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    var colW = Math.max(1, col.x1 - col.x0);
    var local = (cx - col.x0) / colW;
    var corner = local < 0.24 || local > 0.76;
    if (cy < pageH * 0.18 && corner && box.w < colW * 0.5 && box.h < pageH * 0.28) return '页眉';
    var n = 12;
    var grid = penGrid(image, box, n);
    var border = 0, borderN = 0, center = 0, centerN = 0;
    var side = [0, 0, 0, 0], sideN = [0, 0, 0, 0];
    var diag = 0, diagN = 0, anti = 0, antiN = 0, fill = 0;
    var j, i, edge, ctr;
    for (j = 0; j < n; j++) {
      for (i = 0; i < n; i++) {
        var on = grid[j][i];
        if (on) fill++;
        edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
        ctr = i >= 4 && i <= 7 && j >= 4 && j <= 7;
        if (edge) { borderN++; if (on) border++; }
        if (ctr) { centerN++; if (on) center++; }
        if (j === 0) { sideN[0]++; if (on) side[0]++; }
        if (j === n - 1) { sideN[1]++; if (on) side[1]++; }
        if (i === 0) { sideN[2]++; if (on) side[2]++; }
        if (i === n - 1) { sideN[3]++; if (on) side[3]++; }
        if (i === j) { diagN++; if (on) diag++; }
        if (i + j === n - 1) { antiN++; if (on) anti++; }
      }
    }
    var sides = 0;
    for (i = 0; i < 4; i++) if (sideN[i] && side[i] / sideN[i] > 0.18) sides++;
    var hollow = centerN && center / centerN < 0.22;
    var aspect = Math.max(box.w, box.h) / Math.max(1, Math.min(box.w, box.h));
    if (aspect < 1.5 && borderN && border / borderN > 0.2 && hollow && sides >= 3) return '圈出';
    var minSide = Math.min(box.w, box.h);
    if (aspect < 2.5 && box.n >= 40 && minSide >= Math.max(16, Math.round(pageH * 0.04)) && diagN && antiN && diag / diagN > 0.45 && anti / antiN > 0.45) return '叉号';
    var density = box.n && box.w && box.h ? box.n / (box.w * box.h) : fill / (n * n);
    var flat = (box.w > box.h * 4 && box.h <= 12) || (box.h > box.w * 4 && box.w <= 8);
    var thin = density < 0.16 && Math.max(box.w, box.h) > 28;
    if (flat || thin) return '页标';
    var wide = 0, c;
    for (j = 0; j < n; j++) {
      c = 0;
      for (i = 0; i < n; i++) if (grid[j][i]) c++;
      if (c > wide) wide = c;
    }
    if (wide >= n * 0.5 && fill < n * n * 0.55) return '页标';
    var best = 0, bestRow = 0;
    for (j = 0; j < Math.floor(n * 0.75); j++) {
      c = 0;
      for (i = 0; i < n; i++) if (grid[j][i]) c++;
      if (c > best) { best = c; bestRow = j; }
    }
    if (best >= n * 0.34) {
      var vert = 0, below = 0, belowN = 0;
      for (i = 0; i < n; i++) {
        var run = 0;
        for (j = bestRow + 1; j < n; j++) if (grid[j][i]) run++;
        if (run > vert) vert = run;
      }
      for (j = bestRow + 1; j < n; j++) for (i = 0; i < n; i++) {
        belowN++;
        if (grid[j][i]) below++;
      }
      var room = n - bestRow - 1;
      if (room >= 3 && vert >= room * 0.4 && belowN && below / belowN < 0.5) return '页标';
    }
    if (density >= 0.45 && box.n >= 48 && Math.min(box.w, box.h) >= 8) return '批改';
    return '略过';
  }

  function inkAt(image, x, y) {
    var p = (y * image.width + x) * 4;
    return isInkPixel(image.data[p], image.data[p + 1], image.data[p + 2]);
  }

  function pageColumns(image) {
    var w = image.width, h = image.height;
    var col = new Int32Array(w);
    var y, x, total = 0;
    for (y = 0; y < h; y += 2) {
      for (x = 0; x < w; x++) if (inkAt(image, x, y)) { col[x]++; total++; }
    }
    if (!total) return [{ x0: 0, x1: w }];
    var a = Math.floor(w * 0.28), b = Math.ceil(w * 0.72);
    var best = null, run = 0, runStart = 0;
    var thresh = Math.max(2, Math.floor(h * 0.012));
    function consider(x0, x1) {
      if (x1 - x0 < w * 0.012) return;
      var left = 0, right = 0, i;
      for (i = 0; i < x0; i++) left += col[i];
      for (i = x1; i < w; i++) right += col[i];
      if (left < total * 0.18 || right < total * 0.18) return;
      if (!best || x1 - x0 > best.w) best = { x0: x0, x1: x1, w: x1 - x0 };
    }
    for (x = a; x < b; x++) {
      if (col[x] <= thresh) {
        if (!run) runStart = x;
        run++;
      } else if (run) {
        consider(runStart, x);
        run = 0;
      }
    }
    if (run) consider(runStart, b);
    if (!best) return [{ x0: 0, x1: w }];
    return [{ x0: 0, x1: best.x0 }, { x0: best.x1, x1: w }];
  }

  function gapBands(image, col) {
    var h = image.height;
    var runs = [], run = -1, y, x, ink, heights, median, mergeGap, bands;
    for (y = 0; y < h; y++) {
      ink = 0;
      for (x = col.x0; x < col.x1; x += 2) if (inkAt(image, x, y)) ink++;
      if (ink >= 3) { if (run < 0) run = y; }
      else if (run >= 0) { runs.push({ y0: run, y1: y }); run = -1; }
    }
    if (run >= 0) runs.push({ y0: run, y1: h });
    heights = runs.map(function (rn) { return rn.y1 - rn.y0; }).sort(function (a, b) { return a - b; });
    median = heights.length ? heights[Math.floor(heights.length / 2)] : 8;
    mergeGap = Math.max(8, Math.round(median * 2.2));
    bands = [];
    runs.forEach(function (rn) {
      var prev = bands[bands.length - 1];
      if (prev && rn.y0 - prev.y1 <= mergeGap) prev.y1 = rn.y1;
      else bands.push({ y0: rn.y0, y1: rn.y1, x0: col.x0, x1: col.x1 });
    });
    return bands;
  }

  function questionBands(image, col) {
    var h = image.height;
    var span = col.x1 - col.x0;
    var origin = col.x0 + Math.max(10, Math.round(span * 0.025));
    var lefts = [], y, x, first;
    for (y = 0; y < h; y += 2) {
      first = -1;
      for (x = origin; x < col.x1; x += 2) {
        if (inkAt(image, x, y)) { first = x; break; }
      }
      if (first >= 0) lefts.push(first);
    }
    if (lefts.length < 12) return gapBands(image, col);
    lefts.sort(function (a, b) { return a - b; });
    var edge = lefts[Math.floor(lefts.length * 0.22)];
    var unit = Math.max(10, Math.round(h * 0.02));
    var lines = [], run = -1;
    for (y = 0; y < h; y++) {
      first = -1;
      for (x = origin; x < Math.min(col.x1, edge + unit * 2); x++) {
        if (inkAt(image, x, y)) { first = x; break; }
      }
      var hit = first >= edge - Math.round(unit * 0.6) && first <= edge + unit;
      if (hit) { if (run < 0) run = y; }
      else if (run >= 0) { lines.push(run); run = -1; }
    }
    if (run >= 0) lines.push(run);
    var labels = [];
    lines.forEach(function (y0) {
      var y1 = Math.min(h, y0 + unit);
      var blob = 0, gap = 0, seen = false, after = false;
      for (x = Math.max(col.x0, edge - Math.round(unit * 0.3)); x < edge + unit * 3 && x < col.x1; x++) {
        var on = false, yy;
        for (yy = y0; yy < y1; yy++) if (inkAt(image, x, yy)) on = true;
        if (on && !after) { blob++; seen = true; gap = 0; }
        else if (seen && !on) { gap++; if (gap >= 2) after = true; }
        else if (after && on) break;
      }
      if (blob >= 2 && blob <= unit + 4 && after) labels.push(y0);
    });
    var collapsed = [];
    labels.forEach(function (y0) {
      if (!collapsed.length || y0 - collapsed[collapsed.length - 1] > unit) collapsed.push(y0);
    });
    labels = collapsed;
    if (labels.length < 2) return gapBands(image, col);
    var minGap = Math.max(36, Math.round(h * 0.09));
    var kept = [labels[0]];
    var i;
    for (i = 1; i < labels.length; i++) {
      if (labels[i] - kept[kept.length - 1] >= minGap) kept.push(labels[i]);
    }
    if (kept.length < 2) return gapBands(image, col);
    return kept.map(function (y0, index) {
      return { y0: y0, y1: kept[index + 1] || h, x0: col.x0, x1: col.x1 };
    });
  }

  function penComponents(image) {
    var w = image.width, h = image.height, data = image.data;
    var step = w * h > 1200000 ? 2 : 1;
    var cell = 2;
    var cols = Math.ceil(w / cell);
    var rows = Math.ceil(h / cell);
    var hot = new Uint8Array(cols * rows);
    var hotN = new Uint32Array(cols * rows);
    var penCount = 0;
    var y, x, p, r, g, b;
    for (y = 0; y < h; y += step) {
      for (x = 0; x < w; x += step) {
        p = (y * w + x) * 4;
        r = data[p]; g = data[p + 1]; b = data[p + 2];
        if (!isPenPixel(r, g, b)) continue;
        penCount++;
        var ci = Math.floor(y / cell) * cols + Math.floor(x / cell);
        hot[ci] = 1;
        hotN[ci]++;
      }
    }
    if (penCount * step * step > w * h * 0.18) return null;
    var link = new Uint8Array(hot.length);
    var radius = 2;
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        if (!hot[y * cols + x]) continue;
        var oy, ox, ny, nx;
        for (oy = -radius; oy <= radius; oy++) {
          for (ox = -radius; ox <= radius; ox++) {
            ny = y + oy;
            nx = x + ox;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            link[ny * cols + nx] = 1;
          }
        }
      }
    }
    var seen = new Uint8Array(hot.length);
    var pens = [];
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        var start = y * cols + x;
        if (!hot[start] || seen[start]) continue;
        var stack = [start];
        seen[start] = 1;
        var minX = x, maxX = x, minY = y, maxY = y, nPix = 0;
        while (stack.length) {
          var cur = stack.pop();
          var cy = Math.floor(cur / cols);
          var cx = cur - cy * cols;
          if (hotN[cur]) {
            nPix += hotN[cur];
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;
          }
          var oy, ox;
          for (oy = -1; oy <= 1; oy++) {
            for (ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue;
              var nx = cx + ox, ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              var ni = ny * cols + nx;
              if (!link[ni] || seen[ni]) continue;
              seen[ni] = 1;
              stack.push(ni);
            }
          }
        }
        if (nPix < 12) continue;
        var bw = (maxX - minX + 1) * cell;
        var bh = (maxY - minY + 1) * cell;
        if (bw * bh > w * h * 0.45) continue;
        pens.push({
          x: minX * cell,
          y: minY * cell,
          w: Math.min(bw, w - minX * cell),
          h: Math.min(bh, h - minY * cell),
          n: nPix * step * step
        });
      }
    }
    return pens;
  }

  function rotatePixels(image, quarter) {
    var q = ((quarter % 4) + 4) % 4;
    if (!q || !image) return image;
    var w = image.width, h = image.height, src = image.data;
    var swap = q % 2 === 1;
    var nw = swap ? h : w;
    var nh = swap ? w : h;
    var data = new Uint8ClampedArray(nw * nh * 4);
    var y, x, nx, ny, s, d;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (q === 1) { nx = h - 1 - y; ny = x; }
        else if (q === 2) { nx = w - 1 - x; ny = h - 1 - y; }
        else { nx = y; ny = w - 1 - x; }
        s = (y * w + x) * 4;
        d = (ny * nw + nx) * 4;
        data[d] = src[s];
        data[d + 1] = src[s + 1];
        data[d + 2] = src[s + 2];
        data[d + 3] = src[s + 3];
      }
    }
    return { width: nw, height: nh, data: data };
  }

  /* 正文行的左缘对齐、右缘参差，才是正放。倒着放时左右对调。横竖先看哪一边出现成行的文字。 */
  function readingScore(image) {
    var w = image.width, h = image.height, data = image.data;
    if (!w || !h || !data) return 0;
    var cols = new Int32Array(w);
    var y, x, p, step = 1;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x += 2) {
        p = (y * w + x) * 4;
        if (isInkPixel(data[p], data[p + 1], data[p + 2])) cols[x] += step;
      }
    }
    var halves = [{ x0: 0, x1: w }];
    var a = Math.floor(w * 0.32), b = Math.ceil(w * 0.68);
    var quiet = Math.max(2, Math.floor(h * 0.012));
    var run = 0, runStart = 0, gap = null, gx;
    for (gx = a; gx < b; gx++) {
      if (cols[gx] <= quiet) {
        if (!run) runStart = gx;
        run++;
      } else if (run) {
        if (!gap || run > gap.w) gap = { x0: runStart, x1: gx, w: run };
        run = 0;
      }
    }
    if (run && (!gap || run > gap.w)) gap = { x0: runStart, x1: b, w: run };
    var leftInk = 0, rightInk = 0;
    if (gap && gap.w > w * 0.015) {
      for (x = 0; x < gap.x0; x++) leftInk += cols[x];
      for (x = gap.x1; x < w; x++) rightInk += cols[x];
      if (leftInk > 80 && rightInk > 80) halves = [{ x0: 0, x1: gap.x0 }, { x0: gap.x1, x1: w }];
    }
    var score = 0;
    halves.forEach(function (half) {
      var span = half.x1 - half.x0;
      if (span < 40) return;
      var rows = new Int32Array(h);
      for (y = 0; y < h; y += step) {
        var c = 0;
        for (x = half.x0; x < half.x1; x += 2) {
          p = (y * w + x) * 4;
          if (isInkPixel(data[p], data[p + 1], data[p + 2])) c++;
        }
        rows[y] = c;
      }
      var minH = Math.max(4, Math.round(h * 0.008));
      var maxH = Math.max(minH + 2, Math.round(h * 0.045));
      var lines = [], runY = -1;
      for (y = 0; y < h; y++) {
        if (rows[y] >= 6) { if (runY < 0) runY = y; }
        else if (runY >= 0) { lines.push({ y0: runY, y1: y }); runY = -1; }
      }
      if (runY >= 0) lines.push({ y0: runY, y1: h });
      var lefts = [], rights = [];
      lines.forEach(function (ln) {
        var bh = ln.y1 - ln.y0;
        if (bh < minH || bh > maxH) return;
        var left = half.x1, right = half.x0 - 1, yy, xx;
        for (yy = ln.y0; yy < ln.y1; yy += step) {
          for (xx = half.x0; xx < half.x1; xx += 2) {
            p = (yy * w + xx) * 4;
            if (!isInkPixel(data[p], data[p + 1], data[p + 2])) continue;
            if (xx < left) left = xx;
            if (xx > right) right = xx;
          }
        }
        if (right - left < span * 0.28) return;
        lefts.push(left);
        rights.push(right);
      });
      if (lefts.length < 5) return;
      function spread(arr) {
        var i, n = arr.length, s = 0, s2 = 0;
        for (i = 0; i < n; i++) { s += arr[i]; s2 += arr[i] * arr[i]; }
        var m = s / n;
        return Math.sqrt(Math.max(0, s2 / n - m * m));
      }
      score += (spread(rights) - spread(lefts)) * lefts.length / span;
    });
    return score;
  }

  function rotationScores(image) {
    var scores = [];
    var current = image;
    var q;
    for (q = 0; q < 4; q++) {
      scores[q] = readingScore(current);
      if (q < 3) current = rotatePixels(current, 1);
    }
    return scores;
  }

  function suggestRotation(image) {
    var w = image && image.width || 0;
    var h = image && image.height || 0;
    if (!w || !h || !image.data || w * h < 8000) return 0;
    var scores = rotationScores(image);
    var best = 0;
    var q;
    for (q = 1; q < 4; q++) if (scores[q] > scores[best]) best = q;
    if (w > h * 1.25) {
      if (scores[2] > scores[0] + 0.04 && scores[2] > 2) return 2;
      return 0;
    }
    if (best && scores[best] < scores[0] + 0.04) return 0;
    return best;
  }

  function digitInk(image, x, y) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    var p = (y * image.width + x) * 4;
    var r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
    if (isPenPixel(r, g, b)) return false;
    return (r * 3 + g * 6 + b) / 10 < 162;
  }

  function shapeInk(image, x, y) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    var p = (y * image.width + x) * 4;
    var r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
    if (isPenPixel(r, g, b)) return false;
    return (r * 3 + g * 6 + b) / 10 < 165;
  }

  function numInk(image, x, y) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    var p = (y * image.width + x) * 4;
    var r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
    if (isPenPixel(r, g, b)) return false;
    return (r * 3 + g * 6 + b) / 10 < 145;
  }

  /* 页边印刷题号。只认能看清的 6（下半圈）和 8（两个圈），认不出就交回题目区域序号。 */
  function glyphDigit(image, x0, y0, bw, bh) {
    if (x0 <= 2 || bh > Math.max(18, bw * 2.3)) return 0;
    var gw = 14, gh = 20, grid = [], seen = [], y, x, sy, sx, on, yA, yB, xA, xB;
    for (y = 0; y < gh; y++) {
      grid[y] = [];
      seen[y] = [];
      yA = y0 + Math.floor(y * bh / gh);
      yB = Math.max(yA + 1, y0 + Math.floor((y + 1) * bh / gh));
      for (x = 0; x < gw; x++) {
        xA = x0 + Math.floor(x * bw / gw);
        xB = Math.max(xA + 1, x0 + Math.floor((x + 1) * bw / gw));
        on = false;
        for (sy = yA; sy < yB && !on; sy++) for (sx = xA; sx < xB; sx++) if (digitInk(image, sx, sy)) on = true;
        grid[y][x] = on ? 1 : 0;
      }
    }
    var holes = [];
    function walk(sx0, sy0) {
      var stack = [[sx0, sy0]], n = 0, minY = sy0, maxY = sy0, touch = false;
      seen[sy0][sx0] = 1;
      while (stack.length) {
        var c = stack.pop();
        n++;
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
        if (!c[0] || !c[1] || c[0] === gw - 1 || c[1] === gh - 1) touch = true;
        var oy, ox, nx, ny;
        for (oy = -1; oy <= 1; oy++) {
          for (ox = -1; ox <= 1; ox++) {
            nx = c[0] + ox;
            ny = c[1] + oy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            if (grid[ny][nx] || seen[ny][nx]) continue;
            seen[ny][nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      return { n: n, touch: touch, mid: (minY + maxY) / 2 / gh };
    }
    for (y = 0; y < gh; y++) {
      for (x = 0; x < gw; x++) {
        if (grid[y][x] || seen[y][x]) continue;
        var info = walk(x, y);
        if (!info.touch && info.n >= 2) holes.push(info);
      }
    }
    if (holes.length === 2 && holes[0].n >= 5 && holes[1].n >= 5) return 8;
    if (holes.length === 1 && holes[0].n >= 8 && holes[0].mid > 0.5) return 6;
    return 0;
  }

  function marginDigit(image, col, y0, y1) {
    var span = Math.max(1, col.x1 - col.x0);
    var unit = Math.max(8, Math.round(image.height * 0.018));
    var x0 = Math.max(0, col.x0 - unit);
    var x1 = Math.min(image.width, col.x0 + Math.round(span * 0.16));
    y0 = Math.max(0, y0);
    y1 = Math.min(image.height, y1);
    if (y1 - y0 < unit * 0.6 || x1 - x0 < unit) return 0;
    var gw = x1 - x0, gh = y1 - y0;
    var seen = new Uint8Array(gw * gh);
    function id(x, y) { return (y - y0) * gw + (x - x0); }
    var found = [], y, x;
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        if (!digitInk(image, x, y) || seen[id(x, y)]) continue;
        var stack = [[x, y]];
        seen[id(x, y)] = 1;
        var minX = x, maxX = x, minY = y, maxY = y, n = 0;
        while (stack.length) {
          var c = stack.pop();
          n++;
          if (c[0] < minX) minX = c[0];
          if (c[0] > maxX) maxX = c[0];
          if (c[1] < minY) minY = c[1];
          if (c[1] > maxY) maxY = c[1];
          var oy, ox, nx, ny;
          for (oy = -1; oy <= 1; oy++) {
            for (ox = -1; ox <= 1; ox++) {
              nx = c[0] + ox;
              ny = c[1] + oy;
              if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
              if (!digitInk(image, nx, ny) || seen[id(nx, ny)]) continue;
              seen[id(nx, ny)] = 1;
              stack.push([nx, ny]);
            }
          }
        }
        var bw = maxX - minX + 1, bh = maxY - minY + 1;
        var minSide = Math.max(4, Math.round(unit * 0.45));
        var slim = bw <= Math.max(4, unit * 0.7) && bh >= unit * 0.7 && bh <= unit * 4.2 && bw * 2 < bh && n >= bh * 0.45;
        var shaped = n >= minSide * 2 && bw >= minSide && bh >= minSide && bw <= unit * 1.8 && bh <= unit * 2.6 && bw <= bh;
        if (!slim && !shaped) continue;
        found.push({ x: minX, y: minY, w: bw, h: bh });
      }
    }
    found.sort(function (a, b) { return a.x - b.x; });
    for (x = 0; x < found.length; x++) {
      var digit = glyphDigit(image, found[x].x, found[x].y, found[x].w, found[x].h);
      if (digit) return digit;
    }
    return 0;
  }


  /* 通用像素阈值按约 1024 宽校准。更宽的照片先缩到这个宽度，框再映射回原图。 */
  function fitForAnalysis(image) {
    var maxW = 1024;
    if (!image || !image.width || !image.height || !image.data || image.width <= maxW) return image;
    var w = maxW;
    var h = Math.max(1, Math.round(image.height * maxW / image.width));
    var data = new Uint8ClampedArray(w * h * 4);
    var x, y, sx, sy, s, d;
    for (y = 0; y < h; y++) {
      sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / h));
      for (x = 0; x < w; x++) {
        sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / w));
        s = (sy * image.width + sx) * 4;
        d = (y * w + x) * 4;
        data[d] = image.data[s];
        data[d + 1] = image.data[s + 1];
        data[d + 2] = image.data[s + 2];
        data[d + 3] = image.data[s + 3];
      }
    }
    return { width: w, height: h, data: data };
  }

  function scaleQuestion(q, sx, sy) {
    return {
      x: Math.round(q.x * sx),
      y: Math.round(q.y * sy),
      w: Math.max(1, Math.round(q.w * sx)),
      h: Math.max(1, Math.round(q.h * sy)),
      number: q.number,
      kind: q.kind,
      prompt: q.prompt,
      correction: q.correction,
      reasonNote: q.reasonNote,
      reason: q.reason,
      knowledge: q.knowledge || '',
      studentAnswer: q.studentAnswer || ''
    };
  }

  function questionRank(value) {
    var n = parseInt(value, 10);
    return n > 0 ? n : 1000;
  }




  function headerDigit(image, x0, y0, x1, y1) {
    var bw = x1 - x0, bh = y1 - y0;
    if (bh < 28 || bw < 6) return -1;
    var gw = 10, gh = 14, grid = [], seen = [], y, x;
    for (y = 0; y < gh; y++) {
      grid[y] = [];
      seen[y] = [];
      for (x = 0; x < gw; x++) {
        var on = false, yy, xx, p, r, g, b;
        var ya = y0 + Math.floor(y * bh / gh), yb = Math.max(ya + 1, y0 + Math.floor((y + 1) * bh / gh));
        var xa = x0 + Math.floor(x * bw / gw), xb = Math.max(xa + 1, x0 + Math.floor((x + 1) * bw / gw));
        for (yy = ya; yy < yb && !on; yy++) for (xx = xa; xx < xb; xx++) {
          if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
          p = (yy * image.width + xx) * 4;
          r = image.data[p]; g = image.data[p + 1]; b = image.data[p + 2];
          if (isPenPixel(r, g, b)) on = true;
        }
        grid[y][x] = on ? 1 : 0;
      }
    }
    var holes = [];
    function walk(sx, sy) {
      var stack = [[sx, sy]], n = 0, minY = sy, maxY = sy, touch = false;
      seen[sy][sx] = 1;
      while (stack.length) {
        var c = stack.pop();
        n++;
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
        if (!c[0] || !c[1] || c[0] === gw - 1 || c[1] === gh - 1) touch = true;
        var oy, ox, nx, ny;
        for (oy = -1; oy <= 1; oy++) for (ox = -1; ox <= 1; ox++) {
          nx = c[0] + ox; ny = c[1] + oy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || grid[ny][nx] || seen[ny][nx]) continue;
          seen[ny][nx] = 1;
          stack.push([nx, ny]);
        }
      }
      return { n: n, touch: touch, mid: (minY + maxY) / 2 / gh };
    }
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) if (!grid[y][x] && !seen[y][x]) {
      var info = walk(x, y);
      if (!info.touch && info.n >= 3) holes.push(info);
    }
    var minC = gw, maxC = 0;
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) if (grid[y][x]) {
      if (x < minC) minC = x;
      if (x > maxC) maxC = x;
    }
    if (holes.length >= 2) return 8;
    if (maxC - minC <= 3) return 1;
    if (holes.length === 1 && holes[0].mid > 0.55) return 6;
    if (holes.length === 1 && holes[0].mid < 0.45) {
      var bowlL = 0, bowlR = 0, waist = 0;
      for (y = gh - 5; y < gh - 1; y++) for (x = 0; x < gw; x++) if (grid[y][x]) {
        if (x < gw / 2) bowlL++; else bowlR++;
      }
      for (y = 4; y <= 8; y++) for (x = 0; x < gw; x++) if (grid[y][x]) waist++;
      if (bowlL >= 4 && bowlR >= 3 && waist >= 12) return 8;
      return 9;
    }
    if (holes.length === 1) return 0;
    var right = 0, left = 0;
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) if (grid[y][x]) {
      if (x < gw / 2) left++; else right++;
    }
    if (right > left * 1.15) return 3;
    return 2;
  }

  /* 只读页面最上方的一组大号红笔数字，不猜它是得分还是扣分。 */
  function headerNumberMark(image) {
    var w = image.width, h = image.height, yLimit = Math.round(h * 0.2);
    var cols = new Int32Array(w), y, x, p, r, g, b;
    for (y = 0; y < yLimit; y++) for (x = 0; x < w; x++) {
      p = (y * w + x) * 4;
      r = image.data[p]; g = image.data[p + 1]; b = image.data[p + 2];
      if (isPenPixel(r, g, b)) cols[x]++;
    }
    var runs = [], run = -1;
    for (x = 0; x < w; x++) {
      if (cols[x] >= 4) { if (run < 0) run = x; }
      else if (run >= 0) { runs.push([run, x]); run = -1; }
    }
    if (run >= 0) runs.push([run, w]);
    var bandTop = yLimit, bandBot = 0;
    runs.forEach(function (rn) {
      var top = yLimit, bot = 0, yy, xx;
      for (yy = 0; yy < yLimit; yy++) for (xx = rn[0]; xx < rn[1]; xx++) {
        p = (yy * w + xx) * 4;
        if (!isPenPixel(image.data[p], image.data[p + 1], image.data[p + 2])) continue;
        if (yy < top) top = yy;
        if (yy > bot) bot = yy;
      }
      var bh = bot - top, bw = rn[1] - rn[0];
      if (bh >= 36 && bh <= 90 && bw >= 12 && bw <= 120 && top < h * 0.06) {
        if (top < bandTop) bandTop = top;
        if (bot > bandBot) bandBot = bot;
      }
    });
    if (bandBot <= bandTop) return 0;
    cols = new Int32Array(w);
    for (y = bandTop; y <= bandBot; y++) for (x = 0; x < w; x++) {
      p = (y * w + x) * 4;
      if (isPenPixel(image.data[p], image.data[p + 1], image.data[p + 2])) cols[x]++;
    }
    runs = []; run = -1;
    for (x = 0; x < w; x++) {
      if (cols[x] >= 2) { if (run < 0) run = x; }
      else if (run >= 0) { if (x - run >= 4) runs.push([run, x]); run = -1; }
    }
    if (run >= 0) runs.push([run, w]);
    var merged = [], split = [];
    runs.forEach(function (rn) {
      var prev = merged[merged.length - 1];
      var gap = prev ? rn[0] - prev[1] : 99;
      var joined = prev ? rn[1] - prev[0] : 0;
      if (prev && gap <= 4) prev[1] = rn[1];
      else if (prev && gap <= 10 && joined <= 40) prev[1] = rn[1];
      else merged.push([rn[0], rn[1]]);
    });
    merged.forEach(function (rn) { splitRun(rn); });
    function splitRun(rn) {
      var width = rn[1] - rn[0];
      if (width <= 36) { split.push(rn); return; }
      var mid0 = rn[0] + Math.floor(width * 0.3);
      var mid1 = rn[0] + Math.floor(width * 0.7);
      var best = mid0, bestV = cols[mid0], k;
      for (k = mid0; k < mid1; k++) if (cols[k] < bestV) { bestV = cols[k]; best = k; }
      var side = Math.max(cols[rn[0] + 2] || 0, cols[rn[1] - 3] || 0);
      if (best <= rn[0] + 4 || best >= rn[1] - 5 || bestV > side * 0.72) { split.push(rn); return; }
      splitRun([rn[0], best]);
      splitRun([best + 1, rn[1]]);
    }
    var digits = [];
    split.forEach(function (rn) {
      if (rn[1] - rn[0] < 8 || rn[1] - rn[0] > 70) return;
      var d = headerDigit(image, rn[0], bandTop, rn[1], bandBot + 1);
      if (d >= 0) digits.push({ x: rn[0], x1: rn[1], d: d });
    });
    if (!digits.length) return 0;
    var anchor = null;
    digits.forEach(function (item) { if (item.d === 8 && !anchor) anchor = item; });
    if (!anchor) anchor = digits[0];
    var n = '', last = anchor.x;
    digits.forEach(function (item) {
      if (item.x < anchor.x - 4) return;
      if (item.x > last + 14) return;
      n += item.d;
      last = item.x1;
    });
    var value = parseInt(n, 10);
    if (!(value >= 1 && value <= 99)) return 0;
    return value;
  }

  function penAt(image, x, y) {
    var oy, ox, yy, xx, p;
    for (oy = -1; oy <= 1; oy++) for (ox = -1; ox <= 1; ox++) {
      xx = x + ox; yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
      p = (yy * image.width + xx) * 4;
      if (isPenPixel(image.data[p], image.data[p + 1], image.data[p + 2])) return true;
    }
    return false;
  }

  function printedInside(image, cx, cy, r) {
    var ink = 0, n = 0, sy, sx, px, py, p, r0, g0, b0, lum;
    for (sy = -r; sy <= r; sy += 3) for (sx = -r; sx <= r; sx += 3) {
      if (sx * sx + sy * sy > r * r * 0.36) continue;
      px = cx + sx; py = cy + sy;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      p = (py * image.width + px) * 4;
      r0 = image.data[p]; g0 = image.data[p + 1]; b0 = image.data[p + 2];
      n++;
      if (isPenPixel(r0, g0, b0)) continue;
      lum = (r0 * 3 + g0 * 6 + b0) / 10;
      if (lum < 150) ink++;
    }
    return n && ink / n >= 0.04;
  }

  function penCore(image, cx, cy, r) {
    var ink = 0, n = 0, sy, sx, px, py, p, r0, g0, b0;
    for (sy = -r; sy <= r; sy += 2) for (sx = -r; sx <= r; sx += 2) {
      if (sx * sx + sy * sy > r * r * 0.2) continue;
      px = cx + sx; py = cy + sy;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      p = (py * image.width + px) * 4;
      r0 = image.data[p]; g0 = image.data[p + 1]; b0 = image.data[p + 2];
      n++;
      if (isPenPixel(r0, g0, b0)) ink++;
    }
    return n && ink / n >= 0.12 && ink / n <= 0.65;
  }

  function answerRings(image) {
    var w = image.width, h = image.height, found = [], radii = [10, 14, 18, 24];
    var ri, r, cy, cx, a, rad, px, py, ring, ringN, inner, innerN;
    for (ri = 0; ri < radii.length; ri++) {
      r = radii[ri];
      for (cy = r + 4; cy < h - r; cy += 6) {
        for (cx = r + 4; cx < w - r; cx += 6) {
          if (cy < h * 0.12) continue;
          ring = 0; ringN = 0; inner = 0; innerN = 0;
          for (a = 0; a < 16; a++) {
            rad = a / 16 * Math.PI * 2;
            px = Math.round(cx + Math.cos(rad) * r);
            py = Math.round(cy + Math.sin(rad) * r);
            ringN++;
            if (penAt(image, px, py)) ring++;
            px = Math.round(cx + Math.cos(rad) * r * 0.4);
            py = Math.round(cy + Math.sin(rad) * r * 0.4);
            innerN++;
            if (penAt(image, px, py)) inner++;
          }
          if (ring / ringN < 0.62 || inner / innerN > 0.3) continue;
          if (!printedInside(image, cx, cy, r) && !penCore(image, cx, cy, r)) continue;
          found.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, cx: cx, cy: cy });
        }
      }
    }
    var stroke = penComponents(image) || [];
    r = 10;
    for (cy = r + 4; cy < h - r; cy += 4) {
      if (cy < h * 0.13) continue;
      for (cx = r + 4; cx < w - r; cx += 4) {
        var nearStroke = stroke.some(function (pen) {
          return Math.abs(pen.x + pen.w / 2 - cx) <= 14 && Math.abs(pen.y + pen.h / 2 - cy) <= 18;
        });
        if (!nearStroke) continue;
        ring = 0; ringN = 0; inner = 0; innerN = 0;
        for (a = 0; a < 20; a++) {
          rad = a / 20 * Math.PI * 2;
          px = Math.round(cx + Math.cos(rad) * r);
          py = Math.round(cy + Math.sin(rad) * r);
          ringN++;
          if (penAt(image, px + 1, py) || penAt(image, px - 1, py) || penAt(image, px, py + 1) || penAt(image, px, py - 1)) ring++;
          px = Math.round(cx + Math.cos(rad) * r * 0.4);
          py = Math.round(cy + Math.sin(rad) * r * 0.4);
          innerN++;
          if (penAt(image, px, py)) inner++;
        }
        if (ring / ringN < 0.74 || inner / innerN > 0.15) continue;
        found.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, cx: cx, cy: cy });
      }
    }
    var kept = [];
    found.forEach(function (item) {
      if (kept.some(function (k) { return Math.abs(k.cx - item.cx) < 36 && Math.abs(k.cy - item.cy) < 36; })) return;
      var radius = item.w / 2;
      if (radius <= 12) {
        var reach = radius * 2.6, minX = item.cx, maxX = item.cx, minY = item.cy, maxY = item.cy, yy, xx, pix;
        for (yy = Math.round(item.cy - reach); yy <= item.cy + reach; yy++) {
          for (xx = Math.round(item.cx - reach); xx <= item.cx + reach; xx++) {
            if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
            pix = (yy * image.width + xx) * 4;
            if (!isPenPixel(image.data[pix], image.data[pix + 1], image.data[pix + 2])) continue;
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
            if (yy < minY) minY = yy;
            if (yy > maxY) maxY = yy;
          }
        }
        if (maxX - minX > radius * 4.8 || maxY - minY > radius * 4.8) return;
      }
      kept.push(item);
    });
    return kept;
  }

  /* 软照片上的印刷题号往往只有三五像素。认得出 0、1、2、3、8、9 就用，认不出再交给下面的格子。 */
  function smallDigit(image, x0, y0, bw, bh) {
    if (bw < 1 || bw > 6 || bh < 5 || bh > 22) return -1;
    var rows = [], y, x, n, first, last, seen = false;
    for (y = y0; y < y0 + bh; y++) {
      n = 0; first = -1; last = -1;
      for (x = 0; x < bw; x++) if (shapeInk(image, x0 + x, y)) {
        n++;
        if (first < 0) first = x;
        last = x;
      }
      if (n) seen = true;
      if (seen) rows.push({ n: n, first: first, last: last, gap: n > 1 && last > first && n < last - first + 1 });
    }
    while (rows.length && !rows[rows.length - 1].n) rows.pop();
    if (rows.length < 4) return -1;
    var H = rows.length;
    function zone(a, b, pred) {
      var c = 0, i, i0 = Math.floor(H * a), i1 = Math.max(i0 + 1, Math.ceil(H * b));
      for (i = i0; i < i1 && i < H; i++) if (pred(rows[i])) c++;
      return c;
    }
    var splitHi = zone(0, 0.48, function (r) { return r.gap; });
    var splitLo = zone(0.52, 1, function (r) { return r.gap; });
    var solidMid = zone(0.32, 0.72, function (r) { return r.n >= Math.max(2, Math.ceil(bw * 0.75)) && !r.gap; });
    var fullTop = zone(0, 0.38, function (r) { return r.n >= Math.max(2, Math.ceil(bw * 0.66)); });
    var fullBot = zone(0.68, 1, function (r) { return r.n >= Math.max(2, Math.ceil(bw * 0.66)); });
    var rightStem = zone(0.58, 1, function (r) { return r.n && r.last >= bw - 1 && r.first >= Math.floor(bw / 2); });
    var oneCol = rows.every(function (r) { return !r.n || r.last === r.first; });
    if (oneCol && rows.filter(function (r) { return r.n; }).length >= 5) return 1;
    if (splitHi && splitLo && solidMid) return 8;
    if (splitHi && !splitLo && rightStem && !fullBot) return 9;
    var midSplit = zone(0.15, 0.85, function (r) { return r.gap; });
    if (!solidMid && midSplit >= 2 && !fullTop && !fullBot) return 0;
    var up = 0, upN = 0, lo = 0, loN = 0, i, opens = 0, inOpen = false, rightOn = 0;
    for (i = 0; i < H; i++) {
      if (!rows[i].n) { inOpen = false; continue; }
      if (i < H / 2) { up += rows[i].first + rows[i].last; upN += 2; }
      else { lo += rows[i].first + rows[i].last; loN += 2; }
      if (rows[i].last >= bw - 1) rightOn++;
      var open = rows[i].first >= Math.max(1, Math.floor(bw / 3));
      if (open && !inOpen) opens++;
      inOpen = open;
    }
    var midThin = zone(0.28, 0.75, function (r) { return r.n > 0 && r.n <= Math.max(1, Math.floor(bw * 0.6)); });
    if (fullTop && fullBot && midThin && !splitHi && !splitLo && upN && loN && (up / upN) > (lo / loN) + 0.2) return 2;
    if (bw <= 2 && fullTop && fullBot && midThin && !splitHi && !splitLo) return 2;
    if (bw >= 3 && rightOn >= H * 0.7 && opens >= 1 && opens <= 2 && !splitHi && !splitLo) return 3;
    if (bw <= 2 && rows.filter(function (r) { return r.n >= bw; }).length >= H * 0.6) return 1;
    return -1;
  }

  function lineDigit(image, x0, y0, bw, bh) {
    var soft = smallDigit(image, x0, y0, bw, bh);
    if (soft >= 0) return soft;
    if (bw <= 5 && bh >= 6) {
      var topRow = -1, botRow = -1, sy, sx;
      for (sy = y0; sy < y0 + bh; sy++) for (sx = x0; sx < x0 + bw; sx++) if (shapeInk(image, sx, sy)) {
        if (topRow < 0) topRow = sy;
        botRow = sy;
      }
      if (topRow >= 0 && botRow - topRow >= 5) {
        var topOn = 0, botOn = 0, up = 0, upN = 0, lo = 0, loN = 0, mid = (topRow + botRow) / 2;
        for (sx = x0; sx < x0 + bw; sx++) {
          if (shapeInk(image, sx, topRow) || shapeInk(image, sx, topRow + 1)) topOn++;
          if (shapeInk(image, sx, botRow) || (botRow > topRow && shapeInk(image, sx, botRow - 1))) botOn++;
        }
        for (sy = topRow; sy <= botRow; sy++) for (sx = x0; sx < x0 + bw; sx++) if (shapeInk(image, sx, sy)) {
          if (sy < mid) { up += sx; upN++; }
          else { lo += sx; loN++; }
        }
        if (topOn >= Math.max(2, bw * 0.6) && botOn >= Math.max(2, bw * 0.6) && upN && loN && (up / upN) > (lo / loN) + 0.3) return 2;
      }
    }
    var minX = x0 + bw, minY = y0 + bh, maxX = x0, maxY = y0, any = false, y, x;
    for (y = y0; y < y0 + bh; y++) for (x = x0; x < x0 + bw; x++) if (numInk(image, x, y)) {
      any = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (!any) return -1;
    bw = maxX - minX + 1; bh = maxY - minY + 1; x0 = minX; y0 = minY;
    if (bw <= 3 && bh >= 5) {
      var stem = 0, row, leftCol = bw, rightCol = 0;
      for (row = y0; row < y0 + bh; row++) {
        var across = 0, col;
        for (col = x0; col < x0 + bw; col++) if (numInk(image, col, row)) {
          across++;
          if (col - x0 < leftCol) leftCol = col - x0;
          if (col - x0 > rightCol) rightCol = col - x0;
        }
        if (across >= bw) stem++;
      }
      if (rightCol - leftCol <= 0 && stem >= bh * 0.6) return 1;
    }
    if (bh >= 6 && bw <= 8 && bh >= bw * 1.6) {
      var full = 0, yy, xx, c, spanL = bw, spanR = 0;
      for (yy = y0; yy < y0 + bh; yy++) {
        c = 0;
        for (xx = x0; xx < x0 + bw; xx++) if (numInk(image, xx, yy)) {
          c++;
          if (xx - x0 < spanL) spanL = xx - x0;
          if (xx - x0 > spanR) spanR = xx - x0;
        }
        if (c >= bw * 0.7) full++;
      }
      if (spanR - spanL <= 1 && full <= 1) return 1;
    }
    var gw = 8, gh = 10, grid = [], seen = [], sy, sx;
    for (y = 0; y < gh; y++) {
      grid[y] = [];
      seen[y] = [];
      for (x = 0; x < gw; x++) {
        var on = false;
        var ya = y0 + Math.floor(y * bh / gh), yb = Math.max(ya + 1, y0 + Math.floor((y + 1) * bh / gh));
        var xa = x0 + Math.floor(x * bw / gw), xb = Math.max(xa + 1, x0 + Math.floor((x + 1) * bw / gw));
        for (sy = ya; sy < yb && !on; sy++) for (sx = xa; sx < xb; sx++) if (numInk(image, sx, sy)) on = true;
        grid[y][x] = on ? 1 : 0;
      }
    }
    var holes = [];
    function walk(sx0, sy0) {
      var stack = [[sx0, sy0]], n = 0, minY = sy0, maxY = sy0, touch = false;
      seen[sy0][sx0] = 1;
      while (stack.length) {
        var c = stack.pop();
        n++;
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
        if (!c[0] || !c[1] || c[0] === gw - 1 || c[1] === gh - 1) touch = true;
        var oy, ox, nx, ny;
        for (oy = -1; oy <= 1; oy++) for (ox = -1; ox <= 1; ox++) {
          nx = c[0] + ox; ny = c[1] + oy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || grid[ny][nx] || seen[ny][nx]) continue;
          seen[ny][nx] = 1;
          stack.push([nx, ny]);
        }
      }
      return { n: n, touch: touch, mid: (minY + maxY) / 2 / gh };
    }
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) if (!grid[y][x] && !seen[y][x]) {
      var info = walk(x, y);
      if (!info.touch && info.n >= 2) holes.push(info);
    }
    function band(j0, j1) {
      var n = 0, t = 0;
      for (y = j0; y < j1; y++) for (x = 0; x < gw; x++) { t++; if (grid[y][x]) n++; }
      return t ? n / t : 0;
    }
    function side(i0, i1) {
      var n = 0, t = 0;
      for (x = i0; x < i1; x++) for (y = 0; y < gh; y++) { t++; if (grid[y][x]) n++; }
      return t ? n / t : 0;
    }
    var top = band(0, 3), mid = band(4, 6), bot = band(7, 10);
    var left = side(0, 3), right = side(5, 8);
    if (holes.length >= 2) return 8;
    if (holes.length === 1) {
      if (holes[0].mid > 0.62) return 6;
      if (holes[0].mid < 0.4 && bot < 0.25) return 9;
      if (holes[0].mid < 0.42 && right > left) return 4;
      return 0;
    }
    if (top > 0.35 && bot > 0.28 && mid < 0.35 && left < 0.35 && right > 0.4) return 2;
    if (right > 0.45 && left < 0.35 && top > 0.25 && bot > 0.2) return 3;
    if (top > 0.4 && bot < 0.28 && right > left) return 7;
    if (top > 0.3 && left > 0.35 && right > 0.3 && bot > 0.25 && mid > 0.2) return 5;
    if (right > 0.4 && mid > 0.35 && top < 0.35) return 4;
    return -1;
  }

  function printedLabels(image, col) {
    var lines = [], y, run = -1, x, first;
    for (y = 0; y < image.height; y++) {
      first = -1;
      for (x = col.x0; x < col.x1; x++) if (numInk(image, x, y)) { first = x; break; }
      if (first >= 0) { if (run < 0) run = y; }
      else if (run >= 0) {
        var left = col.x1, yy, xx;
        for (yy = run; yy < y; yy++) for (xx = col.x0; xx < col.x1; xx++) if (numInk(image, xx, yy)) { if (xx < left) left = xx; break; }
        if (y - run >= 6 && y - run <= 22) lines.push({ y: run, h: y - run, x: left });
        run = -1;
      }
    }
    if (lines.length < 3) return [];
    var xs = lines.map(function (ln) { return ln.x; }).sort(function (a, b) { return a - b; });
    var edge = xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.2))];
    var picked = [];
    lines.forEach(function (ln) {
      if (ln.x > edge + 10 || ln.y < image.height * 0.03) return;
      var gx = ln.x, n = 0, digits = 0, origin = -1, y0 = ln.y, y1 = ln.y + ln.h;
      var limit = Math.min(col.x1, ln.x + 42);
      while (gx < limit && digits < 2) {
        while (gx < ln.x + 26 && gx < limit && !colOn(gx)) gx++;
        if (gx >= ln.x + 26 || gx >= limit) break;
        var gx1 = gx;
        while (gx1 < limit && gx1 - gx < 8) {
          if (colOn(gx1)) { gx1++; continue; }
          if (gx1 - gx >= 2 && gx1 + 1 < limit && colOn(gx1 + 1) && gx1 + 1 - gx <= 7) { gx1++; continue; }
          break;
        }
        var d = -1;
        if (gx1 - gx >= 1 && gx1 - gx <= 16) d = lineDigit(image, gx, y0, gx1 - gx, y1 - y0);
        if (d >= 0 && origin < 0) origin = gx;
        gx = gx1;
        var gap = 0;
        while (gx < limit && !colOn(gx)) { gap++; gx++; }
        if (d >= 0) { n = n * 10 + d; digits++; }
        if (gap > 5) break;
      }
      if (digits) picked.push({ y: ln.y, n: n, x0: col.x0, x1: col.x1, gx: origin });
      function colOn(px) {
        var yy;
        for (yy = y0; yy < y1; yy++) if (numInk(image, px, yy)) return true;
        return false;
      }
    });
    if (picked.length < 3) return [];
    var gaps = [], i;
    for (i = 1; i < picked.length; i++) gaps.push(picked[i].y - picked[i - 1].y);
    var sorted = gaps.slice().sort(function (a, b) { return a - b; });
    var med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 40;
    var spaced = [picked[0]];
    for (i = 1; i < picked.length; i++) {
      var gap = picked[i].y - picked[i - 1].y;
      if (gap < 30 && gap < med * 0.6) continue;
      spaced.push(picked[i]);
    }
    picked = spaced;
    if (picked.length < 3) return [];
    gaps = [];
    for (i = 1; i < picked.length; i++) gaps.push(picked[i].y - picked[i - 1].y);
    sorted = gaps.slice().sort(function (a, b) { return a - b; });
    med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 40;
    var step = [0];
    for (i = 1; i < picked.length; i++) step.push(step[i - 1] + (picked[i].y - picked[i - 1].y > med * 1.65 ? 2 : 1));
    var base = null, bestDist = 0, bestHits = 0;
    for (i = 0; i < picked.length; i++) {
      if (picked[i].n < 10 || picked[i].n > 40) continue;
      var guess = picked[i].n - step[i];
      if (guess < 1) continue;
      var dist = 0, hits = 0, j;
      for (j = 0; j < picked.length; j++) {
        if (j === i || !picked[j].n) continue;
        var expect = guess + step[j];
        var read = picked[j].n;
        var hit = read === expect || (read < 10 && read === expect % 10);
        if (!hit) continue;
        hits++;
        dist = Math.max(dist, Math.abs(step[j] - step[i]));
      }
      if (dist >= 3 && (hits > bestHits || (hits === bestHits && dist >= bestDist))) {
        base = guess; bestHits = hits; bestDist = dist;
      }
    }
    if (base == null && picked.length && picked[0].n >= 15 && picked[0].n <= 40 && picked[0].y < image.height * 0.2) {
      var head = [picked[0]], t;
      for (t = 1; t < picked.length; t++) {
        if (picked[t].y - head[head.length - 1].y < 36) continue;
        head.push(picked[t]);
      }
      if (head.length >= 2 && head.length <= 8) {
        return head.map(function (ln, idx) {
          return { y: ln.y, n: picked[0].n + idx, read: ln.n, x0: ln.x0, x1: ln.x1, gx: ln.gx };
        });
      }
    }
    if (base == null) return [];
    return picked.map(function (ln, idx) {
      return { y: ln.y, n: base + step[idx], read: ln.n, x0: ln.x0, x1: ln.x1, gx: ln.gx };
    });
  }

  /* 题号行被插图连成一条时，按上一题的位置把下一题的两个数字找回来。 */
  function findFollow(image, gx, gy, want) {
    if (!(want >= 10 && want <= 40) || gx < 0) return -1;
    var tens = Math.floor(want / 10), ones = want % 10;
    var y, dx, x2, d1, d2;
    for (y = gy + 36; y < gy + 260 && y + 11 < image.height; y += 2) {
      for (dx = -8; dx <= 10; dx += 2) {
        d1 = lineDigit(image, gx + dx, y, 6, 11);
        if (d1 !== tens) continue;
        for (x2 = gx + dx + 6; x2 <= gx + dx + 16; x2 += 2) {
          d2 = lineDigit(image, x2, y, 6, 11);
          if (d2 === ones) return y;
        }
      }
    }
    return -1;
  }

  function lightInk(image, x, y) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    var p = (y * image.width + x) * 4;
    var r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
    if (isPenPixel(r, g, b)) return false;
    return (r * 3 + g * 6 + b) / 10 < 175;
  }

  /* 另一页已经从 8 这样的题号排起来时，这一页前面剩下的题按行距补成 1、2、3。 */
  function leadingLabels(image, col, nextStart) {
    if (!(nextStart >= 2 && nextStart <= 24)) return [];
    var want = nextStart - 1, best = null, x0, y, run, x;
    for (x0 = col.x0 + 8; x0 < Math.min(col.x1 - 24, col.x0 + 150); x0 += 4) {
      var x1 = x0 + 22, lines = [];
      run = -1;
      for (y = 0; y < image.height; y++) {
        var hit = false;
        for (x = x0; x < x1; x++) if (lightInk(image, x, y)) { hit = true; break; }
        if (hit) { if (run < 0) run = y; }
        else if (run >= 0) {
          if (y - run >= 5 && y - run <= 14 && run > image.height * 0.16) {
            var n = 0, left = 0, yy, xx;
            for (yy = run; yy < y; yy++) for (xx = x0; xx < x1; xx++) if (lightInk(image, xx, yy)) {
              n++;
              if (xx < x0 + 16) left++;
            }
            if (n >= 6 && n <= 90 && left > n * 0.4) lines.push(run);
          }
          run = -1;
        }
      }
      var spaced = [];
      lines.forEach(function (yy) {
        if (!spaced.length || yy - spaced[spaced.length - 1] >= 24) spaced.push(yy);
      });
      if (spaced.length < want - 2 || spaced.length > want) continue;
      var gaps = [], i, med;
      for (i = 1; i < spaced.length; i++) gaps.push(spaced[i] - spaced[i - 1]);
      gaps.sort(function (a, b) { return a - b; });
      med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 40;
      var nums = [1], k;
      for (k = 1; k < spaced.length; k++) nums.push(nums[k - 1] + (spaced[k] - spaced[k - 1] > med * 1.45 ? 2 : 1));
      if (nums[nums.length - 1] !== want) continue;
      best = spaced.map(function (yy, idx) { return { y: yy, n: nums[idx] }; });
    }
    if (!best) return [];
    return best.map(function (item) {
      return { y: item.y, n: item.n, x0: col.x0, x1: col.x1 };
    });
  }

  function numberFromLabels(labels, x, y) {
    var best = 0, bestY = -1, i;
    for (i = 0; i < labels.length; i++) {
      if (x < labels[i].x0 || x >= labels[i].x1) continue;
      if (labels[i].y <= y + 8 && labels[i].y >= bestY) { bestY = labels[i].y; best = labels[i].n; }
    }
    return best;
  }

  function analyzeFitted(image) {
    var w = image && image.width || 0;
    var h = image && image.height || 0;
    if (!w || !h || !image.data) return [];
    var pens = penComponents(image);
    if (!pens) return [];
    var columns = pageColumns(image);
    var kept = [];
    pens.forEach(function (pen) {
      var cx = pen.x + pen.w / 2;
      var col = columns[0];
      var i;
      for (i = 0; i < columns.length; i++) {
        if (cx >= columns[i].x0 && cx < columns[i].x1) col = columns[i];
      }
      var role = penRole(image, pen, col);
      if (role === '圈出' || role === '叉号' || role === '批改') {
        pen.role = role;
        pen.col = col;
        kept.push(pen);
      }
    });
    kept = kept.filter(function (pen) {
      if (pen.role === '圈出') return true;
      var pad = Math.max(16, Math.round(h * 0.03));
      return !kept.some(function (other) {
        return other !== pen && other.role === '圈出' &&
          pen.x < other.x + other.w + pad && other.x < pen.x + pen.w + pad &&
          pen.y < other.y + other.h + pad && other.y < pen.y + pen.h + pad;
      });
    });
    var regions = [];
    columns.forEach(function (col) {
      var bands = questionBands(image, col);
      bands.forEach(function (band, i) {
        band.seq = regions.length;
        band.number = i + 1;
        regions.push(band);
      });
      if (!bands.length) return;
      var digit = marginDigit(image, col, bands[0].y0 - Math.round(h * 0.015), bands[0].y0 + Math.round(h * 0.04));
      if (!digit) return;
      bands.forEach(function (band, i) {
        band.number = digit + i;
        band.anchored = true;
      });
    });
    var used = new Uint8Array(kept.length);
    var questions = [];
    function pushQuestion(region, mine, number) {
      var x0 = mine[0].x, y0 = mine[0].y, x1 = mine[0].x + mine[0].w, y1 = mine[0].y + mine[0].h;
      var kind = mine[0].role;
      mine.forEach(function (pen) {
        if (pen.x < x0) x0 = pen.x;
        if (pen.y < y0) y0 = pen.y;
        if (pen.x + pen.w > x1) x1 = pen.x + pen.w;
        if (pen.y + pen.h > y1) y1 = pen.y + pen.h;
        if (pen.role === '圈出') kind = '圈出';
        else if (kind !== '圈出' && pen.role === '叉号') kind = '叉号';
      });
      var pad = Math.max(2, Math.round(Math.min(w, h) * 0.008));
      x0 = Math.max(0, x0 - pad);
      y0 = Math.max(0, y0 - pad);
      x1 = Math.min(w, x1 + pad);
      y1 = Math.min(h, y1 + pad);
      var beside = 0;
      if (region) {
        var topPen = mine[0];
        mine.forEach(function (pen) { if (pen.y < topPen.y) topPen = pen; });
        var slack = Math.max(8, Math.round(h * 0.025));
        beside = marginDigit(image, region, topPen.y - slack, topPen.y + Math.max(topPen.h, slack * 2));
      }
      var box = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
      /* 离线只做几何：题号、题目文字、订正和知识点都交给人工核对或 Agent 读取。
       * 模板笔迹识别已移除，避免把某一本练习册的答案套到新试卷上。 */
      if (beside) number = beside;
      var n = String(number);
      var anchored = !!beside || !!(region && region.anchored);
      var prompt = (anchored ? '自动标出：第' + n + '题，' : '自动标出：从上往下第' + n + '个题目区域，') + kind;
      questions.push({
        x: box.x, y: box.y, w: box.w, h: box.h,
        number: n,
        kind: kind,
        prompt: prompt,
        source: 'offline',
        numberConfident: anchored,
        correction: '',
        reasonNote: '',
        reason: '',
        knowledge: '',
        studentAnswer: ''
      });
    }
    regions.forEach(function (region) {
      var mine = [];
      kept.forEach(function (pen, i) {
        if (used[i]) return;
        var cx = pen.x + pen.w / 2;
        if (cx < region.x0 || cx >= region.x1) return;
        var top = Math.max(pen.y, region.y0);
        var bot = Math.min(pen.y + pen.h, region.y1);
        var cy = pen.y + pen.h / 2;
        var score = bot - top;
        if (cy >= region.y0 && cy < region.y1) score += pen.h;
        if (score <= 0) return;
        if (!pen._best || score > pen._score) {
          pen._best = region;
          pen._score = score;
          pen._i = i;
        }
      });
    });
    var grouped = [];
    kept.forEach(function (pen) {
      if (!pen._best) return;
      used[pen._i] = 1;
      var list = grouped[pen._best.seq];
      if (!list) grouped[pen._best.seq] = list = [];
      list.push(pen);
    });
    regions.forEach(function (region) {
      var mine = grouped[region.seq];
      if (mine && mine.length) pushQuestion(region, mine, region.number);
    });
    var lone = [];
    kept.forEach(function (pen, i) { if (!used[i]) lone.push(pen); });
    lone.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var groups = [];
    lone.forEach(function (pen) {
      var prev = groups[groups.length - 1];
      var prevBox = prev && prev[prev.length - 1];
      if (prevBox && pen.y <= prevBox.y + prevBox.h + h * 0.04) prev.push(pen);
      else groups.push([pen]);
    });
    groups.forEach(function (group) {
      pushQuestion(null, group, questions.length + 1);
    });
    var labels = [];
    var anchored = [];
    var labelCols = columns;
    if (columns.length === 2 && columns[1].x0 - columns[0].x1 > 20) {
      var right0 = Math.max(columns[0].x1, columns[1].x0 - 48);
      labelCols = [{ x0: columns[0].x0, x1: right0 }, { x0: right0, x1: columns[1].x1 }];
    }
    labelCols.forEach(function (col) {
      var found = printedLabels(image, col);
      if (found.length >= 2 && found[0].n >= 15 && found[1].y - found[0].y > 180 && found[0].gx >= 0) {
        var followY = findFollow(image, found[0].gx, found[0].y, found[0].n + 1);
        if (followY > found[0].y && followY < found[1].y - 24) {
          found.splice(1, 0, { y: followY, n: found[0].n + 1, x0: col.x0, x1: col.x1, gx: found[0].gx });
          var shift;
          for (shift = 2; shift < found.length; shift++) found[shift].n += 1;
        }
      }
      if (found.length) anchored.push({ col: col, labels: found });
      found.forEach(function (lb) { labels.push(lb); });
    });
    if (anchored.length === 1 && columns.length === 2) {
      var knownCol = anchored[0];
      columns.forEach(function (col) {
        if (col === knownCol.col || col.x0 > knownCol.col.x0) return;
        leadingLabels(image, col, knownCol.labels[0].n).forEach(function (lb) { labels.push(lb); });
      });
    }
    if (labels.length) {
      answerRings(image).forEach(function (ring) {
        var foundNo = numberFromLabels(labels, ring.cx, ring.cy);
        if (!foundNo) return;
        var covered = questions.some(function (q) {
          return String(q.number) === String(foundNo) &&
            Math.abs((q.x + q.w / 2) - ring.cx) < 36 && Math.abs((q.y + q.h / 2) - ring.cy) < 36;
        });
        if (covered) return;
        questions.push({
          x: ring.x, y: ring.y, w: ring.w, h: ring.h,
          number: String(foundNo),
          kind: '圈出',
          prompt: '自动标出：第' + foundNo + '题，圈出',
          source: 'offline',
          numberConfident: true,
          correction: '',
          reasonNote: '',
          reason: '',
          knowledge: '',
          studentAnswer: ''
        });
      });
      questions.forEach(function (q) {
        var foundNo = numberFromLabels(labels, q.x + q.w / 2, q.y);
        if (foundNo) q.number = String(foundNo);
      });
      var seenNo = Object.create(null);
      questions = questions.filter(function (q) {
        if (seenNo[q.number]) return false;
        seenNo[q.number] = 1;
        return true;
      });
    }
    questions.sort(function (a, b) {
      var d = questionRank(a.number) - questionRank(b.number);
      if (d) return d;
      return a.y - b.y || a.x - b.x;
    });
    var listed = questions.slice(0, 40);
    /* 卷头的大号红字可能是得分、扣分，也可能只是批改标记。离线只报读到的数字，
     * 含义、满分、标题和年级都交给人工核对或 Agent 判断，不再按某一份卷子写死。 */
    var headerNumber = headerNumberMark(image);
    if (headerNumber) {
      listed.sheet = {
        headerNumber: String(headerNumber),
        source: 'offline',
        guessed: true,
        note: '卷头读到数字，可能是得分或扣分，请核对后再填写。'
      };
    }
    return listed;
  }

  function analyzePage(image) {
    var srcW = image && image.width || 0;
    var srcH = image && image.height || 0;
    var fitted = fitForAnalysis(image);
    var found = analyzeFitted(fitted);
    if (!srcW || !fitted.width || fitted.width === srcW) return found;
    var sx = srcW / fitted.width;
    var sy = srcH / fitted.height;
    var scaled = found.map(function (q) { return scaleQuestion(q, sx, sy); });
    scaled.sheet = found.sheet || null;
    return scaled;
  }

  function paperById(papers, id) {
    for (var i = 0; i < papers.length; i++) if (papers[i].id === id) return papers[i];
    return null;
  }

  function analyze(papers, items) {
    papers = papers || [];
    items = items || [];
    var byKnowledge = Object.create(null);
    var byReason = Object.create(null);
    var bySubject = Object.create(null);
    var open = 0;
    var mastered = 0;

    function subjectBucket(subject) {
      var key = subject || '';
      if (!bySubject[key]) bySubject[key] = { subject: key, label: subjectLabel(key), papers: Object.create(null), wrong: 0, open: 0 };
      return bySubject[key];
    }

    items.forEach(function (it) {
      var isMastered = it.status === 'mastered';
      if (isMastered) mastered++;
      else open++;
      var name = String(it.knowledge || '').trim() || '未标知识点';
      if (!byKnowledge[name]) byKnowledge[name] = { name: name, total: 0, open: 0, mastered: 0 };
      byKnowledge[name].total++;
      if (isMastered) byKnowledge[name].mastered++;
      else byKnowledge[name].open++;
      var reason = REASONS.indexOf(it.reason) >= 0 ? it.reason : (it.reason ? '其他' : '未判断');
      byReason[reason] = (byReason[reason] || 0) + 1;
      var paper = paperById(papers, it.paperId);
      var bucket = subjectBucket(paper && paper.subject);
      bucket.papers[it.paperId || ''] = 1;
      bucket.wrong++;
      if (!isMastered) bucket.open++;
    });
    papers.forEach(function (p) {
      var bucket = subjectBucket(p.subject);
      bucket.papers[p.id] = 1;
    });

    var knowledge = Object.keys(byKnowledge).map(function (k) { return byKnowledge[k]; });
    knowledge.sort(function (a, b) { return b.open - a.open || b.total - a.total || (a.name > b.name ? 1 : -1); });
    var reasons = Object.keys(byReason).map(function (k) { return { reason: k, count: byReason[k] }; });
    reasons.sort(function (a, b) { return b.count - a.count; });
    var subjects = Object.keys(bySubject).map(function (k) {
      var s = bySubject[k];
      return { subject: s.subject, label: s.label, paperCount: Object.keys(s.papers).length, wrong: s.wrong, open: s.open };
    });
    subjects.sort(function (a, b) { return b.wrong - a.wrong || b.paperCount - a.paperCount; });

    var scored = papers.filter(function (p) { return num(p.score) != null && num(p.total) > 0; }).slice();
    scored.sort(function (a, b) {
      var da = String(a.examDate || a.createdAt || '');
      var db = String(b.examDate || b.createdAt || '');
      return da < db ? -1 : da > db ? 1 : 0;
    });
    var scoreRates = scored.map(function (p) {
      return { id: p.id, title: p.title, rate: num(p.score) / num(p.total), examDate: p.examDate || '' };
    });

    return {
      paperCount: papers.length,
      itemCount: items.length,
      open: open,
      mastered: mastered,
      masteryRate: items.length ? mastered / items.length : null,
      knowledge: knowledge,
      reasons: reasons,
      subjects: subjects,
      scoreRates: scoreRates,
      suggestions: buildSuggestions(papers, items, knowledge, reasons, scoreRates)
    };
  }


  /* 综评只由录入的结构化字段生成，不针对任何一份具体试卷写死题目、答案或讲法。
   * Agent 给出综评时优先采用，并在结果里标明来源。 */
  function summarizeExam(meta, marks) {
    meta = meta || {};
    marks = (marks || []).filter(function (mark) { return mark; });
    var agentText = String(meta.agentSummary || '').trim();
    if (agentText) return { title: '综评结论', text: agentText, source: 'agent' };

    var title = String(meta.title || '').trim();
    var grade = String(meta.grade || '').trim();
    var who = (grade ? grade + ' ' : '') + (title || (subjectLabel(meta.subject) + '试卷'));
    var total = num(meta.total);
    if (total == null) total = 100;
    var score = num(meta.score);
    var deduction = num(meta.deduction);
    var head = '这份是' + who + '。';
    if (score != null && total > 0) head += '得分 ' + score + '，满分 ' + total + '。';
    else head += '满分 ' + total + '。卷面没有读出得分。';
    if (deduction != null && deduction > 0) head += '卷头圈出的 ' + deduction + ' 是扣分。';
    var lines = [head];

    if (!marks.length) {
      lines.push('这几页还没有认出的错题，综评先空着。核对红笔、补上错题，或把照片交给 Agent 分析后，这里会按录入的题号、订正和错因写出来。满分没有特别标注时按 100 分。');
      return { title: '综评结论', text: lines.join('\n'), source: 'offline' };
    }

    var ranked = marks.slice().sort(function (a, b) {
      return questionRank(a.number) - questionRank(b.number);
    });
    var nums = [];
    ranked.forEach(function (mark) {
      var n = String(mark.number || '').trim();
      /* 同一大题的不同小题会重复题号，题号清单里只列一次。 */
      if (n && nums.indexOf(n) < 0) nums.push(n);
    });
    lines.push('共记下 ' + marks.length + ' 道错题' + (nums.length ? '，题号是第 ' + nums.join('、') + ' 题。' : '。题号还没有标全。'));

    var detail = [];
    ranked.forEach(function (mark) {
      var bits = [];
      var kn = String(mark.knowledge || '').trim();
      var sa = String(mark.studentAnswer || '').trim();
      var ra = String(mark.rightAnswer || mark.correction || '').trim();
      var reason = String(mark.reason || '').trim();
      var note = String(mark.reasonNote || '').trim();
      if (kn) bits.push(kn);
      if (sa) bits.push('孩子答 ' + sa);
      if (ra) bits.push('订正 ' + ra);
      if (reason) bits.push('错因 ' + reason);
      if (note) bits.push('卷面旁注「' + note + '」');
      if (bits.length) detail.push('第 ' + (String(mark.number || '').trim() || '?') + ' 题：' + bits.join('；') + '。');
    });
    if (detail.length) {
      detail.slice(0, 8).forEach(function (line) { lines.push(line); });
      if (detail.length > 8) lines.push('另有 ' + (detail.length - 8) + ' 道已在错题清单里，逐条核对。');
    }

    var reasonCount = Object.create(null);
    var knowledge = [];
    marks.forEach(function (mark) {
      if (REASONS.indexOf(mark.reason) >= 0) reasonCount[mark.reason] = (reasonCount[mark.reason] || 0) + 1;
      var name = String(mark.knowledge || '').trim();
      if (name && knowledge.indexOf(name) < 0) knowledge.push(name);
    });
    var reasons = Object.keys(reasonCount).map(function (name) { return { name: name, count: reasonCount[name] }; });
    reasons.sort(function (a, b) { return b.count - a.count || (a.name > b.name ? 1 : -1); });
    if (reasons.length) lines.push('错因里' + reasons.map(function (row) { return row.name + ' ' + row.count + ' 道'; }).join('，') + '。');
    if (knowledge.length) lines.push('涉及' + knowledge.slice(0, 12).join('、') + '。');

    var agentTips = Array.isArray(meta.agentSuggestions) ? meta.agentSuggestions.filter(function (s) {
      return String(s || '').trim();
    }) : [];
    if (agentTips.length) lines.push('建议：' + agentTips.slice(0, 3).map(function (s) { return String(s).trim(); }).join('；') + '。');
    var tip = reasons[0] && REASON_TIP[reasons[0].name];
    lines.push(tip ? '下一步：' + tip.detail : '下一步：先把每道错题的订正和错因核对完，再按知识点各做一道变式。');
    lines.push('以上按录入的信息生成；题目文字和手写订正请核对，信息不全时可用 Agent 分析补充。');
    return { title: '综评结论', text: lines.join('\n'), source: 'offline' };
  }

  /* ===== Agent 交接协议 =====
   * 离线算法只负责几何（红笔、分栏、题号、框）。读懂题目、手写订正、知识点归因和
   * 针对性讲评需要语义理解，交给 Agent：这里定义请求包、提示词、结果格式与合并规则。
   * 照片默认不进请求包；是否附带图片由使用方显式决定。 */
  var AGENT_SCHEMA_VERSION = 1;
  var AGENT_RESULT_KIND = 'paper-analysis-result';

  var AGENT_OUTPUT_SCHEMA = {
    schemaVersion: 1,
    kind: AGENT_RESULT_KIND,
    paper: {
      title: '试卷名称，读不到就留空字符串',
      grade: '年级或册次',
      subject: '学科 id，如 math / chinese / english',
      examDate: 'YYYY-MM-DD，读不到留空',
      score: '得分数字，读不到留空',
      total: '满分数字，未特别标注按 100',
      deduction: '卷头圈出的扣分数字，读不到留空',
      summary: '综评正文，2～5 段，用换行分隔；只写卷面上看得到的内容',
      suggestions: ['下一步建议，最多 3 条']
    },
    pages: [{
      index: 0,
      items: [{
        number: '题号，读不到就留空',
        prompt: '题目原文',
        studentAnswer: '孩子写的答案',
        rightAnswer: '正确答案或红笔订正',
        knowledge: '对应知识点',
        reason: '概念不清|计算失误|审题不清|步骤不完整|记忆不牢|时间不够|其他',
        reasonNote: '卷面旁注或错因原话',
        kind: '圈出|叉号|批改|未标',
        x: 0.1, y: 0.2, w: 0.3, h: 0.1,
        confidence: 0.9,
        match: '可选：new 强制新建，box 只按框对齐，留空自动判断'
      }]
    }]
  };

  function agentBox(mark) {
    function v(n) { var x = Number(n); return isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }
    return { x: v(mark.x), y: v(mark.y), w: v(mark.w), h: v(mark.h) };
  }

  function copyObject(src) {
    var out = {}, k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    return out;
  }

  function agentBoxText(box) {
    function f(v) { return Math.round(Number(v || 0) * 1000) / 1000; }
    return '[' + f(box.x) + ',' + f(box.y) + ',' + f(box.w) + ',' + f(box.h) + ']';
  }

  function buildAgentPrompt(request) {
    var pages = (request && request.pages) || [];
    var hint = String((request && request.paper && request.paper.headerHint) || '').trim();
    var count = 0;
    pages.forEach(function (p) { count += (p.candidates || []).length; });
    /* 提示词要能脱离请求包单独使用：把候选框直接列出来，并说明照片是分析的前提。 */
    var candLines = pages.map(function (p, i) {
      var cs = p.candidates || [];
      if (!cs.length) return '  照片 ' + (i + 1) + '：没有离线候选';
      var shown = cs.slice(0, 20).map(function (c) {
        return '#' + (c.number || '?') + (c.numberConfident ? '*' : '') + agentBoxText(c.box || {});
      }).join(' ');
      return '  照片 ' + (i + 1) + '：' + shown + (cs.length > 20 ? ' …另有 ' + (cs.length - 20) + ' 个' : '');
    });
    var lines = [
      '你在分析一份已经批改过的中小学试卷。请只读卷面，逐题核对，不要编造题目或答案。',
      '输入：' + pages.length + ' 张照片，共 ' + count + ' 个离线候选错题框。一张照片可能拍到跨页的两页试卷；items 按「照片」分组，index 与照片序号一致，不要按印刷页码另拆页。',
      '照片必须随请求一起提供。如果没有收到照片，请直接说明缺少照片并停止分析，不要只凭候选框猜题目或答案。',
      '坐标：box 是相对整张照片宽高的 0～1 归一化坐标，x/y 是左上角，w/h 是宽高。离线候选的框、题号和数量都可能不准，以照片为准。',
      '离线候选清单（#题号，* 表示读到了印刷题号，后面是 [x,y,w,h]）：',
      candLines.join('\n'),
      '要做的事：',
      '1. 读出卷头的试卷名称、年级、学科、得分、满分、卷头圈出的扣分数字；读不清的字段留空，不要猜。' +
        (hint ? '本机在卷头读到大号数字「' + hint + '」，可能是得分也可能是扣分，请以照片为准判断。' : ''),
      '2. 逐题找出被红笔圈出、打叉或批改的错题，写出题号、题目原文、孩子的答案、正确订正、涉及的知识点、错因和卷面旁注。大的红勾表示答对，不要记成错题。',
      '3. 用离线候选框对齐每一道错题：能对应上就沿用它的 box；离线漏掉的错题，按它在照片里的位置给出 box。',
      '4. 写一段综评：说明错了哪些题、集中在哪些知识点和错因、下一步先补什么。只依据卷面，不写没看到的内容。',
      '输出要求：只输出一个 JSON 对象，不要 Markdown 代码块，不要解释文字。reason 必须是给定枚举之一或留空；坐标必须是 0～1 的数字；数字字段用数字或空字符串。同一大题的不同小题可重复题号分别列出；给 match:"new" 可强制新建一条而不合并离线候选。',
      '输出格式：',
      JSON.stringify(AGENT_OUTPUT_SCHEMA, null, 2)
    ];
    return lines.join('\n');
  }

  function buildAgentRequest(bundle, options) {
    options = options || {};
    var src = bundle || {};
    var paper = (src.paper && typeof src.paper === 'object' && !Array.isArray(src.paper)) ? src.paper : src;
    var pages = Array.isArray(src.pages) ? src.pages : [];
    var request = {
      schemaVersion: AGENT_SCHEMA_VERSION,
      kind: 'paper-analysis-request',
      createdAt: new Date().toISOString(),
      paper: {
        title: String(paper.title || '').trim(),
        grade: String(paper.grade || '').trim(),
        subject: String(paper.subject || '').trim(),
        examDate: String(paper.examDate || '').trim(),
        score: String(paper.score == null ? '' : paper.score).trim(),
        total: String(paper.total == null ? '' : paper.total).trim(),
        deduction: String(paper.deduction == null ? '' : paper.deduction).trim(),
        headerHint: String(paper.headerHint || '').trim()
      },
      pages: pages.map(function (page, index) {
        var candidates = (page.marks || page.candidates || []).map(function (mark) {
          return {
            number: String(mark.number || '').trim(),
            kind: String(mark.kind || '').trim(),
            prompt: String(mark.prompt || '').trim(),
            numberConfident: mark.numberConfident === true,
            box: agentBox(mark)
          };
        });
        return {
          index: index,
          id: String(page.id || ''),
          width: Number(page.width) || 0,
          height: Number(page.height) || 0,
          imageName: String(page.sourceName || ''),
          image: options.includeImages ? (page.imageDataUrl || null) : null,
          candidates: candidates
        };
      }),
      catalog: {
        subjects: SUBJECTS.map(function (s) { return { id: s[0], label: s[1] }; }),
        reasons: REASONS.slice(),
        knowledgeHints: (options.knowledgeCatalog || []).slice(0, 300)
      },
      outputSchema: AGENT_OUTPUT_SCHEMA
    };
    request.instructions = buildAgentPrompt(request);
    return request;
  }

  /* 从模型回复里取 JSON：允许 ```json 代码块，也允许前后带说明文字。 */
  function parseAgentText(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) throw new Error('Agent 没有回复内容。');
    var fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
    if (fence) s = fence[1].trim();
    else {
      var first = s.indexOf('{');
      var last = s.lastIndexOf('}');
      if (first < 0 || last <= first) throw new Error('回复里没有找到 JSON 对象。');
      s = s.slice(first, last + 1);
    }
    var parsed;
    try { parsed = JSON.parse(s); }
    catch (e) { throw new Error('回复不是合法的 JSON：' + e.message); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('回复的顶层必须是 JSON 对象。');
    return parsed;
  }

  function agentString(value, max) {
    if (value == null) return '';
    return String(value).trim().slice(0, max || 200);
  }

  function agentNumber(value) {
    if (value === '' || value == null) return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function validateAgentResult(raw) {
    var obj = raw;
    if (typeof raw === 'string') obj = parseAgentText(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: '结果必须是 JSON 对象。' };
    if (obj.kind && obj.kind !== AGENT_RESULT_KIND) return { ok: false, error: '结果不是试卷分析结果（kind 不匹配）。' };
    var version = obj.schemaVersion == null ? AGENT_SCHEMA_VERSION : Number(obj.schemaVersion);
    if (!isFinite(version) || version > AGENT_SCHEMA_VERSION) return { ok: false, error: '结果版本比当前页面更新，请升级后再导入。' };
    var rawPages = obj.pages;
    if (rawPages != null && !Array.isArray(rawPages)) return { ok: false, error: 'pages 必须是数组。' };
    rawPages = rawPages || [];
    if (rawPages.length > 30) return { ok: false, error: '一次最多导入 30 页。' };

    var warnings = [];
    var paperIn = (obj.paper && typeof obj.paper === 'object') ? obj.paper : {};
    var paper = {
      title: agentString(paperIn.title, 120),
      grade: agentString(paperIn.grade, 40),
      subject: agentString(paperIn.subject, 40),
      examDate: agentString(paperIn.examDate, 20),
      score: agentNumber(paperIn.score),
      total: agentNumber(paperIn.total),
      deduction: agentNumber(paperIn.deduction),
      summary: agentString(paperIn.summary, 8000),
      suggestions: []
    };
    if (Array.isArray(paperIn.suggestions)) {
      paper.suggestions = paperIn.suggestions.slice(0, 8).map(function (s) { return agentString(s, 300); }).filter(function (s) { return s; });
    }
    var pages = [];
    rawPages.forEach(function (pg, idx) {
      if (!pg || typeof pg !== 'object') { warnings.push('第 ' + (idx + 1) + ' 页格式不对，已跳过。'); return; }
      var index = pg.index == null ? idx : Number(pg.index);
      if (!isFinite(index) || Math.floor(index) !== index) { warnings.push('第 ' + (idx + 1) + ' 页的 index 不是整数，按顺序处理。'); index = idx; }
      var itemsIn = Array.isArray(pg.items) ? pg.items : [];
      if (itemsIn.length > 60) warnings.push('第 ' + (index + 1) + ' 页超过 60 道，只取前 60 道。');
      var items = [];
      itemsIn.slice(0, 60).forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        var reason = agentString(it.reason, 20);
        if (reason && REASONS.indexOf(reason) < 0) { warnings.push('错因「' + reason + '」不在清单里，已留空。'); reason = ''; }
        var status = it.status === 'mastered' ? 'mastered' : 'open';
        var box = null;
        var bx = agentNumber(it.x), by = agentNumber(it.y), bw = agentNumber(it.w), bh = agentNumber(it.h);
        if (bx != null && by != null && bw != null && bh != null) {
          var x1 = Math.max(0, Math.min(1, bx));
          var y1 = Math.max(0, Math.min(1, by));
          var w1 = Math.max(0, Math.min(1 - x1, bw));
          var h1 = Math.max(0, Math.min(1 - y1, bh));
          /* 夹住整块框，不让 x+w / y+h 超出照片；宽高被夹成 0 时视为没给框。 */
          if (w1 > 0 && h1 > 0) box = { x: x1, y: y1, w: w1, h: h1 };
        }
        var confidence = agentNumber(it.confidence);
        items.push({
          number: agentString(it.number, 12),
          prompt: agentString(it.prompt, 4000),
          studentAnswer: agentString(it.studentAnswer, 200),
          rightAnswer: agentString(it.rightAnswer != null && it.rightAnswer !== '' ? it.rightAnswer : it.correction, 200),
          knowledge: agentString(it.knowledge, 80),
          reason: reason,
          reasonNote: agentString(it.reasonNote, 300),
          kind: agentString(it.kind, 20),
          status: status,
          confidence: confidence,
          box: box,
          match: agentString(it.match, 12)
        });
      });
      pages.push({ index: index, items: items });
    });
    return {
      ok: true,
      result: { schemaVersion: AGENT_SCHEMA_VERSION, kind: AGENT_RESULT_KIND, paper: paper, pages: pages },
      warnings: warnings
    };
  }

  function boxOverlap(a, b) {
    var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    var x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 <= x0 || y1 <= y0) return 0;
    var inter = (x1 - x0) * (y1 - y0);
    var area = Math.max(1e-6, a.w * a.h + b.w * b.h - inter);
    return inter / area;
  }

  /* 题号相同但框离得太远，多半是离线把题号认错了：宁可新建，也不要合并到错误位置。 */
  function boxesNear(a, b) {
    if (!a || !b) return true;
    if (boxOverlap(a, b) > 0.02) return true;
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    var bx = b.x + b.w / 2, by = b.y + b.h / 2;
    return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)) < 0.18;
  }

  function findAgentTarget(marks, item, used) {
    var i, best = -1, bestScore = 0;
    if (item.match === 'new') {
      /* 「强制新建」只针对离线候选：重复导入同一份结果时，题号与题目完全一致的
       * Agent 条目必须复用，否则每导入一次就多出一批重复错题。 */
      for (i = 0; i < marks.length; i++) {
        if (used[i] || !marks[i].agent) continue;
        if (String(marks[i].number || '') === String(item.number || '') &&
            String(marks[i].prompt || '') === String(item.prompt || '')) return i;
      }
      return -1;
    }
    if (item.box && item.match !== 'number') {
      var itemArea = Math.max(1e-6, item.box.w * item.box.h);
      for (i = 0; i < marks.length; i++) {
        if (used[i]) continue;
        var candidate = agentBox(marks[i]);
        var candArea = candidate.w * candidate.h;
        /* 离线偶尔会把一整条红线画成巨大的框，别让小题被这种框吞掉。 */
        if (candArea > itemArea * 4) continue;
        var score = boxOverlap(candidate, item.box);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0 && bestScore >= 0.4) return best;
    }
    if (item.number && item.match !== 'box') {
      for (i = 0; i < marks.length; i++) {
        if (used[i]) continue;
        if (String(marks[i].number || '').trim() !== item.number) continue;
        if (item.match === 'number' || boxesNear(agentBox(marks[i]), item.box)) return i;
      }
    }
    return -1;
  }

  /* 只清理「自动标出」且完全没被人工补过内容的离线候选；人工标的和已补过的保留。 */
  function isUnclaimedOfflinePlaceholder(mark) {
    if (!mark || mark.agent) return false;
    if (!/^自动标出/.test(String(mark.prompt || '').trim())) return false;
    var keys = ['knowledge', 'studentAnswer', 'rightAnswer', 'reason', 'reasonNote'];
    for (var i = 0; i < keys.length; i++) if (String(mark[keys[i]] || '').trim()) return false;
    return true;
  }

  function agentMark(item) {
    var box = item.box || { x: 0.02, y: 0.02, w: 0.12, h: 0.05 };
    return {
      id: newId('w_'),
      x: box.x, y: box.y, w: box.w, h: box.h,
      auto: false,
      agent: true,
      number: '', prompt: '', knowledge: '', reason: '', reasonNote: '',
      studentAnswer: '', rightAnswer: '', status: 'open', reviews: [],
      createdAt: new Date().toISOString()
    };
  }

  function isOfflineMark(mark) {
    return !!(mark && (mark.source === 'offline' || mark.auto === true ||
      /^自动标出/.test(String(mark.prompt || '').trim())));
  }

  function isOfflinePlaceholder(mark, key, current) {
    /* 离线生成的「自动标出：第N题…」和跟着算出来的题号都只是占位，Agent 可以覆盖。 */
    if (key === 'prompt') return /^自动标出[:：]/.test(current);
    if (key === 'number') return isOfflineMark(mark) && /^\d+$/.test(current);
    return false;
  }

  function applyAgentField(mark, key, value, overwrite) {
    if (!value) return false;
    var current = String(mark[key] == null ? '' : mark[key]).trim();
    if (current && !overwrite && !isOfflinePlaceholder(mark, key, current)) return false;
    if (current === String(value).trim()) return false;
    mark[key] = value;
    return true;
  }

  /* 把 Agent 结果合并进草稿。默认只填空字段，不覆盖人工已录入的内容；
   * 重复导入同一结果不会产生新错题。返回新的 bundle，不修改入参。 */
  function applyAgentResult(bundle, raw, options) {
    options = options || {};
    var checked = validateAgentResult(raw);
    if (!checked.ok) throw new Error(checked.error);
    var result = checked.result;
    var warnings = checked.warnings.slice();
    var src = bundle || {};
    var next = copyObject(src);
    var pages = Array.isArray(src.pages) ? src.pages : [];
    next.pages = pages.map(function (page) {
      var p = copyObject(page);
      p.marks = (page.marks || []).map(copyObject);
      return p;
    });
    var paperTarget = (src.paper && typeof src.paper === 'object') ? (next.paper = copyObject(src.paper)) : next;
    var paperIn = result.paper;
    var applied = { updated: 0, created: 0, paperFields: 0, pruned: 0 };
    var total = paperIn.total != null ? paperIn.total : (agentNumber(paperTarget.total) != null ? agentNumber(paperTarget.total) : 100);
    var score = paperIn.score;
    if (score == null && paperIn.deduction != null && total != null) score = Math.max(0, total - paperIn.deduction);
    var paperFields = {
      title: paperIn.title, grade: paperIn.grade, subject: paperIn.subject, examDate: paperIn.examDate,
      score: score == null ? '' : String(score), total: total == null ? '' : String(total)
    };
    Object.keys(paperFields).forEach(function (key) {
      /* 草稿里的满分、年级、学科多是默认值或孩子档案带出来的，不是人工录入；
       * 只有用户真正动过这几个字段（*_Edited）才不可被 Agent 纠正。 */
      var force = !!options.overwrite ||
        (key === 'total' && paperTarget.totalEdited === false) ||
        (key === 'grade' && paperTarget.gradeEdited !== true) ||
        (key === 'subject' && paperTarget.subjectEdited !== true);
      if (applyAgentField(paperTarget, key, paperFields[key], force)) applied.paperFields++;
    });
    if (paperIn.deduction != null && (options.overwrite || !String(paperTarget.deduction || '').trim())) {
      paperTarget.deduction = String(paperIn.deduction);
      applied.paperFields++;
    }
    if (paperIn.summary && (options.overwrite || !String(paperTarget.agentSummary || '').trim())) {
      paperTarget.agentSummary = paperIn.summary;
      applied.paperFields++;
    }
    if (paperIn.suggestions.length && (options.overwrite || !(Array.isArray(paperTarget.agentSuggestions) && paperTarget.agentSuggestions.length))) {
      paperTarget.agentSuggestions = paperIn.suggestions.slice();
    }
    paperTarget.agentAt = new Date().toISOString();
    paperTarget.agentSource = 'agent';

    result.pages.forEach(function (pg) {
      var page = next.pages[pg.index];
      if (!page) { warnings.push('结果里的第 ' + (pg.index + 1) + ' 页在草稿里不存在，已跳过。'); return; }
      var used = new Uint8Array(page.marks.length);
      pg.items.forEach(function (item) {
        var at = findAgentTarget(page.marks, item, used);
        var changed = false;
        if (at >= 0) {
          used[at] = 1;
          var mark = page.marks[at];
          var fields = {
            number: item.number, prompt: item.prompt, knowledge: item.knowledge,
            reason: item.reason, reasonNote: item.reasonNote, studentAnswer: item.studentAnswer,
            rightAnswer: item.rightAnswer, kind: item.kind, status: item.status
          };
          Object.keys(fields).forEach(function (key) {
            if (applyAgentField(mark, key, fields[key], !!options.overwrite)) changed = true;
          });
          /* 合并进离线候选时，框也用 Agent 看过照片后给的位置，别留着那个小误判框。 */
          if (item.box && isOfflineMark(mark)) {
            ['x', 'y', 'w', 'h'].forEach(function (key) {
              if (mark[key] !== item.box[key]) { mark[key] = item.box[key]; changed = true; }
            });
          }
          if (item.confidence != null) mark.agentConfidence = item.confidence;
          mark.agent = true;
          if (changed) applied.updated++;
        } else {
          if (page.marks.length >= 60) { warnings.push('第 ' + (pg.index + 1) + ' 页已满 60 道，新错题没有加入。'); return; }
          var fresh = agentMark(item);
          var createdFields = {
            number: item.number, prompt: item.prompt, knowledge: item.knowledge,
            reason: item.reason, reasonNote: item.reasonNote, studentAnswer: item.studentAnswer,
            rightAnswer: item.rightAnswer, kind: item.kind, status: item.status
          };
          Object.keys(createdFields).forEach(function (key) {
            if (createdFields[key]) fresh[key] = createdFields[key];
          });
          if (item.confidence != null) fresh.agentConfidence = item.confidence;
          if (!item.box) warnings.push('第 ' + (pg.index + 1) + ' 页有一道新错题没给框，放在页左上角待调整。');
          page.marks.push(fresh);
          applied.created++;
        }
      });
      if (!options.keepOffline) {
        var claimed = used;
        var before = page.marks.length;
        page.marks = page.marks.filter(function (mark, idx) {
          return !isUnclaimedOfflinePlaceholder(mark) || (idx < claimed.length && claimed[idx]);
        });
        applied.pruned += before - page.marks.length;
      }
      page.marks.sort(function (a, b) {
        return questionRank(a.number) - questionRank(b.number) || a.y - b.y || a.x - b.x;
      });
    });
    return { bundle: next, result: result, applied: applied, warnings: warnings };
  }

  /* 只有用户勾选「附带照片」时才把图片转成 data URL 放进请求包。 */
  function blobToDataUrl(blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function') return Promise.reject(new Error('这张照片读不出来。'));
    return blob.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = '', chunk = 8192, i;
      for (i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      var toBase64 = typeof btoa === 'function' ? btoa : function (s) { return Buffer.from(s, 'binary').toString('base64'); };
      return 'data:' + (blob.type || 'image/jpeg') + ';base64,' + toBase64(binary);
    });
  }

  function buildSuggestions(papers, items, knowledge, reasons, scoreRates) {
    var out = [];
    if (!papers.length) {
      out.push({ title: '先导入一份试卷', detail: '拍下或选择已经批改的试卷图片。页面上的红笔会成为候选错题，核对后写入本机数据库。' });
      return out;
    }
    if (!items.length) {
      out.push({ title: '把错题记下来', detail: '试卷图片已经在库里。打开试卷，点在错题上，填上知识点和错因，跟踪和优化方案才有依据。' });
      return out;
    }
    var unlabeled = null;
    knowledge.forEach(function (k) { if (k.name === '未标知识点' && k.open) unlabeled = k; });
    if (unlabeled) {
      out.push({ title: '给错题补上知识点', detail: '还有 ' + unlabeled.open + ' 道没收口的错题没有知识点。补上之后，相同知识点会合并成一条方案。' });
    }
    knowledge.forEach(function (k) {
      if (k.name === '未标知识点' || k.open <= 0 || out.length >= 4) return;
      var subject = '';
      items.forEach(function (it) {
        if (subject || String(it.knowledge || '').trim() !== k.name || it.status === 'mastered') return;
        var paper = paperById(papers, it.paperId);
        if (paper) subject = paper.subject;
      });
      var repeat = k.total >= 2;
      out.push({
        title: (repeat ? '优先回补「' : '回补「') + k.name + '」',
        detail: '这个知识点有 ' + k.open + ' 道没收口' + (k.mastered ? '，另有 ' + k.mastered + ' 道已经做对。' : '。') + (repeat ? '它在错题里出现了不止一次，先补稳这一点，再做新卷。' : '先做一小段针对性练习，隔天用这道错题再考一次。'),
        diagnose: diagnoseHref(subject),
        diagnoseLabel: '去' + subjectLabel(subject) + '诊断'
      });
    });
    reasons.forEach(function (r) {
      if (items.length < 2 || r.count / items.length < 0.3) return;
      var tip = REASON_TIP[r.reason];
      if (!tip) return;
      out.push({ title: tip.title, detail: '错因「' + r.reason + '」有 ' + r.count + ' 道，超过三成。' + tip.detail });
    });
    var stuck = items.filter(function (it) {
      if (it.status === 'mastered') return false;
      var still = (it.reviews || []).filter(function (rv) { return rv.result === 'still'; }).length;
      return still >= 2;
    });
    if (stuck.length) {
      out.push({ title: '换一种讲法', detail: stuck.length + ' 道题回看两次仍然做错。先停掉原题抄写，用一道更小的同类题把步骤讲出来，再回到这道错题。' });
    }
    if (scoreRates.length >= 2) {
      var first = scoreRates[0].rate;
      var last = scoreRates[scoreRates.length - 1].rate;
      if (last + 0.05 < first) {
        out.push({ title: '先补重复错点再做整卷', detail: '按考试日期看，最近一份的得分比例低于较早的一份。先把没收口的知识点做完，再增加新卷。' });
      } else if (last > first + 0.05) {
        out.push({ title: '保持隔天回看', detail: '得分比例比最早一份更高。已经做对的错题隔两天再看一眼，没收口的按知识点继续。' });
      }
    }
    if (!out.length) {
      out.push({ title: '继续按知识点收口', detail: '错题都已记下。每做对一道就标成已掌握，还没掌握的隔天再做一次。' });
    }
    return out.slice(0, 6);
  }

  function hexBytes(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    var i, n;
    for (i = 0; i < bytes.length; i++) {
      n = bytes[i];
      hex += (n < 16 ? '0' : '') + n.toString(16);
    }
    return hex;
  }

  function fnvHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    var i;
    for (i = 0; i < bytes.length; i++) {
      h1 ^= bytes[i];
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= bytes[i] ^ (i & 255);
      h2 = Math.imul(h2, 0x01000193);
    }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function digestBlob(blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function') return Promise.resolve('');
    return blob.arrayBuffer().then(function (buf) {
      var subtle = typeof crypto !== 'undefined' && crypto.subtle;
      if (!subtle || typeof subtle.digest !== 'function') return fnvHex(buf);
      return subtle.digest('SHA-256', buf).then(hexBytes, function () { return fnvHex(buf); });
    }, function () { return ''; });
  }

  function fingerprintPages(pages) {
    return Promise.all((pages || []).map(function (page) {
      if (!page) return page;
      return Promise.all([digestBlob(page.source), digestBlob(page.blob)]).then(function (digests) {
        page.sourceDigest = digests[0] || '';
        page.viewDigest = digests[1] || '';
        return page;
      });
    }));
  }

  function pageKeys(page) {
    var keys = [];
    if (page && page.sourceDigest) keys.push('s:' + page.sourceDigest);
    else if (page && page.viewDigest) keys.push('v:' + page.viewDigest);
    return keys;
  }

  function duplicateOf(pages, library, selfId) {
    var seen = Object.create(null);
    var incoming = [];
    var i, j, keys, paper, theirs, key;
    (pages || []).forEach(function (page) {
      keys = pageKeys(page);
      for (i = 0; i < keys.length; i++) {
        if (seen[keys[i]]) incoming.push({ repeat: 1, key: keys[i] });
        seen[keys[i]] = 1;
      }
    });
    if (incoming.length) return { reason: 'repeat', title: '' };
    library = library || [];
    for (i = 0; i < library.length; i++) {
      paper = library[i];
      if (selfId && paper.id === selfId) continue;
      theirs = Object.create(null);
      (paper.pages || []).forEach(function (page) {
        keys = pageKeys(page);
        for (j = 0; j < keys.length; j++) theirs[keys[j]] = 1;
      });
      for (key in seen) {
        if (theirs[key]) return { reason: 'stored', id: paper.id || '', title: paper.title || '未命名试卷' };
      }
    }
    return null;
  }

  function duplicateMessage(dup, partial) {
    if (!dup) return '';
    var title = dup.title || '未命名试卷';
    if (dup.reason === 'repeat') return partial ? '重复的一页没有加入。' : '同一张试卷照片加了两次，没有再次录入。';
    if (partial) return '已经在错题库里的「' + title + '」没有再次加入。';
    return '这份试卷已经在错题库里：「' + title + '」。没有再次录入。';
  }

  function libraryFingerprints() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['papers', 'pages'], 'readonly');
        var papersReq = tx.objectStore('papers').getAll();
        var pagesReq = tx.objectStore('pages').getAll();
        tx.oncomplete = function () {
          resolve({ papers: papersReq.result || [], pages: pagesReq.result || [] });
        };
        tx.onerror = function () { reject(tx.error || new Error('读取试卷失败。')); };
      });
    }).then(function (data) {
      var byPaper = Object.create(null);
      data.papers.forEach(function (paper) {
        byPaper[paper.id] = { id: paper.id, title: paper.title || '', pages: [] };
      });
      var pending = data.pages.map(function (page) {
        if (page.sourceDigest || page.viewDigest) return Promise.resolve(page);
        return fingerprintPages([page]).then(function () { return page; });
      });
      return Promise.all(pending).then(function (pages) {
        var out = [];
        pages.forEach(function (page) {
          var slot = byPaper[page.paperId];
          if (!slot) {
            slot = { id: page.paperId, title: '', pages: [] };
            byPaper[page.paperId] = slot;
          }
          slot.pages.push(page);
        });
        Object.keys(byPaper).forEach(function (id) { out.push(byPaper[id]); });
        return out;
      });
    });
  }

  function normalizePaper(raw) {
    var subject = raw && raw.subject;
    var known = SUBJECTS.some(function (s) { return s[0] === subject; });
    var score = num(raw && raw.score);
    var total = num(raw && raw.total);
    var now = new Date().toISOString();
    return {
      id: (raw && raw.id) || newId('p_'),
      title: String(raw && raw.title || '').trim() || '未命名试卷',
      subject: known ? subject : 'math',
      grade: String(raw && raw.grade || '').trim(),
      examDate: String(raw && raw.examDate || '').trim(),
      score: score,
      total: total,
      deduction: num(raw && raw.deduction),
      agentSummary: String(raw && raw.agentSummary || '').trim(),
      agentSuggestions: Array.isArray(raw && raw.agentSuggestions) ? raw.agentSuggestions.slice(0, 8) : [],
      childId: (raw && raw.childId) || null,
      childName: String(raw && raw.childName || '').trim(),
      summary: String(raw && raw.summary || '').trim(),
      createdAt: (raw && raw.createdAt) || now,
      updatedAt: now
    };
  }

  function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('这台浏览器没有可用的本地数据库。'));
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('papers')) db.createObjectStore('papers', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pages')) {
          var pages = db.createObjectStore('pages', { keyPath: 'id' });
          pages.createIndex('paperId', 'paperId');
        }
        if (!db.objectStoreNames.contains('items')) {
          var items = db.createObjectStore('items', { keyPath: 'id' });
          items.createIndex('paperId', 'paperId');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('本地数据库打不开。')); };
    });
  }

  function loadAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['papers', 'items'], 'readonly');
        var papersReq = tx.objectStore('papers').getAll();
        var itemsReq = tx.objectStore('items').getAll();
        tx.oncomplete = function () {
          var papers = (papersReq.result || []).slice();
          papers.sort(function (a, b) {
            var da = String(a.examDate || a.createdAt || '');
            var dbv = String(b.examDate || b.createdAt || '');
            if (da !== dbv) return da < dbv ? 1 : -1;
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
          });
          resolve({ papers: papers, items: itemsReq.result || [] });
        };
        tx.onerror = function () { reject(tx.error || new Error('读取错题库失败。')); };
      });
    });
  }

  function getPaper(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('papers', 'readonly');
        var req = tx.objectStore('papers').get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function listPages(paperId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pages', 'readonly');
        var req = tx.objectStore('pages').index('paperId').getAll(paperId);
        req.onsuccess = function () {
          var pages = (req.result || []).slice();
          pages.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
          resolve(pages);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function writePaper(paper, pages, items) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['papers', 'pages', 'items'], 'readwrite');
        var ps = tx.objectStore('papers');
        var gs = tx.objectStore('pages');
        var is = tx.objectStore('items');
        var oldPages = gs.index('paperId').getAll(paper.id);
        oldPages.onerror = function () { reject(oldPages.error); };
        oldPages.onsuccess = function () {
          (oldPages.result || []).forEach(function (p) { gs.delete(p.id); });
          var oldItems = is.index('paperId').getAll(paper.id);
          oldItems.onerror = function () { reject(oldItems.error); };
          oldItems.onsuccess = function () {
            (oldItems.result || []).forEach(function (it) { is.delete(it.id); });
            ps.put(paper);
            pages.forEach(function (p) { gs.put(p); });
            items.forEach(function (it) { is.put(it); });
          };
        };
        tx.oncomplete = function () { resolve(paper); };
        tx.onerror = function () { reject(tx.error || new Error('保存试卷失败。')); };
        tx.onabort = function () { reject(tx.error || new Error('保存试卷已中断。')); };
      });
    });
  }

  function savePaper(bundle, options) {
    var paper = normalizePaper(bundle && bundle.paper);
    var pages = (bundle && bundle.pages) || [];
    var items = (bundle && bundle.items) || [];
    var rejectDuplicate = !!(options && options.rejectDuplicate);
    return fingerprintPages(pages).then(function () {
      if (!rejectDuplicate) return null;
      return libraryFingerprints().then(function (library) {
        return duplicateOf(pages, library, paper.id);
      });
    }).then(function (dup) {
      if (dup) {
        var err = new Error(duplicateMessage(dup));
        err.code = 'duplicate';
        err.duplicate = dup;
        return Promise.reject(err);
      }
      return writePaper(paper, pages, items);
    });
  }

  function updateItem(item) {
    item.updatedAt = new Date().toISOString();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put(item);
        tx.oncomplete = function () { resolve(item); };
        tx.onerror = function () { reject(tx.error || new Error('更新错题失败。')); };
      });
    });
  }

  function deletePaper(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['papers', 'pages', 'items'], 'readwrite');
        var gs = tx.objectStore('pages');
        var is = tx.objectStore('items');
        tx.objectStore('papers').delete(id);
        var oldPages = gs.index('paperId').getAll(id);
        oldPages.onsuccess = function () {
          (oldPages.result || []).forEach(function (p) { gs.delete(p.id); });
          var oldItems = is.index('paperId').getAll(id);
          oldItems.onsuccess = function () {
            (oldItems.result || []).forEach(function (it) { is.delete(it.id); });
          };
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('删除试卷失败。')); };
      });
    });
  }

  return {
    DB_NAME: DB_NAME,
    SUBJECTS: SUBJECTS,
    REASONS: REASONS,
    subjectLabel: subjectLabel,
    diagnoseHref: diagnoseHref,
    findRedMarks: findRedMarks,
    analyzePage: analyzePage,
    suggestRotation: suggestRotation,
    rotateBox: rotateBox,
    analyze: analyze,
    summarizeExam: summarizeExam,
    newId: newId,
    num: num,
    loadAll: loadAll,
    getPaper: getPaper,
    listPages: listPages,
    digestBlob: digestBlob,
    fingerprintPages: fingerprintPages,
    duplicateOf: duplicateOf,
    duplicateMessage: duplicateMessage,
    libraryFingerprints: libraryFingerprints,
    AGENT_SCHEMA_VERSION: AGENT_SCHEMA_VERSION,
    AGENT_OUTPUT_SCHEMA: AGENT_OUTPUT_SCHEMA,
    buildAgentRequest: buildAgentRequest,
    buildAgentPrompt: buildAgentPrompt,
    parseAgentText: parseAgentText,
    validateAgentResult: validateAgentResult,
    applyAgentResult: applyAgentResult,
    blobToDataUrl: blobToDataUrl,
    savePaper: savePaper,
    updateItem: updateItem,
    deletePaper: deletePaper
  };
});
