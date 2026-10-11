/**
 * The download dialog: «دانلود» in the header opens it; it lists the downloads per system.
 * Nothing is requested until the user clicks a file link — the dialog itself loads nothing.
 * The macOS link is a same-folder file (downloads/Finglish.dmg) with the `download` attribute, so the browser saves it
 * instead of navigating to it; the page the user is on never changes.
 */
(function () {
  'use strict';
  const dialog = document.getElementById('dl'), button = document.getElementById('dl-open');
  if (!dialog || !button) return;
  const open = () => { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); };
  button.addEventListener('click', open);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });          // a click on the dimmed area closes it
  dialog.querySelectorAll('a[download]').forEach(a => a.addEventListener('click', () => setTimeout(() => dialog.close(), 250)));
})();
