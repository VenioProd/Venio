(function () {
    var champs = document.querySelectorAll('#etapes [contenteditable]');
    var cle = 'venio-preuves-prochaines-etapes';
    var sauvegarde = {};
    try { sauvegarde = JSON.parse(localStorage.getItem(cle) || '{}'); } catch (e) {}
    champs.forEach(function (champ, i) {
      if (sauvegarde[i]) champ.textContent = sauvegarde[i];
      champ.addEventListener('input', function () {
        var donnees = {};
        champs.forEach(function (c, j) { if (c.textContent.trim()) donnees[j] = c.textContent; });
        try { localStorage.setItem(cle, JSON.stringify(donnees)); } catch (e) {}
      });
      champ.addEventListener('paste', function (e) {
        e.preventDefault();
        document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
      });
    });
  })();
