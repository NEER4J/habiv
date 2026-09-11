// Minimal canvas loop: click to start a run, survive 15 s of orbiting dots.
(function () {
  var c = document.getElementById('c'), x = c.getContext('2d'), t0 = 0, running = false, dead = false;
  var player = { x: 240, y: 160 }, dots = [];
  for (var i = 0; i < 6; i++) dots.push({ a: Math.random() * 6.28, r: 60 + i * 30, s: 0.5 + Math.random() });
  c.addEventListener('pointermove', function (e) { var b = c.getBoundingClientRect(); player.x = (e.clientX - b.left) * (480 / b.width); player.y = (e.clientY - b.top) * (320 / b.height); });
  c.addEventListener('pointerdown', function () { if (!running) { running = true; dead = false; t0 = performance.now(); if (window.Habiv) Habiv.runStart(); } });
  function frame(now) {
    x.fillStyle = '#000'; x.fillRect(0, 0, 480, 320);
    var el = running ? (now - t0) / 1000 : 0;
    dots.forEach(function (d) { d.a += 0.01 * d.s; var dx = 240 + Math.cos(d.a) * d.r, dy = 160 + Math.sin(d.a) * d.r; x.fillStyle = '#7ed08a'; x.beginPath(); x.arc(dx, dy, 8, 0, 6.28); x.fill();
      if (running && Math.hypot(dx - player.x, dy - player.y) < 14) { running = false; dead = true; if (window.Habiv) Habiv.runEnd({ outcome: 'fail', score: Math.floor(el * 100) }); } });
    x.fillStyle = '#fff'; x.beginPath(); x.arc(player.x, player.y, 6, 0, 6.28); x.fill();
    x.font = '14px monospace'; x.fillText(running ? el.toFixed(1) + 's' : (dead ? 'dead · click to retry' : 'click to start'), 10, 20);
    if (running && el >= 15) { running = false; if (window.Habiv) { Habiv.beatGame(); Habiv.runEnd({ outcome: 'complete', score: 1500, progress_pct: 100 }); } }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
