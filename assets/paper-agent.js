/* 可选的视觉模型直连通道。默认关闭：只有用户显式开启、自己填好端点，
 * 并确认照片会离开本机之后，才会把试卷照片发给模型。
 * 主链路是「导出请求包 → Agent 分析 → 导入结果」，此文件只是可选加速方式。
 * window.CnmPaperAgent；浏览器与 Node 共用（Node 测试可注入 fetch）。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CnmPaperAgent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONFIG_KEY = 'cnmPaperAgent.v1';
  var DEFAULT_CONFIG = {
    enabled: false,
    endpoint: '',
    model: '',
    apiKey: '',
    timeoutMs: 90000,
    jsonMode: false
  };

  var SYSTEM_PROMPT = '你是一个严谨的试卷分析助手。只依据照片上能看清的内容作答，' +
    '读不清的字段留空，不编造题目、答案或分数。输出必须是一个 JSON 对象，' +
    '不要 Markdown 代码块，不要附加解释。字段格式以用户消息里的 instructions 为准。';

  var memoryConfig = null;

  function storage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* 隐私模式下不可用 */ }
    return null;
  }

  function loadConfig() {
    var cfg = {}, k;
    for (k in DEFAULT_CONFIG) if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k)) cfg[k] = DEFAULT_CONFIG[k];
    var store = storage();
    var raw = store ? store.getItem(CONFIG_KEY) : memoryConfig;
    if (!raw) return cfg;
    try {
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        for (k in DEFAULT_CONFIG) {
          if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k) && saved[k] != null) cfg[k] = saved[k];
        }
      }
    } catch (e) { /* 配置损坏时用默认值 */ }
    return cfg;
  }

  function saveConfig(next) {
    var cfg = loadConfig(), k;
    for (k in DEFAULT_CONFIG) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k) && next && next[k] != null) cfg[k] = next[k];
    }
    var raw = JSON.stringify(cfg);
    var store = storage();
    if (store) store.setItem(CONFIG_KEY, raw);
    else memoryConfig = raw;
    return cfg;
  }

  function endpointUrl(endpoint) {
    var s = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!s) return '';
    if (/\/chat\/completions$/i.test(s)) return s;
    return s + '/chat/completions';
  }

  function buildRequestBody(request, cfg) {
    var content = [{ type: 'text', text: String(request && request.instructions || '').trim() || '请分析这份试卷。' }];
    var withImage = 0;
    ((request && request.pages) || []).forEach(function (page) {
      if (!page.image) return;
      content.push({ type: 'text', text: '下面是第 ' + (Number(page.index) + 1) + ' 页照片' + (page.imageName ? '（' + page.imageName + '）' : '') + '。' });
      content.push({ type: 'image_url', image_url: { url: page.image } });
      withImage++;
    });
    var body = {
      model: String(cfg.model || '').trim(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: content }
      ],
      temperature: 0.2
    };
    if (cfg.jsonMode) body.response_format = { type: 'json_object' };
    return { body: body, imageCount: withImage };
  }

  function messageText(message) {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content.map(function (part) {
        return part && (part.text || (part.type === 'text' ? part.text : '')) || '';
      }).join('\n');
    }
    return '';
  }

  /* 返回 {raw, result, imageCount}。result 只是解析出的对象，
   * 结构与字段仍由 CnmPapers.validateAgentResult 统一校验。 */
  function analyze(request, cfg, fetchImpl) {
    cfg = cfg || loadConfig();
    if (!cfg.enabled) return Promise.reject(new Error('直连分析没有开启。请先在设置里打开开关。'));
    var url = endpointUrl(cfg.endpoint);
    if (!url) return Promise.reject(new Error('请填写模型服务地址。'));
    if (!String(cfg.model || '').trim()) return Promise.reject(new Error('请填写模型名称。'));
    var built = buildRequestBody(request, cfg);
    if (!built.imageCount) return Promise.reject(new Error('请求包里没有照片。请勾选「附带照片」再导出或发送。'));
    var doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return Promise.reject(new Error('这个环境不能发起网络请求。'));

    var headers = { 'Content-Type': 'application/json' };
    if (String(cfg.apiKey || '').trim()) headers.Authorization = 'Bearer ' + String(cfg.apiKey).trim();
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    var timeout = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 90000;
    var init = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(built.body)
    };
    if (controller) init.signal = controller.signal;

    var pending = doFetch(url, init).then(function (response) {
      if (!response || !response.ok) {
        var status = response ? response.status : 0;
        return (response && typeof response.text === 'function' ? response.text() : Promise.resolve('')).then(function (text) {
          throw new Error('模型服务返回 ' + status + (text ? '：' + String(text).slice(0, 200) : ''));
        });
      }
      return response.json();
    }).then(function (payload) {
      var text = payload && Array.isArray(payload.choices) && payload.choices[0]
        ? messageText(payload.choices[0].message) : '';
      if (!String(text).trim()) throw new Error('模型没有返回内容。');
      var parsed;
      try {
        parsed = typeof text === 'string' ? JSON.parse(text) : text;
      } catch (e) {
        var first = String(text).indexOf('{'), last = String(text).lastIndexOf('}');
        if (first < 0 || last <= first) throw new Error('模型回复不是 JSON，请把结果保存为文件后用「导入 Agent 结果」导入。');
        parsed = JSON.parse(String(text).slice(first, last + 1));
      }
      return { raw: text, result: parsed, imageCount: built.imageCount };
    });

    if (controller && typeof setTimeout === 'function') {
      timer = setTimeout(function () { controller.abort(); }, timeout);
      pending = pending.catch(function (err) {
        if (err && err.name === 'AbortError') throw new Error('模型请求超时，可以调大超时时间或改用导出请求包。');
        throw err;
      });
    }
    return pending.then(function (out) {
      if (timer) clearTimeout(timer);
      return out;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  return {
    CONFIG_KEY: CONFIG_KEY,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    endpointUrl: endpointUrl,
    buildRequestBody: buildRequestBody,
    analyze: analyze
  };
});
