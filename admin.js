// admin.js - full updated admin panel client logic
import { supabase } from './app.js';

const authBox   = document.getElementById('authBox');
const adminArea = document.getElementById('adminArea');
const authMsg   = document.getElementById('authMsg');

let currentUser = null;
let isAdmin     = false;

// ---------- Helpers ----------
function showAdmin(show){
  if(show){ authBox?.classList.add('hidden'); adminArea?.classList.remove('hidden'); }
  else    { adminArea?.classList.add('hidden'); authBox?.classList.remove('hidden'); }
}

async function requireAdminSession(){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){ currentUser=null; isAdmin=false; showAdmin(false); return false; }
  currentUser = session.user;

  // verify admin role server-side by reading user_roles
  const { data: roleRow, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', currentUser.id)
    .single();

  if(error || !roleRow || roleRow.role!=='admin'){
    // ensure no silent session kept
    await supabase.auth.signOut().catch(()=>{});
    authMsg.textContent = 'Your account is not authorized as admin.';
    currentUser=null; isAdmin=false; showAdmin(false);
    return false;
  }

  isAdmin = true; showAdmin(true);
  return true;
}

// ---------- Login / Logout ----------
document.getElementById('loginBtn').onclick = async ()=>{
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  authMsg.textContent = 'Signing in...';

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){ authMsg.textContent = error.message; return; }

  const ok = await requireAdminSession();
  if(ok){ initAdmin(); authMsg.textContent = ''; }
};

document.getElementById('logoutBtn').onclick = async ()=>{
  await supabase.auth.signOut();
  currentUser=null; isAdmin=false;
  showAdmin(false);
};

// Also handle refreshes / existing sessions
requireAdminSession().then(ok => { if(ok) initAdmin(); }).catch(err=>console.error(err));

// ---------- Admin App ----------
async function initAdmin(){
  await Promise.all([loadCategories(), loadProducts(), loadOnhand(), loadOrders(), loadStats()]);
  document.getElementById('prodForm').onsubmit = guarded(saveProduct);
  document.getElementById('invForm').onsubmit  = guarded(addOnhand);
  document.getElementById('csvBtn').onclick   = guarded(exportCSV);
}

// Guard to prevent actions when not admin
function guarded(fn){
  return async function(e){
    if(e) e.preventDefault();
    const ok = await requireAdminSession();
    if(!ok){ alert('Please login as admin.'); return; }
    return fn(e);
  };
}

/* ===== Categories & Products ===== */
async function loadCategories(){
  // categories used for product creation (kept for compatibility)
  const { data: cats, error } = await supabase.from('categories').select('id,name').order('sort');
  const sel = document.getElementById('pCat');
  if(!sel) return;
  sel.innerHTML = '';
  if (error){ console.error('loadCategories error', error); return; }
  cats.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

async function loadProducts(){
  // load all products in admin product list
  const box = document.getElementById('prodList');
  const { data, error } = await supabase.from('products')
    .select('*, categories(name)')
    .order('created_at',{ascending:false});
  if(error){ console.error('loadProducts error',error); if(box) box.textContent = error.message; return; }
  if(!box) return;
  box.innerHTML = '';
  data.forEach(p=>{
    const div = document.createElement('div');
    div.className='item';
    div.innerHTML = `
      <b>${p.name}</b> — ₱${Number(p.price).toFixed(2)} — <i>${p.categories?.name||''}</i>
      <div class="muted">${p.description||''}</div>
      <div class="muted">Stock: ${p.available_stock ?? 0} • ${p.available ? 'Available' : 'Hidden'}</div>
      <div class="actions">
        <button class="btn small" data-act="edit" data-id="${p.id}">Edit</button>
        <button class="btn small" data-act="toggle" data-id="${p.id}">${p.available ? 'Hide' : 'Show'}</button>
      </div>
    `;
    div.querySelector('[data-act="edit"]').onclick   = guarded(()=> fillProduct(p));
    div.querySelector('[data-act="toggle"]').onclick = guarded(async ()=>{
      await supabase.from('products').update({ available: !p.available }).eq('id', p.id);
      await loadProducts();
      await populateProductSelects();
    });
    box.appendChild(div);
  });

  // also populate dropdowns used elsewhere
  await populateProductSelects();
}

function fillProduct(p){
  document.getElementById('pCat').value   = p.category_id || '';
  document.getElementById('pName').value  = p.name || '';
  document.getElementById('pPrice').value = p.price || '';
  document.getElementById('pDesc').value  = p.description || '';
  document.getElementById('pAvail').checked = !!p.available;
  document.getElementById('pStock').value = p.available_stock || 0;
  document.getElementById('prodForm').dataset.editId = p.id;
}

async function saveProduct(e){
  const form = e.target;
  const body = {
    category_id: document.getElementById('pCat').value || null,
    name:        document.getElementById('pName').value,
    price:       parseFloat(document.getElementById('pPrice').value || 0),
    description: document.getElementById('pDesc').value || null,
    available:   document.getElementById('pAvail').checked,
    available_stock: parseInt(document.getElementById('pStock').value || 0)
  };
  const id = form.dataset.editId;
  if (id) await supabase.from('products').update(body).eq('id', id);
  else    await supabase.from('products').insert(body);
  form.reset(); delete form.dataset.editId;
  await loadProducts(); await loadCategories();
}

/* populate dropdowns used in admin forms with available product options */
async function populateProductSelects(){
  // For product selection in inventory and for on-hand add
  const selInv = document.getElementById('invProd');   // on-hand add select
  const selProdForm = document.getElementById('pCat'); // keep categories as before if needed

  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,available,available_stock,price')
    .order('name');

  if(error){ console.error('populateProductSelects', error); return; }

  if(selInv){
    // build with product id, name and stock in option label
    selInv.innerHTML = `<option value="">Select product...</option>`;
    products.forEach(p=>{
      const label = `${p.name} — ₱${Number(p.price||0).toFixed(2)} — ${p.available_stock ?? 0} on-hand`;
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = label;
      // attach metadata via dataset
      opt.dataset.stock = p.available_stock ?? 0;
      opt.dataset.price = p.price ?? 0;
      selInv.appendChild(opt);
    });
  }

  // If you have other selects that need products, populate them similarly
  const prodSelects = document.querySelectorAll('[data-populate-products]');
  prodSelects.forEach(s=>{
    s.innerHTML = `<option value="">Select product...</option>`;
    products.forEach(p=>{
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.name} — ${p.available_stock ?? 0} on-hand`;
      s.appendChild(o);
    });
  });
}

/* ===== On-hand accounts ===== */
async function addOnhand(e){
  e.preventDefault();
  // require fields: product, username, secret, account_type, duration
  const prodId  = document.getElementById('invProd').value;
  const username= document.getElementById('invUser').value.trim();
  const secret  = document.getElementById('invSecret').value.trim();
  const notes   = document.getElementById('invNotes').value.trim();
  const accType = document.querySelector('input[name="accType"]:checked')?.value || 'solo'; // radio
  const duration = document.getElementById('invDuration')?.value || '1 month';

  if(!prodId || !username || !secret){
    return alert('Please select product and fill username & password/token.');
  }

  // compute expires_at based on duration string (simple parser)
  const now = new Date();
  let expiresAt = null;
  if(duration === 'lifetime') expiresAt = null;
  else {
    // parse '1 month', '3 months', '6 months'
    const parts = duration.split(' ');
    const num = parseInt(parts[0]) || 1;
    const unit = parts[1] || 'month';
    const dt = new Date(now);
    if(unit.startsWith('month')) dt.setMonth(dt.getMonth() + num);
    else if(unit.startsWith('day')) dt.setDate(dt.getDate() + num);
    else if(unit.startsWith('year')) dt.setFullYear(dt.getFullYear() + num);
    expiresAt = dt.toISOString();
  }

  // generate a simple order id for trace (can be improved)
  const orderId = 'ORD-' + Math.random().toString(36).slice(2,10).toUpperCase();

  const payload = {
    product_id: prodId,
    username,
    secret,
    notes: notes || null,
    account_type: accType,
    expires_at: expiresAt,
    order_id: orderId,
    assigned: false
  };

  const { error } = await supabase.from('onhand_accounts').insert(payload);
  if(error){ alert('Could not add account: ' + error.message); console.error(error); return; }

  // increment product available_stock via RPC if exists (or simple update fallback)
  try {
    await supabase.rpc('increment_stock', { p_product_id: prodId });
  } catch(e){ 
    // fallback: increment directly (make sure you have permission)
    await supabase.from('products').update({ available_stock: supabase.raw('available_stock + 1') }).eq('id', prodId).catch(()=>{});
  }

  e.target.reset();
  await loadOnhand();
  await loadProducts(); // refresh product stock view
}

/* ===== Load on-hand accounts list ===== */
async function loadOnhand(){
  const box = document.getElementById('invList');
  const { data, error } = await supabase.from('onhand_accounts')
    .select('*, products(name,price)')
    .order('assigned, created_at', {ascending:true});
  if(error){ console.error('loadOnhand', error); if(box) box.textContent = error.message; return; }
  if(!box) return;
  box.innerHTML='';
  data.forEach(a=>{
    const div = document.createElement('div');
    div.className='item';
    const status = a.assigned ? 'Assigned' : 'Available';
    const expires = a.expires_at ? new Date(a.expires_at).toLocaleString() : '—';
    div.innerHTML = `
      <b>${a.products?.name || ''}</b> • ${a.username}
      <div class="muted">${status} ${a.assigned_at ? '• ' + new Date(a.assigned_at).toLocaleString():''}</div>
      <div class="muted">Type: ${a.account_type || 'solo'} • Expires: ${expires}</div>
      <div class="muted">${a.notes || ''}</div>
      <div class="actions">
        <button class="btn small delete" data-id="${a.id}">Delete</button>
      </div>
    `;
    div.querySelector('.delete').onclick = guarded(async ()=>{
      if(!confirm('Delete this on-hand account?')) return;
      await supabase.from('onhand_accounts').delete().eq('id', a.id);
      // optionally decrement stock (depends on your stock logic)
      await loadOnhand(); await loadProducts();
    });
    box.appendChild(div);
  });
}

/* ===== Orders ===== */
async function loadOrders(){
  const box = document.getElementById('orderList');
  const { data, error } = await supabase.from('orders').select('*').order('created_at',{ascending:false});
  if(error){ console.error('loadOrders', error); if(box) box.textContent = error.message; return; }
  if(!box) return;
  box.innerHTML='';
  data.forEach(o=>{
    const div = document.createElement('div');
    div.className='item';
    div.innerHTML = `
      <b>${o.product_name}</b> — ₱${Number(o.price).toFixed(2)} • <i>${o.payment_method||'N/A'}</i>
      <div class="muted">Order ${o.id} • ${o.customer_name} • ${o.customer_email}</div>
      ${o.payment_ref?`<div class="muted">Ref: ${o.payment_ref}</div>`:''}
      ${o.receipt_url?`<div><a target="_blank" href="${o.receipt_url}">View receipt</a></div>`:''}
      ${o.drop_payload ? `
        <div class="card" style="margin:6px 0">
          <b>Delivered:</b> ${o.drop_payload.username} / ${o.drop_payload.secret}
          <br><small>${o.drop_payload.notes || ''}</small>
        </div>` : ''}
      <label>Status:
        <select data-id="${o.id}" class="status">
          ${['pending','paid','completed','cancelled'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}
        </select>
      </label>
      <div class="actions">
        <button data-id="${o.id}" class="btn small save">Save</button>
        <button data-id="${o.id}" class="btn small drop">Confirm Paid & Auto-Drop</button>
      </div>
    `;
    div.querySelector('.save').onclick = guarded(async ()=>{
      const st = div.querySelector('.status').value;
      await supabase.from('orders').update({status:st}).eq('id', o.id);
      loadStats(); loadOrders();
    });
    div.querySelector('.drop').onclick = guarded(async ()=>{
      await supabase.from('orders').update({status:'paid'}).eq('id', o.id);
      const { error } = await supabase.rpc('fulfill_order', { p_order_id: o.id });
      if (error) alert(error.message);
      await loadProducts(); await loadOnhand(); await loadOrders(); await loadStats();
    });
    box.appendChild(div);
  });
}

async function loadStats(){
  const { data } = await supabase.from('orders')
    .select('product_name,status')
    .in('status',['paid','completed']);
  const counts = {};
  data?.forEach(o=>counts[o.product_name]=(counts[o.product_name]||0)+1);
  const html = Object.entries(counts).map(([k,v])=>`<div class="card"><h4>${k}</h4><p class="muted">${v} sold</p></div>`).join('');
  document.getElementById('stats').innerHTML = `<h3>Sales Summary</h3><div class="grid">${html || '<p class="muted">No sales yet.</p>'}</div>`;
}

/* ===== Export CSV ===== */
async function exportCSV(){
  const { data, error } = await supabase.from('orders').select('*');
  if (error) return alert(error.message);
  if (!data.length) return alert('No orders.');
  const headers=Object.keys(data[0]); const rows=[headers.join(',')];
  data.forEach(r=>rows.push(headers.map(h=>`"${(r[h]??'').toString().replace(/"/g,'""')}"`).join(',')));
  const blob=new Blob([rows.join('\n')],{type:'text/csv'}), url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='orders.csv'; a.click(); URL.revokeObjectURL(url);
}
