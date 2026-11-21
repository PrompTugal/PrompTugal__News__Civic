/* assets/live/london.js: London buyers' contract notices, live from data.promptugal.news (civic.b@PrompTugal.dinis,
 * 20 Nov 2026), the same way as assets/live/contracts.js:
 *   - one GET to data.promptugal.news, 8 s timeout, 2 MB cap, no credentials, no referrer, no storage, no beacons;
 *   - the DOM built with createElement and textContent only; links only to https://www.contractsfinder.service.gov.uk/Notice/<id>;
 *   - a file older than our built copy (data-built-read) is not shown; one older than its own
 *     expected_cadence.stale_after_seconds (or data-cadence-hours) is shown as stale;
 *   - values shown in pounds as published, never converted. */
(function () {
    'use strict'
    var URL_ = 'https://data.promptugal.news/api/v1/contracts-finder/latest.json', MAX_BYTES = 2 * 1024 * 1024, ROWS = 60
    var box = document.getElementById('live-london')
    if (!box || !window.fetch || !window.AbortController) return
    var builtRead = box.getAttribute('data-built-read') || '', cadenceH = +box.getAttribute('data-cadence-hours') || 13
    var note = box.querySelector('.live-note')
    var cut = function (s, n) { s = typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ') : ''; return s.length > n ? s.slice(0, n - 1) + '…' : s }
    var TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
    var fmt = function (s) { if (typeof s !== 'string' || !TS.test(s)) return 'n/a'; var d = new Date(s); return isNaN(d) ? 'n/a' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) }
    var gbp = function (v) { return v && v.currency === 'GBP' && typeof v.amount === 'number' && isFinite(v.amount) && v.amount >= 0 && v.amount < 1e11 ? '£' + v.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : 'n/a' }
    var notice = function (u) { return typeof u === 'string' && /^https:\/\/www\.contractsfinder\.service\.gov\.uk\/Notice\/[0-9a-f-]{36}$/.test(u) ? u : null }
    var STAGE = { planning: 'Planned', tender: 'Open for bids', award: 'Awarded', contract: 'Contract signed', implementation: 'Under way' }
    var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e }
    var fail = function () { if (note) note.textContent = 'The live file did not load; the table below is our published copy.' }
    var ac = new AbortController(), timer = setTimeout(function () { ac.abort() }, 8000)
    fetch(URL_, { signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', redirect: 'error' })
        .then(function (r) {
            if (!r.ok) throw new Error('status')
            var len = +r.headers.get('content-length'); if (len && len > MAX_BYTES) throw new Error('too large')
            return r.text()
        })
        .then(function (t) {
            clearTimeout(timer)
            if (t.length > MAX_BYTES) throw new Error('too large')
            var d = JSON.parse(t)
            if (!d || typeof d !== 'object' || !Array.isArray(d.notices)) throw new Error('shape')
            if (!d.license || d.license.name !== 'Open Government Licence v3.0' || typeof d.license.attribution !== 'string') throw new Error('licence')
            var rawRead = typeof d.data_read_at === 'string' ? d.data_read_at : d.read_at
            var readMs = typeof rawRead === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(rawRead) ? Date.parse(rawRead) : NaN
            if (!isFinite(readMs) || readMs > Date.now() + 3e5) throw new Error('no valid read time')
            var builtMs = Date.parse(builtRead); if (!isFinite(builtMs) || readMs < builtMs) throw new Error('older than the built copy')
            var ec = d.expected_cadence && typeof d.expected_cadence === 'object' ? d.expected_cadence : null
            // a one-day window: the file's own limit only between 13 and 24 hours (post-review low 4)
            var staleS = ec && typeof ec.stale_after_seconds === 'number' && ec.stale_after_seconds >= 46800 && ec.stale_after_seconds <= 86400 ? ec.stale_after_seconds : cadenceH * 3600
            var stale = Date.now() - readMs > staleS * 1000
            var ns = d.notices.filter(function (n) { return n && typeof n === 'object' && notice(n.notice) }).slice(0, ROWS)
            var readAt = rawRead.slice(0, 16).replace('T', ' ') + ' UTC'
            var kids = [el('p', 'Live from data.promptugal.news (PrompTugal.news’s data site), read at ' + readAt + ' as the file states' + (stale ? ' (stale: older than ' + Math.round(staleS / 3600) + ' hours, for a twice-daily collection)' : '') + ': ' + ns.length + ' notices by London buyers in the 24 hours before, newest first. Not reviewed by a person.', stale ? 'small stale' : 'small muted')]
            if (ns.length) {
                var t2 = el('table'), head = el('thead'), hr = el('tr'), body = el('tbody')
                ;['Published (London time)', 'What', 'Buyer', 'Stage', 'Value'].forEach(function (h, i) { var th = el('th', h); if (i === 4) th.className = 'r'; hr.appendChild(th) })
                head.appendChild(hr); t2.appendChild(head)
                ns.forEach(function (n) {
                    var tr = el('tr'), td0 = el('td'), a = el('a', fmt(n.published)); a.setAttribute('href', notice(n.notice)); a.setAttribute('rel', 'noopener'); td0.appendChild(a); tr.appendChild(td0)
                    tr.appendChild(el('td', cut(n.title, 200)))
                    tr.appendChild(el('td', cut(n.buyer, 120) + (typeof n.buyer_postcode_district === 'string' && /^[A-Z]{1,2}\d[A-Z\d]?$/.test(n.buyer_postcode_district) ? ' (' + n.buyer_postcode_district + ')' : '')))
                    tr.appendChild(el('td', (Array.isArray(n.stage) ? n.stage : []).map(function (s) { return STAGE[s] || '' }).filter(Boolean).join(', ') || 'n/a'))
                    tr.appendChild(el('td', gbp(n.award_value && typeof n.award_value.amount === 'number' ? n.award_value : n.value), 'r'))
                    body.appendChild(tr)
                })
                t2.appendChild(body); var wrap = el('div', null, 'tbl'); wrap.appendChild(t2); kids.push(wrap)   // the site's scrolling table box: no sideways page scroll on a phone
            } else kids.push(el('p', 'No notices by London buyers in that window.'))
            kids.push(el('p', 'Source: Contracts Finder (UK government; Crown Commercial Service, as its licence names), through data.promptugal.news. ' + cut(d.license.attribution, 200) + ' Each time links the notice.', 'src'))
            var live = box.querySelector('.live-body'); if (live) { live.replaceChildren.apply(live, kids); if (note) note.textContent = 'Your browser loaded this from data.promptugal.news, which sees your IP address as any website does. Our dated copy follows.' }
        })
        .catch(function () { clearTimeout(timer); fail() })
})()
