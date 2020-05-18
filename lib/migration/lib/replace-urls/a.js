const { isEligible, assetify } = require('./utils');

module.exports = (document) => {
  const a = document.querySelectorAll('a[href]');

  a.forEach(el => {
    if (!isEligible(el.href)) return;

    if (/\/assets\//.test(el.href)) {
      el.href = assetify(el.href);
    }
  });
};
