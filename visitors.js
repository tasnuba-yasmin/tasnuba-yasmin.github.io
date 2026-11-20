// Visitor map: records one visit per browser per day, then draws a GitHub-style
// grid of the last year's visits with a country/city breakdown on hover.
(function () {
  var section = document.getElementById('visitors');
  if (!section) return;
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var api = local ? 'http://localhost:8787' : section.getAttribute('data-api');
  var grid = section.querySelector('.visit-grid');
  var months = section.querySelector('.visit-months');
  var summary = section.querySelector('.visit-summary');
  var tip = section.querySelector('.visit-tip');
  var scroller = section.querySelector('.visit-scroll');

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
  function countryName(code) {
    if (!code || code === 'XX') return 'Unknown location';
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  }

  function store(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }

  // Visiting with ?novisit=1 stops this browser from being counted (?novisit=0 undoes it).
  var params = new URLSearchParams(location.search);
  if (params.get('novisit') === '1') store(function (s) { s.setItem('visit-skip', '1'); });
  if (params.get('novisit') === '0') store(function (s) { s.removeItem('visit-skip'); });

  var dhakaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

  function recordVisit() {
    var skip = store(function (s) { return s.getItem('visit-skip'); });
    var last = store(function (s) { return s.getItem('visit-day'); });
    if (skip === '1' || last === dhakaDay) return Promise.resolve();
    return fetch(api + '/hit', { method: 'POST', keepalive: true })
      .then(function () { store(function (s) { s.setItem('visit-day', dhakaDay); }); })
      .catch(function () {});
  }

  function parseDay(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function fmtDay(d) { return d.toISOString().slice(0, 10); }
  var longDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  var monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' });

  function level(n, max) {
    if (!n) return 0;
    if (max <= 4) return Math.min(n, 4);
    return Math.min(4, Math.ceil((n / max) * 4));
  }

  function draw(data) {
    var end = parseDay(data.today);
    // 53 columns ending with the current week, starting on Sunday like GitHub.
    var start = new Date(end.getTime() - (52 * 7 + end.getUTCDay()) * 86400000);
    var max = 0, places = {};
    Object.keys(data.days).forEach(function (k) {
      max = Math.max(max, data.days[k].total);
      data.days[k].places.forEach(function (p) { places[p.country] = 1; });
    });

    var frag = document.createDocumentFragment();
    var monthFrag = document.createDocumentFragment();
    var lastMonth = -1;
    for (var w = 0; w < 53; w++) {
      var first = new Date(start.getTime() + w * 7 * 86400000);
      var label = document.createElement('span');
      if (first.getUTCMonth() !== lastMonth && first.getUTCDate() <= 7 && w < 52) {
        label.textContent = monthName.format(first);
        lastMonth = first.getUTCMonth();
      }
      monthFrag.appendChild(label);
      for (var d = 0; d < 7; d++) {
        var day = new Date(first.getTime() + d * 86400000);
        var cell = document.createElement('span');
        cell.className = 'visit-cell';
        if (day > end) { cell.classList.add('is-future'); frag.appendChild(cell); continue; }
        var key = fmtDay(day);
        var info = data.days[key];
        cell.setAttribute('data-day', key);
        cell.setAttribute('data-level', level(info ? info.total : 0, max));
        frag.appendChild(cell);
      }
    }
    grid.appendChild(frag);
    months.appendChild(monthFrag);

    var countries = Object.keys(places).filter(function (c) { return c !== 'XX'; }).length;
    summary.textContent = data.total
      ? data.total + (data.total === 1 ? ' visit' : ' visits') + ' in the last year from ' +
        countries + (countries === 1 ? ' country' : ' countries') + '.'
      : 'No visits recorded yet. The map fills in as people visit.';
    scroller.scrollLeft = scroller.scrollWidth;

    function show(cell) {
      var key = cell.getAttribute('data-day');
      if (!key) return hide();
      var info = data.days[key];
      var n = info ? info.total : 0;
      var html = '<strong>' + (n || 'No') + (n === 1 ? ' visit' : ' visits') + '</strong> on ' + longDate.format(parseDay(key));
      if (info) {
        html += '<ul>' + info.places.slice(0, 12).map(function (p) {
          var where = p.city ? p.city + ', ' + countryName(p.country) : countryName(p.country);
          return '<li><span>' + escapeHtml(where) + '</span><span>' + p.count + '</span></li>';
        }).join('') + '</ul>';
        if (info.places.length > 12) html += '<p>and ' + (info.places.length - 12) + ' more</p>';
      }
      tip.innerHTML = html;
      tip.hidden = false;
      var box = section.getBoundingClientRect();
      var c = cell.getBoundingClientRect();
      var left = c.left - box.left + c.width / 2 - tip.offsetWidth / 2;
      left = Math.max(0, Math.min(left, box.width - tip.offsetWidth));
      tip.style.left = left + 'px';
      tip.style.top = (c.top - box.top - tip.offsetHeight - 8) + 'px';
    }
    function hide() { tip.hidden = true; }
    grid.addEventListener('mouseover', function (e) { if (e.target.classList.contains('visit-cell')) show(e.target); });
    grid.addEventListener('mouseleave', hide);
    grid.addEventListener('click', function (e) { if (e.target.classList.contains('visit-cell')) show(e.target); });
    scroller.addEventListener('scroll', hide);
    document.addEventListener('click', function (e) { if (!grid.contains(e.target)) hide(); });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  recordVisit()
    .then(function () { return fetch(api + '/stats'); })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(draw)
    .catch(function () { summary.textContent = 'Visitor statistics are unavailable right now.'; });
})();
