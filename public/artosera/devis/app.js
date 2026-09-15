(() => {
  // ---- Les grandes lignes. p : prix de mise en œuvre (€ HT). t : palier d'abonnement qu'appelle la ligne. r : dans le périmètre recommandé.
  const GROUPS = [
    { id: "bureau", title: "Le bureau", items: [
      { id: "inventaire", n: "Inventaire complet", d: "Prix public et prix artiste distincts, localisation (réserve, salle, foire, chez client), import et export CSV ou Excel avec les images.", p: 800, t: "e", r: true },
      { id: "editions", n: "Éditions, provenance, coûts de production", d: "Tirages numérotés et épreuves, historique des expositions et propriétaires, frais engagés par œuvre à déduire de la marge.", p: 800, t: "g", r: false },
      { id: "contrats-artistes", n: "Contrats de représentation", d: "Le contrat rattaché à l'artiste, avec échéance et rappel.", p: 250, t: "e", r: true },
      { id: "contacts", n: "Contacts enrichis", d: "Demandes reçues depuis le site rattachées au contact, historique d'achats et d'intérêts, consentement et RGPD.", p: 500, t: "e", r: true },
      { id: "expos", n: "Expositions, foires, actualités", d: "Œuvres accrochées, vues d'accrochage, stand et liste de prix du stand, annonces reprises sur le site.", p: 700, t: "e", r: true },
      { id: "agenda", n: "Agenda et presse", d: "Vernissages, rendez-vous, échéances ; revue de presse et catalogues rattachés aux expositions.", p: 350, t: "g", r: false },
      { id: "mouvements", n: "Mouvements et logistique", d: "Prêts, consignations et dépôts avec leurs bons, suivi de transport, constats d'état avec photos.", p: 1450, t: "g", r: false },
    ]},
    { id: "ventes", title: "Ventes et documents", items: [
      { id: "ventes", n: "Ventes", d: "Réservations, offres à un contact avec suivi et relance, factures et avoirs, liste de prix en un clic.", p: 900, t: "e", r: true },
      { id: "facturx", n: "Facture électronique et fiscalité de l'art", d: "Factur-X, obligatoire à l'émission pour les TPE et PME au 1er septembre 2027 ; TVA sur marge, taux 5,5 %, droit de suite.", p: 1200, t: "g", r: true },
      { id: "documents", n: "Documents en un clic", d: "Fiche d'œuvre PDF, certificat d'authenticité numéroté, dossier d'œuvres pour un client, modèles aux couleurs de la galerie.", p: 800, t: "e", r: true },
    ]},
    { id: "coffre", title: "Le coffre", items: [
      { id: "coffre", n: "Coffre à documents", d: "Contrats, NDA, dépôts, assurances, transport rattachés à une œuvre, un artiste ou un contact ; échéances et rappels ; journal des consultations.", p: 1150, t: "e", r: true },
      { id: "modeles-contrats", n: "Modèles de contrats pré-remplis", d: "NDA, contrat d'artiste, contrat de dépôt générés depuis le bureau.", p: 500, t: "g", r: false },
    ]},
    { id: "site", title: "Le site de la galerie", items: [
      { id: "site", n: "Site relié au bureau", d: "Une œuvre ou une exposition créée en interne apparaît en ligne sans nouvelle saisie. Pages artistes, expositions, foires, actualités, contact ; français et anglais ; référencement ; thème au choix parmi trois.", p: 2150, t: "e", r: true },
      { id: "surmesure", n: "Site sur mesure", d: "Direction artistique propre, au-delà des thèmes.", p: 900, t: "e", r: false },
      { id: "viewing", n: "Viewing rooms privées et archives", d: "Sélection pour un collectionneur, lien expirant, prix visibles ou non, ouvertures journalisées ; expositions passées consultables.", p: 550, t: "g", r: false },
      { id: "boutique", n: "Boutique, paiement, visite virtuelle", d: "Panier et paiement en ligne sans commission, éditions et livres, vue à 360° de l'exposition en cours.", p: 3000, t: "g", r: false },
    ]},
    { id: "diffusion", title: "Diffusion", items: [
      { id: "newsletter", n: "Newsletter et réseaux", d: "Listes par type de contact, envoi et statistiques, inscription depuis le site, visuels prêts pour les réseaux.", p: 650, t: "g", r: false },
      { id: "places", n: "Publication vers Artsy et Artnet", d: "Œuvres disponibles poussées vers les places de marché.", p: 900, t: "g", r: false },
    ]},
    { id: "acces", title: "Accès, sécurité, connexions", items: [
      { id: "roles", n: "Rôles et droits", d: "Direction, équipe, lecture seule ; qui voit le prix artiste, qui ouvre le coffre.", p: 550, t: "e", r: true },
      { id: "securite", n: "Double authentification et journal", d: "Code à usage unique à la connexion ; toute modification identifiée et horodatée.", p: 450, t: "g", r: false },
      { id: "foire", n: "Mode foire sur tablette", d: "Interface adaptée au stand : prix, statut, offre, réservation.", p: 400, t: "g", r: false },
      { id: "pwa", n: "Application installable sur téléphone et tablette", d: "Le bureau s'installe depuis le navigateur, sans passer par les boutiques d'applications ; consultation hors ligne des fiches et saisie rapide.", p: 900, t: "g", r: false },
      { id: "api", n: "API et connexion comptable", d: "Liaison avec la comptabilité ou un outil tiers, webhooks.", p: 1000, t: "g", r: false },
    ]},
    { id: "accomp", title: "Accompagnement", items: [
      { id: "formation", n: "Formation", d: "Deux heures à la mise en place, puis à la demande.", p: 200, t: "e", r: false },
    ]},
  ];
  const TIER = { e: { n: "Essentiel", p: 149, r: 1 }, g: { n: "Galerie", p: 249, r: 2 } };
  const MIG = { base: 900, parMilleOeuvres: 300, parSite: 450 };
  const KEY = "devis-artosera-v2";
  const DEST = "contact@venio.paris";
  const ALL = GROUPS.flatMap(g => g.items);
  const eur = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
  const nf = n => new Intl.NumberFormat("fr-FR").format(n);
  const el = id => document.getElementById(id);

  // ---- État
  let picked = new Set(ALL.filter(i => i.r).map(i => i.id));
  let S = { name: "", who: "", mail: "", eng: 12, oeuvres: 2500, sites: 1, notes: "", com: false, disc: 0, oImpl: null, oMig: null, oSub: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (Array.isArray(s.picked)) picked = new Set(s.picked.filter(id => ALL.some(i => i.id === id))); if (s.S) S = Object.assign(S, s.S); }
  } catch (e) { /* stockage indisponible : périmètre recommandé */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ picked: [...picked], S })); } catch (e) {} };

  // ---- Lignes
  const host = el("groups");
  host.innerHTML = GROUPS.map(g => `
    <section class="group" id="g-${g.id}">
      <h2 class="gt"><label class="svc"><input type="checkbox" class="svc-box" data-group="${g.id}" aria-label="Retenir tout le service ${g.title}"><span>${g.title}</span></label> <span class="cnt" data-cnt="${g.id}"></span></h2>
      <div class="head"><span></span><span>Brique</span><span>Palier</span><span class="r">Mise en œuvre</span></div>
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

  // ---- Champs
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

  // ---- Calcul
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

  // ---- Rendu
  function render() {
    const c = compute();
    const show = (id, key) => { const v = el(id); v.innerHTML = (S.disc > 0 || c.adjusted[key]) && Math.round(c.base[key]) !== Math.round(c.net[key]) ? `<span class="was">${eur(c.base[key])}</span>${eur(c.net[key])}` : eur(c.net[key]); };
    show("tImpl", "impl"); show("tMig", "mig"); show("tSub", "sub");
    el("tSubU").textContent = `par mois · offre ${c.tier.n}` + (S.eng ? ` · ${S.eng} mois` : " · sans engagement");
    el("tYear").textContent = eur(c.year);
    el("count").textContent = `${c.chosen.length} brique${c.chosen.length > 1 ? "s" : ""} retenue${c.chosen.length > 1 ? "s" : ""} sur ${ALL.length}` + (S.disc ? ` · remise ${S.disc} %` : "");
    rows.forEach(r => r.classList.toggle("off", !picked.has(r.dataset.id)));
    GROUPS.forEach(g => {
      const n = g.items.filter(i => picked.has(i.id)).length, somme = g.items.filter(i => picked.has(i.id)).reduce((s, i) => s + i.p, 0);
      const sb = host.querySelector(`.svc-box[data-group="${g.id}"]`);
      if (sb) { sb.checked = n === g.items.length; sb.indeterminate = n > 0 && n < g.items.length; }
      host.querySelector(`[data-cnt="${g.id}"]`).textContent = `${n} / ${g.items.length}` + (somme ? ` · ${eur(somme)}` : "");
    });
    el("migHint").textContent = `${eur(MIG.base)} de base, ${eur(MIG.parMilleOeuvres)} par millier d'œuvres, ${eur(MIG.parSite)} par site. Œuvres et sites à zéro : pas de reprise.`;

    const L = [
      ["Mise en œuvre", `${c.chosen.length} brique${c.chosen.length > 1 ? "s" : ""}, socle compris` + (c.adjusted.impl ? ` · ajustée (calcul : ${eur(c.implCalc)})` : ""), eur(c.base.impl)],
      ["Reprise des données", c.migCalc || c.adjusted.mig ? `${nf(S.oeuvres)} œuvres · ${S.sites} site${S.sites > 1 ? "s" : ""}` + (c.adjusted.mig ? ` · ajustée (calcul : ${eur(c.migCalc)})` : "") : "Aucune reprise demandée", eur(c.base.mig)],
      [`Abonnement ${c.tier.n}`, (S.eng ? `engagement ${S.eng} mois` : "sans engagement") + (c.adjusted.sub ? ` · ajusté (tarif : ${eur(c.tier.p)})` : ""), `${eur(c.base.sub)} / mois`],
    ];
    let html = L.map(([l, s, a]) => `<div class="line"><span><span class="l">${l}</span><span class="s">${s}</span></span><span class="a">${a}</span></div>`).join("");
    if (S.disc > 0) html += `<div class="line rem"><span><span class="l">Remise ${S.disc} %</span><span class="s">sur la mise en œuvre, la reprise et l'abonnement</span></span><span class="a">− ${eur((c.base.impl - c.net.impl) + (c.base.mig - c.net.mig))} et − ${eur(c.base.sub - c.net.sub)} / mois</span></div>`;
    html += `<div class="line sum"><span><span class="l">Première année, tout compris</span><span class="s">mise en œuvre, reprise et douze mois d'abonnement</span></span><span class="a">${eur(c.year)}</span></div>`;
    el("recapLines").innerHTML = html;
    el("recapNote").innerHTML = `L'offre <b>${c.tier.n}</b> est celle qu'appellent les briques cochées : la plus exigeante fixe le palier. La reprise comprend l'import de l'inventaire, des contacts et des documents, la reprise des contenus du site et les redirections des anciennes adresses.`;
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
    const dateStr = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const txt = (s, x, yy, o = {}) => doc.text(String(s), x, yy, o);
    const line = (yy, w = 0.2) => { doc.setLineWidth(w); doc.line(M, yy, R, yy); };
    const need = h => { if (y + h > 277) { doc.addPage(); y = 20; } };

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(168, 18, 47);
    txt("ARTOSERA · PLATEFORME DE GESTION POUR GALERIES D'ART", M, y); y += 8;
    doc.setFontSize(22); doc.setTextColor(23, 20, 15); txt("Devis", M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(94, 88, 78);
    txt(`Établi le ${dateStr} par Venio, Paris`, R, y - 5, { align: "right" }); txt("Valable 60 jours · prix en euros hors taxes", R, y, { align: "right" });
    y += 6; line(y, 0.8); y += 8;

    doc.setTextColor(23, 20, 15); doc.setFontSize(10);
    const galerie = S.name || "Galerie à préciser";
    doc.setFont("helvetica", "bold"); txt(galerie, M, y); doc.setFont("helvetica", "normal");
    const who = [S.who, S.mail].filter(Boolean).join(" · "); if (who) { y += 5; txt(who, M, y); }
    y += 5; txt(`Abonnement ${c.tier.n} · ${S.eng ? "engagement " + S.eng + " mois" : "mensuel, sans engagement"}`, M, y);
    y += 10;

    const section = (title) => { need(14); doc.setFont("helvetica", "bold"); doc.setFontSize(11); txt(title, M, y); y += 3; line(y, 0.5); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); };
    const rowPdf = (name, desc, amount) => {
      const lines = desc ? doc.splitTextToSize(desc, R - M - 40) : [];
      const h = 5 + lines.length * 4 + 2; need(h);
      doc.setFont("helvetica", "bold"); txt(name, M, y); doc.setFont("helvetica", "normal"); txt(amount, R, y, { align: "right" });
      if (lines.length) { doc.setTextColor(94, 88, 78); doc.setFontSize(8.5); doc.text(lines, M, y + 4); doc.setFontSize(9.5); doc.setTextColor(23, 20, 15); }
      y += h; doc.setDrawColor(223, 218, 209); line(y - 1.5, 0.2); doc.setDrawColor(23, 20, 15);
    };

    section("Compris dans l'abonnement");
    doc.setTextColor(94, 88, 78); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize("Fiche d'œuvre, photos, statut, recherche · fiche artiste FR/EN · carnet d'adresses · accès depuis tout appareil, plusieurs utilisateurs · domaine de la galerie, HTTPS · hébergement en France, sauvegarde quotidienne · maintenance et mises à jour · assistance par e-mail · export complet et réversibilité au contrat.", R - M), M, y);
    y += 16; doc.setTextColor(23, 20, 15); doc.setFontSize(9.5);

    section("Mise en œuvre — briques retenues");
    if (!c.chosen.length) { txt("Aucune brique retenue au-delà du socle.", M, y); y += 8; }
    GROUPS.forEach(g => {
      const retenues = g.items.filter(i => picked.has(i.id));
      if (!retenues.length) return;
      need(12); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(168, 18, 47);
      txt(g.title, M, y); txt(eur(retenues.reduce((a, i) => a + i.p, 0)), R, y, { align: "right" });
      doc.setTextColor(23, 20, 15); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); y += 5;
      retenues.forEach(i => rowPdf(i.n, i.d, eur(i.p)));
      y += 2;
    });
    y += 2; need(8); doc.setFont("helvetica", "bold"); txt("Mise en œuvre", M, y); txt(eur(c.base.impl) + (c.adjusted.impl ? " (ajustée)" : ""), R, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 10;

    section("Reprise des données");
    if (c.base.mig > 0) rowPdf("Reprise de l'inventaire, des contacts, des documents et du site", `${nf(S.oeuvres)} œuvres · ${S.sites} site${S.sites > 1 ? "s" : ""} existant${S.sites > 1 ? "s" : ""} · redirections des anciennes adresses comprises`, eur(c.base.mig) + (c.adjusted.mig ? " (ajustée)" : ""));
    else { txt("Aucune reprise demandée.", M, y); y += 8; }
    y += 4;

    section("Abonnement");
    rowPdf(`Offre ${c.tier.n}`, `${S.eng ? "Engagement " + S.eng + " mois" : "Mensuel, sans engagement"} · socle compris · hébergement en France`, `${eur(c.base.sub)} / mois` + (c.adjusted.sub ? " (ajusté)" : ""));
    y += 4;

    need(40); section("Total");
    const tot = (l, a, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); txt(l, M, y); txt(a, R, y, { align: "right" }); y += 6; };
    if (S.disc > 0) { tot(`Remise ${S.disc} % sur la mise en œuvre, la reprise et l'abonnement`, `− ${eur((c.base.impl - c.net.impl) + (c.base.mig - c.net.mig))} · − ${eur(c.base.sub - c.net.sub)} / mois`); }
    tot("Mise en œuvre, à la livraison", eur(c.net.impl));
    tot("Reprise des données, avant la bascule", eur(c.net.mig));
    tot(`Abonnement ${c.tier.n}, par mois`, eur(c.net.sub));
    y += 1; line(y, 0.8); y += 7;
    doc.setFontSize(12); tot("Première année, tout compris", eur(c.year), true); doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
    if (S.notes) {
      y += 2; section("Remarques et conditions particulières");
      const nl = doc.splitTextToSize(S.notes, R - M); need(nl.length * 4.2 + 6); doc.text(nl, M, y); y += nl.length * 4.2 + 4;
    }
    y += 4; doc.setTextColor(94, 88, 78); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize("Mise en service estimée à treize semaines après signature, reprise des données comprise. Toute brique non retenue peut être ajoutée plus tard : la plateforme est la même, seules les fonctions ouvertes changent. Données hébergées en France, export complet à tout moment.", R - M), M, y);
    y += 18; doc.setTextColor(23, 20, 15);
    need(30); doc.setFontSize(8.5);
    txt("Pour la galerie — nom, date, signature", M, y); txt("Pour Venio — nom, date, signature", W / 2 + 4, y); y += 14; doc.setDrawColor(150); doc.line(M, y, W / 2 - 4, y); doc.line(W / 2 + 4, y, R, y);

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(151, 144, 127); txt(`Artosera est conçu et développé à Paris par Venio · devis ${galerie} · page ${i} / ${n}`, M, 290); }
    const slug = (galerie || "galerie").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { doc, filename: `devis-artosera-${slug}-${new Date().toISOString().slice(0, 10)}.pdf` };
  }

  const status = (msg, cls) => { const s = el("status"); s.textContent = msg; s.className = "status" + (cls ? " " + cls : ""); };
  let downloads = null;
  if (window.claude && typeof window.claude.use === "function") { window.claude.use("downloads").then(ns => { downloads = ns; }).catch(() => {}); }

  async function savePdf() {
    if (!window.jspdf) { status("Le générateur PDF n'est pas chargé. Vérifiez la connexion, puis réessayez.", "err"); return null; }
    readFields();
    const { doc, filename } = buildPdf();
    const blob = doc.output("blob");
    if (downloads) {
      try { await downloads.save({ filename, data: blob }); status(`PDF enregistré : ${filename}`, "ok"); }
      catch (e) { status(e && e.code === "declined" ? "Enregistrement annulé." : "Le PDF n'a pas pu être enregistré ici. Utilisez Imprimer.", e && e.code === "declined" ? "" : "err"); }
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); status(`PDF téléchargé : ${filename}`, "ok");
    }
    return { doc, filename, blob };
  }
  el("bPdf").addEventListener("click", savePdf);

  // ---- Envoi par mail. Servie depuis venio.paris : la route envoie le PDF en pièce jointe. Ailleurs : PDF téléchargé + mail pré-rempli.
  el("bMail").addEventListener("click", async () => {
    readFields();
    if (S.mail && !F.mail.checkValidity()) { status("L'adresse e-mail de la galerie est mal formée.", "err"); F.mail.focus(); return; }
    const c = compute();
    const galerie = S.name || "votre galerie";
    const subject = `Devis Artosera — ${galerie}`;
    const body = [
      `Devis composé pour ${galerie}${S.who ? ", avec " + S.who : ""}${S.mail ? " (" + S.mail + ")" : ""}.`, "",
      "Périmètre retenu :", "",
      ...GROUPS.flatMap(g => {
        const retenues = g.items.filter(i => picked.has(i.id));
        return retenues.length ? [`${g.title} — ${eur(retenues.reduce((a, i) => a + i.p, 0))}`,
          ...retenues.map(i => `    · ${i.n} : ${eur(i.p)}`), ""] : [];
      }),
      "", `Mise en œuvre : ${eur(c.net.impl)}`, `Reprise des données : ${eur(c.net.mig)}`,
      `Abonnement ${c.tier.n} : ${eur(c.net.sub)} par mois, ${S.eng ? "engagement " + S.eng + " mois" : "sans engagement"}`,
      S.disc ? `Remise appliquée : ${S.disc} %` : null,
      `Première année, tout compris : ${eur(c.year)}`, "",
      S.notes ? `Remarques et conditions particulières :\n${S.notes}\n` : null,
      "Le devis détaillé est en pièce jointe. Prix hors taxes, valable 60 jours.", "",
      "Envoyé depuis la page de devis Artosera.",
    ].filter(l => l !== null).join("\n");

    const onVenio = /(^|\.)venio\.paris$/.test(location.hostname);
    if (onVenio) {
      try {
        if (!window.jspdf) throw new Error("pdf");
        const { doc, filename } = buildPdf();
        const b64 = doc.output("datauristring").split(",")[1];
        const r = await fetch("/api/artosera/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: DEST, galerie: S.name, interlocuteur: S.who, subject, body, filename, pdfBase64: b64, devis: { picked: [...picked], S, totals: c.net, tier: c.tier.n, year: c.year } }) });
        if (!r.ok) throw new Error(String(r.status));
        status(`Envoyé à ${DEST}, PDF en pièce jointe.`, "ok"); return;
      } catch (e) { status("L'envoi depuis le serveur a échoué ; le PDF est téléchargé et le mail s'ouvre à la place.", "err"); }
    }
    await savePdf();
    window.location.href = `mailto:${encodeURIComponent(DEST)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status(`PDF téléchargé, mail ouvert pour ${DEST} : joignez le fichier avant d'envoyer.`, "ok");
  });

  // ---- Départ
  writeFields();
  el("stampDate").textContent = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  render();
})();
