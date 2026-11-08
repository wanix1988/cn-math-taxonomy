/* 中文按 RUBRIC（硬笔楷书量表：笔法 30 / 结体 50 / 章法 20）逐字评判，
 * 英文按字母书写六维来看。不识别写的是哪个汉字，笔顺、起收笔、部件比例不评判。
 * 评价和标注位置是纯函数，浏览器与 Node 共用。window.CnmHandwriting。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CnmHandwriting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ADVICE = {
    baseline: ['底部对齐', '每个字母的底部贴着同一条线。'],
    centerZh: ['字心成行', '每个字的中心贴着同一条线。'],
    tiltDown: ['这行写平', '这一行越写越往下，沿着横线写平。'],
    tiltUp: ['这行写平', '这一行越写越往上，沿着横线写平。'],
    tiltDownZh: ['这行写平', '这一行的字心越写越往下，沿着格线写平。'],
    tiltUpZh: ['这行写平', '这一行的字心越写越往上，沿着格线写平。'],
    sizeZh: ['大小匀称', '同样的字写得一样大，约写满格子的三分之二。'],
    sizeEn: ['字母同高', '小写字母的主体写一样高。'],
    sizeSmall: ['字再写大', '字再写大一点，大约占格子的三分之二。'],
    shapeZh: ['字形方正', '楷书字形宜方，不要写得过扁或过长。'],
    tightZh: ['拉开字距', '字距大约留半个字，不要挤在一起。'],
    looseZh: ['字距收拢', '字距收一点，空档不要超过一个字。'],
    gapZh: ['字距写匀', '字与字之间留同样宽的空。'],
    wordEn: ['词距写匀', '单词之间空开，大约一个字母那么宽。'],
    tightEn: ['字母分开', '字母之间留一条细缝，不要连在一起。'],
    slantMean: ['竖画写正', '竖画垂直向下，字不要往一边倒。'],
    slantMeanZh: ['横平竖直', '竖画垂直，横画平正，字不要一边倒。'],
    slantVar: ['斜度统一', '整页保持同一个倾斜角度。'],
    slantVarZh: ['斜度不齐', '楷书横平竖直，不要有的正有的斜。'],
    inkFaint: ['笔迹写深', '笔落稳再写，颜色要看得清。'],
    inkFaintZh: ['用笔扎实', '笔落到纸上再走，笔画要清楚。'],
    inkUneven: ['用力写匀', '同一页用同样的力气，不要有的重有的轻。'],
    inkUnevenZh: ['提按写匀', '同一页力气一致，不要忽轻忽重。'],
    blob: ['少涂黑', '写错轻轻改，不要涂成一块。'],
    blobZh: ['笔画干净', '写错轻轻改，不要涂成一块。'],
    margin: ['左边对齐', '每行从同一条竖线起笔。'],
    marginZh: ['行款整齐', '每行从同一位置起笔，行首对齐。'],
    leading: ['行距拉开', '行距大约留一个字的高度。'],
    edge: ['四周留边', '纸的四周留一条边，不要顶到纸边。'],
    edgeZh: ['四周留白', '纸边留出一指宽，不要顶边。'],
    overflow: ['写进行内', '字写在两行中间，不要压到下一行。'],
    overflowZh: ['字不越格', '字收在本行里，不要压到下一行。'],
    centerCore: ['中宫居中', '笔画往字的中心收，重心落在格子正中。'],
    cellFill: ['占格合宜', '字写在格子正中，上下左右留白均匀。']
  };

  /* 中文硬笔楷书评价量表。依据：教育部教育考试院《书画等级考试（硬笔书法）考试大纲》
   * 初级（1—3 级）书写卷按「笔画 / 结构 / 章法」= 30 / 50 / 20 计分；《义务教育
   * 语文课程标准（2022 年版）》第二、三学段；《中小学书法教育指导纲要》。
   * 只收录像素可观测的条款，不能离线测量的条款单列在 unmeasurable，不做猜测。 */
  var RUBRIC = {
    id: 'hardpen-kaishu-rubric-v1',
    version: '1.0',
    name: '硬笔楷书书写评价量表',
    stage: '小学中高年级正楷 · 参照 CCPT 硬笔书法初级（1—3 级）书写卷',
    sources: [
      {
        title: '教育部教育考试院《书画等级考试（硬笔书法）考试大纲》',
        point: '初级书写卷按笔画 30% / 结构 50% / 章法 20% 计分；要求笔画形态基本正确、结构平正匀称比例适当重心稳定、通篇字大小匀称且字在格内基本居中、书写整洁无涂改乱画。',
        url: 'https://cjcx.neea.edu.cn/res/Home/2312/0e969438bbbe0b2163371a87c2fbcf01.pdf'
      },
      {
        title: '《义务教育语文课程标准（2022 年版）》',
        point: '第二学段「能用硬笔熟练地书写正楷字，做到规范、端正、整洁」；第三学段「硬笔书写楷书，行款整齐，力求美观」。',
        url: ''
      },
      {
        title: '《中小学书法教育指导纲要》（教基二〔2013〕1 号）',
        point: '基本笔画与笔顺规则、间架结构（左窄右宽、左短右长、包围结构等）、从单字到行款布局的训练序列。',
        url: ''
      }
    ],
    dimensions: [
      { key: 'stroke', label: '笔画', full: '笔法·笔画', weight: 30, criterion: '笔画形态基本正确，线条清晰匀净，横平竖直，无涂改乱画。' },
      { key: 'structure', label: '结构', full: '结构·结体', weight: 50, criterion: '结构平正匀称、比例适当、重心平稳，通篇大小匀称，字在格内基本居中。' },
      { key: 'layout', label: '章法', full: '章法·卷面', weight: 20, criterion: '字距行距合宜、行款整齐、四周留白，通篇协调统一。' }
    ],
    grades: [
      { min: 90, label: '优秀', note: '合于法度，可作本行范字' },
      { min: 80, label: '良好', note: '基本达标，个别条款需打磨' },
      { min: 65, label: '合格', note: '达到「规范、端正、整洁」，仍需练习' },
      { min: 0, label: '待改进', note: '有明显失度之处，先按顺序逐条改' }
    ],
    items: [
      {
        code: 'B1', dim: 'stroke', name: '线条清晰', weight: 8,
        criterion: '笔画落纸实在、颜色清楚，无虚浮断笔。',
        advice: '落笔先轻按、再匀速行笔，笔尖贴着纸走完整个笔画，不要「飘」着划过去；对照范字把每一笔写完整。',
        train: '同一行慢写 5 遍长横，比较首尾粗细是否一致。'
      },
      {
        code: 'B2', dim: 'stroke', name: '用力匀净', weight: 6,
        criterion: '同一页提按力度一致，不忽轻忽重。',
        advice: '整页保持同一种握笔力度；硬笔的粗细变化靠轻按与匀速，不靠反复描画。',
        train: '写一行「十」字，检查每字的墨色深浅是否接近。'
      },
      {
        code: 'B3', dim: 'stroke', name: '横平竖直', weight: 10,
        criterion: '竖画垂直、横画平正（楷书横画可统一向右上取势约 5°），全页斜度一致。',
        advice: '写竖时笔杆摆正、行笔匀速向下；横画整页保持同一个取势角度，不要有的平有的斜。',
        train: '在横线格上写一排「十」，让每个竖画都垂直穿过横的中点。'
      },
      {
        code: 'B4', dim: 'stroke', name: '笔画洁净', weight: 6,
        criterion: '笔画交代清楚，不涂成墨块。',
        advice: '考级要求「书写整洁、无涂改、不乱画」；写错用一条细横线轻轻划去，不要来回涂抹。',
        train: '练「一次写成」，落笔前先看清范字再下笔。'
      },
      {
        code: 'S1', dim: 'structure', name: '重心平稳', weight: 14,
        criterion: '字心落在同一条水平线上，行气贯通，不上下跳动。',
        advice: '先在本行定一条看不见的中线，每个字的中宫压在线上再落笔；写完眯眼看整行是否成一条线。',
        train: '用带中线的田字格抄一行，专门检查字心是否贴线。'
      },
      {
        code: 'S2', dim: 'structure', name: '大小匀称', weight: 12,
        criterion: '通篇字大小基本匀称、协调，个别字不突然放大或缩小。',
        advice: '起笔前先定字高，一行内按同一字高写；大小变化靠笔画伸展，不靠把整字写大。',
        train: '在方格纸写 10 个不同字，量外框是否都接近同一高度。'
      },
      {
        code: 'S3', dim: 'structure', name: '字形方正', weight: 10,
        criterion: '楷书字形宜方，长宽比例适当，不过扁或过长。',
        advice: '扁字把竖画伸展、横画收紧；长字把横画放开、竖画收住，长宽比回到接近 1:1。',
        train: '用米字格对照范字，看字的四角是否撑得住方格。'
      },
      {
        code: 'S4', dim: 'structure', name: '中宫居中', weight: 8,
        criterion: '笔画向中心聚拢，墨迹重心落在字的几何中心附近，不偏向一角。',
        advice: '楷书讲「中宫收紧、四维开张」：内部笔画收拢，主笔向四周舒展，别把笔画堆在一侧。',
        train: '写完在字上画十字，看四象限的笔画量是否大致均衡。'
      },
      {
        code: 'S5', dim: 'structure', name: '占格合宜', weight: 6,
        criterion: '字在本行（格）里基本居中，字高约占格的三分之二，四边留白均匀。',
        advice: '不要顶格也不要缩在角落：上下左右都留一点空白，字写在格子正中。',
        train: '在田字格写「永」字，检查是否压横中线、竖中线。'
      },
      {
        code: 'L1', dim: 'layout', name: '字距匀称', weight: 7,
        criterion: '字与字之间留同样宽的空，约半个字，不挤不散。',
        advice: '行内保持一个固定的空档；写快时容易越写越挤，写到行末回头看一遍间距。',
        train: '抄一行后量相邻字的空档，是否都接近半个字宽。'
      },
      {
        code: 'L2', dim: 'layout', name: '行距合宜', weight: 5,
        criterion: '行距约一个字高，行与行不粘连。',
        advice: '下一行起笔前留出约一个字的高度，别让上一行的竖钩、捺脚压到下一行。',
        train: '用横线格书写，让每行都落在同一条基线之上。'
      },
      {
        code: 'L3', dim: 'layout', name: '行款整齐', weight: 5,
        criterion: '每行从同一位置起笔，行首对齐。',
        advice: '每行第一个字对齐同一条竖线；段落首行缩进要统一，不要忽左忽右。',
        train: '在纸左侧画一条淡竖线，行首都贴着它起笔。'
      },
      {
        code: 'L4', dim: 'layout', name: '卷面整洁', weight: 3,
        criterion: '四周留白，字不越行、不顶到纸边，无乱画。',
        advice: '纸的四周留出一指宽；字收在本行内，长笔画不要拖到下一行。',
        train: '写完检查四条纸边和行间有没有出格的笔画。'
      }
    ],
    unmeasurable: [
      { name: '字形是否正确、有无错字漏字', reason: '本工具不识别写的是哪个汉字，也不与范字比对。' },
      { name: '笔顺规则与起笔、行笔、收笔动作', reason: '静态照片不含运笔顺序与提按节奏。' },
      { name: '部件搭配、避让穿插、主次分明', reason: '需要先认出字与偏旁，再判断左窄右宽、包围结构等结体关系。' },
      { name: '笔画形态（撇捺出锋、折角、钩的力度）', reason: '像素轮廓无法可靠区分笔画类型与书写动作。' },
      { name: '坐姿、执笔姿势与书写速度', reason: '不在照片可见范围内。' }
    ],
    advanced: '横画统一向右上取势约 5°，撇捺适度舒展，中宫收紧、四周留白均匀；抄写时先定字高再落笔。',
    note: '本量表只按照片里可测量的几何与墨色特征评分，用于定位练字重点，不等同于考级成绩；不识别具体汉字，因此字形正误、笔顺、起收笔、部件比例等须由教师或可读字的视觉模型复核。'
  };

  var DIM_LABEL = {
    baseline: '行齐',
    size: '大小',
    spacing: '间距',
    slant: '斜正',
    ink: '浓淡',
    neat: '整洁',
    stroke: '笔画',
    structure: '结构',
    layout: '章法'
  };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function limit(n) {
    if (!isFinite(n)) return 100;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0, i;
    for (i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    if (s.length % 2) return s[m];
    return (s[m - 1] + s[m]) / 2;
  }

  function stdev(arr) {
    if (!arr.length) return 0;
    var m = mean(arr), v = 0, i;
    for (i = 0; i < arr.length; i++) v += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(v / arr.length);
  }

  function luma(r, g, b) {
    return (r * 3 + g * 6 + b) / 10;
  }

  function isRed(r, g, b) {
    if (r < 90 || g > 175 || b > 175) return false;
    if (r < g + 18 || r < b + 18) return false;
    return r > Math.max(g, b) * 1.35 || r - Math.max(g, b) > 28;
  }

  function rotatePixels(image, quarter) {
    var q = ((quarter % 4) + 4) % 4;
    if (!q) return image;
    var w = image.width, h = image.height, src = image.data;
    var nw = q % 2 ? h : w;
    var nh = q % 2 ? w : h;
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

  function darkAt(image, x, y) {
    var i = (y * image.width + x) * 4;
    var r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    if (isRed(r, g, b)) return false;
    return luma(r, g, b) < 170;
  }

  function contentBox(image) {
    var w = image.width, h = image.height;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    var step = Math.max(1, Math.floor(Math.max(w, h) / 360));
    var y, x;
    for (y = 0; y < h; y += step) {
      for (x = 0; x < w; x += step) {
        if (!darkAt(image, x, y)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
  }

  /* 横排文字的行投影更起伏，而且左边比右边齐。倒过来之后左边会变花。 */
  function readingScore(image) {
    var box = contentBox(image);
    if (!box) return 0;
    var bw = box.x1 - box.x0;
    var bh = box.y1 - box.y0;
    if (bw < 12 || bh < 12) return 0;
    var step = Math.max(1, Math.floor(Math.max(bw, bh) / 280));
    var rowCount = Math.ceil(bh / step);
    var rows = new Float64Array(rowCount);
    var y, x, ri, n = 0;
    for (y = box.y0, ri = 0; y < box.y1; y += step, ri++) {
      for (x = box.x0; x < box.x1; x += step) {
        if (!darkAt(image, x, y)) continue;
        rows[ri]++;
        n++;
      }
    }
    if (n < 20 || !rowCount) return 0;
    var rm = mean(rows);
    var rowPeak = rm > 0 ? stdev(rows) / rm : 0;
    var thresh = Math.max(1, rm * 0.4);
    var lefts = [], rights = [];
    var run = -1;
    for (ri = 0; ri <= rowCount; ri++) {
      if (ri < rowCount && rows[ri] >= thresh) {
        if (run < 0) run = ri;
      } else if (run >= 0) {
        var yA = box.y0 + run * step;
        var yB = box.y0 + ri * step;
        if (yB - yA >= step * 2) {
          var left = box.x1, right = box.x0;
          for (y = yA; y < yB; y += step) {
            for (x = box.x0; x < box.x1; x += step) {
              if (!darkAt(image, x, y)) continue;
              if (x < left) left = x;
              if (x > right) right = x;
            }
          }
          if (right > left) { lefts.push(left); rights.push(right); }
        }
        run = -1;
      }
    }
    var margin = 0;
    if (lefts.length >= 3) margin = (stdev(rights) - stdev(lefts)) / bw;
    return rowPeak + margin * 3;
  }

  function cropPaper(image) {
    var w = image.width, h = image.height, data = image.data;
    var full = { image: image, x: 0, y: 0, fullW: w, fullH: h, cropped: false };
    var step = 3;
    var gw = Math.ceil(w / step), gh = Math.ceil(h / step);
    var paper = new Uint8Array(gw * gh);
    var gy, gx, x, y, i, r, g, b, count = 0;
    for (gy = 0; gy < gh; gy++) {
      for (gx = 0; gx < gw; gx++) {
        x = Math.min(w - 1, gx * step);
        y = Math.min(h - 1, gy * step);
        i = (y * w + x) * 4;
        r = data[i];
        g = data[i + 1];
        b = data[i + 2];
        if (luma(r, g, b) < 176) continue;
        if (Math.abs(r - g) > 28 || Math.abs(r - b) > 28) continue;
        paper[gy * gw + gx] = 1;
        count++;
      }
    }
    if (count < gw * gh * 0.12) return full;
    var seen = new Uint8Array(gw * gh);
    var stack = [];
    var bestN = 0, best = null;
    for (gy = 0; gy < gh; gy++) {
      for (gx = 0; gx < gw; gx++) {
        var start = gy * gw + gx;
        if (!paper[start] || seen[start]) continue;
        stack.length = 0;
        stack.push(start);
        seen[start] = 1;
        var n = 0, minX = gx, maxX = gx, minY = gy, maxY = gy;
        while (stack.length) {
          var cur = stack.pop();
          var cy = (cur / gw) | 0;
          var cx = cur - cy * gw;
          n++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          var oy, ox, nx, ny, ni;
          for (oy = -1; oy <= 1; oy++) {
            for (ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue;
              nx = cx + ox;
              ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              ni = ny * gw + nx;
              if (!paper[ni] || seen[ni]) continue;
              seen[ni] = 1;
              stack.push(ni);
            }
          }
        }
        if (n > bestN) {
          bestN = n;
          best = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
        }
      }
    }
    if (!best || bestN < count * 0.4) return full;
    var x0 = best.minX * step;
    var y0 = best.minY * step;
    var x1 = Math.min(w - 1, (best.maxX + 1) * step);
    var y1 = Math.min(h - 1, (best.maxY + 1) * step);
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < w * 0.28 || bh < h * 0.28) return full;
    if (bw > w * 0.97 && bh > h * 0.97) return full;
    var nw = bw, nh = bh;
    var out = new Uint8ClampedArray(nw * nh * 4);
    for (y = 0; y < nh; y++) {
      out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + nw) * 4), y * nw * 4);
    }
    return { image: { width: nw, height: nh, data: out }, x: x0, y: y0, fullW: w, fullH: h, cropped: true };
  }

  function suggestQuarter(image) {
    if (!image || !image.width || !image.height || image.width * image.height < 4000) return 0;
    var scores = [];
    var current = cropPaper(image).image;
    var q, best = 0;
    for (q = 0; q < 4; q++) {
      scores[q] = readingScore(current);
      if (q < 3) current = rotatePixels(current, 1);
    }
    for (q = 1; q < 4; q++) if (scores[q] > scores[best]) best = q;
    if (!best) return 0;
    if (scores[best] < scores[0] * 1.15 + 0.05) return 0;
    return best;
  }

  function downsample(image, maxEdge) {
    var w = image.width, h = image.height;
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    if (scale > 0.98) return image;
    var nw = Math.max(1, Math.round(w * scale));
    var nh = Math.max(1, Math.round(h * scale));
    var data = new Uint8ClampedArray(nw * nh * 4);
    var src = image.data;
    var x, y, sx0, sx1, sy0, sy1, xx, yy, si, lum, best, bi;
    for (y = 0; y < nh; y++) {
      sy0 = Math.floor(y * h / nh);
      sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * h / nh));
      for (x = 0; x < nw; x++) {
        sx0 = Math.floor(x * w / nw);
        sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * w / nw));
        best = 999;
        bi = (sy0 * w + sx0) * 4;
        for (yy = sy0; yy < sy1; yy++) {
          for (xx = sx0; xx < sx1; xx++) {
            si = (yy * w + xx) * 4;
            lum = luma(src[si], src[si + 1], src[si + 2]);
            if (lum < best) { best = lum; bi = si; }
          }
        }
        si = (y * nw + x) * 4;
        data[si] = src[bi];
        data[si + 1] = src[bi + 1];
        data[si + 2] = src[bi + 2];
        data[si + 3] = 255;
      }
    }
    return { width: nw, height: nh, data: data };
  }

  function buildMask(image) {
    var w = image.width, h = image.height, data = image.data;
    var tile = 36;
    var nx = Math.ceil(w / tile), ny = Math.ceil(h / tile);
    var bins = new Uint32Array(nx * ny * 256);
    var counts = new Uint32Array(nx * ny);
    var y, x, i, lum, tx, ty, slot;
    for (y = 0; y < h; y++) {
      ty = Math.floor(y / tile);
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        lum = luma(data[i], data[i + 1], data[i + 2]);
        slot = (ty * nx + Math.floor(x / tile)) * 256 + Math.max(0, Math.min(255, lum | 0));
        bins[slot]++;
        counts[ty * nx + Math.floor(x / tile)]++;
      }
    }
    var bg = new Uint16Array(nx * ny);
    var t, seen, need, b;
    for (t = 0; t < nx * ny; t++) {
      need = Math.max(1, Math.floor(counts[t] * 0.9));
      seen = 0;
      bg[t] = 248;
      for (b = 0; b < 256; b++) {
        seen += bins[t * 256 + b];
        if (seen >= need) { bg[t] = b; break; }
      }
    }
    var mask = new Uint8Array(w * h);
    var ink = 0, r, g, bl, paper;
    for (y = 0; y < h; y++) {
      ty = Math.floor(y / tile);
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        r = data[i];
        g = data[i + 1];
        bl = data[i + 2];
        if (isRed(r, g, bl)) continue;
        lum = luma(r, g, bl);
        paper = bg[ty * nx + Math.floor(x / tile)];
        if (lum + 34 < paper && lum < paper - 26 && lum < 205) {
          mask[y * w + x] = 1;
          ink++;
        }
      }
    }
    return { mask: mask, ink: ink };
  }

  function components(image, mask) {
    var w = image.width, h = image.height, data = image.data;
    var seen = new Uint8Array(w * h);
    var list = [];
    var stack = [];
    var y, x, start;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        start = y * w + x;
        if (!mask[start] || seen[start]) continue;
        stack.length = 0;
        stack.push(start);
        seen[start] = 1;
        var area = 0, minX = x, maxX = x, minY = y, maxY = y, sumL = 0, sumX = 0, sumY = 0;
        while (stack.length) {
          var cur = stack.pop();
          var cy = (cur / w) | 0;
          var cx = cur - cy * w;
          area++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          var pi = cur * 4;
          sumL += luma(data[pi], data[pi + 1], data[pi + 2]);
          sumX += cx;
          sumY += cy;
          var oy, ox, nx, ny, ni;
          for (oy = -1; oy <= 1; oy++) {
            for (ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue;
              nx = cx + ox;
              ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              ni = ny * w + nx;
              if (!mask[ni] || seen[ni]) continue;
              seen[ni] = 1;
              stack.push(ni);
            }
          }
        }
        list.push({
          x: minX,
          y: minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
          area: area,
          lum: sumL / area,
          cx: sumX / area,
          cy: sumY / area
        });
      }
    }
    return list;
  }

  function measureSlant(image, mask, g) {
    var w = image.width;
    var yCut = g.y + g.h * 0.32;
    var yBot = g.y + g.h * 0.68;
    var topX = 0, topN = 0, botX = 0, botN = 0;
    var y, x, i;
    for (y = g.y; y < g.y + g.h; y++) {
      i = y * w + g.x;
      for (x = g.x; x < g.x + g.w; x++, i++) {
        if (!mask[i]) continue;
        if (y < yCut) { topX += x; topN++; }
        else if (y >= yBot) { botX += x; botN++; }
      }
    }
    if (topN < 4 || botN < 4) return null;
    return (topX / topN - botX / botN) / g.h;
  }

  function isRuling(g, w, h) {
    var shortSide = Math.min(g.w, g.h);
    var longSide = Math.max(g.w, g.h);
    if (longSide >= shortSide * 4.2) return true;
    if (g.w >= w * 0.42 || g.h >= h * 0.22) return true;
    if (shortSide <= 4 && longSide >= 36) return true;
    if (longSide >= 48 && g.area / Math.max(1, g.w * g.h) < 0.12) return true;
    return false;
  }

  function keepGlyphs(image, mask, raw) {
    var w = image.width, h = image.height;
    var minArea = Math.max(12, Math.round(w * h * 0.00004));
    var kept = [];
    var i, g;
    for (i = 0; i < raw.length; i++) {
      g = raw[i];
      if (g.area < minArea) continue;
      if (g.w * g.h > w * h * 0.18) continue;
      if (isRuling(g, w, h)) continue;
      g.slant = measureSlant(image, mask, g);
      g.bottom = g.y + g.h;
      kept.push(g);
    }
    if (kept.length < 4) return kept;
    var medH = median(kept.map(function (it) { return it.h; })) || 1;
    return kept.filter(function (it) {
      if (it.h > medH * 2.4 || it.w > medH * 3.2) return false;
      if (it.h < medH * 0.2 && it.w < medH * 0.2) return false;
      return true;
    });
  }

  function spansOf(counts, minCount, minLen) {
    var spans = [];
    var on = false, start = 0, i;
    for (i = 0; i <= counts.length; i++) {
      var hit = i < counts.length && counts[i] >= minCount;
      if (hit && !on) { on = true; start = i; }
      if (!hit && on) {
        if (i - start >= minLen) spans.push({ a: start, b: i });
        on = false;
      }
    }
    return spans;
  }

  function joinSpans(spans, gapLimit, sizeLimit) {
    var out = [];
    var i, prev, gap, size;
    for (i = 0; i < spans.length; i++) {
      prev = out[out.length - 1];
      gap = prev ? spans[i].a - prev.b : 99;
      size = prev ? spans[i].b - prev.a : 0;
      if (prev && gap <= gapLimit && size <= sizeLimit) prev.b = spans[i].b;
      else out.push({ a: spans[i].a, b: spans[i].b });
    }
    return out;
  }

  function glyphFromInk(image, mask, x0, y0, x1, y1) {
    var w = image.width, data = image.data;
    var area = 0, sumL = 0, sumX = 0, sumY = 0;
    var minX = x1, minY = y1, maxX = x0 - 1, maxY = y0 - 1;
    var y, x, i, p;
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        i = y * w + x;
        if (!mask[i]) continue;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        p = i * 4;
        sumL += luma(data[p], data[p + 1], data[p + 2]);
        sumX += x;
        sumY += y;
      }
    }
    if (area < 8 || maxX < minX) return null;
    return {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      area: area,
      lum: sumL / area,
      cx: sumX / area,
      cy: sumY / area
    };
  }

  function charactersFromMask(image, mask) {
    var w = image.width, h = image.height;
    var rows = new Uint16Array(h);
    var y, x;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) if (mask[y * w + x]) rows[y]++;
    }
    var vals = [];
    for (y = 0; y < h; y++) if (rows[y] > 2) vals.push(rows[y]);
    vals.sort(function (a, b) { return a - b; });
    var mid = vals.length ? vals[Math.floor(vals.length * 0.5)] : 4;
    var hi = vals.length ? vals[Math.floor(vals.length * 0.85)] : mid;
    var cut = hi > mid * 1.7 ? Math.max(6, Math.round(mid * 1.45)) : Math.max(4, Math.round(mid * 0.45));
    var bands = spansOf(rows, cut, 2);
    if (!bands.length) return [];
    var gaps = [];
    var bi;
    for (bi = 1; bi < bands.length; bi++) gaps.push(bands[bi].a - bands[bi - 1].b);
    var medGap = median(gaps) || 2;
    var largeGaps = gaps.filter(function (g) { return g > medGap; });
    var pitch = largeGaps.length ? median(largeGaps) : medGap * 3;
    var gapLimit = !largeGaps.length ? Math.max(1, medGap * 0.45) : Math.max(2, Math.min(medGap, pitch * 0.42));
    var heights = bands.map(function (b) { return b.b - b.a; });
    var medBand = median(heights) || 8;
    bands = joinSpans(bands, gapLimit, Math.max(medBand * 2.4, pitch * 0.92));
    var glyphs = [];
    bands.forEach(function (band) {
      var rowH = band.b - band.a;
      if (rowH < 6 || rowH > h * 0.28) return;
      var cols = new Uint16Array(w);
      for (y = band.a; y < band.b; y++) {
        for (x = 0; x < w; x++) if (mask[y * w + x]) cols[x]++;
      }
      var cells = spansOf(cols, 2, 3);
      if (!cells.length) return;
      var widths = cells.map(function (c) { return c.b - c.a; });
      var narrow = median(widths) < rowH * 0.62;
      var gapLimit = narrow ? Math.max(2, Math.floor(rowH * 0.16)) : 2;
      cells = joinSpans(cells, gapLimit, narrow ? rowH * 1.25 : rowH * 1.05);
      cells.forEach(function (cell) {
        if (cell.b - cell.a > rowH * 2.4) return;
        var g = glyphFromInk(image, mask, cell.a, band.a, cell.b, band.b);
        if (g) glyphs.push(g);
      });
    });
    return glyphs;
  }

  function groupLines(glyphs) {
    if (!glyphs.length) return [];
    var medH = median(glyphs.map(function (g) { return g.h; })) || 1;
    var sorted = glyphs.slice().sort(function (a, b) { return a.cy - b.cy || a.x - b.x; });
    var lines = [];
    var i, g, last, heights;
    for (i = 0; i < sorted.length; i++) {
      g = sorted[i];
      last = lines[lines.length - 1];
      if (!last || Math.abs(g.cy - last.cy) > medH * 0.62) {
        lines.push({ glyphs: [g], cy: g.cy });
      } else {
        last.glyphs.push(g);
        heights = last.glyphs.map(function (it) { return it.cy; });
        last.cy = median(heights);
      }
    }
    lines.forEach(function (ln) {
      ln.glyphs.sort(function (a, b) { return a.x - b.x; });
      var y0 = Infinity, y1 = 0, x0 = Infinity, x1 = 0;
      ln.glyphs.forEach(function (it) {
        if (it.y < y0) y0 = it.y;
        if (it.bottom > y1) y1 = it.bottom;
        if (it.x < x0) x0 = it.x;
        if (it.x + it.w > x1) x1 = it.x + it.w;
      });
      ln.y0 = y0;
      ln.y1 = y1;
      ln.x0 = x0;
      ln.x1 = x1;
      ln.h = Math.max(1, y1 - y0);
    });
    return lines.sort(function (a, b) { return a.cy - b.cy; });
  }

  function gapsOf(glyphs) {
    var gaps = [], i;
    for (i = 1; i < glyphs.length; i++) gaps.push(glyphs[i].x - (glyphs[i - 1].x + glyphs[i - 1].w));
    return gaps;
  }

  function markPunctuation(lines) {
    lines.forEach(function (ln) {
      if (!ln.glyphs || ln.glyphs.length < 4) return;
      var sizes = ln.glyphs.map(function (g) { return Math.max(g.w, g.h); }).sort(function (a, b) { return a - b; });
      var em = sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.7))] || 1;
      ln.glyphs.forEach(function (g) {
        var longSide = Math.max(g.w, g.h);
        var shortSide = Math.min(g.w, g.h);
        g.punct = longSide < em * 0.58 && shortSide < em * 0.5 && g.area < em * em * 0.2;
      });
    });
  }

  function charGaps(glyphs) {
    var gaps = [];
    var pairs = [];
    var i;
    for (i = 1; i < glyphs.length; i++) {
      if (glyphs[i].punct || glyphs[i - 1].punct) continue;
      gaps.push(glyphs[i].x - (glyphs[i - 1].x + glyphs[i - 1].w));
      pairs.push([glyphs[i - 1], glyphs[i]]);
    }
    return { gaps: gaps, pairs: pairs };
  }

  function omitPunctSlots(packed, em) {
    var gaps = packed.gaps;
    var pairs = packed.pairs;
    if (!gaps || gaps.length < 4) return packed;
    var sorted = gaps.slice().sort(function (a, b) { return a - b; });
    var typical = sorted[Math.floor(sorted.length * 0.35)];
    var limit = typical + Math.max(8, em * 0.7);
    var keptG = [];
    var keptP = [];
    var i;
    for (i = 0; i < gaps.length; i++) {
      if (gaps[i] > limit) continue;
      keptG.push(gaps[i]);
      keptP.push(pairs[i]);
    }
    if (keptG.length < 3) return packed;
    return { gaps: keptG, pairs: keptP };
  }

  function splitGaps(gaps) {
    var positive = gaps.filter(function (g) { return g >= 0; });
    if (positive.length < 4) return { letter: positive, word: [] };
    var sorted = positive.slice().sort(function (a, b) { return a - b; });
    var head = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.6)));
    var cut = median(head) * 1.85 + 3;
    var word = positive.filter(function (g) { return g > cut; });
    var letter = positive.filter(function (g) { return g <= cut; });
    if (word.length < 2 || letter.length < 2) return { letter: positive, word: [] };
    return { letter: letter, word: word };
  }

  function classifyLine(line) {
    var gs = line.glyphs.filter(function (g) { return !g.punct; });
    if (gs.length < 4) return 'unknown';
    var narrow = 0, square = 0, i, aspect;
    for (i = 0; i < gs.length; i++) {
      aspect = gs[i].w / Math.max(1, gs[i].h);
      if (aspect < 0.58) narrow++;
      if (aspect >= 0.72 && aspect <= 1.45) square++;
    }
    var split = splitGaps(gapsOf(gs));
    var wordy = split.word.length >= 2 && split.letter.length >= split.word.length;
    if (square / gs.length >= 0.5 && narrow / gs.length < 0.35) return 'zh';
    if (wordy && narrow / gs.length >= 0.4) return 'en';
    if (narrow / gs.length >= 0.6) return 'en';
    if (square / gs.length >= 0.45) return 'zh';
    return 'unknown';
  }

  function detectScript(lines) {
    var zh = 0, en = 0, i, kind;
    for (i = 0; i < lines.length; i++) {
      kind = classifyLine(lines[i]);
      lines[i].kind = kind;
      if (kind === 'zh') zh++;
      else if (kind === 'en') en++;
    }
    var script;
    if (zh && en && Math.min(zh, en) / Math.max(zh, en) >= 0.5) script = 'mixed';
    else if (en > zh) script = 'en';
    else if (zh > 0) script = 'zh';
    else {
      var aspects = [];
      lines.forEach(function (ln) {
        ln.glyphs.forEach(function (g) {
        if (g.punct) return;
        aspects.push(g.w / Math.max(1, g.h));
      });
      });
      script = median(aspects) < 0.62 ? 'en' : 'zh';
    }
    return script;
  }

  function boxOf(g, pad, W, H) {
    var x = Math.max(0, g.x - pad);
    var y = Math.max(0, g.y - pad);
    var x2 = Math.min(W, g.x + g.w + pad);
    var y2 = Math.min(H, g.y + g.h + pad);
    return { x: x / W, y: y / H, w: Math.max(0.01, (x2 - x) / W), h: Math.max(0.01, (y2 - y) / H), place: 'char' };
  }

  function markOf(glyphs, W, H) {
    if (!glyphs || !glyphs.length) return null;
    var box = glyphs.length === 1 ? boxOf(glyphs[0], 1, W, H) : boxUnion(glyphs, 1, W, H);
    if (glyphs.length === 1) {
      box.place = 'char';
      return box;
    }
    var xs = glyphs.map(function (g) { return g.cx; });
    var ys = glyphs.map(function (g) { return g.cy; });
    box.place = stdev(xs) < stdev(ys) ? 'col' : 'line';
    return box;
  }

  function boxUnion(gs, pad, W, H) {
    var x = Infinity, y = Infinity, x2 = 0, y2 = 0, i;
    for (i = 0; i < gs.length; i++) {
      if (gs[i].x < x) x = gs[i].x;
      if (gs[i].y < y) y = gs[i].y;
      if (gs[i].x + gs[i].w > x2) x2 = gs[i].x + gs[i].w;
      if (gs[i].y + gs[i].h > y2) y2 = gs[i].y + gs[i].h;
    }
    x = Math.max(0, x - pad);
    y = Math.max(0, y - pad);
    x2 = Math.min(W, x2 + pad);
    y2 = Math.min(H, y2 + pad);
    return { x: x / W, y: y / H, w: Math.max(0.02, (x2 - x) / W), h: Math.max(0.015, (y2 - y) / H) };
  }

  function bodyGlyphs(glyphs, english) {
    if (!english) return glyphs.filter(function (g) { return g.h >= median(glyphs.map(function (it) { return it.h; })) * 0.55; });
    var hs = glyphs.map(function (g) { return g.h; }).sort(function (a, b) { return a - b; });
    var cut = hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.6))];
    var body = glyphs.filter(function (g) { return g.h <= cut * 1.12 && g.h >= cut * 0.62; });
    return body.length >= 4 ? body : glyphs;
  }

  function worse(best, score, key, mark) {
    if (!best || score < best.score) return { score: score, key: key, mark: mark };
    return best;
  }

  function scoreBaseline(lines, W, H) {
    var scores = [];
    var best = null;
    lines.forEach(function (ln) {
      var pool = ln.glyphs.filter(function (g) { return !g.punct; });
      if (pool.length < 4) return;
      var english = ln.kind === 'en';
      var body = bodyGlyphs(pool, english);
      if (body.length < 4) body = pool;
      var em = median(body.map(function (g) { return g.h; })) || 1;
      var anchor = english
        ? function (g) { return g.bottom; }
        : function (g) { return g.cy; };
      var base = median(body.map(anchor));
      var devs = body.map(function (g) { return Math.abs(anchor(g) - base) / em; });
      var avg = mean(devs);
      var scatter = limit(100 - Math.max(0, avg - 0.06) * 420);
      var n = body.length, sumX = 0, sumY = 0, sumXX = 0, sumXY = 0, i, g;
      for (i = 0; i < n; i++) {
        g = body[i];
        sumX += g.cx;
        sumY += anchor(g);
        sumXX += g.cx * g.cx;
        sumXY += g.cx * g.bottom;
      }
      var den = n * sumXX - sumX * sumX;
      var slope = Math.abs(den) < 1 ? 0 : (n * sumXY - sumX * sumY) / den;
      var rise = slope * (body[n - 1].cx - body[0].cx);
      var residual = 0;
      for (i = 0; i < n; i++) residual += Math.abs(anchor(body[i]) - (base + slope * (body[i].cx - mean(body.map(function (it) { return it.cx; })))));
      residual /= n * em;
      var tilt = Math.abs(rise) / em;
      var tiltScore = limit(100 - Math.max(0, tilt - 0.28) * 160);
      var useTilt = tiltScore < scatter && residual < 0.1;
      var score = useTilt ? tiltScore : scatter;
      var mark = null;
      var key = english ? 'baseline' : 'centerZh';
      if (useTilt) {
        if (english) key = rise > 0 ? 'tiltDown' : 'tiltUp';
        else key = rise > 0 ? 'tiltDownZh' : 'tiltUpZh';
        mark = markOf(body, W, H);
        if (mark) mark.place = 'line';
      } else {
        var farBottom = body.slice().sort(function (a, b) {
          return Math.abs(anchor(b) - base) - Math.abs(anchor(a) - base);
        })[0];
        mark = markOf([farBottom], W, H);
      }
      scores.push(score);
      best = worse(best, score, key, mark);
    });
    if (!scores.length) return { score: 100, key: 'baseline', mark: null };
    var mixed = Math.min(mean(scores), best.score + 8);
    return { score: limit(mixed), key: best.key, mark: best.mark };
  }

  function scoreSize(lines, W, H) {
    var groups = { zh: [], en: [] };
    lines.forEach(function (ln) {
      var key = ln.kind === 'en' ? 'en' : 'zh';
      ln.glyphs.forEach(function (g) {
        if (g.punct) return;
        groups[key].push(g);
      });
    });
    var best = null;
    var scores = [];
    ['zh', 'en'].forEach(function (kind) {
      var gs = groups[kind];
      if (gs.length < 5) return;
      var english = kind === 'en';
      var body = bodyGlyphs(gs, english);
      var hs = body.map(function (g) { return g.h; });
      var em = median(hs) || 1;
      var cv = stdev(hs) / em;
      var cvScore = limit(100 - Math.max(0, cv - 0.12) * 280);
      var smallScore = em < 8 ? 64 : 100;
      var score = Math.min(cvScore, smallScore);
      var key = smallScore < cvScore ? 'sizeSmall' : (english ? 'sizeEn' : 'sizeZh');
      var target = em;
      var far = body[0], farD = -1;
      body.forEach(function (g) {
        var d = Math.abs(g.h - target);
        if (d > farD) { farD = d; far = g; }
      });
      scores.push(score);
      best = worse(best, score, key, markOf([far], W, H));
    });
    if (!best) return { score: 100, key: 'sizeZh', mark: null };
    return { score: limit(Math.min(mean(scores), best.score + 6)), key: best.key, mark: best.mark };
  }

  function scoreShape(lines, W, H) {
    var gs = [];
    lines.forEach(function (ln) {
      if (ln.kind === 'en') return;
      ln.glyphs.forEach(function (g) {
        if (!g.punct) gs.push(g);
      });
    });
    if (gs.length < 5) return { score: 100, key: 'shapeZh', mark: null };
    var aspects = gs.map(function (g) { return g.w / Math.max(1, g.h); });
    var med = median(aspects) || 1;
    var avg = mean(aspects.map(function (a) { return Math.abs(a - 1); }));
    var cv = stdev(aspects) / Math.max(0.15, Math.abs(med));
    var score = limit(Math.min(
      100 - Math.max(0, avg - 0.22) * 180,
      100 - Math.max(0, cv - 0.35) * 120
    ));
    var far = gs[0], farD = -1;
    gs.forEach(function (g) {
      var d = Math.abs(g.w / Math.max(1, g.h) - 1);
      if (d > farD) { farD = d; far = g; }
    });
    return { score: score, key: 'shapeZh', mark: markOf([far], W, H) };
  }

  function scoreSpacing(lines, W, H) {
    var scores = [];
    var best = null;
    lines.forEach(function (ln) {
      var english = ln.kind === 'en';
      var pool = english ? ln.glyphs : ln.glyphs.filter(function (g) { return !g.punct; });
      if (pool.length < 4) return;
      var em = median(pool.map(function (g) { return g.h; })) || 1;
      var packed = english ? null : omitPunctSlots(charGaps(ln.glyphs), em);
      var gaps = english ? gapsOf(ln.glyphs) : packed.gaps;
      if (gaps.length < 3) return;
      if (!english) {
        var ratios = gaps.map(function (g) { return g / em; });
        var med = median(ratios);
        var tightN = ratios.filter(function (r) { return r < 0.1; }).length / ratios.length;
        var tightScore = limit(Math.min(
          100 - Math.max(0, tightN - 0.2) * 160,
          med < 0.12 ? 72 - (0.12 - med) * 220 : 100
        ));
        var looseScore = limit(med > 1.05 ? 100 - (med - 1.05) * 90 : 100);
        var cv = stdev(ratios) / Math.max(0.08, Math.abs(med));
        var cvScore = limit(100 - Math.max(0, cv - 0.55) * 110);
        var score = Math.min(tightScore, looseScore, cvScore);
        var key = 'gapZh';
        var mark = markOf(pool, W, H);
        if (mark) mark.place = 'line';
        function pairAt(index) {
          return packed.pairs[index] || pool;
        }
        if (tightScore <= looseScore && tightScore <= cvScore) {
          key = 'tightZh';
          var bi = 0, bgap = gaps[0];
          gaps.forEach(function (g, idx) { if (g < bgap) { bgap = g; bi = idx; } });
          mark = markOf(pairAt(bi), W, H);
        } else if (looseScore < cvScore) {
          key = 'looseZh';
          var li = 0, lg = gaps[0];
          gaps.forEach(function (g, idx) { if (g > lg) { lg = g; li = idx; } });
          mark = markOf(pairAt(li), W, H);
        } else {
          var targetGap = median(gaps);
          var gi = 0, gd = -1;
          gaps.forEach(function (g, idx) {
            var d = Math.abs(g - targetGap);
            if (d > gd) { gd = d; gi = idx; }
          });
          mark = markOf(pairAt(gi), W, H);
        }
        scores.push(score);
        best = worse(best, score, key, mark);
        return;
      }
      var split = splitGaps(gaps);
      var touch = 0, t;
      for (t = 0; t < split.letter.length; t++) if (split.letter[t] <= 0) touch++;
      var touchScore = limit(100 - (split.letter.length ? touch / split.letter.length : 0) * 140);
      var wordScore = 100;
      if (split.word.length >= 2) {
        var wcv = stdev(split.word) / Math.max(1, mean(split.word));
        wordScore = limit(100 - Math.max(0, wcv - 0.28) * 170);
      }
      var enScore = Math.min(touchScore, wordScore);
      var enKey = wordScore < touchScore ? 'wordEn' : 'tightEn';
      var enMark = markOf(ln.glyphs, W, H);
      if (enMark) enMark.place = 'line';
      if (enKey === 'tightEn') {
        var ti = 1, tg = 999;
        gaps.forEach(function (g, idx) { if (g < tg) { tg = g; ti = idx + 1; } });
        if (ln.glyphs[ti]) enMark = markOf([ln.glyphs[ti - 1], ln.glyphs[ti]], W, H);
      } else if (split.word.length >= 2) {
        var target = median(split.word);
        var worst = 0, wi = 1;
        gaps.forEach(function (g, idx) {
          if (g < (split.letter.length ? Math.max.apply(null, split.letter.concat([0])) + 0.1 : target)) return;
          var d = Math.abs(g - target);
          if (d > worst) { worst = d; wi = idx + 1; }
        });
        enMark = markOf([ln.glyphs[wi - 1], ln.glyphs[wi]], W, H);
      }
      scores.push(enScore);
      best = worse(best, enScore, enKey, enMark);
    });
    if (!best) return { score: 100, key: 'gapZh', mark: null };
    return { score: limit(Math.min(mean(scores), best.score + 6)), key: best.key, mark: best.mark };
  }

  function scoreSlant(lines) {
    var zs = [], es = [];
    lines.forEach(function (ln) {
      ln.glyphs.forEach(function (g) {
        if (g.punct || g.slant == null) return;
        (ln.kind === 'en' ? es : zs).push(g);
      });
    });
    var best = null;
    function scoreGroup(gs, english, W, H) {
      if (gs.length < 5) return;
      var angles = gs.map(function (g) { return g.slant; });
      var m = mean(angles);
      var sd = stdev(angles);
      var meanScore, stdScore;
      if (english) {
        meanScore = Math.abs(m) > 0.55 ? limit(100 - (Math.abs(m) - 0.55) * 200) : 100;
        stdScore = limit(100 - Math.max(0, sd - 0.1) * 280);
      } else {
        meanScore = limit(100 - Math.max(0, Math.abs(m) - 0.12) * 260);
        stdScore = limit(100 - Math.max(0, sd - 0.08) * 280);
      }
      var key = stdScore < meanScore
        ? (english ? 'slantVar' : 'slantVarZh')
        : (english ? 'slantMean' : 'slantMeanZh');
      var focus = m;
      if (key === 'slantVar') focus = m;
      var far = gs[0], farD = -1;
      gs.forEach(function (g) {
        var d = key === 'slantVar' ? Math.abs(g.slant - focus) : Math.abs(g.slant);
        if (d > farD) { farD = d; far = g; }
      });
      var page = gs;
      var W2 = 1, H2 = 1;
      page.forEach(function (g) {
        if (g.x + g.w > W2) W2 = g.x + g.w;
        if (g.bottom > H2) H2 = g.bottom;
      });
      best = worse(best, Math.min(meanScore, stdScore), key, { glyph: far });
    }
    scoreGroup(zs, false);
    scoreGroup(es, true);
    if (!best) return { score: 100, key: 'slantMean', mark: null, glyph: null };
    return { score: best.score, key: best.key, mark: null, glyph: best.mark.glyph };
  }

  function scoreInk(lines, W, H) {
    var gs = [];
    lines.forEach(function (ln) {
      gs = gs.concat(ln.glyphs.filter(function (g) { return !g.punct; }));
    });
    if (gs.length < 4) return { score: 100, key: 'inkFaint', mark: null };
    var english = lines.every(function (ln) { return ln.kind === 'en'; });
    var lum = mean(gs.map(function (g) { return g.lum; }));
    var faint = limit(lum <= 150 ? 100 : 100 - (lum - 150) * 1.6);
    var byLine = lines.filter(function (ln) { return ln.glyphs.length >= 3; }).map(function (ln) {
      var inked = ln.glyphs.filter(function (g) { return !g.punct; });
      return { ln: { glyphs: inked }, lum: mean(inked.map(function (g) { return g.lum; })) };
    });
    var uneven = 100;
    var faintLine = byLine[0];
    if (byLine.length >= 2) {
      var lums = byLine.map(function (it) { return it.lum; });
      var spread = Math.max.apply(null, lums) - Math.min.apply(null, lums);
      var darkest = Math.min.apply(null, lums);
      if (darkest <= 155) uneven = limit(100 - Math.max(0, spread - 28) * 1.7);
      byLine.forEach(function (it) { if (!faintLine || it.lum > faintLine.lum) faintLine = it; });
    }
    var unevenKey = english ? 'inkUneven' : 'inkUnevenZh';
    var faintKey = english ? 'inkFaint' : 'inkFaintZh';
    if (uneven < faint && faintLine) {
      var unevenMark = markOf(faintLine.ln.glyphs, W, H);
      if (unevenMark) unevenMark.place = 'line';
      return { score: uneven, key: unevenKey, mark: unevenMark };
    }
    var markLine = faintLine ? faintLine.ln : lines[0];
    var faintMark = markOf(markLine.glyphs, W, H);
    if (faintMark) faintMark.place = 'line';
    return { score: faint, key: faintKey, mark: faintMark };
  }

  function forgiveLeadingSlot(xs, em) {
    if (xs.length < 4) return xs.slice();
    var med = median(xs);
    var aligned = xs.filter(function (x) { return Math.abs(x - med) <= em * 0.4; });
    if (aligned.length < Math.max(3, xs.length - 2)) return xs.slice();
    var base = median(aligned);
    return xs.map(function (x) {
      var shift = x - base;
      if (shift > em * 0.65 && shift < em * 2.3) return base;
      return x;
    });
  }

  function scoreNeat(lines, glyphs, W, H) {
    var chinese = lines.length && lines.every(function (ln) { return ln.kind !== 'en'; });
    var items = [];
    function add(score, key, mark) {
      items.push({ score: limit(score), key: key, mark: mark || null });
    }
    var fills = glyphs.map(function (g) { return g.area / Math.max(1, g.w * g.h); });
    var medFill = median(fills);
    var medBox = median(glyphs.map(function (g) { return g.w * g.h; }));
    var blobs = glyphs.filter(function (g) {
      var fill = g.area / Math.max(1, g.w * g.h);
      return fill > 0.75 && fill > medFill + 0.28 && g.w * g.h > medBox * 1.25 && g.w >= 8 && g.h >= 8;
    });
    var blobScore = 100;
    var blobMark = null;
    if (blobs.length && medFill < 0.62) {
      blobs.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
      blobScore = limit(68 - Math.min(3, blobs.length) * 12);
      blobMark = markOf([blobs[0]], W, H);
    }
    add(blobScore, chinese ? 'blobZh' : 'blob', blobMark);
    var content = lines.filter(function (ln) { return ln.glyphs.length >= 3; });
    if (content.length >= 3) {
      var widest = Math.max.apply(null, content.map(function (ln) { return ln.x1 - ln.x0; }));
      content = content.filter(function (ln) { return ln.x1 - ln.x0 >= widest * 0.62 && ln.glyphs.length >= 4; });
      if (content.length < 3) content = lines.filter(function (ln) { return ln.glyphs.length >= 3; });
      var heads = content.map(function (ln) {
        var sized = ln.glyphs.filter(function (g) { return !g.punct; });
        var medW = median(sized.map(function (g) { return g.w; })) || 1;
        var head = sized[0];
        var i;
        for (i = 0; i < sized.length; i++) {
          if (sized[i].w >= medW * 0.45) { head = sized[i]; break; }
        }
        if (!head) return ln.glyphs[0];
        var lead = null;
        ln.glyphs.forEach(function (g) {
          if (!g.punct || g.x >= head.x) return;
          if (head.x - (g.x + g.w) > Math.max(head.w, medW) * 1.35) return;
          if (!lead || g.x < lead.x) lead = g;
        });
        if (!lead) return head;
        return { x: lead.x, y: head.y, w: head.w, h: head.h, cx: lead.x + head.w / 2, cy: head.cy };
      });
      var rawXs = heads.map(function (g) { return g.x; });
      var em = median(glyphs.map(function (g) { return g.h; })) || 1;
      var xs = forgiveLeadingSlot(rawXs, em);
      var sd = stdev(xs);
      var marginScore = limit(100 - Math.max(0, sd - em * 0.35) * (90 / em));
      var mid = median(xs);
      var offHeads = [];
      heads.forEach(function (g, i) {
        if (Math.abs(xs[i] - mid) > em * 0.45) offHeads.push(g);
      });
      if (!offHeads.length) {
        offHeads = [heads.slice().sort(function (a, b) { return Math.abs(b.x - mid) - Math.abs(a.x - mid); })[0]];
      }
      add(marginScore, chinese ? 'marginZh' : 'margin', markOf(offHeads, W, H));
    }
    if (lines.length >= 3) {
      var pitches = [];
      var pi;
      for (pi = 1; pi < lines.length; pi++) pitches.push(lines[pi].cy - lines[pi - 1].cy);
      var medH = median(glyphs.map(function (g) { return g.h; })) || 1;
      var ratio = median(pitches) / medH;
      var leadScore = limit(ratio >= 1.45 ? 100 : 100 - (1.45 - ratio) * 150);
      var tightI = 1, tightP = pitches[0];
      pitches.forEach(function (p, idx) { if (p < tightP) { tightP = p; tightI = idx + 1; } });
      var crowded = markOf(lines[tightI].glyphs, W, H);
      if (crowded) crowded.place = 'line';
      add(leadScore, 'leading', crowded);
    }
    var cut = glyphs.filter(function (g) {
      return g.x <= 1 || g.y <= 1 || g.x + g.w >= W - 1 || g.y + g.h >= H - 1;
    });
    add(cut.length >= 2 ? limit(62 - cut.length * 4) : 100, chinese ? 'edgeZh' : 'edge', cut.length ? markOf([cut[0]], W, H) : null);
    var overflowScore = 100;
    var overflowMark = null;
    var li;
    for (li = 0; li < lines.length - 1; li++) {
      if (lines[li].kind === 'en') continue;
      var next = lines[li + 1];
      var base = median(lines[li].glyphs.map(function (g) { return g.cy; }));
      var em2 = median(lines[li].glyphs.map(function (g) { return g.h; })) || 1;
      lines[li].glyphs.forEach(function (g) {
        if (g.punct || g.h > em2 * 1.45) return;
        if (g.bottom > next.y0 + 2 && g.cy - base > em2 * 0.55) {
          overflowScore = 58;
          overflowMark = markOf([g], W, H);
        }
      });
    }
    add(overflowScore, chinese ? 'overflowZh' : 'overflow', overflowMark);
    var best = items[0];
    items.forEach(function (it) { if (it.score < best.score) best = it; });
    return { score: best.score, key: best.key, mark: best.mark, items: items };
  }

  function dimension(key, found, W, H) {
    var advice = ADVICE[found.key] || ADVICE.baseline;
    var mark = null;
    if (found.score < 78 && found.mark) {
      mark = {
        x: found.mark.x,
        y: found.mark.y,
        w: found.mark.w,
        h: found.mark.h,
        text: advice[0],
        level: found.score < 62 ? 'bad' : 'warn',
        place: found.mark.place || 'char'
      };
      if (found.glyph) {
        var b = boxOf(found.glyph, 1, W, H);
        mark.x = b.x;
        mark.y = b.y;
        mark.w = b.w;
        mark.h = b.h;
        mark.place = 'char';
      }
      if (mark.x < 0.015 && mark.h > 0.4 && mark.w < 0.06) mark = null;
      if (mark && mark.y < 0.015 && mark.w > 0.75 && mark.h < 0.04) mark = null;
    }
    var show = !!mark;
    return {
      key: key,
      label: DIM_LABEL[key],
      score: limit(found.score),
      title: show ? advice[0] : '',
      detail: show ? advice[1] : '',
      mark: mark
    };
  }

  function iou(a, b) {
    var x = Math.max(a.x, b.x);
    var y = Math.max(a.y, b.y);
    var x2 = Math.min(a.x + a.w, b.x + b.w);
    var y2 = Math.min(a.y + a.h, b.y + b.h);
    var inter = Math.max(0, x2 - x) * Math.max(0, y2 - y);
    var union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
  }

  function emptyReport(message) {
    return { ok: false, message: message };
  }

  function rubricItem(code) {
    var i;
    for (i = 0; i < RUBRIC.items.length; i++) if (RUBRIC.items[i].code === code) return RUBRIC.items[i];
    return null;
  }

  function gradeOf(score) {
    var i;
    for (i = 0; i < RUBRIC.grades.length; i++) if (score >= RUBRIC.grades[i].min) return RUBRIC.grades[i];
    return RUBRIC.grades[RUBRIC.grades.length - 1];
  }

  function deviationScore(value, tolerance, scale, floor) {
    return limit(Math.max(floor == null ? 45 : floor, 100 - Math.max(0, value - tolerance) * scale));
  }

  /* 按硬笔楷书量表逐字评判。行款类条款按所在行评定，不生成逐字圈注，
   * 避免出现「这个字要改行距」这种不准确的批注；圈注只标字本身的问题。 */
  function evaluateZhCharacters(lines, W, H) {
    var notes = [];
    var characters = [];
    var all = [];
    lines.forEach(function (ln) {
      ln.glyphs.forEach(function (g) { if (!g.punct) all.push(g); });
    });
    if (!all.length) return { notes: notes, characters: characters };
    var em = median(all.map(function (g) { return g.h; })) || 1;
    var lum0 = median(all.map(function (g) { return g.lum; }));
    var slantPool = all.map(function (g) { return g.slant; }).filter(function (s) { return s != null; });
    var slant0 = slantPool.length ? median(slantPool) : 0;
    var heads = lines.map(function (ln) { return ln.x0; });
    var head0 = heads.length ? median(heads) : 0;
    var pitches = [];
    var li;
    for (li = 1; li < lines.length; li++) pitches.push(lines[li].cy - lines[li - 1].cy);
    var pitch0 = pitches.length ? median(pitches) : em * 1.6;
    var index = 0;

    lines.forEach(function (ln, row) {
      var pool = ln.glyphs.filter(function (g) { return !g.punct; });
      if (!pool.length) return;
      var cy0 = median(pool.map(function (g) { return g.cy; }));
      var packed = charGaps(ln.glyphs);
      var gap0 = packed.gaps.length ? median(packed.gaps) : em * 0.5;
      pool.forEach(function (g) { g.gapToNext = null; });
      packed.pairs.forEach(function (pair, i) { pair[0].gapToNext = packed.gaps[i]; });
      var pitch = row > 0 ? ln.cy - lines[row - 1].cy : pitch0;
      var bandH = Math.max(1, ln.h);
      var headDev = Math.abs(ln.x0 - head0) / em;
      var pitchRatio = pitch / em;

      pool.forEach(function (g, col) {
        var findings = [];
        function hit(code, score, detail, title, charLevel) {
          var item = rubricItem(code);
          if (!item) return;
          findings.push({
            code: code,
            name: item.name,
            dimension: item.dim,
            weight: item.weight,
            score: limit(score),
            criterion: item.criterion,
            detail: detail,
            action: item.advice,
            train: item.train || '',
            advice: item.advice + (item.train ? '练法：' + item.train : ''),
            title: title || '',
            charLevel: !!charLevel
          });
        }

        var aspect = g.w / Math.max(1, g.h);
        var aspect0 = median(pool.map(function (it) { return it.w / Math.max(1, it.h); })) || 1;
        var fill = g.area / Math.max(1, g.w * g.h);
        var sizeDev = (g.h - em) / em;
        var centerDx = (g.cx - (g.x + g.w / 2)) / Math.max(1, g.w);
        var centerDy = (g.cy - (g.y + g.h / 2)) / Math.max(1, g.h);
        var coreOff = Math.sqrt(centerDx * centerDx + centerDy * centerDy);
        var bandOff = Math.abs((g.cy - ln.y0) / bandH - 0.5);
        var cyDelta = (g.cy - cy0) / em;
        var cyOff = Math.abs(cyDelta);
        var lean = g.slant == null ? 0 : Math.abs(g.slant);
        var slantDev = g.slant == null ? 0 : Math.abs(g.slant - slant0);
        var lumDelta = g.lum - lum0;
        var gap = g.gapToNext == null ? gap0 : g.gapToNext;
        var gapDev = Math.abs(gap - gap0) / em;

        /* 笔法·笔画 */
        if (g.lum > 168 || (lum0 <= 150 && g.lum > lum0 + 36)) {
          hit('B1', deviationScore(g.lum, 168, 1.6, 48),
            '笔画灰度 ' + Math.round(g.lum) + '，比本页偏淡，线条不够清晰。', '用笔扎实', true);
        }
        if (Math.abs(lumDelta) > 30 && g.lum <= 168) {
          hit('B2', deviationScore(Math.abs(lumDelta), 30, 1.6, 52),
            '墨色与本页中位相差 ' + Math.round(Math.abs(lumDelta)) + ' 级，用力忽轻忽重。', '提按写匀', true);
        }
        if (lean > 0.28) {
          hit('B3', deviationScore(lean, 0.28, 150, 45),
            '竖向笔势偏斜约 ' + Math.round(lean * 100) + '%，竖画不够垂直。', '横平竖直', true);
        } else if (slantDev > 0.24) {
          hit('B3', deviationScore(slantDev, 0.24, 140, 55),
            '与整页斜度相差 ' + Math.round(slantDev * 100) + '%，同一页取势不一致。', '斜度不齐', true);
        }
        if (fill > 0.72 && g.w >= 10 && g.h >= 10) {
          hit('B4', 46, '局部填充率 ' + Math.round(fill * 100) + '%，笔画涂成了墨块。', '笔画干净', true);
        }

        /* 结构·结体 */
        if (cyOff > 0.22) {
          hit('S1', deviationScore(cyOff, 0.22, 110, 40),
            '字心比本行中线偏' + (cyDelta > 0 ? '下' : '上') + ' ' + Math.round(cyOff * 100) + '% 字高，行气断开。', '字心成行', true);
        }
        if (sizeDev < -0.28) {
          hit('S2', deviationScore(-sizeDev, 0.28, 70, 48),
            '字高比全页中位小 ' + Math.round(-sizeDev * 100) + '%，大小不匀。', '写大一些', true);
        } else if (sizeDev > 0.32) {
          hit('S2', deviationScore(sizeDev, 0.32, 70, 48),
            '字高比全页中位大 ' + Math.round(sizeDev * 100) + '%，大小不匀。', '写小一些', true);
        }
        if (Math.abs(aspect - 1) > 0.32 && Math.abs(aspect - aspect0) > 0.30) {
          hit('S3', deviationScore(Math.abs(aspect - 1), 0.32, 150, 48),
            '长宽比 ' + aspect.toFixed(2) + '，明显偏' + (aspect < 1 ? '长' : '扁') + '，楷书宜方。', '字形写方', true);
        }
        if (coreOff > 0.10) {
          hit('S4', deviationScore(coreOff, 0.10, 220, 50),
            '墨迹重心偏离字心 ' + Math.round(coreOff * 100) + '%，中宫没有收住。', '中宫居中', true);
        }
        if (bandOff > 0.18) {
          hit('S5', deviationScore(bandOff, 0.18, 160, 52),
            '字心在本行格内偏' + ((g.cy - ln.y0) / bandH > 0.5 ? '下' : '上') + ' ' + Math.round(bandOff * 100) + '%，没有居中。', '占格合宜', true);
        }

        /* 章法·卷面（按行评定，不生成逐字圈注） */
        var gapRatio = gap / em;
        if (gapRatio < 0.12) {
          hit('L1', 45, '字距只有 ' + Math.round(gapRatio * 100) + '% 字高，字挤在一起。', '', false);
        } else if (gapRatio > 1.05) {
          hit('L1', deviationScore(gapRatio - 1.05, 0, 70, 50),
            '字距达 ' + gapRatio.toFixed(2) + ' 倍字高，空档过大。', '', false);
        } else if (gapDev > 0.30) {
          hit('L1', deviationScore(gapDev, 0.30, 120, 55),
            '与相邻字的空档相差 ' + Math.round(gapDev * 100) + '% 字高，字距不匀。', '', false);
        }
        if (pitchRatio < 1.45) {
          hit('L2', 45, '本行行距只有 ' + pitchRatio.toFixed(2) + ' 倍字高，行与行太挤。', '', false);
        }
        if (headDev > 0.6) {
          hit('L3', deviationScore(headDev, 0.6, 90, 55),
            '本行行首比全页错开 ' + Math.round(headDev * 100) + '% 字高，行款不齐。', '', false);
        }
        var edgeTouch = g.x <= 1 || g.y <= 1 || g.x + g.w >= W - 1 || g.y + g.h >= H - 1;
        var overflow = row < lines.length - 1 && g.bottom > lines[row + 1].y0 + 2 && cyDelta > 0.55;
        if (edgeTouch || overflow) {
          hit('L4', 52, overflow ? '长笔画压到下一行，字没有收在本行内。' : '笔画贴到纸边，四周没有留白。', '', false);
        }

        var dimScores = { stroke: 100, structure: 100, layout: 100 };
        RUBRIC.dimensions.forEach(function (dim) {
          var wsum = 0, vsum = 0, worstItem = 100;
          RUBRIC.items.forEach(function (item) {
            if (item.dim !== dim.key) return;
            var f = null;
            findings.forEach(function (candidate) { if (candidate.code === item.code) f = candidate; });
            var s = f ? f.score : 100;
            if (s < worstItem) worstItem = s;
            wsum += item.weight;
            vsum += item.weight * s;
          });
          /* 维度内也按最差条款收敛，避免「整行挤成一团」被平均成章法满分。 */
          dimScores[dim.key] = limit(Math.min(wsum ? vsum / wsum : 100, worstItem + 8));
        });
        /* 单字分只按笔法与结体（30:50）计算；章法是整行的属性，按行另评，
         * 不因为「这一行挤」就把每个字都判成不及格。 */
        var baseTotal = (dimScores.stroke * 30 + dimScores.structure * 50) / 80;
        var charFindings = findings.filter(function (f) { return f.charLevel; });
        var rowFindings = findings.filter(function (f) { return !f.charLevel; });
        charFindings.sort(function (a, b) { return a.score - b.score; });
        rowFindings.sort(function (a, b) { return a.score - b.score; });
        findings.sort(function (a, b) { return a.score - b.score || (a.code > b.code ? 1 : -1); });
        /* 单条明显失度要封顶：平均值会把「一个字写得很扁」稀释成优秀，
         * 与圈注等级矛盾。考级同样要求笔画、结构、章法分别达标。 */
        var worstChar = charFindings.length ? charFindings[0].score : 100;
        var cap = !charFindings.length ? 100 : worstChar < 62 ? 64 : worstChar < 78 ? 79 : 89;
        var total = limit(Math.min(baseTotal, cap));
        var grade = gradeOf(total);
        var level = charFindings.length ? (charFindings[0].score < 62 ? 'bad' : 'warn') : 'good';
        var title = charFindings.length ? charFindings[0].title : '写得工整';
        var place = '第' + (row + 1) + '行第' + (col + 1) + '字';
        var verdict = place + ' · ' + grade.label + '（' + total + ' 分，单字）｜笔法 ' + dimScores.stroke +
          '、结体 ' + dimScores.structure + '；章法 ' + dimScores.layout + '（按本行评定）。';
        if (findings.length) {
          var main = charFindings.slice(0, 2).concat(rowFindings.slice(0, 1)).slice(0, 2);
          verdict += (charFindings.length ? '主要问题：' : '本行章法：') + main.map(function (f) {
            return f.name + '（' + f.detail.replace(/。$/, '') + '）';
          }).join('；') + '。';
        } else {
          verdict += RUBRIC.items.length + ' 项可测量条款全部达标：重心平稳、大小匀称、字形方正、笔画清晰、行款整齐。';
        }
        var advice;
        if (findings.length) {
          var parts = charFindings.slice(0, 2).map(function (f) { return f.advice; });
          if (!parts.length) {
            parts.push('单字本身可以保持；本行' + rowFindings[0].name + '需整体调整：' + rowFindings[0].advice);
          } else if (rowFindings.length) {
            parts.push('另：本行' + rowFindings[0].name + '见行标注，' + rowFindings[0].action);
          }
          advice = '优先改：' + parts.join(' ') + ' 其余条款保持现状。';
        } else {
          advice = '此字已合「规范、端正、整洁」，可作本行范字。进阶：' + RUBRIC.advanced;
        }
        var box = boxOf(g, 1, W, H);
        var charIndex = index++;
        characters.push({
          index: charIndex,
          line: row + 1,
          column: col + 1,
          box: { x: box.x, y: box.y, w: box.w, h: box.h },
          score: total,
          grade: grade.label,
          gradeNote: grade.note,
          level: level,
          title: title,
          verdict: verdict,
          advice: advice,
          scores: dimScores,
          findings: findings,
          passedCount: RUBRIC.items.length - findings.length,
          itemCount: RUBRIC.items.length
        });
        notes.push({
          glyph: g,
          level: level,
          text: title,
          detail: advice,
          charIndex: charIndex
        });
      });
    });
    return { notes: notes, characters: characters };
  }

  function rubricSummary() {
    return JSON.parse(JSON.stringify(RUBRIC));
  }

  function reviewCharacters(lines) {
    var notes = [];
    lines.forEach(function (ln) {
      var english = ln.kind === 'en';
      var pool = ln.glyphs.filter(function (g) { return !g.punct; });
      if (!pool.length) return;
      var em = median(pool.map(function (g) { return g.h; })) || 1;
      var cy0 = median(pool.map(function (g) { return english ? g.bottom : g.cy; }));
      var lum0 = median(pool.map(function (g) { return g.lum; }));
      var aspects = pool.map(function (g) { return g.w / Math.max(1, g.h); });
      var aspect0 = median(aspects) || 1;
      var slants = pool.map(function (g) { return g.slant; }).filter(function (s) { return s != null; });
      var slant0 = slants.length ? median(slants) : 0;
      pool.forEach(function (g) {
        var issues = [];
        var sizeDev = (g.h - em) / em;
        if (sizeDev < -0.28) {
          issues.push({ score: 64 + sizeDev * 70, text: '写大一些', detail: '这个字偏小，写到和其他字一样大。' });
        } else if (sizeDev > 0.32) {
          issues.push({ score: 64 - (sizeDev - 0.32) * 70, text: '写小一些', detail: '这个字偏大，收到和其他字一样大。' });
        }
        if (!english) {
          var aspect = g.w / Math.max(1, g.h);
          var odd = Math.abs(aspect - aspect0);
          if (odd > 0.42 && Math.abs(aspect - 1) > 0.38) {
            issues.push({ score: 66 - (odd - 0.42) * 60, text: '字形写方', detail: '这个字比旁边的字更扁或更长，收到方一些。' });
          }
        }
        var off = Math.abs((english ? g.bottom : g.cy) - cy0) / em;
        if (off > 0.22) {
          issues.push({
            score: 62 - (off - 0.22) * 110,
            text: english ? '底部对齐' : '字心成行',
            detail: english ? '这个字母的底部没有贴齐，贴着同一条线写。' : '这个字偏上或偏下，把字心拉回这一行。'
          });
        }
        if (g.slant != null) {
          var lean = Math.abs(g.slant);
          if (!english && lean > 0.28) {
            issues.push({ score: 60 - (lean - 0.28) * 90, text: '横平竖直', detail: '这一笔歪了，横画写平，竖画写直。' });
          } else if (english && lean > 0.75) {
            issues.push({ score: 64, text: '竖画写正', detail: '这一笔往一边倒了，竖画写直。' });
          } else if (!english && Math.abs(g.slant - slant0) > 0.24) {
            issues.push({ score: 66, text: '斜度不齐', detail: '这一笔和旁边的字斜度不一样，写成一样正。' });
          }
        }
        if (g.lum > 168 || (lum0 <= 150 && g.lum > lum0 + 36)) {
          issues.push({
            score: 58,
            text: english ? '笔迹写深' : '用笔扎实',
            detail: '这一笔太轻，笔落到纸上再写清楚。'
          });
        }
        var fill = g.area / Math.max(1, g.w * g.h);
        if (fill > 0.72 && g.w >= 10 && g.h >= 10) {
          issues.push({ score: 48, text: english ? '不要涂黑' : '笔画干净', detail: '这里涂成一块了，轻轻改掉。' });
        }
        if (!issues.length) {
          notes.push({
            glyph: g,
            level: 'good',
            text: english ? '写得整齐' : '写得工整',
            detail: english ? '这个字母大小和位置都稳，照这样写。' : '这个字大小、字形和字心都稳，照这样写。'
          });
          return;
        }
        issues.sort(function (a, b) { return a.score - b.score; });
        notes.push({
          glyph: g,
          level: issues[0].score < 62 ? 'bad' : 'warn',
          text: issues[0].text,
          detail: issues[0].detail
        });
      });
    });
    return notes;
  }

  function groupNotes(notes) {
    var map = {};
    var order = [];
    notes.forEach(function (n) {
      if (!map[n.text]) {
        map[n.text] = { title: n.text, detail: n.detail, level: n.level, count: 0 };
        order.push(map[n.text]);
      }
      map[n.text].count++;
    });
    order.sort(function (a, b) {
      if ((a.level === 'good') !== (b.level === 'good')) return a.level === 'good' ? 1 : -1;
      return b.count - a.count;
    });
    return order.map(function (g) {
      return { title: g.title, detail: (g.count > 1 ? '有 ' + g.count + ' 处。' : '') + g.detail };
    });
  }

  function assess(image, options) {
    options = options || {};
    if (!image || !image.width || !image.height || !image.data || image.data.length < image.width * image.height * 4) {
      return emptyReport('这张图片读不出来。');
    }
    var fittedFull = downsample(image, 720);
    var frame = cropPaper(fittedFull);
    var fitted = frame.image;
    var W = fitted.width, H = fitted.height;
    var built = buildMask(fitted);
    if (built.ink < W * H * 0.004) {
      return emptyReport('没有看出成行的手写字。请换一张白纸、深色笔的照片，字写清楚，尽量放平。');
    }
    var parts = keepGlyphs(fitted, built.mask, components(fitted, built.mask));
    var cells = keepGlyphs(fitted, built.mask, charactersFromMask(fitted, built.mask));
    var glyphs = cells.length >= 6 && parts.length > cells.length * 1.45 ? cells : parts;
    if (glyphs.length < 6) {
      return emptyReport('没有看出成行的手写字。请换一张白纸、深色笔的照片，字写清楚，尽量放平。');
    }
    var lines = groupLines(glyphs);
    var lineHeights = lines.filter(function (ln) { return ln.glyphs.length >= 3; }).map(function (ln) { return ln.h; });
    var medLineH = median(lineHeights) || 1;
    lines = lines.filter(function (ln) {
      return ln.h >= medLineH * 0.55 && ln.h <= medLineH * 2.2 && ln.glyphs.length >= 2;
    });
    var usable = 0;
    lines.forEach(function (ln) { usable += ln.glyphs.length; });
    if (!lines.length || usable < 6) {
      return emptyReport('没有看出成行的手写字。请换一张白纸、深色笔的照片，字写清楚，尽量放平。');
    }
    markPunctuation(lines);
    var detected = detectScript(lines);
    var script = options.script === 'zh' || options.script === 'en' ? options.script : detected;
    if (script !== 'mixed') lines.forEach(function (ln) { ln.kind = script; });
    else lines.forEach(function (ln) { if (ln.kind === 'unknown') ln.kind = 'zh'; });

    var baselineRaw = scoreBaseline(lines, W, H);
    var sizeRaw = scoreSize(lines, W, H);
    var spacingRaw = scoreSpacing(lines, W, H);
    var slantRaw = scoreSlant(lines);
    var inkRaw = scoreInk(lines, W, H);
    var neatRaw = scoreNeat(lines, glyphs, W, H);
    function withGlyph(raw) {
      if (raw && raw.glyph) {
        return { score: raw.score, key: raw.key, mark: boxOf(raw.glyph, 1, W, H), glyph: null };
      }
      return raw;
    }
    var reviewed = script === 'zh'
      ? evaluateZhCharacters(lines, W, H)
      : { notes: reviewCharacters(lines), characters: [] };
    var notes = reviewed.notes;
    var characters = reviewed.characters;
    var dims;
    if (script === 'zh') {
      /* 全页三维度完全由逐字量表汇总，与逐字评判一个口径。行距、行首、越行等
       * 行级问题已写进 L1—L4 条款，按所在行计入每个字的章法分。 */
      var charDim = { stroke: [], structure: [], layout: [] };
      characters.forEach(function (c) {
        charDim.stroke.push(c.scores.stroke);
        charDim.structure.push(c.scores.structure);
        charDim.layout.push(c.scores.layout);
      });
      function zhDimScore(key) {
        return charDim[key].length ? limit(mean(charDim[key])) : 100;
      }
      dims = [
        { key: 'stroke', label: '笔画', weight: 30, score: zhDimScore('stroke') },
        { key: 'structure', label: '结构', weight: 50, score: zhDimScore('structure') },
        { key: 'layout', label: '章法', weight: 20, score: zhDimScore('layout') }
      ];
    } else {
      dims = [
        dimension('baseline', baselineRaw, W, H),
        dimension('size', sizeRaw, W, H),
        dimension('spacing', spacingRaw, W, H),
        dimension('slant', withGlyph(slantRaw), W, H),
        dimension('ink', inkRaw, W, H),
        dimension('neat', neatRaw, W, H)
      ];
    }
    /* 中文按 CCPT 初级书写卷的 30 / 50 / 20 权重，英文仍用原来的六维权重。 */
    var weights = script === 'zh'
      ? { stroke: 30, structure: 50, layout: 20 }
      : { baseline: 1.25, size: 1.1, spacing: 1.2, slant: 1, ink: 0.8, neat: 1 };
    var wsum = 0, vsum = 0, worst = 100, i;
    for (i = 0; i < dims.length; i++) {
      wsum += weights[dims[i].key];
      vsum += weights[dims[i].key] * dims[i].score;
      if (dims[i].score < worst) worst = dims[i].score;
    }
    var score = limit((vsum / wsum) * 0.6 + worst * 0.4);
    var verdict = score >= 85 ? '工整' : score >= 70 ? '比较工整' : score >= 55 ? '还要练' : '需要多练';
    var scriptLabel = script === 'en' ? '英文' : script === 'mixed' ? '中英' : '中文';
    var marks = notes.map(function (note) {
      var box = boxOf(note.glyph, 1, W, H);
      box.text = note.text;
      box.detail = note.detail;
      box.level = note.level;
      box.place = 'char';
      if (note.charIndex != null) box.charIndex = note.charIndex;
      return box;
    });
    function pushIssue(found, place) {
      if (!found || !(found.score < 78) || !found.mark || !ADVICE[found.key]) return;
      var advice = ADVICE[found.key];
      var mark = {
        x: found.mark.x,
        y: found.mark.y,
        w: found.mark.w,
        h: found.mark.h,
        text: advice[0],
        detail: advice[1],
        level: found.score < 62 ? 'bad' : 'warn',
        place: place || found.mark.place || 'line'
      };
      if (marks.some(function (m) { return m.text === mark.text && iou(m, mark) > 0.45; })) return;
      marks.push(mark);
      notes.push({ text: mark.text, detail: mark.detail, level: mark.level });
    }
    var gapKeys = { tightZh: 1, looseZh: 1, gapZh: 1, wordEn: 1, tightEn: 1 };
    pushIssue(spacingRaw, gapKeys[spacingRaw.key] ? 'gap' : '');
    (neatRaw.items || []).forEach(function (item) {
      pushIssue(item);
    });
    var textLines = lines.filter(function (ln) { return ln.glyphs.length >= 2; });
    if (frame.cropped) {
      marks.forEach(function (m) {
        m.x = (frame.x + m.x * W) / frame.fullW;
        m.y = (frame.y + m.y * H) / frame.fullH;
        m.w = m.w * W / frame.fullW;
        m.h = m.h * H / frame.fullH;
      });
    }
    /* 逐字框与前 N 个标注一一对应，裁纸后同步换算，页面点定位才对得上。 */
    characters.forEach(function (c, i) {
      if (!marks[i]) return;
      c.box = { x: marks[i].x, y: marks[i].y, w: marks[i].w, h: marks[i].h };
    });
    marks.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var suggestions = groupNotes(notes);
    var goodN = 0;
    var fixN = 0;
    notes.forEach(function (n) {
      if (!n.glyph) return;
      if (n.level === 'good') goodN++;
      else fixN++;
    });
    var fixes = suggestions.filter(function (s) { return s.title !== '写得工整' && s.title !== '写得整齐'; });
    var charAverage = characters.length ? limit(mean(characters.map(function (c) { return c.score; }))) : null;
    var summary = scriptLabel + '手写，' + verdict + '。逐字看过 ' + (goodN + fixN) + ' 个，' + goodN + ' 个写得稳，' + fixN + ' 个要改。';
    if (fixes.length) summary += '先改：' + fixes.slice(0, 4).map(function (s) { return s.title; }).join('、') + '。';
    else summary += script === 'zh' ? '可以照着再抄一行。' : '可以照着再写一行。';
    if (script === 'zh') summary += '中文按硬笔楷书量表（笔法 30 / 结体 50 / 章法 20）逐字评判。';
    return {
      ok: true,
      script: script,
      scriptLabel: scriptLabel,
      score: score,
      verdict: verdict,
      summary: summary,
      lineCount: textLines.length,
      glyphCount: glyphs.length,
      goodCount: goodN,
      fixCount: fixN,
      dimensions: dims.map(function (d) {
        return { key: d.key, label: d.label, score: d.score, weight: d.weight || null };
      }),
      rubric: script === 'zh' ? rubricSummary() : null,
      characters: characters,
      charAverage: charAverage,
      standardNote: script === 'zh' ? RUBRIC.note : '',
      suggestions: suggestions,
      marks: marks
    };
  }

  function overlap(a, b, gap) {
    return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  }

  function layoutMarks(marks, width, height, scale) {
    scale = scale || 1;
    if (!marks || !marks.length || width < 20 || height < 20) return [];
    var font = marks.length > 16 ? Math.max(10, Math.round(11 * scale)) : Math.max(13, Math.round(15 * scale));
    var chips = [];
    var ink = [];
    var placed = [];
    var laneY = -999;
    var lane = 0;
    marks.forEach(function (mark) {
      if ((mark.place || 'char') !== 'char') return;
      ink.push({
        x: mark.x * width,
        y: mark.y * height,
        w: Math.max(8 * scale, mark.w * width),
        h: Math.max(8 * scale, mark.h * height)
      });
    });
    marks.forEach(function (mark) {
      var text = mark.text || '';
      var place = mark.place || 'char';
      var bw = Math.max(8 * scale, mark.w * width);
      var bh = Math.max(8 * scale, mark.h * height);
      var bx = mark.x * width;
      var by = mark.y * height;
      var tw = Math.round(text.length * font + 6 * scale);
      var th = Math.round(font * 1.35);
      var box = { x: bx, y: by, w: bw, h: bh };
      if (Math.abs(by - laneY) > bh * 0.7) lane = 0;
      else lane++;
      laneY = by;
      var above = lane % 2 === 0;
      var clear = Math.max(8 * scale, Math.min(bh * 0.48, 14 * scale));
      var spots = place === 'char'
        ? [
          { x: bx + (bw - tw) / 2, y: (above ? by - th - clear : by + bh + clear) },
          { x: bx + (bw - tw) / 2, y: (above ? by + bh + clear : by - th - clear) },
          { x: bx + bw + clear, y: by - th - 2 * scale },
          { x: bx - tw - clear, y: by - th - 2 * scale },
          { x: bx + (bw - tw) / 2, y: by - th - clear - th - 4 * scale },
          { x: bx + (bw - tw) / 2, y: by + bh + clear + th + 4 * scale }
        ]
        : [
          { x: bx - tw - 4 * scale, y: by + (bh - th) / 2 },
          { x: bx + (bw - tw) / 2, y: by - th - 4 * scale },
          { x: bx + bw + 4 * scale, y: by + (bh - th) / 2 },
          { x: bx + (bw - tw) / 2, y: by + bh + 4 * scale }
        ];
      spots.push({ x: width - tw - 4 * scale, y: by });
      var choice = null;
      var i, raw, c, blocked;
      for (i = 0; i < spots.length; i++) {
        raw = spots[i];
        c = {
          x: clamp(raw.x, 2, Math.max(2, width - tw - 2)),
          y: clamp(raw.y, 2, Math.max(2, height - th - 2)),
          w: tw,
          h: th
        };
        blocked = overlap(c, box, 1) || ink.some(function (part) { return overlap(c, part, 1); }) || chips.some(function (chip) { return overlap(c, chip, 1); });
        if (blocked) continue;
        choice = c;
        break;
      }
      if (choice) chips.push(choice);
      placed.push({
        box: box,
        chip: choice,
        text: text,
        level: mark.level || 'bad',
        place: place
      });
    });
    return placed;
  }

  function brushLoop(ctx, cx, cy, rx, ry, pass) {
    var steps = 40;
    var i, t, wobble, x, y;
    ctx.beginPath();
    for (i = 0; i <= steps; i++) {
      t = (i / steps) * Math.PI * 2;
      wobble = 1 + 0.075 * Math.sin(t * 3 + pass * 1.8) + 0.04 * Math.sin(t * 5 + 0.6);
      x = cx + Math.cos(t + pass * 0.05) * rx * wobble;
      y = cy + Math.sin(t) * ry * wobble * (pass ? 1.04 : 0.95);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function ringFor(box, ink) {
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2;
    var roomX = Math.max(box.w, box.h) * 1.4;
    var roomY = roomX;
    var i, o, ocx, ocy, gapX, gapY;
    for (i = 0; i < ink.length; i++) {
      o = ink[i];
      if (o === box) continue;
      ocx = o.x + o.w / 2;
      ocy = o.y + o.h / 2;
      gapX = Math.abs(ocx - cx) - o.w / 2;
      gapY = Math.abs(ocy - cy) - o.h / 2;
      if (Math.abs(ocy - cy) < (box.h + o.h) * 0.7 && gapX > 0) roomX = Math.min(roomX, gapX);
      if (Math.abs(ocx - cx) < (box.w + o.w) * 0.7 && gapY > 0) roomY = Math.min(roomY, gapY);
    }
    var stroke = Math.max(1.3, Math.min(box.w, box.h) * 0.06);
    var minRx = (box.w / 2 + 2 + stroke) / 0.86;
    var minRy = (box.h / 2 + 2 + stroke) / 0.86;
    var maxRx = (roomX - stroke) / 1.12;
    var maxRy = (roomY - stroke) / 1.12;
    if (maxRx < minRx || maxRy < minRy) return null;
    return {
      rx: Math.min(maxRx, minRx + Math.min(4, box.w * 0.08)),
      ry: Math.min(maxRy, minRy + Math.min(4, box.h * 0.08)),
      stroke: stroke
    };
  }

  function drawAnnotations(ctx, placed) {
    if (!ctx || !placed || !placed.length) return;
    var ink = [];
    var i, item;
    for (i = 0; i < placed.length; i++) {
      if ((placed[i].place || 'char') === 'char') ink.push(placed[i].box);
    }
    for (i = 0; i < placed.length; i++) {
      item = placed[i];
      drawOne(ctx, item, ink);
    }
  }

  function drawOne(ctx, item, ink) {
    var box = item.box;
    var place = item.place || 'char';
    var good = item.level === 'good';
    var color = good ? '#1d6b45' : (item.level === 'warn' ? '#c2410c' : '#b42318');
    var ring, cx, cy, pass, fontPx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (place === 'char') {
      ring = ringFor(box, ink);
      if (ring) {
        cx = box.x + box.w / 2;
        cy = box.y + box.h / 2;
        for (pass = 0; pass < 2; pass++) {
          brushLoop(ctx, cx, cy, ring.rx, ring.ry, pass);
          ctx.strokeStyle = pass ? (good ? 'rgba(29, 107, 69, 0.35)' : 'rgba(194, 59, 46, 0.4)') : 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = Math.max(1.4, ring.stroke * (pass ? 0.7 : 1.15));
          ctx.stroke();
          if (!pass) {
            brushLoop(ctx, cx, cy, ring.rx, ring.ry, 0);
            ctx.strokeStyle = color;
            ctx.lineWidth = ring.stroke;
            ctx.stroke();
          }
        }
      } else if (box.y > 8) {
        ctx.beginPath();
        ctx.moveTo(box.x + box.w * 0.2, box.y - 2);
        ctx.lineTo(box.x + box.w * 0.2, box.y - 6);
        ctx.lineTo(box.x + box.w * 0.8, box.y - 6);
        ctx.lineTo(box.x + box.w * 0.8, box.y - 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    } else if (place === 'line' || place === 'col') {
      ctx.beginPath();
      if (place === 'col') {
        ctx.moveTo(box.x, box.y - 5);
        ctx.lineTo(box.x, box.y - 9);
        ctx.lineTo(box.x + box.w, box.y - 9);
        ctx.lineTo(box.x + box.w, box.y - 5);
      } else {
        ctx.moveTo(box.x - 4, box.y);
        ctx.lineTo(box.x - 8, box.y);
        ctx.lineTo(box.x - 8, box.y + box.h);
        ctx.lineTo(box.x - 4, box.y + box.h);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
    if (item.chip && item.text) {
      fontPx = Math.max(10, Math.round(item.chip.h * 0.72));
      ctx.font = '700 ' + fontPx + 'px "KaiTi", "STKaiti", "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, fontPx * 0.18);
      ctx.strokeStyle = 'rgba(255, 252, 247, 0.94)';
      ctx.strokeText(item.text, item.chip.x + item.chip.w / 2, item.chip.y + item.chip.h / 2);
      ctx.fillStyle = color;
      ctx.fillText(item.text, item.chip.x + item.chip.w / 2, item.chip.y + item.chip.h / 2);
    }
    ctx.restore();
  }

  return {
    assess: assess,
    getRubric: rubricSummary,
    gradeOf: gradeOf,
    suggestQuarter: suggestQuarter,
    rotatePixels: rotatePixels,
    layoutMarks: layoutMarks,
    drawAnnotations: drawAnnotations
  };
});
