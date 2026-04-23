// app.js — StockAlert API
const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const APP_ENV = process.env.APP_ENV || "development";
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const DEFAULT_THRESHOLD = parseInt(process.env.DEFAULT_THRESHOLD || "10");

// ── DONNÉES EN MÉMOIRE ───────────────────────────────────────────────
const products = new Map([
  ["prod-001", { id: "prod-001", name: "Laptop Pro 15",       stock: 3,  threshold: 5  }],
  ["prod-002", { id: "prod-002", name: "Mechanical Keyboard", stock: 12, threshold: 10 }],
  ["prod-003", { id: "prod-003", name: "USB-C Hub",           stock: 0,  threshold: 5  }],
  ["prod-004", { id: "prod-004", name: "Monitor 27 pouces",   stock: 8,  threshold: 10 }],
]);

const alerts = new Map();

function genId() { return crypto.randomBytes(4).toString("hex"); }

function checkAndAlert(product) {
  if (product.stock < product.threshold) {
    const id = genId();
    const alert = {
      id,
      productId: product.id,
      productName: product.name,
      currentStock: product.stock,
      threshold: product.threshold,
      severity: product.stock === 0 ? "critical" : "warning",
      createdAt: new Date().toISOString(),
      resolved: false
    };
    alerts.set(id, alert);
    return alert;
  }
  return null;
}

// Résoudre automatiquement les alertes actives d'un produit
// quand son stock repasse au-dessus du seuil
function resolveAlertsForProduct(productId) {
  alerts.forEach(function(alert) {
    if (alert.productId === productId && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
    }
  });
}

products.forEach(p => checkAndAlert(p));

// ── UTILITAIRES ──────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("JSON invalide")); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-App-Version": APP_VERSION,
    "X-App-Env": APP_ENV
  });
  res.end(JSON.stringify(data, null, 2));
}

function getAlertStats() {
  const all = Array.from(alerts.values());
  return {
    total:    all.length,
    active:   all.filter(a => !a.resolved).length,
    critical: all.filter(a => a.severity === "critical" && !a.resolved).length,
    warning:  all.filter(a => a.severity === "warning"  && !a.resolved).length,
    resolved: all.filter(a =>  a.resolved).length
  };
}

function isValidStock(n)    { return Number.isInteger(n) && n >= 0; }
function isValidSeverity(s) { return ["critical", "warning"].includes(s); }

// ── INTERFACE WEB ────────────────────────────────────────────────────
// Le JS embarqué utilise UNIQUEMENT des guillemets simples
// → zéro conflit avec le template literal Node.js (backticks)
// → zéro échappement nécessaire
const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StockAlert</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
    header { background: #1a1d2e; border-bottom: 1px solid #2d3148; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
    .logo { font-size: 20px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
    .logo-badge { background: #ef4444; border-radius: 6px; padding: 4px 8px; font-size: 13px; }
    .env-badge { background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px 12px; font-size: 12px; color: #94a3b8; }
    main { max-width: 1200px; margin: 0 auto; padding: 32px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .stat { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 12px; padding: 20px; }
    .stat-value { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
    .stat-label { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
    .s-critical .stat-value { color: #ef4444; }
    .s-warning  .stat-value { color: #f59e0b; }
    .s-active   .stat-value { color: #3b82f6; }
    .s-ok       .stat-value { color: #22c55e; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .card { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 12px; overflow: hidden; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid #2d3148; display: flex; align-items: center; justify-content: space-between; }
    .card-title { font-size: 15px; font-weight: 600; }
    .cnt { background: #2d3148; border-radius: 20px; padding: 2px 10px; font-size: 12px; color: #94a3b8; }
    .product-list, .alert-list { max-height: 420px; overflow-y: auto; }
    .product-item { padding: 14px 20px; border-bottom: 1px solid #1e2235; display: flex; align-items: center; gap: 12px; }
    .product-item:last-child { border-bottom: none; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .dot-ok       { background: #22c55e; }
    .dot-warning  { background: #f59e0b; }
    .dot-critical { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    .pname  { flex: 1; font-size: 14px; }
    .pseuil { font-size: 13px; color: #94a3b8; }
    .stock-form { display: flex; gap: 6px; align-items: center; }
    .stock-input { width: 72px; background: #0f1117; border: 1px solid #2d3148; border-radius: 6px; color: #e2e8f0; padding: 5px 8px; font-size: 13px; text-align: center; }
    .stock-input:focus { outline: none; border-color: #3b82f6; }
    .btn { border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .btn:disabled { opacity: .5; cursor: default; }
    .btn-update  { background: #3b82f6; color: #fff; }
    .btn-resolve { background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44; }
    .btn-add     { background: #6366f1; color: #fff; font-size: 13px; }
    .alert-item { padding: 14px 20px; border-bottom: 1px solid #1e2235; display: flex; align-items: flex-start; gap: 12px; }
    .alert-item:last-child { border-bottom: none; }
    .badge { border-radius: 5px; padding: 3px 8px; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
    .badge-critical { background: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
    .badge-warning  { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; }
    .alert-body    { flex: 1; }
    .alert-product { font-size: 14px; font-weight: 500; margin-bottom: 3px; }
    .alert-meta    { font-size: 12px; color: #64748b; }
    .add-form { padding: 16px 20px; border-top: 1px solid #2d3148; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .form-input { background: #0f1117; border: 1px solid #2d3148; border-radius: 6px; color: #e2e8f0; padding: 7px 10px; font-size: 13px; }
    .form-input:focus { outline: none; border-color: #6366f1; }
    .empty { padding: 32px; text-align: center; color: #475569; font-size: 14px; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 18px; font-size: 13px; transform: translateY(80px); opacity: 0; transition: all .25s; z-index: 100; }
    .toast.show    { transform: translateY(0); opacity: 1; }
    .toast.ok  { border-color: #22c55e55; color: #22c55e; }
    .toast.err { border-color: #ef444455; color: #ef4444; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2d3148; border-radius: 3px; }
  </style>
</head>
<body>

<header>
  <div class="logo">&#128230; StockAlert <span class="logo-badge">LIVE</span></div>
  <div class="env-badge" id="env-info">chargement...</div>
</header>

<main>
  <div class="stats">
    <div class="stat s-critical"><div class="stat-value" id="v-critical">-</div><div class="stat-label">Critiques</div></div>
    <div class="stat s-warning"> <div class="stat-value" id="v-warning">-</div> <div class="stat-label">Warnings</div></div>
    <div class="stat s-active">  <div class="stat-value" id="v-active">-</div>  <div class="stat-label">Actives</div></div>
    <div class="stat s-ok">      <div class="stat-value" id="v-products">-</div><div class="stat-label">Produits</div></div>
  </div>
  <div class="grid">

    <div class="card">
      <div class="card-header">
        <span class="card-title">Produits</span>
        <span class="cnt" id="cnt-products">0</span>
      </div>
      <div class="product-list" id="product-list"><div class="empty">Chargement...</div></div>
      <div class="add-form">
        <input class="form-input" id="new-name"      placeholder="Nom du produit" style="flex:1;min-width:130px" />
        <input class="form-input" id="new-stock"     type="number" placeholder="Stock" style="width:75px" min="0" />
        <input class="form-input" id="new-threshold" type="number" placeholder="Seuil" style="width:75px" min="0" />
        <button class="btn btn-add" id="btn-add">+ Ajouter</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Alertes actives</span>
        <span class="cnt" id="cnt-alerts">0</span>
      </div>
      <div class="alert-list" id="alert-list"><div class="empty">Chargement...</div></div>
    </div>

  </div>
</main>

<div class="toast" id="toast"></div>

<script>
  'use strict';

  // ── Utilitaires ────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || 'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.className = 'toast'; }, 2500);
  }

  function dotClass(p) {
    if (p.stock === 0)             return 'dot-critical';
    if (p.stock < p.threshold)     return 'dot-warning';
    return 'dot-ok';
  }

  function timeAgo(iso) {
    var s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60)   return 'il y a ' + s + 's';
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + 'min';
    return 'il y a ' + Math.floor(s / 3600) + 'h';
  }

  // ── Rendu produits ─────────────────────────────────────────────────
  // Appelé UNE SEULE FOIS au démarrage et après chaque action utilisateur.
  // PAS dans le setInterval → les inputs ne sont jamais écrasés en cours de saisie.
  function loadProducts() {
    fetch('/products')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        document.getElementById('cnt-products').textContent = data.total;
        var el = document.getElementById('product-list');
        if (!data.products || !data.products.length) {
          el.innerHTML = '<div class="empty">Aucun produit</div>';
          return;
        }
        var html = '';
        data.products.forEach(function(p) {
          html += '<div class="product-item">';
          html +=   '<div class="dot ' + dotClass(p) + '"></div>';
          html +=   '<span class="pname">' + esc(p.name) + '</span>';
          html +=   '<span class="pseuil">seuil: ' + p.threshold + '</span>';
          html +=   '<div class="stock-form" data-pid="' + esc(p.id) + '">';
          html +=     '<input class="stock-input" type="number" value="' + p.stock + '" min="0" />';
          html +=     '<button class="btn btn-update">MAJ</button>';
          html +=   '</div>';
          html += '</div>';
        });
        el.innerHTML = html;
      })
      .catch(function() { toast('Erreur chargement produits', 'err'); });
  }

  // ── Rendu alertes ──────────────────────────────────────────────────
  // Appelé toutes les 5s ET après chaque action. Section isolée des produits.
  function refreshAlerts() {
    fetch('/alerts')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var active = (data.alerts || []).filter(function(a) { return !a.resolved; });
        document.getElementById('cnt-alerts').textContent = active.length;
        var el = document.getElementById('alert-list');
        if (!active.length) {
          el.innerHTML = '<div class="empty">Aucune alerte active</div>';
          return;
        }
        var html = '';
        active.forEach(function(a) {
          html += '<div class="alert-item">';
          html +=   '<span class="badge badge-' + a.severity + '">' + a.severity.toUpperCase() + '</span>';
          html +=   '<div class="alert-body">';
          html +=     '<div class="alert-product">' + esc(a.productName) + '</div>';
          html +=     '<div class="alert-meta">Stock: ' + a.currentStock + ' / Seuil: ' + a.threshold + ' &middot; ' + timeAgo(a.createdAt) + '</div>';
          html +=   '</div>';
          html +=   '<button class="btn btn-resolve" data-aid="' + esc(a.id) + '">Resoudre</button>';
          html += '</div>';
        });
        el.innerHTML = html;
      })
      .catch(function() {});
  }

  // ── Stats ──────────────────────────────────────────────────────────
  function refreshStats() {
    fetch('/health')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        document.getElementById('env-info').textContent    = d.env + ' v' + d.version;
        document.getElementById('v-critical').textContent = d.alerts.critical;
        document.getElementById('v-warning').textContent  = d.alerts.warning;
        document.getElementById('v-active').textContent   = d.alerts.active;
        document.getElementById('v-products').textContent = d.products;
      })
      .catch(function() {});
  }

  // ── Mise à jour du stock ───────────────────────────────────────────
  // Utilise closest('.stock-form') pour trouver l'input associé au bouton cliqué.
  // Plus fiable que querySelector avec data-id (évite toute ambiguïté).
  function handleUpdateStock(btn) {
    var form  = btn.closest('.stock-form');
    if (!form) return;
    var pid   = form.getAttribute('data-pid');
    var input = form.querySelector('.stock-input');
    if (!pid || !input) return;

    var val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) { toast('Stock invalide (entier >= 0)', 'err'); return; }

    btn.disabled    = true;
    btn.textContent = '...';

    fetch('/products/' + pid + '/stock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: val })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
    .then(function(res) {
      if (res.ok) {
        toast('Stock mis a jour');
        loadProducts();
        refreshStats();
        refreshAlerts();
      } else {
        btn.disabled    = false;
        btn.textContent = 'MAJ';
        toast(res.d.error || 'Erreur', 'err');
      }
    })
    .catch(function() {
      btn.disabled    = false;
      btn.textContent = 'MAJ';
      toast('Erreur reseau', 'err');
    });
  }

  // ── Résolution d'alerte ────────────────────────────────────────────
  function handleResolveAlert(btn) {
    var aid = btn.getAttribute('data-aid');
    if (!aid) return;
    btn.disabled = true;
    fetch('/alerts/' + aid + '/resolve', { method: 'PATCH' })
      .then(function(r) {
        if (r.ok) {
          toast('Alerte resolue');
          refreshAlerts();
          refreshStats();
        } else {
          btn.disabled = false;
          toast('Erreur resolution', 'err');
        }
      })
      .catch(function() {
        btn.disabled = false;
        toast('Erreur reseau', 'err');
      });
  }

  // ── Ajout de produit ───────────────────────────────────────────────
  function handleAddProduct() {
    var name      = document.getElementById('new-name').value.trim();
    var stock     = parseInt(document.getElementById('new-stock').value, 10);
    var threshold = parseInt(document.getElementById('new-threshold').value, 10);
    if (!name)                       { toast('Nom requis', 'err'); return; }
    if (isNaN(stock) || stock < 0)   { toast('Stock invalide (entier >= 0)', 'err'); return; }
    if (isNaN(threshold) || threshold < 0) threshold = 10;

    var btn      = document.getElementById('btn-add');
    btn.disabled = true;

    fetch('/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, stock: stock, threshold: threshold })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
    .then(function(res) {
      btn.disabled = false;
      if (res.ok) {
        toast('Produit ajoute' + (res.d.alertCreated ? ' (alerte generee !)' : ''));
        document.getElementById('new-name').value      = '';
        document.getElementById('new-stock').value     = '';
        document.getElementById('new-threshold').value = '';
        loadProducts();
        refreshStats();
        refreshAlerts();
      } else {
        toast(res.d.error || 'Erreur', 'err');
      }
    })
    .catch(function() {
      btn.disabled = false;
      toast('Erreur reseau', 'err');
    });
  }

  // ── Délégation d'événements ────────────────────────────────────────
  // closest() remonte le DOM → fonctionne même si le clic atterrit
  // sur un nœud texte enfant du bouton
  document.addEventListener('click', function(e) {
    var btnUpdate  = e.target.closest('.btn-update');
    var btnResolve = e.target.closest('.btn-resolve');
    var btnAdd     = e.target.closest('#btn-add');

    if (btnUpdate)  handleUpdateStock(btnUpdate);
    if (btnResolve) handleResolveAlert(btnResolve);
    if (btnAdd)     handleAddProduct();
  });

  // ── Démarrage ──────────────────────────────────────────────────────
  loadProducts();
  refreshStats();
  refreshAlerts();

  // Rafraîchissement léger toutes les 5s — stats + alertes uniquement
  // Les produits ne sont PAS inclus : leurs inputs resteraient stables
  setInterval(function() {
    refreshStats();
    refreshAlerts();
  }, 5000);
</script>

</body>
</html>`;

// ── SERVEUR ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  if (req.method === "GET" && url === "/health") {
    json(res, 200, { status: "ok", env: APP_ENV, version: APP_VERSION, products: products.size, alerts: getAlertStats() });
    return;
  }

  if (req.method === "GET" && url === "/products") {
    const list = Array.from(products.values()).map(p => ({ ...p, belowThreshold: p.stock < p.threshold }));
    json(res, 200, { total: list.length, products: list });
    return;
  }

  if (req.method === "POST" && url === "/products") {
    try {
      const { name, stock, threshold } = await parseBody(req);
      if (!name?.trim())       { json(res, 400, { error: "name est requis" }); return; }
      if (!isValidStock(stock)){ json(res, 400, { error: "stock doit etre un entier >= 0" }); return; }
      const id = "prod-" + genId();
      const product = { id, name: name.trim(), stock, threshold: threshold ?? DEFAULT_THRESHOLD };
      products.set(id, product);
      const alert = checkAndAlert(product);
      json(res, 201, { product, alertCreated: alert !== null });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  const stockMatch = url.match(/^\/products\/([^/]+)\/stock$/);
  if (req.method === "PATCH" && stockMatch) {
    try {
      const product = products.get(stockMatch[1]);
      if (!product) { json(res, 404, { error: "Produit introuvable" }); return; }
      const { stock } = await parseBody(req);
      if (!isValidStock(stock)) { json(res, 400, { error: "stock doit etre un entier >= 0" }); return; }
      product.stock = stock;
      // Si le stock repasse au-dessus du seuil → résoudre les alertes actives
      if (product.stock >= product.threshold) {
        resolveAlertsForProduct(product.id);
      }
      const alert = checkAndAlert(product);
      json(res, 200, { product, alertCreated: alert !== null });
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }

  if (req.method === "GET" && url === "/alerts") {
    const list = Array.from(alerts.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    json(res, 200, { ...getAlertStats(), alerts: list });
    return;
  }

  if (req.method === "GET" && url === "/alerts/active") {
    const active = Array.from(alerts.values()).filter(a => !a.resolved);
    json(res, 200, { total: active.length, alerts: active });
    return;
  }

  const resolveMatch = url.match(/^\/alerts\/([^/]+)\/resolve$/);
  if (req.method === "PATCH" && resolveMatch) {
    const alert = alerts.get(resolveMatch[1]);
    if (!alert) { json(res, 404, { error: "Alerte introuvable" }); return; }
    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();
    json(res, 200, { alert });
    return;
  }

  const alertMatch = url.match(/^\/alerts\/([^/]+)$/);
  if (req.method === "DELETE" && alertMatch) {
    if (!alerts.has(alertMatch[1])) { json(res, 404, { error: "Alerte introuvable" }); return; }
    alerts.delete(alertMatch[1]);
    json(res, 200, { message: "Alerte supprimee" });
    return;
  }

  json(res, 404, { error: "Route introuvable" });
});

server.listen(PORT, () => {
  console.log("StockAlert — env: " + APP_ENV + ", version: " + APP_VERSION + ", port: " + PORT);
  console.log("Interface   : http://localhost:" + PORT);
});

module.exports = { server, products, alerts, genId, checkAndAlert, isValidSeverity, isValidStock, getAlertStats };

