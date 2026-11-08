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

  function paintBoard(canvas, pixelW, pixelH, scale) {
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
    paintBoard(canvas, cssW, cssH, 1);
    if (report && report.summary) canvas.setAttribute('aria-label', report.summary);
  }

  function download() {
    if (!view || !report || !report.ok) return;
    var screen = document.getElementById('hw-board');
    var cssW = (screen && screen.clientWidth) || 720;
    var out = document.createElement('canvas');
    out.width = view.width;
    out.height = view.height;
    paintBoard(out, view.width, view.height, view.width / cssW);
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
    html += '<p class="muted">上传中文或英文手写照片。每个字都会看：写得好的用绿圈表扬，要改的用红圈写明改法。圈和字都避开原来的笔迹。不判断字写得对不对。已批改的卷子仍用 <a href="papers.html">试卷质量分析</a>。</p>';
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
        html += '<b>' + dim.score + '</b></div>';
      });
      html += '</section>';
      html += '<section class="card"><h2>逐字批注</h2>';
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
