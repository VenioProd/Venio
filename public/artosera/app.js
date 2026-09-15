(function () {
  function fit() {
    document.querySelectorAll('.screen, .frame').forEach(function (box) {
      var f = box.querySelector('iframe');
      if (!f) return;
      var w = parseInt(box.dataset.w || f.dataset.w || 1400, 10);
      var ratio = box.clientWidth / w;
      f.style.width = w + 'px';
      f.style.height = Math.ceil(box.clientHeight / ratio) + 'px';
      f.style.transform = 'scale(' + ratio + ')';
    });
  }
  window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  fit();
})();
