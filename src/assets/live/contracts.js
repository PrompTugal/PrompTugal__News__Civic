/* assets/live/contracts.js: the latest contracts of one council, live from data.promptugal.news (civic.b@PrompTugal.dinis,
 * 18 Nov 2026; Dinis's word: pages load data dynamically from data.promptugal.news's API where they can, the built page as the
 * fallback). Requirements from civic.b.security@'s pre-review of the same day:
 *   - DOM built with createElement/textContent only; no innerHTML, eval or inline handlers;
 *   - the place comes from the page (data-place, ^[a-z0-9-]+$) and is read with hasOwnProperty, never a feed key;
 *   - a link only for https://www.base.gov.pt/ (exact host), with rel noopener noreferrer; nothing built from NIF or name;
 *   - prices through Number.isFinite, dates strictly YYYY-MM-DD in UTC, strings cut, 15 rows at most, sorted here;
 *   - one GET to data.promptugal.news, 8 s timeout, 5 MB cap, no credentials, no referrer, no storage, no beacons;
 *   - any failure leaves the published table untouched; a natural person is never named, and their contract's text is withheld.
 * Data in the browser (Dinis, 19 Nov 2026 ~01:13 UTC, Website repo board/guidance/2026-11-19-load-the-data-in-the-browser.md):
 *   the feed replaces nothing unless its read time (data_read_at, or read_at) is valid and not older than the built copy's
 *   (data-built-read); a feed older than its cadence (data-cadence-hours: 13 since data.b@ collects twice a day, Dinis 19 Nov 2026 ~16:30 UTC) is shown as stale.
 */
(function () {
    'use strict'
    // data.b@'s per-place file (about 160 KB for Faro) first; the whole feed (about 1.8 MB) if that is not there yet
    var API = 'https://data.promptugal.news/api/v1/base-gov-pt/'
    var MAX_BYTES = 5 * 1024 * 1024, ROWS = 15
    var box = document.getElementById('live-contracts')
    if (!box || !window.fetch || !window.AbortController) return
    var place = box.getAttribute('data-place') || ''
    if (!/^[a-z0-9-]+$/.test(place)) return
    var builtRead = box.getAttribute('data-built-read') || '', cadenceH = +box.getAttribute('data-cadence-hours') || 13
    var known = {}
    String(box.getAttribute('data-company-pages') || '').split(' ').forEach(function (n) { if (/^\d{9}$/.test(n)) known[n] = true })

    var cut = function (s, n) { s = typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ') : ''; return s.length > n ? s.slice(0, n - 1) + '…' : s }
    var day = function (s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
        var d = new Date(s + 'T12:00:00Z'); if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return null
        return d
    }
    var fmtDay = function (d) { return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'n/a' }
    var eur = function (n) { return (typeof n === 'number' && isFinite(n) && n >= 0 && n < 1e10) ? n.toLocaleString('en-GB', { maximumFractionDigits: 0 }) + ' €' : 'n/a' }
    var baseLink = function (u) {
        try { var x = new URL(u); return x.protocol === 'https:' && x.host === 'www.base.gov.pt' && !x.username && !x.password ? x.href : null } catch (e) { return null }
    }
    var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e }
    var PROC = { 'Ajuste Direto Regime Geral': 'Direct award', 'Consulta Prévia': 'Prior consultation', 'Concurso público': 'Open tender', 'Concurso público simplificado': 'Simplified open tender', 'Consulta Prévia Simplificada': 'Simplified prior consultation' }
    var supplier = function (cs) {
        if (!Array.isArray(cs) || !cs.length) return el('span', 'n/a')
        var span = el('span')
        cs.slice(0, 3).forEach(function (s, i) {
            if (i) span.appendChild(document.createTextNode('; '))
            var company = isCompany(s)
            if (!company) { span.appendChild(document.createTextNode('a private individual (name withheld)')); return }
            if (known[s.nif]) { var a = el('a', cut(s.name, 100)); a.setAttribute('href', '/map/' + s.nif + '/'); span.appendChild(a) }
            else span.appendChild(document.createTextNode(cut(s.name, 100)))
        })
        return span
    }
    // a contract is private (text withheld) unless every supplier is a company with a company NIF: decided here, not by the feed's flag
    var isCompany = function (s) { return !!(s && s.kind === 'company' && typeof s.nif === 'string' && /^[5-9]\d{8}$/.test(s.nif) && typeof s.name === 'string' && s.name) }
    var isPrivate = function (c) { return !!c.object_withheld || c.object == null || !Array.isArray(c.contractors) || !c.contractors.length || !c.contractors.every(isCompany) }
    var table = function (rows) {
        var t = el('table'), head = el('thead'), hr = el('tr'), body = el('tbody')
        ;['Published', 'What', 'Supplier', 'Procedure', 'Value'].forEach(function (h, i) { var th = el('th', h); if (i === 4) th.className = 'r'; hr.appendChild(th) })
        head.appendChild(hr); t.appendChild(head)
        rows.forEach(function (c) {
            var tr = el('tr'), td0 = el('td'), link = baseLink(c.url), ds = fmtDay(day(c.published))
            if (link) { var a = el('a', ds); a.setAttribute('href', link); a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('referrerpolicy', 'no-referrer'); td0.appendChild(a) } else td0.textContent = ds
            tr.appendChild(td0)
            tr.appendChild(el('td', isPrivate(c) ? 'Description withheld: a supplier is a private individual' : cut(c.object, 200)))
            var td2 = el('td'); td2.appendChild(supplier(c.contractors)); tr.appendChild(td2)
            tr.appendChild(el('td', PROC[c.procedure] || cut(c.procedure, 60)))
            tr.appendChild(el('td', eur(c.price_eur), 'r num'))
            body.appendChild(tr)
        })
        t.appendChild(body)
        var wrap = el('div', null, 'tbl'); wrap.appendChild(t); return wrap
    }
    var note = box.querySelector('.live-note')
    var fail = function () { if (note) note.textContent = 'Live data unavailable just now: the table below is our published copy.' }

    var ac = new AbortController(), timer = setTimeout(function () { ac.abort() }, 8000)
    var get = function (url) { return fetch(url, { signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', cache: 'no-cache', redirect: 'error' }) }
    get(API + 'places/' + place + '.json')
        .then(function (r) { return r.status === 404 ? get(API + 'latest.json') : r })
        .then(function (r) {
            if (!r.ok) throw new Error('status ' + r.status)
            var len = +r.headers.get('content-length'); if (len && len > MAX_BYTES) throw new Error('too large')
            if (!r.body || !r.body.getReader) return r.text()
            var reader = r.body.getReader(), parts = [], size = 0, dec = new TextDecoder()   // stop reading at MAX_BYTES, whatever the headers say
            var pump = function () { return reader.read().then(function (x) {
                if (x.done) { parts.push(dec.decode()); return parts.join('') }
                size += x.value.length; if (size > MAX_BYTES) { ac.abort(); throw new Error('too large') }
                parts.push(dec.decode(x.value, { stream: true })); return pump()
            }) }
            return pump()
        })
        .then(function (text) {
            clearTimeout(timer)
            if (text.length > MAX_BYTES) throw new Error('too large')
            var d = JSON.parse(text)
            if (!d || typeof d !== 'object' || !d.places || typeof d.places !== 'object' || !Object.prototype.hasOwnProperty.call(d.places, place)) throw new Error('no place')
            var all = d.places[place]; if (!Array.isArray(all) || !all.length) throw new Error('empty')
            var sorted = all.filter(function (c) { return c && typeof c === 'object' }).sort(function (a, b) {
                var x = day(b.published) ? b.published : '', y = day(a.published) ? a.published : ''; return x < y ? -1 : x > y ? 1 : (+b.id || 0) - (+a.id || 0)
            })
            var council = sorted.filter(function (c) { return c.buyer_kind === 'council' }).slice(0, ROWS)
            var isOther = function (c) { return c.buyer_kind === 'municipal company' || c.buyer_kind === 'municipal service' }
            var others = sorted.filter(isOther).slice(0, ROWS)
            var rawRead = typeof d.data_read_at === 'string' ? d.data_read_at : d.read_at
            var readMs = typeof rawRead === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(rawRead) ? Date.parse(rawRead) : NaN
            if (!isFinite(readMs) || readMs > Date.now() + 3e5) throw new Error('no valid read time')
            if (!/^\d{4}-\d{2}-\d{2}$/.test(builtRead) || readMs < Date.parse(builtRead + 'T00:00:00Z')) throw new Error('older than the built copy, or no built date')
            var stale = Date.now() - readMs > cadenceH * 36e5
            var readAt = rawRead.slice(0, 16).replace('T', ' ') + ' UTC'
            var kids = [el('p', 'Live from data.promptugal.news (PrompTugal.news’s data site), read at ' + readAt + ' as the file states' + (stale ? ' (stale: older than ' + cadenceH + ' hours, though it is collected twice a day)' : '') + ': the council’s contracts published on BASE in the last 90 days, newest first. Not reviewed by a person.', stale ? 'small stale' : 'small muted')]
            kids.push(el('h3', 'The council’s own contracts (' + sorted.filter(function (c) { return c.buyer_kind === 'council' }).length + ' in 90 days)'))
            kids.push(council.length ? table(council) : el('p', 'None in the last 90 days.'))
            if (others.length) {
                kids.push(el('h3', 'Its municipal companies and services (' + sorted.filter(isOther).length + ' in 90 days)'))
                kids.push(table(others))
            }
            var src = el('p', null, 'src')
            src.appendChild(document.createTextNode('Source: IMPIC’s open data of the Portal BASE, through data.promptugal.news; licence: '))
            var la = el('a', 'Outra (Domínio Público), as dados.gov.pt publishes it'); la.setAttribute('href', 'https://dados.gov.pt/pt/datasets/66d72d488ca4b7cb2de28712/'); src.appendChild(la)
            src.appendChild(document.createTextNode('. Our record of it: CC BY 4.0. Each date links the contract on base.gov.pt.'))
            kids.push(src)
            var live = box.querySelector('.live-body'); if (live) { live.replaceChildren.apply(live, kids); if (note) note.textContent = 'Your browser loaded this from data.promptugal.news, which sees your IP address as any website does. The table under "Its latest contracts" is our published copy.' }
        })
        .catch(function () { clearTimeout(timer); fail() })
})()
