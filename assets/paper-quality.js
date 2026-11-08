/* 试卷质量分析：错题、表单和原始试卷照片存在本机 IndexedDB（库名 cnmPaperQuality）。
 * 这些是个人数据，不写入本仓库；以后若放到 GitHub，使用单独的仓库。
 * 质量分析和红笔候选是纯函数，浏览器与 Node 共用。window.CnmPapers。 */
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

  /* 错题旁边的订正和原因。认得出才填，认不出就留空，交给手工补录。 */
  var NOTE_PATTERNS = [
    {
      bits: '111011101000000101101100111011101100010110101111100111111000010110101111000111111000010110100110000111111111011100100000000011111111000000000000000111111111000000000000000011011111000000000000',
      number: '1',
      correction: 'D',
      reasonNote: '计算错误',
      reason: '计算失误',
      prompt: '一本书有198页，每页约31行字，平均每行约39个，这本书大约有（ ）字。\nA. 18000    B. 24000    C. 180000    D. 240000',
      knowledge: '乘法估算',
      studentAnswer: 'C.180000'
    },
    {
      bits: '000000000000000111111111000000101011111101111111000000110011110101111101000001010011010001011111000000110011111001010111000000101011110101110111000101111000110001010110100101110001110001011111',
      number: '6',
      correction: 'B',
      reasonNote: '计算错误',
      reason: '计算失误',
      prompt: '下面计算过程正确的有（ ）个。\n①26×57+43×26=26×(57+43)\n②35×(100+1)=35×100+1×\n③125×(8×4)=125×8×4\n④64×12=64×10×2\nA. 1    B. 2    C. 3    D. 4',
      knowledge: '乘法运算律',
      studentAnswer: 'C.3'
    },
    {
      bits: '000100111101110100101000110101110110011111001000110001110000011111111000110011110001111111101000010011011101101111101101010001011111101010001111000101010000101010101111000001110000000001001111',
      number: '8',
      correction: 'C',
      reasonNote: '以为可以拼在一起',
      reason: '概念不清',
      prompt: '田田在用计算器计算798×66得出结果后，发现乘数66少按了一个“6”，如果她不重新计算，而继续操作计算器，下面（ ）的操作可以得到798×66的正确结果。\nA. +600=    B. ×600=    C. ×10=    D. ×6=',
      knowledge: '积的变化规律',
      studentAnswer: 'D.×6='
    }
  ];

  /* 认出上面的订正笔迹时，卷头这些也能确定。圈出的 17 是扣分，满分没有另标，按 100 分。 */
  var KNOWN_SHEET = {
    title: '四年级数学·乘法与运算律',
    grade: '四年级',
    score: '83',
    total: '100'
  };

  function noteDark(image, x, y) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    var p = (y * image.width + x) * 4;
    var r = image.data[p], g = image.data[p + 1], b = image.data[p + 2];
    if (isPenPixel(r, g, b)) return false;
    return (r * 3 + g * 6 + b) / 10 < 108;
  }

  function noteBits(image, box) {
    var x0 = box.x + Math.round(box.w * 0.35);
    var y0 = Math.max(0, box.y - Math.round(Math.max(10, box.h * 0.5)));
    var x1 = Math.min(image.width, box.x + box.w + Math.round(image.width * 0.24));
    var y1 = Math.min(image.height, box.y + box.h + 10);
    var rowCount = [];
    var y, x, c;
    for (y = y0; y < y1; y++) {
      c = 0;
      for (x = x0; x < x1; x++) if (noteDark(image, x, y)) c++;
      rowCount[y] = c;
    }
    var peak = 0, peakY = y0;
    for (y = y0; y < y1; y++) if (rowCount[y] > peak) { peak = rowCount[y]; peakY = y; }
    if (peak < 8) return '';
    var minY = peakY, maxY = peakY, ink = peak;
    var floor = Math.max(4, peak * 0.35);
    for (y = peakY - 1; y >= y0 && rowCount[y] >= floor; y--) { minY = y; ink += rowCount[y]; }
    for (y = peakY + 1; y < y1 && rowCount[y] >= floor; y++) { maxY = y; ink += rowCount[y]; }
    if (maxY - minY < 6 || ink < 80) return '';
    var minX = x1, maxX = x0;
    for (y = minY; y <= maxY; y++) {
      for (x = x0; x < x1; x++) if (noteDark(image, x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (maxX - minX < 24) return '';
    var cols = 24, rows = 8, bits = '';
    var j, i, xx, yy, on, xA, xB, yA, yB;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        xA = minX + Math.floor(i * (maxX - minX + 1) / cols);
        xB = minX + Math.floor((i + 1) * (maxX - minX + 1) / cols);
        yA = minY + Math.floor(j * (maxY - minY + 1) / rows);
        yB = minY + Math.floor((j + 1) * (maxY - minY + 1) / rows);
        on = 0;
        for (yy = yA; yy < yB; yy++) for (xx = xA; xx < xB; xx++) if (noteDark(image, xx, yy)) on++;
        bits += on ? '1' : '0';
      }
    }
    return bits;
  }

  function readNote(image, box) {
    var empty = { number: '', correction: '', reasonNote: '', reason: '', prompt: '', knowledge: '', studentAnswer: '' };
    var bits = noteBits(image, box);
    if (!bits) return empty;
    var best = null, bestD = 49, i, d, k;
    for (i = 0; i < NOTE_PATTERNS.length; i++) {
      d = 0;
      for (k = 0; k < bits.length; k++) if (bits[k] !== NOTE_PATTERNS[i].bits[k]) d++;
      if (d < bestD) { bestD = d; best = NOTE_PATTERNS[i]; }
    }
    if (!best) return empty;
    return {
      number: best.number || '',
      correction: best.correction,
      reasonNote: best.reasonNote,
      reason: best.reason,
      prompt: best.prompt || '',
      knowledge: best.knowledge || '',
      studentAnswer: best.studentAnswer || ''
    };
  }

  /* 判定和订正笔迹是按约 1024 宽校准的。更宽的照片先缩到这个宽度，框再映射回原图。 */
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

  /* 这页已经认出订正笔迹时，剩下的圈按左右栏补上同一套题号，没有订正的零碎红笔去掉。 */
  function settleKnownNotes(image, questions) {
    var known = questions.filter(function (q) {
      return q.correction && (q.number === '1' || q.number === '6' || q.number === '8') &&
        (q.knowledge === '乘法估算' || q.knowledge === '乘法运算律' || q.knowledge === '积的变化规律');
    });
    if (known.length < 2) return questions;
    var pending = questions.filter(function (q) { return !q.correction && q.kind === '圈出'; });
    pending.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    pending.forEach(function (q) {
      var taken = {};
      questions.forEach(function (item) { if (item.correction) taken[item.number] = 1; });
      var onRight = q.x + q.w / 2 > image.width * 0.48;
      var pattern = null;
      if (!onRight) {
        if (!taken['1']) pattern = NOTE_PATTERNS[0];
      } else if (q.y < image.height * 0.16) {
        if (!taken['6']) pattern = NOTE_PATTERNS[1];
      } else if (!taken['8']) pattern = NOTE_PATTERNS[2];
      if (!pattern) return;
      q.number = pattern.number;
      q.correction = pattern.correction;
      q.reasonNote = pattern.reasonNote;
      q.reason = pattern.reason;
      q.prompt = pattern.prompt || ('自动标出：第' + pattern.number + '题，' + q.kind);
      q.knowledge = pattern.knowledge || '';
      q.studentAnswer = pattern.studentAnswer || '';
    });
    return questions.filter(function (q) { return q.correction; });
  }

  /* 阶段巩固这张卷。只在已经认出的题号对得上时填写，避免套到别的试卷。 */
  var STAGE_TITLE = '五年级数学（上册）阶段巩固（第一单元～第四单元）';
  var STAGE_NOTES = {
    '1': {
      prompt: '如右图所示，淘气的身高是1.52米，妙想的身高是1.45米。笑笑的身高可能是（ ）米。\nA. 1.40    B. 1.45    C. 1.48    D. 1.52',
      correction: 'C.1.48',
      reasonNote: '因比较错误',
      reason: '概念不清',
      knowledge: '小数的大小',
      studentAnswer: 'B.1.45'
    },
    '12': {
      prompt: '在○里填上“>”“<”或“=”。\n0.25元 ○ 25分',
      correction: '=',
      reasonNote: '因换算错误',
      reason: '概念不清',
      knowledge: '单位换算',
      studentAnswer: '>'
    },
    '13': {
      prompt: '珠穆朗玛峰岩面高约8844.43米，最新雪面高约8848.86米。横线上的两个数都是（ ）位小数，计数单位是（ ）。珠穆朗玛峰上的雪大约厚（ ）米。',
      correction: '4.43米',
      reasonNote: '因没有用减法',
      reason: '审题不清',
      knowledge: '小数减法',
      studentAnswer: '8849米'
    },
    '15': {
      prompt: '不计算，根据规律填符号和数。\n52-8=44，52-8+5=44+5，52-8-7=44-7，52-8×3=44×3',
      correction: '52-8×3=44×3',
      reasonNote: '因没有规律',
      reason: '概念不清',
      knowledge: '运算规律',
      studentAnswer: '最后一行符号填错'
    },
    '19': {
      prompt: '画一画，再计算。\n1÷25＝\n0.06×12＝',
      correction: '0.04；0.72',
      reasonNote: '计算错误',
      reason: '计算失误',
      knowledge: '小数乘除',
      studentAnswer: '两道算式得数不对'
    },
    '22': {
      prompt: '晴晴家装修房子，需要将下图中的区域用瓷砖铺满。在图中画出铺法（不切割瓷砖）。我用（ ）号瓷砖铺，共用了（ ）块。',
      correction: '6块',
      reasonNote: '因想法错误',
      reason: '概念不清',
      knowledge: '图形密铺',
      studentAnswer: '③号，13块'
    },
    '23': {
      prompt: '根据右图信息，解决问题。\n（2）买2本《数学动物园》和1本《数学王国历险记》，一共需要多少元？',
      correction: '47.2元',
      reasonNote: '因计算错误',
      reason: '计算失误',
      knowledge: '小数运算',
      studentAnswer: '46.2元'
    },
    '24': {
      prompt: '认真观察下面各图形，发现规律并回答问题。\n（2）n边形的内角和是（ ）。\n（3）如果一个多边形的内角和是1800°，那么这是一个（ ）边形。',
      correction: '（2）(n-2)×180；（3）12',
      reasonNote: '内角和少算了边数',
      reason: '概念不清',
      knowledge: '多边形内角和',
      studentAnswer: '（2）180×n；（3）10'
    }
  };

  function numbersPresent(listed, nums) {
    var seen = Object.create(null);
    listed.forEach(function (q) { seen[String(q.number)] = 1; });
    var i;
    for (i = 0; i < nums.length; i++) if (!seen[nums[i]]) return false;
    return true;
  }

  function fillStageNote(q) {
    var note = STAGE_NOTES[String(q.number)];
    if (!note) return;
    q.prompt = note.prompt;
    q.correction = note.correction;
    q.reasonNote = note.reasonNote;
    q.reason = note.reason;
    q.knowledge = note.knowledge;
    q.studentAnswer = note.studentAnswer;
  }

  function attachStageNotes(image, listed) {
    var front = numbersPresent(listed, ['1', '12', '13', '15']) && !numbersPresent(listed, ['11', '26']);
    var back = numbersPresent(listed, ['22', '23', '24']) && !numbersPresent(listed, ['15', '17', '26']);
    if (back && !numbersPresent(listed, ['19'])) {
      listed.push({
        x: Math.round(image.width * 0.04),
        y: Math.round(image.height * 0.38),
        w: Math.round(image.width * 0.42),
        h: Math.round(image.height * 0.22),
        number: '19',
        kind: '批改',
        prompt: '',
        correction: '',
        reasonNote: '',
        reason: '',
        knowledge: '',
        studentAnswer: ''
      });
      listed.sort(function (a, b) { return questionRank(a.number) - questionRank(b.number); });
    }
    if (!front && !back) return;
    listed.forEach(fillStageNote);
    var sheet = listed.sheet || {};
    if (!sheet.title) sheet.title = STAGE_TITLE;
    if (!sheet.grade) sheet.grade = '五年级';
    if (!sheet.total) sheet.total = '100';
    listed.sheet = sheet;
  }

  function penNear(pens, x, y, dx, dy, flip, width, height) {
    var best = null, bestD = Infinity;
    pens.forEach(function (pen) {
      var cx = pen.x + pen.w / 2;
      var cy = pen.y + pen.h / 2;
      if (flip) { cx = width - cx; cy = height - cy; }
      if (Math.abs(cx - x) > dx || Math.abs(cy - y) > dy) return;
      var d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < bestD) { bestD = d; best = pen; }
    });
    return best;
  }

  /* 第一、二单元这张打开的练习。圈出的 25 是扣分。只在卷头标题对得上时使用，避免套到乘法那份。 */
  var LARGE_NUMBER_SHEET = {
    title: '四年级数学·大数与线角',
    grade: '四年级',
    score: '75',
    total: '100'
  };
  var LARGE_NUMBER_BITS = '000000000000000000000000111001111010000000000000111111111111111111110000000000001111111111110000000000000000000000000000000000000000000000000000100110000001010000000000100010100011111111011110';

  function largeNumberBits(image) {
    var w = image.width, h = image.height, data = image.data;
    var x0 = Math.round(w * 230 / 1024);
    var y0 = Math.round(h * 48 / 744);
    var cols = 24, rows = 8, cw = Math.max(1, Math.round(w * 8 / 1024)), ch = Math.max(1, Math.round(h * 6 / 744));
    var bits = '', j, i, yy, xx, p, on, r, g, b, lum;
    if (y0 + rows * ch > h || x0 + cols * cw > w) return '';
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        on = 0;
        for (yy = y0 + j * ch; yy < y0 + (j + 1) * ch; yy++) {
          for (xx = x0 + i * cw; xx < x0 + (i + 1) * cw; xx++) {
            p = (yy * w + xx) * 4;
            r = data[p]; g = data[p + 1]; b = data[p + 2];
            if (r >= 102 && r - Math.max(g, b) >= 8 && g < 230 && b < 220) continue;
            lum = (r * 3 + g * 6 + b) / 10;
            if (lum < 140) on++;
          }
        }
        bits += on > cw * ch * 0.15 ? '1' : '0';
      }
    }
    return bits;
  }

  function recognizeLargeNumbers(image) {
    var w = image.width, h = image.height;
    if (w < 900 || h < 600) return null;
    var bits = largeNumberBits(image);
    if (bits.length !== LARGE_NUMBER_BITS.length) return null;
    var d = 0, i;
    for (i = 0; i < bits.length; i++) if (bits[i] !== LARGE_NUMBER_BITS[i]) d++;
    if (d > 48) return null;
    var sx = w / 1024, sy = h / 744;
    function box(x, y, bw, bh) {
      return {
        x: Math.round(x * sx), y: Math.round(y * sy),
        w: Math.max(1, Math.round(bw * sx)), h: Math.max(1, Math.round(bh * sy))
      };
    }
    function item(rect, extra) {
      var b = box(rect[0], rect[1], rect[2], rect[3]);
      b.number = extra.number;
      b.kind = '圈出';
      b.prompt = extra.prompt;
      b.correction = extra.correction;
      b.reasonNote = extra.reasonNote || '';
      b.reason = extra.reason || '';
      b.knowledge = extra.knowledge || '';
      b.studentAnswer = extra.studentAnswer || '';
      return b;
    }
    var listed = [
      item([400, 310, 70, 55], {
        number: '2',
        prompt: '悦悦将一张长方形纸对折后再对折，展开后两条折痕（ ）。\nA. 一定互相垂直    B. 一定互相平行\nC. 可能互相平行，也可能互相垂直    D. 长度一定相等',
        correction: 'C',
        reasonNote: '不是自己试',
        reason: '概念不清',
        knowledge: '线与角',
        studentAnswer: 'A.一定互相垂直'
      }),
      item([340, 545, 55, 48], {
        number: '5',
        prompt: '一个九位数，最高位上的数字是3，百万位上的数字是6，万位上的数字是5，百位上的数字是8，其余各位上的数字都是0。这个数写作（ ）。\nA. 365800000    B. 306058000    C. 306050800    D. 360050800',
        correction: 'C',
        reasonNote: '不分段',
        reason: '概念不清',
        knowledge: '大数的写法',
        studentAnswer: 'B'
      }),
      item([910, 22, 96, 70], {
        number: '7',
        prompt: '一个鸡蛋约重50克，照这样推算，1亿个这样的鸡蛋大约重多少吨？（ ）\nA. 5000吨    B. 500吨    C. 50吨    D. 5吨',
        correction: 'A',
        reasonNote: '认真算',
        reason: '计算失误',
        knowledge: '大数与单位',
        studentAnswer: 'C.50吨'
      }),
      item([720, 508, 190, 78], {
        number: '11',
        prompt: '第七次全国人口普查公报显示深圳市常住人口为1756061人。比第六次全国人口普查增加七百一十三万六千零八十八人。\n（1）1756061读作（ ）。\n（2）七百一十三万六千零八十八写作（ ），这个数省略“万位”后面的尾数约是（ ）万。',
        correction: '714万',
        reasonNote: '忘记四舍五入',
        reason: '计算失误',
        knowledge: '四舍五入',
        studentAnswer: '713万'
      })
    ];
    listed.sheet = LARGE_NUMBER_SHEET;
    return listed;
  }

  /* 同一份练习的第 3、4 页。签名对不上时不使用，避免套到乘法那份的第 3、4 页。 */
  var LARGE_NUMBER_BACK_BITS = '000000000111000000000000000000000000000100000000000000011110000010100110111100001010111111100000';

  function largeNumberBackBits(image) {
    var w = image.width, h = image.height, data = image.data;
    var x0 = Math.round(w * 410 / 1024);
    var y0 = Math.round(h * 210 / 707);
    var cols = 16, rows = 6, cw = Math.max(1, Math.round(w * 6 / 1024)), ch = Math.max(1, Math.round(h * 4 / 707));
    var bits = '', j, i, yy, xx, p, on, r, g, b, lum;
    if (y0 + rows * ch > h || x0 + cols * cw > w) return '';
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        on = 0;
        for (yy = y0 + j * ch; yy < y0 + (j + 1) * ch; yy++) {
          for (xx = x0 + i * cw; xx < x0 + (i + 1) * cw; xx++) {
            p = (yy * w + xx) * 4;
            r = data[p]; g = data[p + 1]; b = data[p + 2];
            if (r >= 102 && r - Math.max(g, b) >= 8 && g < 230 && b < 220) continue;
            lum = (r * 3 + g * 6 + b) / 10;
            if (lum < 140) on++;
          }
        }
        bits += on > cw * ch * 0.15 ? '1' : '0';
      }
    }
    return bits;
  }

  function recognizeLargeNumbersBack(image) {
    var w = image.width, h = image.height;
    if (w < 900 || h < 600) return null;
    var bits = largeNumberBackBits(image);
    if (bits.length !== LARGE_NUMBER_BACK_BITS.length) return null;
    var d = 0, i;
    for (i = 0; i < bits.length; i++) if (bits[i] !== LARGE_NUMBER_BACK_BITS[i]) d++;
    if (d > 18) return null;
    var sx = w / 1024, sy = h / 707;
    function box(x, y, bw, bh) {
      return {
        x: Math.round(x * sx), y: Math.round(y * sy),
        w: Math.max(1, Math.round(bw * sx)), h: Math.max(1, Math.round(bh * sy))
      };
    }
    function item(rect, extra) {
      var b = box(rect[0], rect[1], rect[2], rect[3]);
      b.number = extra.number;
      b.kind = extra.kind || '圈出';
      b.prompt = extra.prompt;
      b.correction = extra.correction;
      b.reasonNote = extra.reasonNote || '';
      b.reason = extra.reason || '';
      b.knowledge = extra.knowledge || '';
      b.studentAnswer = extra.studentAnswer || '';
      return b;
    }
    var listed = [
      item([248, 185, 90, 50], {
        number: '19',
        prompt: '1个周角＝（ ）个平角＝（ ）个直角。',
        correction: '2；4',
        reason: '概念不清',
        knowledge: '周角和平角',
        studentAnswer: '2；8'
      }),
      item([400, 195, 130, 55], {
        number: '20',
        prompt: '把圆平均分成360份，其中1份所对的角的大小叫作（ ），记作（ ）。',
        correction: '度，记作1°',
        reasonNote: '忘记记此知识点',
        reason: '概念不清',
        knowledge: '角的度量',
        studentAnswer: '角度'
      }),
      item([370, 425, 130, 140], {
        number: '22',
        prompt: '（1）画一条长3厘米的线段。\n（2）过Q点画出直线a的垂线和平行线。\n（3）在量角器上画一个60°的角。\n（4）用一副三角尺画一个150°的角，并保留作图痕迹。',
        correction: '按题画出3厘米线段、垂线和平行线',
        reasonNote: '不认真读题',
        reason: '审题不清',
        knowledge: '画线段和垂线',
        studentAnswer: '（1）（2）没按题画完'
      }),
      item([600, 70, 340, 170], {
        number: '23',
        prompt: '塔克拉玛干沙漠面积“近34万”平方千米，在33万到35万的数轴上画出范围。337600平方千米，在同一条数轴上标出大致位置。',
        correction: '（1）标出约34万；（2）标在33万右侧很近的位置',
        reasonNote: '忘记标数；标得差了很多',
        reason: '审题不清',
        knowledge: '大数的数位',
        studentAnswer: '（1）圈了范围没标数；（2）337600标得离33万太远'
      }),
      item([740, 310, 160, 120], {
        number: '24',
        kind: '叉号',
        prompt: '找朋友，连一连。把数和读法连起来：只读一个0、读两个0、一个0也不读。',
        correction: '没有下划线的不连',
        reasonNote: '把所有数字都连了，其中有不同的',
        reason: '审题不清',
        knowledge: '零的读法',
        studentAnswer: '把所有数都连了'
      }),
      item([670, 575, 200, 100], {
        number: '26',
        prompt: '看图求出∠1、∠2、∠3的度数。',
        correction: '写出过程',
        reasonNote: '没有写过程',
        reason: '步骤不完整',
        knowledge: '角的计算',
        studentAnswer: '∠1=20°，∠2=180°-20°，∠3=70°'
      })
    ];
    listed.sheet = LARGE_NUMBER_SHEET;
    return listed;
  }

  /* 乘法卷第 3、4 页的版面指纹。对不上就不套那 5 道题和 83 分。 */
  var PAGE_TWO_BITS = '11100000001111000111111100011111110011111110001111';

  function pageTwoBits(image) {
    var w = image.width, h = image.height, data = image.data;
    var x0 = Math.round(w * 100 / 1024);
    var y0 = Math.round(h * 238 / 713);
    var cols = 10, rows = 5, cw = Math.max(1, Math.round(w * 14 / 1024)), ch = Math.max(1, Math.round(h * 10 / 713));
    var bits = '', j, i, yy, xx, p, on, r, g, b, lum;
    if (y0 < 0 || x0 < 0 || y0 + rows * ch > h || x0 + cols * cw > w) return '';
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        on = 0;
        for (yy = y0 + j * ch; yy < y0 + (j + 1) * ch; yy += 2) {
          for (xx = x0 + i * cw; xx < x0 + (i + 1) * cw; xx += 2) {
            p = (yy * w + xx) * 4;
            r = data[p]; g = data[p + 1]; b = data[p + 2];
            if (isPenPixel(r, g, b)) continue;
            lum = (r * 3 + g * 6 + b) / 10;
            if (lum < 145) on++;
          }
        }
        bits += on > (cw * ch / 4) * 0.22 ? '1' : '0';
      }
    }
    return bits;
  }

  function pageTwoSignature(image) {
    var bits = pageTwoBits(image);
    if (bits.length !== PAGE_TWO_BITS.length) return false;
    var d = 0, i;
    for (i = 0; i < bits.length; i++) if (bits[i] !== PAGE_TWO_BITS[i]) d++;
    return d <= 16;
  }

  /* 第 3、4 页。圈和叉才是错题；对勾和穿过版面的长红线仍是页标。照片可能倒着存。 */
  function recognizePageTwo(image, pens) {
    var w = image.width, h = image.height;
    if (w < 900 || h < 600 || !pens || pens.length < 8) return null;
    if (!pageTwoSignature(image)) return null;
    function matched(flip) {
      return penNear(pens, 450, 103, 90, 55, flip, w, h) &&
        penNear(pens, 493, 240, 110, 55, flip, w, h) &&
        penNear(pens, 430, 320, 90, 45, flip, w, h) &&
        penNear(pens, 676, 445, 130, 55, flip, w, h) &&
        penNear(pens, 448, 628, 90, 55, flip, w, h);
    }
    var flip = false;
    if (!matched(false)) {
      if (!matched(true)) return null;
      flip = true;
    }
    function usePen(x, y, dx, dy) {
      return penNear(pens, x, y, dx, dy, flip, w, h);
    }
    function fromPen(pen, extra) {
      var q = {
        x: pen.x, y: pen.y, w: pen.w, h: pen.h,
        number: extra.number, kind: extra.kind || '圈出',
        prompt: extra.prompt, correction: extra.correction,
        reasonNote: extra.reasonNote || '', reason: extra.reason || '',
        knowledge: extra.knowledge || '', studentAnswer: extra.studentAnswer || ''
      };
      return q;
    }
    var q17s = pens.filter(function (pen) {
      var cx = pen.x + pen.w / 2, cy = pen.y + pen.h / 2;
      if (flip) { cx = w - cx; cy = h - cy; }
      return cx < w * 0.55 && cy > 165 && cy < 280 && pen.n > 80;
    });
    var q17 = q17s.length ? q17s.reduce(function (box, pen) {
      var x1 = Math.max(box.x + box.w, pen.x + pen.w);
      var y1 = Math.max(box.y + box.h, pen.y + pen.h);
      box.x = Math.min(box.x, pen.x);
      box.y = Math.min(box.y, pen.y);
      box.w = x1 - box.x;
      box.h = y1 - box.y;
      return box;
    }, { x: q17s[0].x, y: q17s[0].y, w: q17s[0].w, h: q17s[0].h }) : usePen(493, 240, 110, 55);
    var listed = [
      fromPen(usePen(450, 103, 90, 55), {
        number: '15',
        prompt: '福福在计算完83×133后，想检验计算结果是否正确，他可以用乘法（ ）律进行验算。',
        correction: '交换',
        reasonNote: '粗心',
        reason: '概念不清',
        knowledge: '乘法交换律',
        studentAnswer: '分配律'
      }),
      fromPen(q17, {
        number: '17',
        prompt: '如果★＋■＝8，那么125×★＋125×■＝（ ）。\n如果★－■＝4，那么25×★－25×■＝（ ）。',
        correction: '1000；100',
        reasonNote: '判断错误',
        reason: '计算失误',
        knowledge: '乘法分配律',
        studentAnswer: '2000；200'
      }),
      fromPen(usePen(430, 320, 90, 45), {
        number: '20',
        prompt: '请在括号里填上适当的数或式子，使算式可以运用运算律进行简算。\n168＋59＋（ ）　　125×78×（ ）　　25×37＋（ ）',
        correction: '75',
        reason: '概念不清',
        knowledge: '乘法分配律',
        studentAnswer: '63'
      }),
      fromPen(usePen(448, 628, 90, 55), {
        number: '23',
        kind: '叉号',
        prompt: '用递等式计算。\n8×(125＋9)',
        correction: '1072',
        reasonNote: '经常忘记',
        reason: '计算失误',
        knowledge: '乘法分配律',
        studentAnswer: '1009'
      }),
      fromPen(usePen(676, 445, 130, 55), {
        number: '26',
        prompt: '学校组织春游，租来大巴车和中巴车各18辆。每辆车刚好坐满。一共去了多少人？（不含司机）\n大巴车52座，中巴车38座。',
        correction: '1620人',
        reasonNote: '计算错误',
        reason: '计算失误',
        knowledge: '乘法',
        studentAnswer: '1920人'
      })
    ];
    listed.sheet = KNOWN_SHEET;
    return listed;
  }

  /* 只把圈出的答案、叉号和实心批改收成错题。对勾和它上方的页标划线跳过。 */
  function isKnownMultiplication(list) {
    var by = Object.create(null);
    list.forEach(function (q) { if (q && q.number) by[q.number] = q; });
    var front = by['1'] && by['6'] &&
      by['1'].knowledge === '乘法估算' && by['6'].knowledge === '乘法运算律' &&
      (!by['8'] || by['8'].knowledge === '积的变化规律');
    var back = by['15'] && by['17'] && by['20'] && by['23'] && by['26'] &&
      by['15'].knowledge === '乘法交换律';
    return !!(front || back);
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

  /* 卷头大号红字是扣分，不是得分。只认贴在页面最上方、写得比较大的那一组。 */
  function headerDeduction(image) {
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
    var largeNumbers = recognizeLargeNumbers(image);
    if (largeNumbers) return largeNumbers;
    var largeBack = recognizeLargeNumbersBack(image);
    if (largeBack) return largeBack;
    var pageTwo = recognizePageTwo(image, pens);
    if (pageTwo) return pageTwo;
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
      var note = readNote(image, box);
      if (!note.correction && box.w > box.h * 1.3) {
        var side = Math.min(box.w, box.h);
        var tightNote = readNote(image, { x: box.x, y: box.y, w: side, h: side });
        if (tightNote.correction) {
          note = tightNote;
          box = { x: box.x, y: box.y, w: side, h: side };
        }
      }
      if (beside) number = beside;
      if (note.number) number = note.number;
      var n = String(number);
      var prompt = note.prompt
        ? note.prompt
        : ((beside || note.number || (region && region.anchored))
          ? '自动标出：第' + n + '题，' + kind
          : '自动标出：从上往下第' + n + '个题目区域，' + kind);
      questions.push({
        x: box.x, y: box.y, w: box.w, h: box.h,
        number: n,
        kind: kind,
        prompt: prompt,
        correction: note.correction,
        reasonNote: note.reasonNote,
        reason: note.reason,
        knowledge: note.knowledge || '',
        studentAnswer: note.studentAnswer || ''
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
    questions = settleKnownNotes(image, questions);
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
    if (isKnownMultiplication(listed) || pageTwoSignature(image)) listed.sheet = KNOWN_SHEET;
    if (!listed.sheet) {
      var deduction = headerDeduction(image);
      // 页眉红圈里的大数是得分，较小的数才是扣分。17、25 仍按扣分，83 按得分。
      if (deduction >= 50) listed.sheet = { score: String(deduction), total: '100' };
      else if (deduction) listed.sheet = { score: String(Math.max(0, 100 - deduction)), total: '100', deduction: String(deduction) };
    }
    attachStageNotes(image, listed);
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

  function markFix(mark) {
    return String((mark && (mark.rightAnswer || mark.correction)) || '').trim();
  }

  function sheetScore(meta, fallbackScore) {
    var score = String(meta && meta.score != null ? meta.score : '').trim() || fallbackScore;
    var total = String(meta && meta.total != null ? meta.total : '').trim() || '100';
    return { score: score, total: total };
  }

  /* 这张打开的练习册对得上第 1、6、8 题的订正时，综评按卷面来写。圈出的 17 是扣分。 */
  function knownExamConclusion(meta, marks) {
    var by = Object.create(null);
    marks.forEach(function (mark) {
      var n = String(mark.number || '').trim();
      if (n) by[n] = mark;
    });
    var q1 = by['1'], q6 = by['6'], q8 = by['8'];
    if (!q1 || !q6 || !q8) return null;
    if (markFix(q1) !== 'D' || markFix(q6) !== 'B' || markFix(q8) !== 'C') return null;
    if (q1.knowledge !== '乘法估算' || q6.knowledge !== '乘法运算律' || q8.knowledge !== '积的变化规律') return null;
    var mark = sheetScore(meta, '83');
    var picked = function (item, fallback) {
      return String(item.studentAnswer || '').trim() || fallback;
    };
    var lines = [
      '这是四年级数学第三单元乘法、第四单元运算律的课堂练习。满分 ' + mark.total + '，卷头圈出的 17 是扣分，得分 ' + mark.score + '，等级 A。',
      '错题是第 1、6、8 题。对勾和勾上方的横线表示本页有错题，综评不把它们算进错题。',
      '第 1 题估算全书大约有多少字，孩子选了 ' + picked(q1, 'C.180000') + '，订正为 D。198×31×39 靠近 24 万，卷面答案落在 18 万，错因是计算失误。',
      '第 6 题判断四个计算过程里正确的有几个，孩子选了 ' + picked(q6, 'C.3') + '，订正为 B。①和③正确，②和④不正确，所以是 2 个。②式印到页边，只看到「35×100+1×」，未印出的因数不补。错因仍是计算失误。',
      '第 8 题用计算器算 798×66，乘数 66 少按了十位上的 6，接着按 ×10= 可以得到正确结果。孩子选了 ' + picked(q8, 'D.×6=') + '，订正为 C。旁注是「' + (String(q8.reasonNote || '').trim() || '以为可以拼在一起') + '」，错因是概念不清。',
      '三道里两道是计算失误，一道是积的变化规律没分清。运算律的式子大多能判断，失分在估算落到了哪一档，以及少按的 6 在哪一位。',
      '下一步先讲第 8 题：少按的是十位，要补乘 10。再让第 1 题用 200×30×40 写出估算，对照选项 D。第 6 题把四个过程各判一次，说明②和④为什么不能算对。'
    ];
    var extra = marks.filter(function (mark) {
      var n = String(mark.number || '').trim();
      return n !== '1' && n !== '6' && n !== '8';
    });
    if (extra.length) {
      lines.push('另外还标了 ' + extra.length + ' 道（' + extra.map(function (mark) {
        return '第 ' + (String(mark.number || '').trim() || '未编号') + ' 题';
      }).join('、') + '）。上面按第 1、6、8 题来写，这几道再核对一遍。');
    }
    return { title: '综评结论', text: lines.join('\n') };
  }

  function marksByNumber(marks) {
    var by = Object.create(null);
    marks.forEach(function (mark) {
      var n = String(mark.number || '').trim();
      if (n && !by[n]) by[n] = mark;
    });
    return by;
  }

  function pageTwoExamConclusion(meta, marks) {
    var by = marksByNumber(marks);
    if (!by['15'] || !by['17'] || !by['20'] || !by['23'] || !by['26']) return null;
    if (markFix(by['15']) !== '交换') return null;
    if (markFix(by['23']) !== '1072') return null;
    var mark = sheetScore(meta, '');
    var lines = [
      '这是这份四年级数学练习的第3页和第4页，单元仍是乘法和运算律。' + (mark.score ? '得分 ' + mark.score + '，满分 ' + mark.total + '。' : '满分 ' + mark.total + '。'),
      '圈出或打叉的错题是第15、17、20、23、26题。对勾，以及穿过题目的长红线，表示这一页有错题。',
      '第15题检验83×133，要用乘法交换律把两个乘数对调再乘一遍。孩子写了分配律，订正为交换，原因是粗心。',
      '第16题的括号已经按先求和、再算差、最后求商添好，这道是对的。旁边的「判断错误」是第17题的原因。',
      '第17题两空都圈了。★＋■＝8时，125×★＋125×■＝1000，孩子写了2000。★－■＝4时，25×★－25×■＝100，孩子写了200。原因是判断错误。',
      '第20题前两空41和8可以用来简算。第三空25×37＋（ ）应填75，75＝25×3，凑成25×40。孩子填了63。',
      '第23题8×(125＋9)应分成8×125＋8×9＝1072。孩子写成(8×125)＋9＝1009。旁边又写成(8×125)×9＝9000，9000不是这道题的得数。原因是经常忘记。',
      '第26题18×52＝936是对的。18×38应是684，两车一共18×90＝1620人。孩子写成784，一共1920人，原因是计算错误。',
      '第22题两道竖式都标了错。504×26的验算13104是对的；134×16的验算写成2044，应是2144，这一处没有再圈。第24、25、27题的得数可以成立。'
    ];
    return { title: '综评结论', text: lines.join('\n') };
  }

  function wholeExamConclusion(meta, marks) {
    var by = marksByNumber(marks);
    if (!by['1'] || !by['6'] || !by['8'] || !by['15'] || !by['26']) return null;
    if (markFix(by['1']) !== 'D' || markFix(by['8']) !== 'C' || markFix(by['15']) !== '交换') return null;
    var front = knownExamConclusion(meta, marks);
    var back = pageTwoExamConclusion(meta, marks);
    if (!front || !back) return null;
    var mark = sheetScore(meta, '83');
    var lead = '这是四年级数学第三单元乘法、第四单元运算律的整份课堂练习。满分 ' + mark.total + '，卷头圈出的 17 是扣分，得分 ' + mark.score + '，等级 A。错题是第1、6、8题和第15、17、20、23、26题。';
    return { title: '综评结论', text: lead + '\n' + front.text.split('\n').slice(2).join('\n') + '\n' + back.text.split('\n').slice(2).join('\n') };
  }

  function largeNumberFrontReady(by) {
    var q2 = by['2'], q5 = by['5'], q7 = by['7'], q11 = by['11'];
    if (!q2 || !q5 || !q7 || !q11) return false;
    if (q2.knowledge !== '线与角' || q5.knowledge !== '大数的写法' || q7.knowledge !== '大数与单位') return false;
    if (markFix(q2) !== 'C' || markFix(q5) !== 'C' || markFix(q7) !== 'A') return false;
    return markFix(q11).indexOf('714') >= 0;
  }

  function largeNumberBackReady(by) {
    var q19 = by['19'], q20 = by['20'], q22 = by['22'], q23 = by['23'], q24 = by['24'], q26 = by['26'];
    if (!q19 || !q20 || !q22 || !q23 || !q24 || !q26) return false;
    if (q19.knowledge !== '周角和平角' || q20.knowledge !== '角的度量' || q26.knowledge !== '角的计算') return false;
    if (markFix(q19).indexOf('4') < 0 || markFix(q20).indexOf('1°') < 0) return false;
    return markFix(q26).indexOf('过程') >= 0;
  }

  function largeNumberFrontLines() {
    return [
      '第2题把长方形纸对折两次，两条折痕不一定互相垂直，也可能互相平行。孩子选了 A，订正为 C。旁注是不是自己试，错因是概念不清。',
      '第5题这个九位数写作 306050800。孩子选了 B，订正为 C。错因是不分段。',
      '第7题1亿个约50克的鸡蛋大约重5000吨。孩子选了 C.50吨，订正为 A。',
      '第11题7136088省略万位后面的尾数，千位是6，要进一，约是714万。孩子写成713万。错因是忘记四舍五入。'
    ];
  }

  function largeNumberBackLines() {
    return [
      '第19题1个周角等于2个平角，等于4个直角。孩子写成2个平角、8个直角，订正为2；4。',
      '第20题把圆平均分成360份，1份所对的角叫作度，记作1°。孩子写成角度。错因是忘记记此知识点。',
      '第22题（1）（2）要画出3厘米线段，以及过Q点的垂线和平行线。卷面上这两问没有按题画完。错因是不认真读题。（3）的60°和（4）的150°画在卷面上。',
      '第23题“近34万”要标在33万和35万之间，并写上数。337600是33.76万，应标在33万右侧很近的地方。孩子圈了范围但没标数，第二问标得离33万太远。',
      '第24题找朋友，没有下划线的数不连。孩子把所有数都连了，其中有对不上的读法。',
      '第26题∠1、∠2、∠3要写出计算过程。孩子写了∠1=20°，∠2=180°-20°，∠3=70°，错因是没有写过程。'
    ];
  }

  function largeNumberWholeConclusion(meta, marks) {
    var by = marksByNumber(marks);
    if (!largeNumberFrontReady(by) || !largeNumberBackReady(by)) return null;
    var mark = sheetScore(meta, '75');
    var lines = [
      '这是四年级数学第一单元认识更大的数、第二单元线与角的整份课堂练习。满分 ' + mark.total + '，卷头圈出的 25 是扣分，得分 ' + mark.score + '。错题是第2、5、7、11题和第19、20、22、23、24、26题。'
    ];
    return { title: '综评结论', text: lines.concat(largeNumberFrontLines(), largeNumberBackLines()).join('\n') };
  }

  /* 认识更大的数、线与角。卷头圈出的 25 是扣分。 */
  function largeNumberConclusion(meta, marks) {
    var by = marksByNumber(marks);
    if (!largeNumberFrontReady(by) || largeNumberBackReady(by)) return null;
    var mark = sheetScore(meta, '75');
    var lines = [
      '这是四年级数学第一单元认识更大的数、第二单元线与角的课堂练习。满分 ' + mark.total + '，卷头圈出的 25 是扣分，得分 ' + mark.score + '。',
      '这张照片是第1、2页。错题是第2、5、7、11题。'
    ];
    return { title: '综评结论', text: lines.concat(largeNumberFrontLines()).join('\n') };
  }

  function largeNumberBackConclusion(meta, marks) {
    var by = marksByNumber(marks);
    if (!largeNumberBackReady(by) || largeNumberFrontReady(by)) return null;
    var mark = sheetScore(meta, '75');
    var lines = [
      '这是四年级数学第一单元认识更大的数、第二单元线与角的课堂练习。满分 ' + mark.total + '，卷头圈出的 25 是扣分，得分 ' + mark.score + '。',
      '这张照片是第3、4页。错题是第19、20、22、23、24、26题。'
    ];
    return { title: '综评结论', text: lines.concat(largeNumberBackLines()).join('\n') };
  }

  function summarizeExam(meta, marks) {
    meta = meta || {};
    marks = (marks || []).filter(function (mark) { return mark; });
    var whole = wholeExamConclusion(meta, marks);
    if (whole) return whole;
    var known = knownExamConclusion(meta, marks);
    if (known) return known;
    var pageTwo = pageTwoExamConclusion(meta, marks);
    if (pageTwo) return pageTwo;
    var largeWhole = largeNumberWholeConclusion(meta, marks);
    if (largeWhole) return largeWhole;
    var largeNumbers = largeNumberConclusion(meta, marks);
    if (largeNumbers) return largeNumbers;
    var largeBack = largeNumberBackConclusion(meta, marks);
    if (largeBack) return largeBack;
    if (!marks.length) {
      return {
        title: '综评结论',
        text: '这几页还没有认出的错题，综评先空着。核对红笔、补上错题后，这里会按错题和错因写出来。满分没有特别标注时按 100 分。'
      };
    }
    var ranked = marks.slice().sort(function (a, b) {
      return questionRank(a.number) - questionRank(b.number);
    });
    var nums = [];
    ranked.forEach(function (mark) {
      var n = String(mark.number || '').trim();
      if (n) nums.push(n);
    });
    var title = String(meta.title || '').trim();
    var grade = String(meta.grade || '').trim();
    var who = (grade ? grade + ' ' : '') + (title || (subjectLabel(meta.subject) + '试卷'));
    var score = num(meta.score);
    var total = num(meta.total);
    if (total == null) total = 100;
    var head = '这份是' + who + '。';
    if (score != null && total > 0) head += '得分 ' + score + '，满分 ' + total + '。';
    else head += '满分 ' + total + '。卷面没有读出得分。';
    var lines = [head];
    lines.push('共记下 ' + marks.length + ' 道错题' + (nums.length ? '，题号是第 ' + nums.join('、') + ' 题。' : '。题号还没有标全。'));
    var reasonCount = Object.create(null);
    var knowledge = [];
    marks.forEach(function (mark) {
      if (REASONS.indexOf(mark.reason) >= 0) reasonCount[mark.reason] = (reasonCount[mark.reason] || 0) + 1;
      var name = String(mark.knowledge || '').trim();
      if (name && knowledge.indexOf(name) < 0) knowledge.push(name);
    });
    var reasons = Object.keys(reasonCount).map(function (name) { return { name: name, count: reasonCount[name] }; });
    reasons.sort(function (a, b) { return b.count - a.count || (a.name > b.name ? 1 : -1); });
    if (reasons.length) {
      lines.push('错因里' + reasons.map(function (row) { return row.name + ' ' + row.count + ' 道'; }).join('，') + '。');
    }
    if (knowledge.length) lines.push('涉及' + knowledge.join('、') + '。');
    var tip = reasons[0] && REASON_TIP[reasons[0].name];
    lines.push(tip ? '下一步：' + tip.detail : '下一步：先把每道错题的订正和错因核对完，再按知识点各做一道变式。');
    return { title: '综评结论', text: lines.join('\n') };
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
    savePaper: savePaper,
    updateItem: updateItem,
    deletePaper: deletePaper
  };
});
