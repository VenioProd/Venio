(() => {
  // ---- The modules. p: implementation price (€ excl. VAT). t: subscription plan the module requires. r: in the recommended scope.
  const GROUPS = [
    { id: "bureau", title: "The back office", items: [
      { id: "inventaire", n: "Full inventory", d: "Separate public and artist prices, location (storeroom, gallery floor, art fair, client's premises), CSV or Excel import and export with images.", p: 800, t: "e", r: true },
      { id: "editions", n: "Editions, provenance, production costs", d: "Numbered print runs and proofs, exhibition and ownership history, costs incurred per artwork to deduct from margin.", p: 800, t: "g", r: false },
      { id: "contrats-artistes", n: "Representation agreements", d: "The agreement linked to the artist, with a deadline and reminder.", p: 250, t: "e", r: true },
      { id: "contacts", n: "Enriched contacts", d: "Enquiries received from the website linked to the contact, purchase and interest history, consent and GDPR.", p: 500, t: "e", r: true },
      { id: "expos", n: "Exhibitions, art fairs, news", d: "Artworks on display, hanging views, stand and stand price list, announcements carried over to the website.", p: 700, t: "e", r: true },
      { id: "agenda", n: "Diary and press", d: "Private views, appointments, deadlines; press coverage and catalogues linked to exhibitions.", p: 350, t: "g", r: false },
      { id: "mouvements", n: "Movements and logistics", d: "Loans, consignments and deposits with their dockets, shipment tracking, condition reports with photos.", p: 1450, t: "g", r: false },
    ]},
    { id: "ventes", title: "Sales and documents", items: [
      { id: "ventes", n: "Sales", d: "Reservations, offers to a contact with follow-up and chasing, invoices and credit notes, price list in one click.", p: 900, t: "e", r: true },
      { id: "facturx", n: "E-invoicing and art taxation", d: "Factur-X e-invoicing, mandatory for French SMEs from 1 September 2027; margin-scheme VAT, 5.5% rate, artist's resale right.", p: 1200, t: "g", r: true },
      { id: "documents", n: "One-click documents", d: "Artwork record PDF, numbered certificate of authenticity, artwork portfolio for a client, templates in the gallery's colours.", p: 800, t: "e", r: true },
    ]},
    { id: "coffre", title: "The vault", items: [
      { id: "coffre", n: "Document vault", d: "Agreements, NDAs, deposits, insurance, transport linked to an artwork, an artist or a contact; deadlines and reminders; access log.", p: 1150, t: "e", r: true },
      { id: "modeles-contrats", n: "Pre-filled contract templates", d: "NDA, artist agreement, deposit agreement generated from the back office.", p: 500, t: "g", r: false },
    ]},
    { id: "site", title: "The gallery website", items: [
      { id: "site", n: "Website linked to the back office", d: "An artwork or exhibition created internally appears online without re-entering it. Artist, exhibition, art fair, news and contact pages; French and English; SEO; choice of three themes.", p: 2150, t: "e", r: true },
      { id: "surmesure", n: "Bespoke website", d: "Its own art direction, beyond the standard themes.", p: 900, t: "e", r: false },
      { id: "viewing", n: "Private viewing rooms and archives", d: "Selection for a collector, expiring link, prices shown or hidden, logged views; past exhibitions available to browse.", p: 550, t: "g", r: false },
      { id: "boutique", n: "Shop, payment, virtual tour", d: "Online cart and payment with no commission, editions and books, 360° view of the current exhibition.", p: 3000, t: "g", r: false },
    ]},
    { id: "diffusion", title: "Outreach", items: [
      { id: "newsletter", n: "Newsletter and social media", d: "Lists by contact type, sending and statistics, sign-up from the website, visuals ready for social media.", p: 650, t: "g", r: false },
      { id: "places", n: "Publishing to Artsy and Artnet", d: "Available artworks pushed to the marketplaces.", p: 900, t: "g", r: false },
    ]},
    { id: "acces", title: "Access, security, connections", items: [
      { id: "roles", n: "Roles and permissions", d: "Management, team, read-only; who sees the artist price, who opens the vault.", p: 550, t: "e", r: true },
      { id: "securite", n: "Two-factor authentication and log", d: "One-time code at login; every change identified and time-stamped.", p: 450, t: "g", r: false },
      { id: "foire", n: "Art fair mode on tablet", d: "Interface suited to the stand: price, status, offer, reservation.", p: 400, t: "g", r: false },
      { id: "pwa", n: "Installable app for phone and tablet", d: "The back office installs from the browser, with no need for app stores; offline access to records and quick entry.", p: 900, t: "g", r: false },
      { id: "api", n: "API and accounting connection", d: "Link with accounting or a third-party tool, webhooks.", p: 1000, t: "g", r: false },
    ]},
    { id: "accomp", title: "Support", items: [
      { id: "formation", n: "Training", d: "Two hours at set-up, then on request.", p: 200, t: "e", r: false },
    ]},
  ];
  const TIER = { e: { n: "Essential", p: 149, r: 1 }, g: { n: "Gallery", p: 249, r: 2 } };
  const MIG = { base: 900, parMilleOeuvres: 300, parSite: 450 };
  const KEY = "artosera-quote-en-v1";
  const DEST = "contact@venio.paris";
  const ALL = GROUPS.flatMap(g => g.items);
  const eur = n => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
  const nf = n => new Intl.NumberFormat("en-GB").format(n);
  const el = id => document.getElementById(id);

  // ---- State
  let picked = new Set(ALL.filter(i => i.r).map(i => i.id));
  let S = { name: "", who: "", mail: "", eng: 12, oeuvres: 2500, sites: 1, notes: "", com: false, disc: 0, oImpl: null, oMig: null, oSub: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (Array.isArray(s.picked)) picked = new Set(s.picked.filter(id => ALL.some(i => i.id === id))); if (s.S) S = Object.assign(S, s.S); }
  } catch (e) { /* storage unavailable: recommended scope */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ picked: [...picked], S })); } catch (e) {} };

  // ---- Rows
  const host = el("groups");
  host.innerHTML = GROUPS.map(g => `
    <section class="group" id="g-${g.id}">
      <h2 class="gt"><label class="svc"><input type="checkbox" class="svc-box" data-group="${g.id}" aria-label="Select the whole ${g.title} service"><span>${g.title}</span></label> <span class="cnt" data-cnt="${g.id}"></span></h2>
      <div class="head"><span></span><span>Module</span><span>Plan</span><span class="r">Implementation</span></div>
      ${g.items.map(i => `
        <label class="row" for="c-${i.id}" data-id="${i.id}">
          <input type="checkbox" id="c-${i.id}" data-id="${i.id}">
          <span><span class="name">${i.n}</span><span class="desc">${i.d}</span></span>
          <span class="tier">${TIER[i.t].n}</span>
          <span class="price">${eur(i.p)}</span>
        </label>`).join("")}
    </section>`).join("");
  const boxes = [...host.querySelectorAll('.row input[type="checkbox"]')];
  const svcBoxes = [...host.querySelectorAll('.svc-box')];
  const rows = [...host.querySelectorAll(".row")];

  // ---- Fields
  const F = { name: el("fName"), who: el("fWho"), mail: el("fMail"), eng: el("fEng"), oeuvres: el("fOeuvres"), sites: el("fSites"), notes: el("fNotes"), disc: el("cDisc"), oImpl: el("cImpl"), oMig: el("cMig"), oSub: el("cSub") };
  const num = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
  const opt = v => v === "" ? null : num(v, 0, 10000000);
  function readFields() {
    S.name = F.name.value.trim(); S.who = F.who.value.trim(); S.mail = F.mail.value.trim();
    S.eng = Number(F.eng.value); S.oeuvres = num(F.oeuvres.value, 0, 200000) ?? 0; S.sites = num(F.sites.value, 0, 10) ?? 0; S.notes = F.notes.value.trim();
    S.disc = num(F.disc.value, 0, 100) ?? 0; S.oImpl = opt(F.oImpl.value); S.oMig = opt(F.oMig.value); S.oSub = opt(F.oSub.value);
  }
  function writeFields() {
    F.name.value = S.name; F.who.value = S.who; F.mail.value = S.mail; F.eng.value = String(S.eng);
    F.oeuvres.value = S.oeuvres; F.sites.value = S.sites; F.notes.value = S.notes; F.disc.value = S.disc;
    F.oImpl.value = S.oImpl ?? ""; F.oMig.value = S.oMig ?? ""; F.oSub.value = S.oSub ?? "";
    boxes.forEach(b => { b.checked = picked.has(b.dataset.id); });
    el("comPanel").hidden = !S.com; el("bCom").setAttribute("aria-pressed", String(S.com));
  }

  // ---- Calculation
  function compute() {
    const chosen = ALL.filter(i => picked.has(i.id));
    const implCalc = chosen.reduce((s, i) => s + i.p, 0);
    const rank = chosen.reduce((r, i) => Math.max(r, TIER[i.t].r), 1);
    const tier = Object.values(TIER).find(t => t.r === rank);
    const migCalc = (S.oeuvres || S.sites) ? MIG.base + MIG.parMilleOeuvres * Math.ceil(S.oeuvres / 1000) + MIG.parSite * S.sites : 0;
    const base = { impl: S.oImpl ?? implCalc, mig: S.oMig ?? migCalc, sub: S.oSub ?? tier.p };
    const k = 1 - S.disc / 100;
    const net = { impl: base.impl * k, mig: base.mig * k, sub: base.sub * k };
    return { chosen, tier, implCalc, migCalc, base, net, year: net.impl + net.mig + net.sub * 12,
      adjusted: { impl: S.oImpl !== null, mig: S.oMig !== null, sub: S.oSub !== null } };
  }

  // ---- Render
  function render() {
    const c = compute();
    const show = (id, key) => { const v = el(id); v.innerHTML = (S.disc > 0 || c.adjusted[key]) && Math.round(c.base[key]) !== Math.round(c.net[key]) ? `<span class="was">${eur(c.base[key])}</span>${eur(c.net[key])}` : eur(c.net[key]); };
    show("tImpl", "impl"); show("tMig", "mig"); show("tSub", "sub");
    el("tSubU").textContent = `per month · the ${c.tier.n} plan` + (S.eng ? ` · ${S.eng} months` : " · no commitment");
    el("tYear").textContent = eur(c.year);
    el("count").textContent = `${c.chosen.length} module${c.chosen.length > 1 ? "s" : ""} selected out of ${ALL.length}` + (S.disc ? ` · ${S.disc}% discount` : "");
    rows.forEach(r => r.classList.toggle("off", !picked.has(r.dataset.id)));
    GROUPS.forEach(g => {
      const n = g.items.filter(i => picked.has(i.id)).length, somme = g.items.filter(i => picked.has(i.id)).reduce((s, i) => s + i.p, 0);
      const sb = host.querySelector(`.svc-box[data-group="${g.id}"]`);
      if (sb) { sb.checked = n === g.items.length; sb.indeterminate = n > 0 && n < g.items.length; }
      host.querySelector(`[data-cnt="${g.id}"]`).textContent = `${n} / ${g.items.length}` + (somme ? ` · ${eur(somme)}` : "");
    });
    el("migHint").textContent = `${eur(MIG.base)} base fee, ${eur(MIG.parMilleOeuvres)} per thousand artworks, ${eur(MIG.parSite)} per site. Artworks and sites at zero: no migration.`;

    const L = [
      ["Implementation", `${c.chosen.length} module${c.chosen.length > 1 ? "s" : ""}, core included` + (c.adjusted.impl ? ` · adjusted (calculated: ${eur(c.implCalc)})` : ""), eur(c.base.impl)],
      ["Data migration", c.migCalc || c.adjusted.mig ? `${nf(S.oeuvres)} artworks · ${S.sites} site${S.sites > 1 ? "s" : ""}` + (c.adjusted.mig ? ` · adjusted (calculated: ${eur(c.migCalc)})` : "") : "No migration requested", eur(c.base.mig)],
      [`Subscription ${c.tier.n}`, (S.eng ? `${S.eng}-month commitment` : "no commitment") + (c.adjusted.sub ? ` · adjusted (list price: ${eur(c.tier.p)})` : ""), `${eur(c.base.sub)} / month`],
    ];
    let html = L.map(([l, s, a]) => `<div class="line"><span><span class="l">${l}</span><span class="s">${s}</span></span><span class="a">${a}</span></div>`).join("");
    if (S.disc > 0) html += `<div class="line rem"><span><span class="l">${S.disc}% discount</span><span class="s">on implementation, data migration and the subscription</span></span><span class="a">− ${eur((c.base.impl - c.net.impl) + (c.base.mig - c.net.mig))} and − ${eur(c.base.sub - c.net.sub)} / month</span></div>`;
    html += `<div class="line sum"><span><span class="l">First year, all included</span><span class="s">implementation, data migration and twelve months' subscription</span></span><span class="a">${eur(c.year)}</span></div>`;
    el("recapLines").innerHTML = html;
    el("recapNote").innerHTML = `The <b>${c.tier.n}</b> plan is the one required by the modules ticked: the most demanding sets the plan. Data migration includes importing the inventory, contacts and documents, migrating the website content and redirecting old addresses.`;
    save();
  }

  // ---- Interactions
  boxes.forEach(b => b.addEventListener("change", () => { b.checked ? picked.add(b.dataset.id) : picked.delete(b.dataset.id); render(); }));
  svcBoxes.forEach(b => b.addEventListener("change", () => {
    const g = GROUPS.find(x => x.id === b.dataset.group);
    const toutRetenu = g.items.every(i => picked.has(i.id));
    g.items.forEach(i => toutRetenu ? picked.delete(i.id) : picked.add(i.id));
    boxes.forEach(x => { x.checked = picked.has(x.dataset.id); });
    render();
  }));

  const setAll = ids => { picked = new Set(ids); boxes.forEach(b => { b.checked = picked.has(b.dataset.id); }); render(); };
  el("bReco").addEventListener("click", () => setAll(ALL.filter(i => i.r).map(i => i.id)));
  el("bNone").addEventListener("click", () => setAll([]));
  el("bCom").addEventListener("click", () => { S.com = !S.com; el("comPanel").hidden = !S.com; el("bCom").setAttribute("aria-pressed", String(S.com)); save(); });
  el("bPrint").addEventListener("click", () => window.print());
  Object.values(F).forEach(f => f.addEventListener("input", () => { readFields(); render(); }));

  // ---- PDF
  function buildPdf() {
    const c = compute();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 18, R = W - M; let y = 20;
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const txt = (s, x, yy, o = {}) => doc.text(String(s), x, yy, o);
    const line = (yy, w = 0.2) => { doc.setLineWidth(w); doc.line(M, yy, R, yy); };
    const need = h => { if (y + h > 277) { doc.addPage(); y = 20; } };

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(168, 18, 47);
    txt("ARTOSERA · MANAGEMENT PLATFORM FOR ART GALLERIES", M, y); y += 8;
    doc.setFontSize(22); doc.setTextColor(23, 20, 15); txt("Quote", M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(94, 88, 78);
    txt(`Prepared on ${dateStr} by Venio, Paris`, R, y - 5, { align: "right" }); txt("Valid for 60 days · prices in euros, excluding VAT", R, y, { align: "right" });
    y += 6; line(y, 0.8); y += 8;

    doc.setTextColor(23, 20, 15); doc.setFontSize(10);
    const galerie = S.name || "Gallery to be confirmed";
    doc.setFont("helvetica", "bold"); txt(galerie, M, y); doc.setFont("helvetica", "normal");
    const who = [S.who, S.mail].filter(Boolean).join(" · "); if (who) { y += 5; txt(who, M, y); }
    y += 5; txt(`Subscription ${c.tier.n} · ${S.eng ? S.eng + "-month commitment" : "monthly, no commitment"}`, M, y);
    y += 10;

    const section = (title) => { need(14); doc.setFont("helvetica", "bold"); doc.setFontSize(11); txt(title, M, y); y += 3; line(y, 0.5); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); };
    const rowPdf = (name, desc, amount) => {
      const lines = desc ? doc.splitTextToSize(desc, R - M - 40) : [];
      const h = 5 + lines.length * 4 + 2; need(h);
      doc.setFont("helvetica", "bold"); txt(name, M, y); doc.setFont("helvetica", "normal"); txt(amount, R, y, { align: "right" });
      if (lines.length) { doc.setTextColor(94, 88, 78); doc.setFontSize(8.5); doc.text(lines, M, y + 4); doc.setFontSize(9.5); doc.setTextColor(23, 20, 15); }
      y += h; doc.setDrawColor(223, 218, 209); line(y - 1.5, 0.2); doc.setDrawColor(23, 20, 15);
    };

    section("Included in the subscription");
    doc.setTextColor(94, 88, 78); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize("Artwork record, photos, status, search · artist record FR/EN · address book · access from any device, multiple users · gallery domain, HTTPS · hosting in France, daily backup · maintenance and updates · e-mail support · full export and reversibility under the contract.", R - M), M, y);
    y += 16; doc.setTextColor(23, 20, 15); doc.setFontSize(9.5);

    section("Implementation — modules selected");
    if (!c.chosen.length) { txt("No modules selected beyond the core.", M, y); y += 8; }
    GROUPS.forEach(g => {
      const kept = g.items.filter(i => picked.has(i.id));
      if (!kept.length) return;
      need(12); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(168, 18, 47);
      txt(g.title, M, y); txt(eur(kept.reduce((a, i) => a + i.p, 0)), R, y, { align: "right" });
      doc.setTextColor(23, 20, 15); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); y += 5;
      kept.forEach(i => rowPdf(i.n, i.d, eur(i.p)));
      y += 2;
    });
    y += 2; need(8); doc.setFont("helvetica", "bold"); txt("Implementation", M, y); txt(eur(c.base.impl) + (c.adjusted.impl ? " (adjusted)" : ""), R, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 10;

    section("Data migration");
    if (c.base.mig > 0) rowPdf("Migration of the inventory, contacts, documents and website", `${nf(S.oeuvres)} artworks · ${S.sites} existing site${S.sites > 1 ? "s" : ""} · redirects from old addresses included`, eur(c.base.mig) + (c.adjusted.mig ? " (adjusted)" : ""));
    else { txt("No migration requested.", M, y); y += 8; }
    y += 4;

    section("Subscription");
    rowPdf(`${c.tier.n} plan`, `${S.eng ? S.eng + "-month commitment" : "Monthly, no commitment"} · core included · hosted in France`, `${eur(c.base.sub)} / month` + (c.adjusted.sub ? " (adjusted)" : ""));
    y += 4;

    need(40); section("Total");
    const tot = (l, a, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); txt(l, M, y); txt(a, R, y, { align: "right" }); y += 6; };
    if (S.disc > 0) { tot(`${S.disc}% discount on implementation, data migration and the subscription`, `− ${eur((c.base.impl - c.net.impl) + (c.base.mig - c.net.mig))} · − ${eur(c.base.sub - c.net.sub)} / month`); }
    tot("Implementation, on delivery", eur(c.net.impl));
    tot("Data migration, before go-live", eur(c.net.mig));
    tot(`${c.tier.n} subscription, per month`, eur(c.net.sub));
    y += 1; line(y, 0.8); y += 7;
    doc.setFontSize(12); tot("First year, all included", eur(c.year), true); doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
    if (S.notes) {
      y += 2; section("Notes and special terms");
      const nl = doc.splitTextToSize(S.notes, R - M); need(nl.length * 4.2 + 6); doc.text(nl, M, y); y += nl.length * 4.2 + 4;
    }
    y += 4; doc.setTextColor(94, 88, 78); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize("Go-live estimated at thirteen weeks after signature, data migration included. Any module not selected can be added later: the platform stays the same, only the functions switched on change. Data hosted in France, full export at any time.", R - M), M, y);
    y += 18; doc.setTextColor(23, 20, 15);
    need(30); doc.setFontSize(8.5);
    txt("For the gallery — name, date, signature", M, y); txt("For Venio — name, date, signature", W / 2 + 4, y); y += 14; doc.setDrawColor(150); doc.line(M, y, W / 2 - 4, y); doc.line(W / 2 + 4, y, R, y);

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(151, 144, 127); txt(`Artosera is designed and built in Paris by Venio · quote ${galerie} · page ${i} / ${n}`, M, 290); }
    const slug = (galerie || "gallery").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { doc, filename: `artosera-quote-${slug}-${new Date().toISOString().slice(0, 10)}.pdf` };
  }

  const status = (msg, cls) => { const s = el("status"); s.textContent = msg; s.className = "status" + (cls ? " " + cls : ""); };
  let downloads = null;
  if (window.claude && typeof window.claude.use === "function") { window.claude.use("downloads").then(ns => { downloads = ns; }).catch(() => {}); }

  async function savePdf() {
    if (!window.jspdf) { status("The PDF generator has not loaded. Check your connection, then try again.", "err"); return null; }
    readFields();
    const { doc, filename } = buildPdf();
    const blob = doc.output("blob");
    if (downloads) {
      try { await downloads.save({ filename, data: blob }); status(`PDF saved: ${filename}`, "ok"); }
      catch (e) { status(e && e.code === "declined" ? "Save cancelled." : "The PDF could not be saved here. Use Print instead.", e && e.code === "declined" ? "" : "err"); }
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); status(`PDF downloaded: ${filename}`, "ok");
    }
    return { doc, filename, blob };
  }
  el("bPdf").addEventListener("click", savePdf);

  // ---- Email. Served from venio.paris: the route sends the PDF as an attachment. Elsewhere: PDF downloaded + pre-filled email.
  el("bMail").addEventListener("click", async () => {
    readFields();
    if (S.mail && !F.mail.checkValidity()) { status("The gallery email address is not valid.", "err"); F.mail.focus(); return; }
    const c = compute();
    const galerie = S.name || "your gallery";
    const subject = `Artosera quote — ${galerie}`;
    const body = [
      `Hello${S.who ? " " + S.who : ""},`, "",
      `Here is a summary of what we agreed for ${galerie}:`, "",
      ...GROUPS.flatMap(g => {
        const kept = g.items.filter(i => picked.has(i.id));
        return kept.length ? [`${g.title} — ${eur(kept.reduce((a, i) => a + i.p, 0))}`,
          ...kept.map(i => `    · ${i.n}: ${eur(i.p)}`), ""] : [];
      }),
      "", `Implementation: ${eur(c.net.impl)}`, `Data migration: ${eur(c.net.mig)}`,
      `${c.tier.n} subscription: ${eur(c.net.sub)} per month, ${S.eng ? S.eng + "-month commitment" : "no commitment"}`,
      S.disc ? `Discount applied: ${S.disc}%` : null,
      `First year, all included: ${eur(c.year)}`, "",
      S.notes ? `Notes and special terms:\n${S.notes}\n` : null,
      "The detailed quote is attached. Prices excluding VAT, valid for 60 days.", "",
      "Kind regards,", "Venio — Artosera",
    ].filter(l => l !== null).join("\n");

    const onVenio = /(^|\.)venio\.paris$/.test(location.hostname);
    if (onVenio) {
      try {
        if (!window.jspdf) throw new Error("pdf");
        const { doc, filename } = buildPdf();
        const b64 = doc.output("datauristring").split(",")[1];
        const r = await fetch("/api/artosera/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: DEST, galerie: S.name, interlocuteur: S.who, subject, body, filename, pdfBase64: b64, devis: { picked: [...picked], S, totals: c.net, tier: c.tier.n, year: c.year } }) });
        if (!r.ok) throw new Error(String(r.status));
        status(`Sent to ${DEST}, PDF attached.`, "ok"); return;
      } catch (e) { status("Sending from the server failed; the PDF has been downloaded and the e-mail opens instead.", "err"); }
    }
    await savePdf();
    window.location.href = `mailto:${encodeURIComponent(DEST)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status(`PDF downloaded, e-mail opened for ${DEST}: attach the file before sending.`, "ok");
  });

  // ---- Start
  writeFields();
  el("stampDate").textContent = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  render();
})();
