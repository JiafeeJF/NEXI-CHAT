/**
 * Bilibili 渲染器
 */
const BiliRenderer = {
  // 提取 BV 号
  extractBV: (url) => url.match(/BV[a-zA-Z0-9]+/)?.[0],

  /**
   * 获取 iframe 字符串
   * @param {string} url - 视频链接或 BV 号
   * @param {object} params - 官方支持的参数 (autoplay, danmaku, p, t 等)
   */
  getHtml(url, params = {}) {
    const bvid = this.extractBV(url);
    if (!bvid) return '';

    // 默认参数与用户参数合并
    const config = {
      bvid,
      high_quality: 1,
      danmaku: 1, // 默认开启弹幕
      autoplay: 0,
      ...params
    };

    // 构建 QueryString
    const query = new URLSearchParams(config).toString();
    const src = `//player.bilibili.com/player.html?${query}`;

    // 返回官方标准 iframe 字符串
    const iframeString = `<iframe src="${src}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width:100%; aspect-ratio:16/9;"></iframe>`;

    return iframeString;
  },

  /**
   * 返回 DOM 节点版本的 iframe，便于直接 appendChild
   */
  getElement(url, params = {}) {
    const html = this.getHtml(url, params);
    if (!html) return null;
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }
};

// 导出到全局，便于页面直接使用
window.BiliRenderer = BiliRenderer;