// admin.js
// Aiaxcart Premium Shop — Admin panel logic
// Requires: <script type="module" src="app.js"> that exports { supabase }

import { supabase } from './app.js';

/* -------------------------- DOM references -------------------------- */
const authBox   = document.getElementById('authBox');
const adminArea = document.getElementById('adminArea');
const authMsg   = document.getElementById('authMsg');

const emailEl   = document.getElementById('email');
const passEl    = document.getElementById('password');
const loginBtn  = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Products form
const prodForm  = document.getElementById('prodForm');
const pCat      = document.getElementById('pCat');      // <select> Category
const pName     = document.getElementById('pName');     // name
const pPrice    = document.getElementById('pPrice');    // price
const pDesc     = document.getElementById('pDesc');     // description
const pAvail    = document.getElementById('pAvail');    // checkbox Available
const pStock    = document.getElementById('pStock');    // available stock (on-hand)

// On-hand accounts form
const invForm   = document.getElementById('invForm');
const invProd   = document.getElementById('invProd');   // <select> product
const invUser   = document.getElementById('invUser');   // username/email/code
const invSecret = document.getElementById('invSecret'); // password/token
const invNotes  = document.getElementById('invNotes');  // notes (optional)

// NEW selects you asked for (please make sure they exist in admin.html)
const invProfile = document.getElementById('invProfile');   // Solo/Shared (profile/account)
const invDuration= document.getElementById('invDuration');  // 7d, 14d, 1–12 months

// Optional sections
const prodList  = document.getElementById('prodList');
const invList   = document.getElementById('invList');
const orderList = document.getElementById('orderList');
const statsBox  = document.getElementById('stats');
const csvBtn    = document.getElementById('csvBtn');

/* ------------------------------- State ------------------------------ */
let currentUser = null;
let isAdmin     = false;

/* --------------------------- Helpers/UX ----------------------------- */
function showAdmin(show) {
  if (show) { authBox?.classList.add('hidden'); adminArea?.classList.remove('hidden'); }
  else      { adminArea?.classList.add('hidden'); authBox?.classList.remove('hidden'); }
}

function niceMoney(n) {
  const v = Number(n ?? 0);
  return isFinite(v) ? `₱${v.toFixed(2)}` : '₱0.00';
}

function toDateStr(dt) {
  return new Date(dt).toLocaleString();
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/* Duration map: label -> days */
const DURATION_CHOICES = [
  ['7 days', 7], ['14 days', 14],
  ['1 month', 30], ['2 months', 60], ['3 months', 90], ['4 months', 120],
  ['5 months', 150], ['6 months', 180], ['7 months', 210], ['8 months', 240],
  ['9 months', 270], ['10 months', 300], ['11 months', 330], ['12 months', 360],
];

/* Profile types */
const PROFILE_TYPES = [
  'Solo profile', 'Shared profile', 'Solo account', 'Shared account'
];

/* Categories to display in category <select> (safe defaults) */
const DEFAULT_CATEGORIES = ['Entertainment','Streaming','Educational','Editing','AI'];

/* ------------------------- Auth: Admin gate ------------------------- */
async function requireAdminSession() {
  // 1) Session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { currentUser = null; isAdmin = false; showAdmin(false); return false; }

  currentUser = session.user;

  // 2) Check user_roles
  const { data: roleRow, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', currentUser.id)
    .single();

  if (error || !roleRow || roleRow.role !== 'admin') {
    await supabase.auth.signOut();
    currentUser = null; isAdmin = false;
    if (authMsg) authMsg.textContent = 'Your account is not authorized as admin.';
    showAdmin(false);
    return false;
  }

  isAdmin = true;
  showAdmin(true);
  return true;
}

/* ----------------------------- Login UI ---------------------------- */
loginBtn?.addEventListener('click', async () => {
  loginBtn.disabled = true;
  authMsg.textContent = '';
  const email = emailEl.value.trim();
  const password = passEl.value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { authMsg.textContent = error.message; loginBtn.disabled = false; return; }

  const ok = await requireAdminSession();
  loginBtn.disabled = false;
  if (ok) initAdmin();
});

logoutBtn?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentUser = null; isAdmin = false;
  showAdmin(false);
});

/* --------------------------- Admin bootstrap ------------------------ */
await requireAdminSession().then(ok => { if (ok) initAdmin(); });

async function initAdmin() {
  // Prime dropdowns (profile & duration) if present
  if (invProfile && !invProfile.options.length) {
    PROFILE_TYPES.forEach(t => {
      const o = document.createElement('option'); o.value = t; o.textContent = t; invProfile.appendChild(o);
    });
  }
  if (invDuration && !invDuration.options.length) {
    DURATION_CHOICES.forEach(([label, days]) => {
      const o = document.createElement('option'); o.value = String(days); o.textContent = label; invDuration.appendChild(o);
    });
  }

  // Load data
  await Promise.all([loadCategoriesSelect(), loadProductsDropDown(), loadProductsList(), loadOnhand(), loadOrders(), loadStats()]);

  // Wire forms
  prodForm?.addEventListener('submit', guarded(saveProduct));
  invForm?.addEventListener('submit', guarded(addOnhand));
  csvBtn?.addEventListener('click', guarded(exportCSV));
}

/* Guard to ensure admin session still valid */
function guarded(fn) {
  return async (e) => {
    e?.preventDefault();
    const ok = await requireAdminSession();
    if (!ok) { alert('Please login as admin.'); return; }
    await fn(e);
  };
}

/* ---------------------------- Categories --------------------------- */
async function loadCategoriesSelect() {
  // try to derive from products; else fallback to defaults
  const { data, error } = await supabase.from('products').select('category').not('category','is',null).order('category');
  const cats = new Set(DEFAULT_CATEGORIES);
  if (!error && data) data.forEach(r => r?.category && cats.add(r.category));

  if (pCat) {
    pCat.innerHTML = '';
    [...cats].forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      pCat.appendChild(o);
    });
  }
}

/* ----------------------------- Products ---------------------------- */
async function loadProductsDropDown() {
  // Populate the On-hand Accounts product <select> with optgroups by category
  if (!invProd) return;

  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, available')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  invProd.innerHTML = '';

  if (error || !data?.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'No products yet';
    invProd.appendChild(o);
    return;
  }

  // group by category
  const byCat = data.reduce((m, r) => {
    const key = r.category || 'Uncategorized';
    if (!m[key]) m[key] = [];
    m[key].push(r);
    return m;
  }, {});

  Object.entries(byCat).forEach(([cat, rows]) => {
    const group = document.createElement('optgroup');
    group.label = cat;
    rows.forEach(r => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.name + (r.available ? '' : ' (hidden)');
      group.appendChild(o);
    });
    invProd.appendChild(group);
  });
}

async function loadProductsList() {
  if (!prodList) return;

  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, description, category, available, available_stock, created_at')
    .order('created_at', { ascending: false });

  if (error) { prodList.textContent = error.message; return; }

  prodList.innerHTML = '';
  data?.forEach(p => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <b>${p.name}</b> — ${niceMoney(p.price)} • <i>${p.category ?? ''}</i>
      <div class="muted">${p.description ?? ''}</div>
      <div class="muted">Stock: ${p.available_stock ?? 0} • ${p.available ? 'Available' : 'Hidden'} • Added ${toDateStr(p.created_at)}</div>
      <div class="actions">
        <button class="btn small edit" data-id="${p.id}">Edit</button>
        <button class="btn small toggle" data-id="${p.id}">${p.available ? 'Hide' : 'Show'}</button>
      </div>
    `;
    div.querySelector('.edit').onclick = guarded(() => fillProductForm(p));
    div.querySelector('.toggle').onclick = guarded(async () => {
      await supabase.from('products').update({ available: !p.available }).eq('id', p.id);
      loadProductsList(); loadProductsDropDown();
    });
    prodList.appendChild(div);
  });
}

function fillProductForm(p) {
  if (pCat)   pCat.value   = p.category ?? '';
  if (pName)  pName.value  = p.name ?? '';
  if (pPrice) pPrice.value = p.price ?? '';
  if (pDesc)  pDesc.value  = p.description ?? '';
  if (pAvail) pAvail.checked = !!p.available;
  if (pStock) pStock.value = p.available_stock ?? 0;
  prodForm.dataset.editId = p.id;
}

async function saveProduct() {
  // Build body tolerant to missing fields
  const body = {
    category: pCat?.value || null,
    name: (pName?.value || '').trim(),
    price: Number(pPrice?.value || 0),
    description: pDesc?.value?.trim() || null,
    available: !!(pAvail?.checked),
    available_stock: Number(pStock?.value || 0)
  };
  if (!body.name) { alert('Product name is required.'); return; }

  const editId = prodForm?.dataset?.editId;
  if (editId)  await supabase.from('products').update(body).eq('id', editId);
  else         await supabase.from('products').insert(body);

  if (prodForm) { prodForm.reset(); delete prodForm.dataset.editId; }
  await Promise.all([loadProductsList(), loadProductsDropDown(), loadCategoriesSelect()]);
}

/* --------------------------- On-hand Accounts ----------------------- */
async function addOnhand() {
  const product_id = invProd?.value || '';
  const username   = (invUser?.value || '').trim();
  const secret     = (invSecret?.value || '').trim();
  const notes      = (invNotes?.value || '').trim() || null;
  const profile    = invProfile?.value || null;
  const durDays    = Number(invDuration?.value || 30);

  if (!product_id) { alert('Please select a product.'); return; }
  if (!username || !secret) { alert('Please enter username & password/token.'); return; }

  const payload = {
    product_id, username, secret, notes,
    profile_type: profile,               // if column exists
    duration_days: isFinite(durDays) ? durDays : null, // if column exists
    expires_at: isFinite(durDays) ? daysFromNow(durDays) : null // if column exists
  };

  // Insert onhand account (tolerant insert even if some columns don't exist)
  await supabase.from('onhand_accounts').insert(payload).select('id');

  // Increment product stock (do on the product record)
  await supabase.rpc('increment_stock', { p_product_id: product_id }).catch(async () => {
    // If RPC not present, fallback: update directly
    await supabase.from('products')
      .update({ available_stock: supabase.rpc ? undefined : supabase.sql`available_stock + 1` })
      .eq('id', product_id);
    // If above direct SQL not allowed, do it in two steps:
    const { data: prod } = await supabase.from('products').select('available_stock').eq('id', product_id).single();
    if (prod) await supabase.from('products').update({ available_stock: (prod.available_stock ?? 0) + 1 }).eq('id', product_id);
  });

  invForm?.reset();
  await Promise.all([loadOnhand(), loadProductsList()]);
}

async function loadOnhand() {
  if (!invList) return;
  const { data, error } = await supabase
    .from('onhand_accounts')
    .select('id, username, assigned, assigned_at, created_at, notes, profile_type, duration_days, expires_at, products(name)')
    .order('assigned', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) { invList.textContent = error.message; return; }

  invList.innerHTML = '';
  data?.forEach(a => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <b>${a.products?.name || ''}</b> • ${a.username}
      <div class="muted">
        ${a.assigned ? 'Assigned' : 'Available'}
        ${a.assigned_at ? ' • ' + toDateStr(a.assigned_at) : ''}
        ${a.profile_type ? ' • ' + a.profile_type : ''}
        ${a.duration_days ? ' • ' + a.duration_days + 'd' : ''}
        ${a.expires_at ? ' • Expires: ' + toDateStr(a.expires_at) : ''}
      </div>
      ${a.notes ? `<div class="muted">${a.notes}</div>` : ''}
    `;
    invList.appendChild(div);
  });
}

/* ------------------------------- Orders ---------------------------- */
async function loadOrders() {
  if (!orderList) return;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { orderList.textContent = error.message; return; }

  orderList.innerHTML = '';
  data?.forEach(o => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <b>${o.product_name}</b> — ${niceMoney(o.price)} • <i>${o.payment_method}</i>
      <div class="muted">Order ${o.id} • ${o.customer_name ?? ''} • ${o.customer_email ?? ''}</div>
      ${o.payment_ref ? `<div class="muted">Ref: ${o.payment_ref}</div>` : ''}
      ${o.receipt_url ? `<div><a target="_blank" href="${o.receipt_url}">View receipt</a></div>` : ''}
      <label>Status:
        <select class="status">
          ${['pending','paid','completed','cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <div class="actions">
        <button class="btn small save">Save</button>
        <button class="btn small drop">Confirm Paid & Auto-Drop</button>
      </div>
    `;
    div.querySelector('.save').onclick = guarded(async () => {
      const st = div.querySelector('.status').value;
      await supabase.from('orders').update({ status: st }).eq('id', o.id);
      loadStats(); loadOrders();
    });
    div.querySelector('.drop').onclick = guarded(async () => {
      await supabase.from('orders').update({ status: 'paid' }).eq('id', o.id);
      // Try RPC if present
      const { error: rpcErr } = await supabase.rpc('fulfill_order', { p_order_id: o.id });
      if (rpcErr) {
        // If RPC missing, you can handle manual fulfillment here if you want.
        console.warn('fulfill_order RPC not present:', rpcErr.message);
      }
      await Promise.all([loadProductsList(), loadOnhand(), loadOrders(), loadStats()]);
    });
    orderList.appendChild(div);
  });
}

/* ----------------------------- Stats / CSV ------------------------- */
async function loadStats() {
  if (!statsBox) return;
  const { data, error } = await supabase
    .from('orders')
    .select('product_name, status')
    .in('status', ['paid','completed']);

  if (error) { statsBox.textContent = error.message; return; }

  const counts = {};
  data?.forEach(o => counts[o.product_name] = (counts[o.product_name] || 0) + 1);

  const html = Object.entries(counts)
    .map(([name, n]) => `<div class="card"><h4>${name}</h4><p class="muted">${n} sold</p></div>`)
    .join('');

  statsBox.innerHTML = `<h3>Sales Summary</h3><div class="grid">${html || '<p class="muted">No sales yet.</p>'}</div>`;
}

async function exportCSV() {
  const { data, error } = await supabase.from('orders').select('*');
  if (error) return alert(error.message);
  if (!data?.length) return alert('No orders.');

  const headers = Object.keys(data[0]);
  const rows = [headers.join(',')];
  data.forEach(r => rows.push(headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')));

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'orders.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
