/* 书写质量页面。照片只在内存里分析，不写入数据库。 */
(function () {
  'use strict';

  var HW = window.CnmHandwriting;
  var root = document.getElementById('root');
  var script = 'auto';
  var view = null;
  var analysis = null;
  var report = null;
  var busy = false;
  var status = '';
  var focusIndex = null;
  var charFilter = 'all';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fit(img, maxW) {
    var scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function turn(canvas, quarter) {
    var q = ((quarter % 4) + 4) % 4;
    if (!q) return canvas;
    var swap = q % 2 === 1;
    var next = document.createElement('canvas');
    next.width = swap ? canvas.height : canvas.width;
    next.height = swap ? canvas.width : canvas.height;
    var ctx = next.getContext('2d', { willReadFrequently: true });
    ctx.translate(next.width / 2, next.height / 2);
    ctx.rotate(q * Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return next;
  }

  function pixels(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function tone(score) {
    if (score >= 85) return 'ok';
    if (score >= 70) return 'shaky';
    return 'bad';
  }

  function analyze() {
    if (!analysis) return;
    var opts = script === 'zh' || script === 'en' ? { script: script } : {};
    report = HW.assess(pixels(analysis), opts);
  }

  function loadFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) {
      status = '请上传图片。';
      render();
      return;
    }
    busy = true;
    status = '正在看笔迹……';
    report = null;
    focusIndex = null;
    charFilter = 'all';
    render();
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var probe = fit(img, 720);
      var quarter = HW.suggestQuarter(pixels(probe));
      analysis = turn(probe, quarter);
      view = turn(img.naturalWidth > 720 ? fit(img, 1600) : probe, quarter);
      busy = false;
      status = '';
      analyze();
      render();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      busy = false;
      status = '这张图片读不出来。';
      view = null;
      analysis = null;
      report = null;
      render();
    };
    img.src = url;
  }

  function paintBoard(canvas, pixelW, pixelH, scale, withFocus) {
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(canvas.width / pixelW, 0, 0, canvas.height / pixelH, 0, 0);
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, pixelW, pixelH);
    ctx.drawImage(view, 0, 0, pixelW, pixelH);
    if (report && report.ok && report.marks && report.marks.length) {
      HW.drawAnnotations(ctx, HW.layoutMarks(report.marks, pixelW, pixelH, scale));
    }
    if (withFocus && report && report.ok && focusIndex != null &&
      report.characters && report.characters[focusIndex]) {
      var b = report.characters[focusIndex].box;
      var pad = Math.max(2, 3 * scale);
      ctx.save();
      ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.strokeStyle = '#0f6e62';
      ctx.lineWidth = Math.max(1.6, 2 * scale);
      ctx.strokeRect(b.x * pixelW - pad, b.y * pixelH - pad,
        b.w * pixelW + pad * 2, b.h * pixelH + pad * 2);
      ctx.restore();
    }
  }

  function drawVisible() {
    var board = document.getElementById('hw-board');
    var canvas = document.getElementById('hw-canvas');
    if (!board || !canvas || !view) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = board.clientWidth || 320;
    var cssH = Math.max(1, Math.round(cssW * view.height / view.width));
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    paintBoard(canvas, cssW, cssH, 1, true);
    if (report && report.summary) canvas.setAttribute('aria-label', report.summary);
  }

  function download() {
    if (!view || !report || !report.ok) return;
    var screen = document.getElementById('hw-board');
    var cssW = (screen && screen.clientWidth) || 720;
    var out = document.createElement('canvas');
    out.width = view.width;
    out.height = view.height;
    paintBoard(out, view.width, view.height, view.width / cssW, false);
    out.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      var url = URL.createObjectURL(blob);
      a.href = url;
      a.download = '书写标注.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/jpeg', 0.92);
  }

  function render() {
    var html = '<section class="card" id="hw-drop">';
    html += '<h1>书写质量</h1>';
    html += '<p class="muted">上传中文或英文手写照片。中文按硬笔楷书量表（笔法 30 / 结体 50 / 章法 20）逐字给分、评级和改法，写得好的用绿圈表扬，要改的用红圈写明改法；英文仍按字母书写看。圈和字都避开原来的笔迹。不判断字写得对不对，笔顺、起收笔、部件比例等需人工复核。已批改的卷子仍用 <a href="papers.html">试卷质量分析</a>。</p>';
    html += '<div class="row" role="radiogroup" aria-label="按哪种文字来看">';
    html += scriptChoice('auto', '自动');
    html += scriptChoice('zh', '中文');
    html += scriptChoice('en', '英文');
    html += '</div>';
    html += '<div class="hw-drop">';
    html += '<p>把照片拖到这里，或从相册选择。尽量拍白纸、深色笔，纸放平，字写满几行。</p>';
    html += '<label class="btn btn-primary">选择图片<input id="hw-file" class="pq-file" type="file" accept="image/*"></label>';
    html += '</div>';
    if (status) html += '<p class="small' + (busy ? '' : ' err') + '" role="status">' + esc(status) + '</p>';
    html += '</section>';

    if (view) {
      html += '<section class="card">';
      html += '<h2>标注</h2>';
      if (report && report.ok) {
        html += '<p>' + esc(report.summary) + '</p>';
        html += '<p class="small muted">看出 ' + report.lineCount + ' 行、' + (report.goodCount + report.fixCount) + ' 个字。绿圈是表扬，红圈是改法，都避开原来的笔迹。</p>';
      } else if (report) {
        html += '<p class="err">' + esc(report.message) + '</p>';
      }
      html += '<div class="hw-board" id="hw-board"><canvas id="hw-canvas"></canvas></div>';
      if (report && report.ok) html += '<p class="row"><button type="button" id="hw-save" class="primary">下载标注图</button></p>';
      html += '</section>';
    }

    if (report && report.ok) {
      html += '<section class="card"><h2>评价</h2><div class="stats">';
      html += '<div class="stat ' + tone(report.score) + '"><b>' + report.score + '</b>' + esc(report.verdict) + '</div>';
      html += '<div class="stat ok"><b>' + report.goodCount + '</b>写得稳</div>';
      html += '<div class="stat ' + (report.fixCount ? 'bad' : 'ok') + '"><b>' + report.fixCount + '</b>要改</div>';
      html += '<div class="stat"><b>' + esc(report.scriptLabel) + '</b>文字</div>';
      html += '</div>';
      report.dimensions.forEach(function (dim) {
        html += '<div class="hw-dim"><span class="name">' + esc(dim.label) + '</span>';
        html += '<div class="progress"><i style="width:' + dim.score + '%"></i></div>';
        html += '<b>' + dim.score + '</b>' + (dim.weight ? '<span class="small muted"> ' + dim.weight + '%</span>' : '') + '</div>';
      });
      if (report.charAverage != null) {
        html += '<p class="small muted">总分按量表三维度加权（章法按行评定）；逐字平均 ' +
          report.charAverage + ' 分只计笔法与结体，不含章法。</p>';
      }
      html += '</section>';
      html += rubricCard(report);
      html += charactersCard(report);
      html += '<section class="card"><h2>共性问题</h2>';
      report.suggestions.forEach(function (item) {
        html += '<article class="pq-plan"><h3>' + esc(item.title) + '</h3><p>' + esc(item.detail) + '</p></article>';
      });
      html += '</section>';
    }

    root.innerHTML = html;
    drawVisible();
    var input = document.getElementById('hw-file');
    if (input) input.addEventListener('change', function () {
      if (input.files && input.files[0]) loadFile(input.files[0]);
    });
    var drop = document.getElementById('hw-drop');
    if (drop) {
      drop.addEventListener('dragover', function (event) {
        event.preventDefault();
        drop.classList.add('hw-over');
      });
      drop.addEventListener('dragleave', function () { drop.classList.remove('hw-over'); });
      drop.addEventListener('drop', function (event) {
        event.preventDefault();
        drop.classList.remove('hw-over');
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) loadFile(file);
      });
    }
    var save = document.getElementById('hw-save');
    if (save) save.addEventListener('click', download);
    var locs = root.querySelectorAll('[data-locate]');
    Array.prototype.forEach.call(locs, function (btn) {
      btn.addEventListener('click', function () {
        focusIndex = Number(btn.getAttribute('data-locate'));
        drawVisible();
        var board = document.getElementById('hw-board');
        if (board && board.scrollIntoView) board.scrollIntoView({ behavior: 'smooth', block: 'center' });
        Array.prototype.forEach.call(root.querySelectorAll('.hw-char'), function (el) {
          if (el.classList.toggle) el.classList.toggle('focus', Number(el.getAttribute('data-index')) === focusIndex);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-filter]'), function (btn) {
      btn.addEventListener('click', function () {
        charFilter = btn.getAttribute('data-filter');
        render();
      });
    });
  }

  function rubricCard(r) {
    var rub = r.rubric;
    if (!rub) return '';
    var html = '<section class="card"><h2>评价标准</h2>';
    html += '<p class="small muted">' + esc(rub.name) + ' · ' + esc(rub.stage) + ' · 版本 ' + esc(rub.version) + '</p>';
    html += '<h3>依据</h3><ul class="hw-list">';
    rub.sources.forEach(function (s) {
      html += '<li><b>' + esc(s.title) + '</b>：' + esc(s.point);
      if (s.url) html += ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">查看大纲</a>';
      html += '</li>';
    });
    html += '</ul><h3>维度与权重</h3>';
    rub.dimensions.forEach(function (d) {
      html += '<div class="hw-rule"><b>' + esc(d.full) + '　' + d.weight + '%</b><p>' + esc(d.criterion) + '</p></div>';
    });
    html += '<details class="hw-details"><summary>' + rub.items.length + ' 项可测量条款与判据</summary><ul class="hw-list">';
    rub.items.forEach(function (it) {
      html += '<li><code>' + esc(it.code) + '</code> ' + esc(it.name) + '（' + it.weight + ' 分）：' + esc(it.criterion) + '</li>';
    });
    html += '</ul></details>';
    html += '<h3>等级</h3><p class="small">' + rub.grades.map(function (g) {
      return esc(g.label) + ' ≥ ' + g.min + ' 分（' + esc(g.note) + '）';
    }).join('；') + '。</p>';
    html += '<details class="hw-details"><summary>本工具不评判的项目（' + rub.unmeasurable.length + ' 项）</summary><ul class="hw-list">';
    rub.unmeasurable.forEach(function (u) {
      html += '<li><b>' + esc(u.name) + '</b>：' + esc(u.reason) + '</li>';
    });
    html += '</ul></details>';
    html += '<p class="small muted">' + esc(rub.note) + '</p></section>';
    return html;
  }

  function charactersCard(r) {
    if (!r.characters || !r.characters.length) return '';
    var html = '<section class="card" id="hw-chars"><h2>逐字评判</h2>';
    html += '<p class="small muted">共 ' + r.characters.length + ' 字，逐字平均 ' + r.charAverage + ' 分。' +
      '每字按笔法与结体定级，章法按所在行另评并写进该字评判；单条明显失度会压低等级；点「在图上定位」对照圈注。</p>';
    var opts = [['all', '全部'], ['bad', '待改进'], ['warn', '需打磨'], ['good', '写得稳']];
    html += '<div class="row hw-filter" role="group" aria-label="按等级筛选">';
    opts.forEach(function (o) {
      html += '<button type="button" class="hw-chip' + (charFilter === o[0] ? ' on' : '') +
        '" data-filter="' + o[0] + '" aria-pressed="' + (charFilter === o[0]) + '">' + o[1] + '</button>';
    });
    html += '</div>';
    var list = r.characters.filter(function (c) { return charFilter === 'all' || c.level === charFilter; });
    if (!list.length) html += '<p class="muted">这一档没有字。</p>';
    list.forEach(function (c) {
      html += '<article class="hw-char' + (focusIndex === c.index ? ' focus' : '') + '" data-index="' + c.index + '">';
      html += '<div class="hw-char-head"><h3>第 ' + c.line + ' 行 · 第 ' + c.column + ' 字</h3>';
      html += '<span class="hw-badge ' + c.level + '">' + esc(c.grade) + ' ' + c.score + '</span>';
      html += '<button type="button" class="hw-locate" data-locate="' + c.index + '">在图上定位</button></div>';
      html += '<div class="hw-scores">';
      [['stroke', '笔法'], ['structure', '结体'], ['layout', '章法']].forEach(function (p) {
        html += '<div class="hw-dim"><span class="name">' + p[1] + '</span>';
        html += '<div class="progress"><i style="width:' + c.scores[p[0]] + '%"></i></div>';
        html += '<b>' + c.scores[p[0]] + '</b></div>';
      });
      html += '</div>';
      html += '<p class="hw-verdict">' + esc(c.verdict) + '</p>';
      html += '<p class="hw-advice"><b>优化建议</b>　' + esc(c.advice) + '</p>';
      if (c.findings.length) {
        html += '<details class="hw-details"><summary>命中 ' + c.findings.length + ' 项（达标 ' +
          c.passedCount + '/' + c.itemCount + '）</summary><ul class="hw-list">';
        c.findings.forEach(function (f) {
          html += '<li><code>' + esc(f.code) + '</code> ' + esc(f.name) + ' <b>' + f.score + ' 分</b>：' + esc(f.detail) +
            '<br><span class="hw-action">改法：' + esc(f.action) +
            (f.train ? '　练法：' + esc(f.train) : '') + '</span></li>';
        });
        html += '</ul></details>';
      } else {
        html += '<p class="small muted">' + c.itemCount + ' 项条款全部达标。</p>';
      }
      html += '</article>';
    });
    html += '</section>';
    return html;
  }

  function scriptChoice(mode, label) {
    var on = script === mode;
    return '<label class="hw-choice' + (on ? ' on' : '') + '"><input type="radio" name="hw-script" value="' + mode + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';
  }

  function pickScript(mode) {
    script = mode || 'auto';
    try {
      if (analysis) analyze();
      render();
    } catch (err) {
      status = (err && err.message) || '没有完成，请再试一次。';
      busy = false;
    }
  }

  root.addEventListener('change', function (event) {
    var input = event.target;
    if (!input || input.name !== 'hw-script') return;
    pickScript(input.value);
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawVisible, 120);
  });

  render();
})();
