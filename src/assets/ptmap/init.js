/* assets/ptmap/init.js: draws designer@'s shared map (ptmap, vendored in assets/ptmap/<version>/, checked against the
 * registry at build by scripts/build.mjs) into each <div class="ptmap-box">. civic.b@PrompTugal.dinis, 20 Nov 2026.
 * Data, not code: the places come from the div's data-places attribute (JSON written at build from data/places.json),
 * parsed with JSON.parse and checked here; ptmap itself keeps only https links on promptugal.news hosts and sets every
 * label with textContent. No network call, no storage. Without JavaScript the list of councils below the map stays. */
(function () {
  'use strict'
  function go () {
    if (!window.PTMap || typeof window.PTMap.render !== 'function') return
    var boxes = document.querySelectorAll('div.ptmap-box')
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i], raw = box.getAttribute('data-places') || '[]', list
      if (raw.length > 100000) continue
      try { list = JSON.parse(raw) } catch (e) { continue }
      if (!Array.isArray(list)) continue
      var places = []
      for (var j = 0; j < list.length && places.length < 400; j++) {
        var p = list[j]
        if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.href !== 'string') continue
        if (!Array.isArray(p.at) || typeof p.at[0] !== 'number' || typeof p.at[1] !== 'number' || !isFinite(p.at[0]) || !isFinite(p.at[1])) continue
        places.push({ id: p.id.slice(0, 64), name: p.name.slice(0, 80), at: [p.at[0], p.at[1]], href: p.href.slice(0, 200), n: typeof p.n === 'number' && isFinite(p.n) ? p.n : 0 })
      }
      // the current place drawn last, so its neighbours' dots do not cover it
      var cur = box.getAttribute('data-current') || ''
      places.sort(function (a, b) { return (a.id === cur) - (b.id === cur) })
      // the London box, only when the page has London data (ptmap keeps the link only if it is on a promptugal.news host)
      var lh = box.getAttribute('data-london'), ln = +box.getAttribute('data-london-n')
      var london = lh ? { href: lh.slice(0, 200), n: isFinite(ln) && ln > 0 ? Math.min(999, Math.round(ln)) : 0 } : undefined
      var host = box.querySelector('.ptmap-draw')
      if (!host || !places.length) continue
      window.PTMap.render(host, { places: places, current: cur || undefined, label: (box.getAttribute('data-label') || 'Map').slice(0, 120), london: london })
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go()
})()
