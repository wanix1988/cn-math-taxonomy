/* 试卷质量分析页面。图片和错题写入 CnmPapers 的本地数据库。 */
(function () {
  'use strict';

  var PQ = window.CnmPapers;
  var root = document.getElementById('root');
  var draft = null;
  var dirty = false;
  var urls = [];
  var selected = { page: 0, mark: 0 };
  var childFilter = 'all';
  var zooms = Object.create(null);
  var moved = false;
  var shown = null;
  var turning = false;

  var SUBJECTS = PQ.SUBJECTS;
  var REASONS = PQ.REASONS;

  function subjectParam() {
    var value = new URLSearchParams(location.search).get('subject');
    return SUBJECTS.some(function (s) { return s[0] === value; }) ? value : 'math';
  }

  function withSubject(href) {
    var subject = subjectParam();
    if (subject === 'math' || !href || href.indexOf('subject=') >= 0 || href.indexOf('http') === 0) return href;
    return href + (href.indexOf('?') >= 0 ? '&' : '?') + 'subject=' + subject;
  }

  function applyChrome() {
    var subject = subjectParam();
    document.body.classList.toggle('subject-english', subject === 'english');
    document.body.classList.toggle('subject-physics', subject === 'physics');
    document.body.classList.toggle('subject-chinese', subject === 'chinese');
    document.body.classList.toggle('subject-science', subject === 'science');
    document.body.classList.toggle('subject-morality', subject === 'morality');
    document.body.classList.toggle('subject-history', subject === 'history');
    document.body.classList.toggle('subject-geography', subject === 'geography');
    document.body.classList.toggle('subject-biology', subject === 'biology');
    document.body.classList.toggle('subject-chemistry', subject === 'chemistry');
    document.querySelectorAll('.site-nav a:not(.subject-link), a.brand').forEach(function (link) {
      var href = link.getAttribute('href');
      var next = withSubject(href);
      if (next && next !== href) link.setAttribute('href', next);
    });
    document.querySelectorAll('.subject-link').forEach(function (link) {
      var on = link.getAttribute('data-subject') === subject;
      link.classList.toggle('on', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function currentChild() {
    try {
      if (window.CnmChildren && CnmChildren.current) return CnmChildren.current();
    } catch (e) { /* 没有档案也能用 */ }
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function route() {
    var hash = location.hash.replace(/^#/, '');
    if (hash.indexOf('/paper/') === 0) return { name: 'paper', id: decodeURIComponent(hash.slice('/paper/'.length)) };
    if (hash.indexOf('/edit/') === 0) return { name: 'edit', id: decodeURIComponent(hash.slice('/edit/'.length)) };
    if (hash === '/new') return { name: 'edit', id: '' };
    return { name: 'home' };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function revoke() {
    urls.forEach(function (url) { URL.revokeObjectURL(url); });
    urls = [];
  }

  function pct(n) { return (Math.max(0, Math.min(1, n)) * 100) + '%'; }

  function today() { return new Date().toISOString().slice(0, 10); }

  function blankDraft() {
    var child = currentChild();
    return {
      id: '',
      title: '',
      subject: subjectParam(),
      grade: (child && child.grade) || '',
      examDate: today(),
      score: '',
      total: '100',
      totalEdited: false,
      childId: child ? child.id : null,
      childName: child ? child.name : '',
      createdAt: '',
      pages: []
    };
  }

  function blankMark(box) {
    return {
      id: PQ.newId('w_'),
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      auto: !!box.auto,
      number: '',
      prompt: '',
      knowledge: '',
      reason: '',
      reasonNote: '',
      studentAnswer: '',
      rightAnswer: '',
      status: 'open',
      reviews: [],
      createdAt: new Date().toISOString()
    };
  }

  function boxFromPixels(box, width, height) {
    return blankMark({
      x: box.x / width,
      y: box.y / height,
      w: box.w / width,
      h: box.h / height,
      auto: true
    });
  }

  function turnCanvas(canvas, quarter) {
    var q = ((quarter % 4) + 4) % 4;
    if (!q) return canvas;
    var swap = q % 2 === 1;
    var next = document.createElement('canvas');
    next.width = swap ? canvas.height : canvas.width;
    next.height = swap ? canvas.width : canvas.height;
    var ctx = next.getContext('2d');
    ctx.translate(next.width / 2, next.height / 2);
    ctx.rotate(q * Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return next;
  }

  function drawFitted(img, maxW) {
    var scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var probe = drawFitted(img, 1024);
        var ctx = probe.getContext('2d', { willReadFrequently: true });
        var quarter = PQ.suggestRotation(ctx.getImageData(0, 0, probe.width, probe.height));
        var analysis = turnCanvas(probe, quarter);
        var actx = analysis.getContext('2d', { willReadFrequently: true });
        var marks = marksFromAnalysis(actx.getImageData(0, 0, analysis.width, analysis.height));
        var viewSrc = img.naturalWidth > 1024 ? drawFitted(img, 1600) : probe;
        var view = turnCanvas(viewSrc, quarter);
        view.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('图片无法压缩')); return; }
          resolve({
            id: PQ.newId('g_'),
            blob: blob,
            source: file,
            sourceName: file.name || '',
            sourceType: file.type || 'image/jpeg',
            width: view.width,
            height: view.height,
            marks: marks,
            sheet: marks.sheet || null,
            upright: 1,
            turned: quarter
          });
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('这张图片读不出来'));
      };
      img.src = url;
    });
  }

  function showError(err) {
    var msg = (err && err.message) || '没有完成，请再试一次。';
    root.innerHTML = '<section class="card"><h1>试卷质量分析</h1><p class="err">' + esc(msg) + '</p><p><a class="btn" href="#/">返回列表</a></p></section>';
  }

  function render() {
    revoke();
    var view = route();
    if (view.name === 'home') renderHome();
    else if (view.name === 'edit') renderEdit(view.id);
    else renderPaper(view.id);
  }

  function renderHome() {
    draft = null;
    dirty = false;
    root.innerHTML = '<section class="card"><p class="muted">正在读取错题库……</p></section>';
    PQ.loadAll().then(function (data) {
      if (route().name !== 'home') return;
      paintHome(data.papers, data.items);
    }).catch(showError);
  }

  function paintHome(papers, items) {
    var child = currentChild();
    if (child && childFilter === 'all' && !paintHome.picked) childFilter = 'child';
    var shownPapers = papers.filter(function (p) {
      return childFilter !== 'child' || !child || p.childId === child.id;
    });
    var ids = Object.create(null);
    shownPapers.forEach(function (p) { ids[p.id] = 1; });
    var shownItems = items.filter(function (it) { return ids[it.paperId]; });
    var report = PQ.analyze(shownPapers, shownItems);
    var maxKnow = report.knowledge.reduce(function (m, k) { return Math.max(m, k.total); }, 1);

    var html = '<section class="card">';
    html += '<h1>试卷质量分析</h1>';
    html += '<p class="muted">导入已批改的试卷图片。圈在答案上的算错题，同一题只记一道。旁边写了订正和原因的，能认出就填进对应栏，认不出再手写补。对勾，以及对勾上面那道表示本页有错题的划线，不记成单题。照片可以放大、缩小和旋转。</p>';
    if (child) {
      html += '<div class="row" style="margin-top:10px"><span class="tag">当前孩子：' + esc(child.name) + '</span>';
      html += '<button type="button" data-filter="child"' + (childFilter === 'child' ? ' class="primary"' : '') + '>只看这个孩子</button>';
      html += '<button type="button" data-filter="all"' + (childFilter === 'all' ? ' class="primary"' : '') + '>全部试卷</button></div>';
    }
    html += '<p class="small muted">新导入的一份默认记为' + esc(PQ.subjectLabel(subjectParam())) + (child ? '，归在「' + esc(child.name) + '」名下' : '') + '。图片和错题都不上传。</p>';
    html += '<p><a class="btn btn-primary" href="#/new">导入试卷</a></p>';
    html += '</section>';

    html += '<section class="card"><h2>质量概览</h2><div class="stats">';
    html += stat('试卷', report.paperCount, '');
    html += stat('错题', report.itemCount, 'bad');
    html += stat('待跟踪', report.open, 'shaky');
    html += stat('已掌握', report.mastered, 'ok');
    html += '</div>';
    if (report.masteryRate != null) {
      html += '<p class="small">错题收口 ' + Math.round(report.masteryRate * 100) + '%。做对后标成已掌握，这里的比例会跟着变。</p>';
    }
    html += bars('按知识点', report.knowledge.map(function (k) {
      return { label: k.name, note: k.open + ' 道待跟踪 / 共 ' + k.total, width: k.total / maxKnow };
    }));
    var maxReason = report.reasons.reduce(function (m, r) { return Math.max(m, r.count); }, 1);
    html += bars('按错因', report.reasons.map(function (r) {
      return { label: r.reason, note: r.count + ' 道', width: r.count / maxReason };
    }));
    if (report.subjects.length) {
      html += '<h3>学科</h3><ul class="pq-lines">';
      report.subjects.forEach(function (s) {
        html += '<li><b>' + esc(s.label) + '</b> ' + s.paperCount + ' 份试卷，' + s.wrong + ' 道错题，' + s.open + ' 道待跟踪</li>';
      });
      html += '</ul>';
    }
    if (report.scoreRates.length) {
      html += '<h3>得分比例</h3><ul class="pq-lines">';
      report.scoreRates.forEach(function (s) {
        html += '<li>' + esc(s.examDate || '未填日期') + ' ' + esc(s.title || '未命名试卷') + ' ' + Math.round(s.rate * 100) + '%</li>';
      });
      html += '</ul>';
    }
    html += '</section>';

    html += '<section class="card"><h2>优化方案</h2>';
    report.suggestions.forEach(function (s) {
      html += '<article class="pq-plan"><h3>' + esc(s.title) + '</h3><p>' + esc(s.detail) + '</p>';
      if (s.diagnose) html += '<p><a href="' + esc(s.diagnose) + '">' + esc(s.diagnoseLabel || '去诊断') + '</a></p>';
      html += '</article>';
    });
    html += '</section>';

    var openItems = shownItems.filter(function (it) { return it.status !== 'mastered'; });
    html += '<section class="card"><h2>持续跟踪</h2>';
    if (!openItems.length) html += '<p class="muted">没有待跟踪的错题。导入试卷并标出错题后，做对一次就在这里收口。</p>';
    openItems.slice().sort(function (a, b) { return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')); }).forEach(function (it) {
      var paper = shownPapers.filter(function (p) { return p.id === it.paperId; })[0];
      html += itemRow(it, paper);
    });
    html += '</section>';

    html += '<section class="card"><h2>试卷</h2>';
    if (!shownPapers.length) html += '<p class="muted">还没有试卷。导入一份已批改的图片即可开始。</p>';
    shownPapers.forEach(function (p) {
      var mine = items.filter(function (it) { return it.paperId === p.id; });
      var waiting = mine.filter(function (it) { return it.status !== 'mastered'; }).length;
      html += '<article class="pq-paper">';
      html += '<div class="grow"><a href="#/paper/' + encodeURIComponent(p.id) + '"><b>' + esc(p.title) + '</b></a>';
      html += '<p class="small muted">' + esc(PQ.subjectLabel(p.subject)) + (p.grade ? ' · ' + esc(p.grade) : '') + (p.examDate ? ' · ' + esc(p.examDate) : '');
      if (p.score != null && p.total) html += ' · ' + esc(p.score) + '/' + esc(p.total);
      if (p.childName) html += ' · ' + esc(p.childName);
      html += '<br>' + mine.length + ' 道错题，' + waiting + ' 道待跟踪</p></div>';
      html += '<a class="btn" href="#/paper/' + encodeURIComponent(p.id) + '">打开</a>';
      html += '</article>';
    });
    html += '</section>';
    root.innerHTML = html;
    paintHome.picked = true;
  }

  function stat(label, value, kind) {
    return '<div class="stat ' + kind + '"><b>' + esc(value) + '</b>' + esc(label) + '</div>';
  }

  function bars(title, rows) {
    if (!rows.length) return '';
    var html = '<h3>' + esc(title) + '</h3>';
    rows.forEach(function (row) {
      html += '<div class="pq-bar"><div class="pq-bar-top"><span>' + esc(row.label) + '</span><span class="small muted">' + esc(row.note) + '</span></div>';
      html += '<div class="progress"><i style="width:' + Math.round(row.width * 100) + '%"></i></div></div>';
    });
    return html;
  }

  function itemRow(it, paper) {
    var still = (it.reviews || []).filter(function (rv) { return rv.result === 'still'; }).length;
    var html = '<article class="pq-item">';
    html += '<div class="grow"><b>' + esc(it.number ? '第 ' + it.number + ' 题' : '未编号') + '</b>';
    html += ' <span class="tag ' + (it.status === 'mastered' ? 'mastered' : 'weak') + '">' + (it.status === 'mastered' ? '已掌握' : '待跟踪') + '</span>';
    html += '<p class="small">' + esc(it.prompt || '未写题目') + '</p>';
    html += '<p class="small muted">' + esc((paper && paper.title) || '试卷') + ' · ' + esc(it.knowledge || '未标知识点') + ' · ' + esc(it.reason || '其他');
    if (it.rightAnswer) html += ' · 订正 ' + esc(it.rightAnswer);
    if (it.reasonNote) html += ' · ' + esc(it.reasonNote);
    if (still) html += ' · 回看仍错 ' + still + ' 次';
    html += '</p></div><div class="row">';
    if (it.status !== 'mastered') {
      html += '<button type="button" class="good" data-act="mastered" data-id="' + esc(it.id) + '">这次做对了</button>';
      html += '<button type="button" data-act="still" data-id="' + esc(it.id) + '">还是错</button>';
    } else {
      html += '<button type="button" data-act="reopen" data-id="' + esc(it.id) + '">重新跟踪</button>';
    }
    html += '</div></article>';
    return html;
  }

  function renderEdit(id) {
    if (draft && ((id && draft.id === id) || (!id && !draft.id))) {
      paintEdit();
      return;
    }
    if (!id) {
      draft = blankDraft();
      dirty = false;
      selected = { page: 0, mark: 0 };
      paintEdit();
      return;
    }
    root.innerHTML = '<section class="card"><p class="muted">正在打开试卷……</p></section>';
    Promise.all([PQ.getPaper(id), PQ.listPages(id), PQ.loadAll()]).then(function (got) {
      var paper = got[0];
      var pages = got[1];
      var items = (got[2].items || []).filter(function (it) { return it.paperId === id; });
      if (!paper) { showError(new Error('找不到这份试卷。')); return null; }
      return straightenStored(paper, pages, items);
    }).then(function (got) {
      if (!got) return;
      var paper = got.paper;
      var pages = got.pages;
      var items = got.items;
      draft = {
        id: paper.id,
        title: paper.title,
        subject: paper.subject,
        grade: paper.grade || '',
        examDate: paper.examDate || '',
        score: paper.score == null ? '' : String(paper.score),
        total: paper.total == null || paper.total === '' ? '100' : String(paper.total),
        totalEdited: !(paper.total == null || paper.total === ''),
        childId: paper.childId,
        childName: paper.childName || '',
        createdAt: paper.createdAt,
        pages: pages.map(function (page) {
          return {
            id: page.id,
            blob: page.blob,
            source: page.source || null,
            sourceName: page.sourceName || '',
            sourceType: page.sourceType || '',
            width: page.width,
            height: page.height,
            marks: items.filter(function (it) { return it.pageId === page.id; }).map(function (it) {
              return {
                id: it.id,
                x: it.x, y: it.y, w: it.w, h: it.h, auto: !!it.auto,
                number: it.number || '', prompt: it.prompt || '', knowledge: it.knowledge || '',
                reason: it.reason || '', reasonNote: it.reasonNote || '',
                studentAnswer: it.studentAnswer || '', rightAnswer: it.rightAnswer || '',
                status: it.status || 'open', reviews: it.reviews || [], createdAt: it.createdAt
              };
            })
          };
        })
      };
      dirty = false;
      selected = { page: 0, mark: 0 };
      paintEdit();
    }).catch(showError);
  }

  function paintEdit() {
    revoke();
    var subjectOptions = SUBJECTS.map(function (s) {
      return '<option value="' + s[0] + '"' + (draft.subject === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
    var html = '<section class="card">';
    html += '<p><a href="#/">返回列表</a></p>';
    html += '<h1>' + (draft.id ? '编辑试卷' : '导入试卷') + '</h1>';
    html += '<p class="muted">选择已批改试卷的照片。照片不论横着、竖着还是倒着拍，查看时都会转正。认得出的试卷名称、年级、得分，以及错题的完整题目、知识点、孩子的答案、订正和原因会先填上，卷面没有的再补。导入后给出这份试卷的综评结论。对勾和它上方的页标划线不算单题。</p>';
    if (draft.childName) html += '<p class="small">记在「' + esc(draft.childName) + '」名下。</p>';
    html += '<div class="pq-form">';
    html += field('试卷名称', '<input id="pq-title" type="text" maxlength="40" value="' + esc(draft.title) + '" placeholder="例如：四年级期中数学">');
    html += field('学科', '<select id="pq-subject">' + subjectOptions + '</select>');
    html += field('年级', '<input id="pq-grade" type="text" maxlength="12" value="' + esc(draft.grade) + '" placeholder="四年级 / 七上">');
    html += field('考试日期', '<input id="pq-date" type="date" value="' + esc(draft.examDate) + '">');
    html += field('得分', '<input id="pq-score" type="number" min="0" step="0.5" value="' + esc(draft.score) + '">');
    html += field('满分', '<input id="pq-total" type="number" min="0" step="0.5" value="' + esc(draft.total) + '" placeholder="没有特别标注时按100">');
    html += '</div>';
    html += '<div class="row"><label class="btn btn-primary">添加试卷图片';
    html += '<input id="pq-files" class="pq-file" type="file" accept="image/*" multiple></label>';
    html += '<button type="button" id="pq-rescan"' + (draft.pages.length ? '' : ' disabled') + '>重新自动分析</button></div>';
    html += '<p id="pq-msg" class="small" role="status"></p>';
    html += '</section>';
    html += conclusionCard();

    draft.pages.forEach(function (page, pi) {
      html += '<section class="card">';
      html += '<div class="row"><h2 class="grow">第 ' + (pi + 1) + ' 页</h2>';
      html += '<button type="button" data-del-page="' + pi + '">删除此页</button></div>';
      html += '<p class="small muted">红框是自动找出的错题。点红框可改这一道，无关的删掉。漏掉的，点在题目空白处补一处。</p>';
      var marksHtml = '';
      page.marks.forEach(function (mark, mi) {
        var on = selected.page === pi && selected.mark === mi;
        marksHtml += '<button type="button" class="pq-mark' + (on ? ' on' : '') + '" data-pick="' + pi + ':' + mi + '" style="left:' + pct(mark.x) + ';top:' + pct(mark.y) + ';width:' + pct(mark.w) + ';height:' + pct(mark.h) + '" aria-label="错题 ' + (mi + 1) + '"></button>';
      });
      html += viewHtml(pi, 'e' + page.id, marksHtml);
      if (!page.marks.length) html += '<p class="muted">这一页还没有错题。点图片上的题目位置添加。</p>';
      page.marks.forEach(function (mark, mi) {
        var on = selected.page === pi && selected.mark === mi;
        html += '<article class="pq-item pq-edit' + (on ? ' on' : '') + '" data-card="' + pi + ':' + mi + '">';
        html += '<div class="row pq-head"><b class="grow">' + markHead(mark, mi) + '</b>';
        html += '<button type="button" data-del-mark="' + pi + ':' + mi + '">删除</button></div>';
        html += '<div class="pq-form">';
        html += field('题号', '<input data-bind="' + pi + ':' + mi + ':number" type="text" maxlength="12" value="' + esc(mark.number) + '" placeholder="3">');
        html += field('题目', '<textarea data-bind="' + pi + ':' + mi + ':prompt" rows="6" maxlength="1200" placeholder="认不出完整题目时再补">' + esc(mark.prompt) + '</textarea>', true);
        html += field('知识点', '<input data-bind="' + pi + ':' + mi + ':knowledge" type="text" maxlength="24" value="' + esc(mark.knowledge) + '" placeholder="例如：分数加减">');
        html += field('订正结果', '<input data-bind="' + pi + ':' + mi + ':rightAnswer" type="text" maxlength="40" value="' + esc(mark.rightAnswer) + '" placeholder="没读到订正时再补">');
        html += field('原因分析', '<input data-bind="' + pi + ':' + mi + ':reasonNote" type="text" maxlength="80" value="' + esc(mark.reasonNote) + '" placeholder="没读到原因时再补">', true);
        html += field('错因', '<select data-bind="' + pi + ':' + mi + ':reason">' +
          '<option value=""' + (mark.reason ? '' : ' selected') + '>未判断</option>' +
          REASONS.map(function (r) {
            return '<option value="' + r + '"' + (mark.reason === r ? ' selected' : '') + '>' + r + '</option>';
          }).join('') + '</select>');
        html += field('孩子的答案', '<input data-bind="' + pi + ':' + mi + ':studentAnswer" type="text" maxlength="40" value="' + esc(mark.studentAnswer) + '">');
        html += '</div></article>';
      });
      html += '</section>';
    });

    html += '<div class="pq-savebar"><button type="button" class="primary" id="pq-save"' + (draft.pages.length ? '' : ' disabled') + '>保存到错题库</button>';
    html += '<a class="btn" href="#/">取消</a></div>';
    root.innerHTML = html;
    draft.pages.forEach(function (page, pi) {
      var img = root.querySelector('img[data-img="' + pi + '"]');
      if (!img || !page.blob) return;
      var url = URL.createObjectURL(page.blob);
      urls.push(url);
      img.src = url;
    });
  }

  function draftMarks() {
    var marks = [];
    if (!draft) return marks;
    draft.pages.forEach(function (page) {
      page.marks.forEach(function (mark) { marks.push(mark); });
    });
    return marks;
  }

  function examSummary() {
    if (!draft || !draft.pages.length) return null;
    return PQ.summarizeExam({
      title: draft.title,
      grade: draft.grade,
      score: draft.score,
      total: draft.total,
      subject: draft.subject
    }, draftMarks());
  }

  function conclusionCard() {
    var summary = examSummary();
    if (!summary || !summary.text) return '';
    return '<section class="card"><h2>' + esc(summary.title || '综评结论') + '</h2><p id="pq-conclusion" class="pq-conclusion">' + esc(summary.text) + '</p></section>';
  }

  function refreshConclusion() {
    var el = document.getElementById('pq-conclusion');
    if (!el) return;
    var summary = examSummary();
    el.textContent = summary && summary.text || '';
  }

  function zoomOf(key) {
    var z = zooms[key];
    if (!(z >= 1)) return 1;
    return z > 4 ? 4 : z;
  }

  function toolButton(attrs, label, svg) {
    return '<button type="button" ' + attrs + ' aria-label="' + label + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + svg + '</svg></button>';
  }

  function viewHtml(pi, key, marksHtml) {
    var z = zoomOf(key);
    return '<div class="pq-view" data-page="' + pi + '" data-zoom-key="' + esc(key) + '">' +
      '<div class="pq-viewport"><div class="pq-stage" data-page="' + pi + '" style="width:' + (z * 100) + '%">' +
      '<img alt="试卷第 ' + (pi + 1) + ' 页" data-img="' + pi + '" draggable="false">' +
      marksHtml +
      '</div></div>' +
      '<div class="pq-tools" role="group" aria-label="查看图片">' +
      toolButton('data-zoom="out"', '缩小', '<circle cx="10.2" cy="10.2" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14.6 14.6 20 20M7.4 10.2h5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
      toolButton('data-zoom="reset"', '还原', '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
      toolButton('data-zoom="in"', '放大', '<circle cx="10.2" cy="10.2" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14.6 14.6 20 20M7.4 10.2h5.6M10.2 7.4v5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
      toolButton('data-turn="-1"', '左转', '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      toolButton('data-turn="1"', '右转', '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      '</div></div>';
  }

  function marksFromAnalysis(image) {
    var found = PQ.analyzePage(image);
    var marks = found.map(function (q) {
      var mark = boxFromPixels(q, image.width, image.height);
      mark.number = q.number || '';
      mark.prompt = q.prompt || '';
      mark.knowledge = q.knowledge || '';
      mark.reason = q.reason || '';
      mark.reasonNote = q.reasonNote || '';
      mark.studentAnswer = q.studentAnswer || '';
      mark.rightAnswer = q.correction || '';
      mark.kind = q.kind || '';
      return mark;
    });
    marks.sheet = found.sheet || null;
    return marks;
  }

  function applySheet(sheet) {
    if (!sheet || !draft) return;
    if (!String(draft.title || '').trim() && sheet.title) draft.title = sheet.title;
    if (!String(draft.grade || '').trim() && sheet.grade) draft.grade = sheet.grade;
    if (String(draft.score == null ? '' : draft.score).trim() === '' && sheet.score) draft.score = sheet.score;
    if (!draft.totalEdited && sheet.total) draft.total = String(sheet.total);
    if (String(draft.total == null ? '' : draft.total).trim() === '') draft.total = '100';
  }

  function applyZoom(view, next) {
    var key = view.getAttribute('data-zoom-key');
    var prev = zoomOf(key);
    var z = Math.max(1, Math.min(4, next));
    zooms[key] = z;
    var stage = view.querySelector('.pq-stage');
    if (stage) stage.style.width = (z * 100) + '%';
    return { prev: prev, next: z };
  }

  function markHead(mark, mi) {
    var parts = [mark.auto ? '自动识别' : '手动补标'];
    if (mark.number) parts.push('第 ' + mark.number + ' 题');
    else parts.push(String(mi + 1));
    if (mark.kind) parts.push(mark.kind);
    if (mark.rightAnswer) parts.push('订正 ' + mark.rightAnswer);
    if (mark.reasonNote) parts.push(mark.reasonNote);
    return esc(parts.join(' · '));
  }

  function field(label, control, wide) {
    return '<label class="pq-field' + (wide ? ' wide' : '') + '"><span>' + label + '</span>' + control + '</label>';
  }

  function readMeta() {
    var title = root.querySelector('#pq-title');
    if (!title) return;
    draft.title = title.value;
    draft.subject = root.querySelector('#pq-subject').value;
    draft.grade = root.querySelector('#pq-grade').value;
    draft.examDate = root.querySelector('#pq-date').value;
    draft.score = root.querySelector('#pq-score').value;
    draft.total = root.querySelector('#pq-total').value;
  }

  function renderPaper(id) {
    draft = null;
    dirty = false;
    root.innerHTML = '<section class="card"><p class="muted">正在打开试卷……</p></section>';
    Promise.all([PQ.getPaper(id), PQ.listPages(id), PQ.loadAll()]).then(function (got) {
      var paper = got[0];
      if (!paper) { showError(new Error('找不到这份试卷。')); return null; }
      if (route().name !== 'paper') return null;
      var items = (got[2].items || []).filter(function (it) { return it.paperId === id; });
      return straightenStored(paper, got[1], items);
    }).then(function (got) {
      if (!got || route().name !== 'paper') return;
      paintPaper(got.paper, got.pages, got.items);
    }).catch(showError);
  }

  function paintPaper(paper, pages, items) {
    shown = { paper: paper, pages: pages, items: items };
    revoke();
    var report = PQ.analyze([paper], items);
    var html = '<section class="card"><p><a href="#/">返回列表</a></p>';
    html += '<h1>' + esc(paper.title) + '</h1>';
    html += '<p class="muted">' + esc(PQ.subjectLabel(paper.subject)) + (paper.grade ? ' · ' + esc(paper.grade) : '') + (paper.examDate ? ' · ' + esc(paper.examDate) : '');
    if (paper.score != null && paper.total) html += ' · ' + esc(paper.score) + '/' + esc(paper.total);
    if (paper.childName) html += ' · ' + esc(paper.childName);
    html += '</p>';
    html += '<div class="stats">' + stat('错题', items.length, 'bad') + stat('待跟踪', report.open, 'shaky') + stat('已掌握', report.mastered, 'ok') + '</div>';
    var summary = items.length ? PQ.summarizeExam(paper, items) : null;
    if (summary && summary.text) html += '<h2>综评结论</h2><p class="pq-conclusion">' + esc(summary.text) + '</p>';
    html += '<div class="row"><a class="btn btn-primary" href="#/edit/' + encodeURIComponent(paper.id) + '">修改错题</a>';
    html += '<button type="button" id="pq-delete" data-id="' + esc(paper.id) + '">删除这份试卷</button></div>';
    if (report.suggestions[0]) html += '<article class="pq-plan"><h3>' + esc(report.suggestions[0].title) + '</h3><p>' + esc(report.suggestions[0].detail) + '</p></article>';
    html += '</section>';
    pages.forEach(function (page, pi) {
      var mine = items.filter(function (it) { return it.pageId === page.id; });
      html += '<section class="card"><h2>第 ' + (pi + 1) + ' 页</h2>';
      var marksHtml = '';
      mine.forEach(function (mark) {
        marksHtml += '<span class="pq-mark static' + (mark.status === 'mastered' ? ' done' : '') + '" style="left:' + pct(mark.x || 0) + ';top:' + pct(mark.y || 0) + ';width:' + pct(mark.w || 0.08) + ';height:' + pct(mark.h || 0.05) + '"></span>';
      });
      html += viewHtml(pi, 'v' + page.id, marksHtml);
      mine.forEach(function (it) { html += itemRow(it, paper); });
      if (!mine.length) html += '<p class="muted">这一页没有记下错题。</p>';
      html += '</section>';
    });
    root.innerHTML = html;
    pages.forEach(function (page, pi) {
      var img = root.querySelector('img[data-img="' + pi + '"]');
      if (!img || !page.blob) return;
      var url = URL.createObjectURL(page.blob);
      urls.push(url);
      img.src = url;
    });
  }

  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    var room = 12 - draft.pages.length;
    if (room <= 0) {
      setMsg('一份试卷最多 12 页。');
      return;
    }
    if (list.length > room) {
      list = list.slice(0, room);
      setMsg('超出的图片没有加入，一份最多 12 页。');
    } else setMsg('正在读取图片并自动分析错题……');
    Promise.all(list.map(readImage)).then(function (pages) {
      readMeta();
      pages.forEach(function (page) {
        draft.pages.push(page);
        applySheet(page.sheet);
      });
      dirty = true;
      selected = { page: draft.pages.length - pages.length, mark: 0 };
      var found = 0;
      var noted = 0;
      pages.forEach(function (page) {
        page.marks.forEach(function (mark) {
          found++;
          if (mark.rightAnswer || mark.reasonNote) noted++;
        });
      });
      paintEdit();
      var turned = pages.some(function (page) { return page.turned; });
      var head = turned ? '照片已转正。' : '';
      setMsg(found
        ? head + '已自动记下 ' + found + ' 道错题' + (noted ? '，其中 ' + noted + ' 道填上了订正或原因' : '') + '。综评结论写在上方。核对红框和下面的栏，多出来的删掉，漏掉的点在题目上补一处。'
        : head + '这几页上没有看出来的批改笔迹。点在错题位置即可补上，补上后综评会跟着写出来。');
    }).catch(function (err) {
      setMsg((err && err.message) || '图片没有读出来。');
    });
  }

  function setMsg(text) {
    var el = document.getElementById('pq-msg');
    if (el) el.textContent = text;
  }

  function overlapsMark(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function rescan() {
    readMeta();
    setMsg('正在自动分析错题……');
    var jobs = draft.pages.map(function (page) {
      return blobMarks(page.blob).then(function (marks) {
        var kept = page.marks.filter(function (mark) {
          return !mark.auto || mark.knowledge || mark.studentAnswer || mark.rightAnswer;
        });
        var fresh = marks.filter(function (mark) {
          return !kept.some(function (old) { return overlapsMark(old, mark); });
        });
        page.marks = fresh.concat(kept);
        applySheet(marks.sheet);
      });
    });
    Promise.all(jobs).then(function () {
      dirty = true;
      paintEdit();
      var n = draft.pages.reduce(function (sum, page) {
        return sum + page.marks.filter(function (mark) { return mark.auto; }).length;
      }, 0);
      setMsg('自动分析完成，现在有 ' + n + ' 道自动识别的错题。已经填过知识点或答案的保留着。');
    }).catch(function (err) {
      setMsg((err && err.message) || '自动分析没有完成。');
    });
  }

  function blobMarks(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = drawFitted(img, 1024);
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        var marks = marksFromAnalysis(ctx.getImageData(0, 0, canvas.width, canvas.height));
        URL.revokeObjectURL(url);
        resolve(marks);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片无法重新检测'));
      };
      img.src = url;
    });
  }

  function saveDraft() {
    readMeta();
    var score = PQ.num(draft.score);
    var total = PQ.num(draft.total);
    if (score != null && total != null && score > total) {
      setMsg('得分不能高于满分。');
      return;
    }
    if (!draft.pages.length) {
      setMsg('先添加至少一页试卷图片。');
      return;
    }
    var paper = {
      id: draft.id || PQ.newId('p_'),
      title: draft.title.trim() || (PQ.subjectLabel(draft.subject) + (draft.examDate ? ' ' + draft.examDate : '') + ' 试卷'),
      subject: draft.subject,
      grade: draft.grade,
      examDate: draft.examDate,
      score: draft.score,
      total: draft.total,
      childId: draft.childId,
      childName: draft.childName,
      createdAt: draft.createdAt || new Date().toISOString()
    };
    var pages = [];
    var items = [];
    draft.pages.forEach(function (page, pi) {
      pages.push({
        id: page.id,
        paperId: paper.id,
        order: pi,
        blob: page.blob,
        source: page.source || null,
        sourceName: page.sourceName || '',
        sourceType: page.sourceType || '',
        width: page.width,
        height: page.height,
        upright: 1
      });
      page.marks.forEach(function (mark, mi) {
        var prompt = String(mark.prompt || '').trim();
        var number = String(mark.number || '').trim();
        var knowledge = String(mark.knowledge || '').trim();
        if (!prompt && !number && !knowledge) prompt = '第 ' + (mi + 1) + ' 处' + (mark.auto ? '红笔' : '标记');
        items.push({
          id: mark.id || PQ.newId('w_'),
          paperId: paper.id,
          pageId: page.id,
          x: mark.x, y: mark.y, w: mark.w, h: mark.h, auto: !!mark.auto,
          number: number,
          prompt: prompt,
          knowledge: knowledge,
          reason: REASONS.indexOf(mark.reason) >= 0 ? mark.reason : '',
          reasonNote: String(mark.reasonNote || '').trim(),
          studentAnswer: String(mark.studentAnswer || '').trim(),
          rightAnswer: String(mark.rightAnswer || '').trim(),
          status: mark.status === 'mastered' ? 'mastered' : 'open',
          reviews: mark.reviews || [],
          createdAt: mark.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
    });
    paper.summary = PQ.summarizeExam(paper, items).text;
    setMsg('正在写入错题库……');
    PQ.savePaper({ paper: paper, pages: pages, items: items }).then(function (saved) {
      dirty = false;
      go('#/paper/' + encodeURIComponent(saved.id));
    }).catch(function (err) {
      setMsg((err && err.message) || '没有写入数据库。');
    });
  }

  function orientBlob(blob) {
    return loadBitmap(blob).then(function (img) {
      var probe = drawFitted(img, 1024);
      var ctx = probe.getContext('2d', { willReadFrequently: true });
      var quarter = PQ.suggestRotation(ctx.getImageData(0, 0, probe.width, probe.height));
      if (!quarter) return null;
      return rotateBlob(blob, quarter).then(function (next) {
        if (next) next.quarter = quarter;
        return next;
      });
    });
  }

  function straightenStored(paper, pages, items) {
    var changed = false;
    return Promise.all((pages || []).map(function (page) {
      if (!page || page.upright || !page.blob) return;
      return orientBlob(page.blob).then(function (next) {
        page.upright = 1;
        changed = true;
        if (!next) return;
        page.blob = next.blob;
        page.width = next.width;
        page.height = next.height;
        (items || []).forEach(function (it) {
          if (it.pageId === page.id) spinBox(it, next.quarter);
        });
      });
    })).then(function () {
      if (!changed) return { paper: paper, pages: pages, items: items };
      return PQ.savePaper({ paper: paper, pages: pages, items: items }).then(function () {
        return { paper: paper, pages: pages, items: items };
      });
    });
  }

  function loadBitmap(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片无法旋转')); };
      img.src = url;
    });
  }

  function rotateBlob(blob, quarter) {
    var q = ((quarter % 4) + 4) % 4;
    if (!q) return Promise.resolve(null);
    return loadBitmap(blob).then(function (img) {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var canvas = document.createElement('canvas');
      var swap = q % 2 === 1;
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      var ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(q * Math.PI / 2);
      ctx.drawImage(img, -w / 2, -h / 2);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (out) {
          if (!out) { reject(new Error('旋转后的图片没有生成')); return; }
          resolve({ blob: out, width: canvas.width, height: canvas.height });
        }, 'image/jpeg', 0.86);
      });
    });
  }

  function spinBox(box, quarter) {
    var next = PQ.rotateBox(box, quarter);
    box.x = next.x;
    box.y = next.y;
    box.w = next.w;
    box.h = next.h;
  }

  function turnDraft(pi, quarter) {
    if (turning) return;
    var page = draft && draft.pages[pi];
    if (!page || !page.blob) return;
    readMeta();
    turning = true;
    setMsg('正在旋转……');
    rotateBlob(page.blob, quarter).then(function (next) {
      page.blob = next.blob;
      page.width = next.width;
      page.height = next.height;
      page.marks.forEach(function (mark) { spinBox(mark, quarter); });
      dirty = true;
      turning = false;
      paintEdit();
      setMsg('已旋转。错题框跟着照片一起转了。');
    }).catch(function (err) {
      turning = false;
      setMsg((err && err.message) || '没有转成。');
    });
  }

  function turnShown(pi, quarter) {
    if (turning || !shown) return;
    var page = shown.pages[pi];
    if (!page || !page.blob) return;
    turning = true;
    rotateBlob(page.blob, quarter).then(function (next) {
      page.blob = next.blob;
      page.width = next.width;
      page.height = next.height;
      shown.items.forEach(function (item) {
        if (item.pageId === page.id) spinBox(item, quarter);
      });
      return PQ.savePaper({ paper: shown.paper, pages: shown.pages, items: shown.items });
    }).then(function () {
      turning = false;
      paintPaper(shown.paper, shown.pages, shown.items);
    }).catch(function (err) {
      turning = false;
      showError(err);
    });
  }

  function review(id, result) {
    PQ.loadAll().then(function (data) {
      var item = data.items.filter(function (it) { return it.id === id; })[0];
      if (!item) return;
      item.reviews = item.reviews || [];
      if (result === 'reopen') {
        item.status = 'open';
      } else {
        item.reviews.push({ at: new Date().toISOString(), result: result });
        item.status = result === 'mastered' ? 'mastered' : 'open';
      }
      return PQ.updateItem(item);
    }).then(function () { render(); }).catch(showError);
  }

  root.addEventListener('click', function (e) {
    var filter = e.target.closest('[data-filter]');
    if (filter) {
      childFilter = filter.getAttribute('data-filter');
      paintHome.picked = true;
      renderHome();
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act) {
      review(act.getAttribute('data-id'), act.getAttribute('data-act'));
      return;
    }
    var del = e.target.closest('#pq-delete');
    if (del) {
      var id = del.getAttribute('data-id');
      if (!confirm('删除这份试卷和其中的错题？图片也会从这台浏览器的数据库里去掉。')) return;
      PQ.deletePaper(id).then(function () { go('#/'); }).catch(showError);
      return;
    }
    var zoomBtn = e.target.closest('[data-zoom]');
    if (zoomBtn) {
      var view = zoomBtn.closest('.pq-view');
      if (!view) return;
      var viewport = view.querySelector('.pq-viewport');
      var cur = zoomOf(view.getAttribute('data-zoom-key'));
      var act = zoomBtn.getAttribute('data-zoom');
      applyZoom(view, act === 'in' ? cur * 1.25 : act === 'out' ? cur / 1.25 : 1);
      if (act === 'reset' && viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
      return;
    }
    var turnBtn = e.target.closest('[data-turn]');
    if (turnBtn) {
      var pageIndex = Number(turnBtn.closest('.pq-view').getAttribute('data-page'));
      var quarter = Number(turnBtn.getAttribute('data-turn'));
      if (draft) turnDraft(pageIndex, quarter);
      else turnShown(pageIndex, quarter);
      return;
    }
    if (!draft) return;
    if (e.target.closest('#pq-save')) { saveDraft(); return; }
    if (e.target.closest('#pq-rescan')) { rescan(); return; }
    var delPage = e.target.closest('[data-del-page]');
    if (delPage) {
      readMeta();
      draft.pages.splice(Number(delPage.getAttribute('data-del-page')), 1);
      dirty = true;
      selected = { page: 0, mark: 0 };
      paintEdit();
      return;
    }
    var delMark = e.target.closest('[data-del-mark]');
    if (delMark) {
      readMeta();
      var pair = delMark.getAttribute('data-del-mark').split(':');
      draft.pages[Number(pair[0])].marks.splice(Number(pair[1]), 1);
      dirty = true;
      selected = { page: Number(pair[0]), mark: 0 };
      paintEdit();
      return;
    }
    var pick = e.target.closest('[data-pick]');
    if (pick) {
      var picked = pick.getAttribute('data-pick').split(':');
      selected = { page: Number(picked[0]), mark: Number(picked[1]) };
      readMeta();
      paintEdit();
      var card = root.querySelector('[data-card="' + pick.getAttribute('data-pick') + '"]');
      if (card) card.scrollIntoView({ block: 'nearest' });
      return;
    }
    var stage = e.target.closest('.pq-stage');
    if (stage && e.target.tagName === 'IMG') {
      if (moved) { moved = false; return; }
      var img = e.target;
      var rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = (e.clientX - rect.left) / rect.width;
      var y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;
      var pi = Number(stage.getAttribute('data-page'));
      if (draft.pages[pi].marks.length >= 40) {
        setMsg('一页最多记下 40 道错题。');
        return;
      }
      readMeta();
      var mark = blankMark({
        x: Math.max(0, x - 0.06),
        y: Math.max(0, y - 0.03),
        w: 0.12,
        h: 0.06,
        auto: false
      });
      if (mark.x + mark.w > 1) mark.x = 1 - mark.w;
      if (mark.y + mark.h > 1) mark.y = 1 - mark.h;
      draft.pages[pi].marks.push(mark);
      selected = { page: pi, mark: draft.pages[pi].marks.length - 1 };
      dirty = true;
      paintEdit();
    }
  });

  var pointer = null;
  root.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var viewport = e.target.closest('.pq-viewport');
    if (!viewport || e.target.closest('button')) return;
    var view = viewport.closest('.pq-view');
    pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sl: viewport.scrollLeft,
      st: viewport.scrollTop,
      viewport: viewport,
      key: view.getAttribute('data-zoom-key')
    };
    moved = false;
  });
  root.addEventListener('pointermove', function (e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    var dx = e.clientX - pointer.x;
    var dy = e.clientY - pointer.y;
    if (dx * dx + dy * dy > 16 && zoomOf(pointer.key) > 1) {
      moved = true;
      pointer.viewport.scrollLeft = pointer.sl - dx;
      pointer.viewport.scrollTop = pointer.st - dy;
    }
  });
  root.addEventListener('pointerup', function (e) {
    if (pointer && e.pointerId === pointer.id) pointer = null;
  });
  root.addEventListener('pointercancel', function () { pointer = null; });
  root.addEventListener('wheel', function (e) {
    var viewport = e.target.closest('.pq-viewport');
    if (!viewport) return;
    var view = viewport.closest('.pq-view');
    var cur = zoomOf(view.getAttribute('data-zoom-key'));
    var nextZoom = cur * (e.deltaY > 0 ? 0.92 : 1.08);
    if (nextZoom < 1 && cur <= 1) return;
    e.preventDefault();
    var rect = viewport.getBoundingClientRect();
    var ox = e.clientX - rect.left + viewport.scrollLeft;
    var oy = e.clientY - rect.top + viewport.scrollTop;
    var applied = applyZoom(view, nextZoom);
    var scale = applied.prev ? applied.next / applied.prev : 1;
    viewport.scrollLeft = ox * scale - (e.clientX - rect.left);
    viewport.scrollTop = oy * scale - (e.clientY - rect.top);
  }, { passive: false });

  root.addEventListener('change', function (e) {
    if (e.target.id === 'pq-files') {
      addFiles(e.target.files);
      e.target.value = '';
      return;
    }
    if (!draft) return;
    var bind = e.target.getAttribute('data-bind');
    if (!bind) {
      if (e.target.id && e.target.id.indexOf('pq-') === 0) {
        if (e.target.id === 'pq-total') draft.totalEdited = true;
        readMeta();
        dirty = true;
        refreshConclusion();
      }
      return;
    }
    var parts = bind.split(':');
    draft.pages[Number(parts[0])].marks[Number(parts[1])][parts[2]] = e.target.value;
    dirty = true;
    refreshConclusion();
  });

  root.addEventListener('input', function (e) {
    if (!draft) return;
    var bind = e.target.getAttribute('data-bind');
    if (bind) {
      var parts = bind.split(':');
      draft.pages[Number(parts[0])].marks[Number(parts[1])][parts[2]] = e.target.value;
      dirty = true;
      refreshConclusion();
      return;
    }
    if (e.target.id && e.target.id.indexOf('pq-') === 0) {
      if (e.target.id === 'pq-total') draft.totalEdited = true;
      readMeta(); dirty = true; refreshConclusion();
    }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  applyChrome();
  if (!location.hash) location.hash = '#/';
  render();
})();
