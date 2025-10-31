import { supabase } from './app.js';

const authBox   = document.getElementById('authBox');
const adminArea = document.getElementById('adminArea');
const authMsg   = document.getElementById('authMsg');

let currentUser=null;

function showAdmin(show){
  if(show){ authBox.classList.add('hidden'); adminArea.classList.remove('hidden'); }
  else    { adminArea.classList.add('hidden'); authBox.classList.remove('hidden'); }
}

async function isAdminSession(){
  const { data:{ session } } = await supabase.auth.getSession();
  if(!session){ showAdmin(false); currentUser=null; return false; }
  currentUser = session.user;
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', currentUser.id).single();
  if(error || !data || data.role!=='admin'){ await supabase.auth.signOut(); authMsg.textContent='Your account is not authorized as admin.'; return false; }
  return true;
}

/* ---------- Auth ---------- */
document.getElementById('loginBtn').onclick = async ()=>{
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){ authMsg.textContent = error.message; return; }
  const ok = await isAdminSession();
  if(ok){ showAdmin(true); initAdmin(); }
};

document.getElementById('logoutBtn').onclick = async ()=>{
  await supabase.auth.signOut();
  showAdmin(false);
};

if(await isAdminSession()){ showAdmin(true); initAdmin(); }

/* ---------- Admin app ---------- */
async function initAdmin(){
  await Promise.all([ loadCategories(), loadProducts(), loadOnhand(), loadOrders(), loadStats() ]);
  document.getElementById('prodForm').onsubmit = guarded(saveProduct);
  document.getElementById('invForm').onsubmit  = guarded(addOnhand);
  document.getElementById('csvBtn').onclick   = guarded(exportCSV);
}

function guarded(fn){
  return async (e)=>{
    if(e) e.preventDefault();
    if(!(await isAdminSession())) return alert('Please login as admin.');
    return fn(e);
  };
}

/* ===== Categories for selects & product pickers ===== */
async function loadCategories(){
  const { data } = await supabase.from('categories').select('*').order('sort');
  const pCat  = document.getElementById('pCat');
  const invSel= document.getElementById('invProd');
  pCat.innerHTML=''; invSel.innerHTML='';

  (data||[]).forEach(c=>{
    pCat.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });

  const { data: prods } = await supabase.from('products').select('id,name').order('name');
  invSel.innerHTML += `<option value="" disabled selected>Select product…</option>`;
  prods?.forEach(p=> invSel.innerHTML += `<option value="${p.id}">${p.name}</option>`);
}

/* ===== Products ===== */
async function loadProducts(){
  const box = document.getElementById('prodList');
  const { data, error } = await supabase.from('products').select('*, categories(name)').order('created_at',{ascending:false});
  if(error){ box.textContent = error.message; return; }
  box.innerHTML = '';
  (data||[]).forEach(p=>{
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <b>${p.name}</b> — ₱${Number(p.price).toFixed(2)} — <i>${p.categories?.name||''}</i>
      <div class="muted">${p.description||''}</div>
      <div class="muted">Stock: ${p.available_stock} • ${p.available? 'Available':'Hidden'}</div>
      <div class="hstack right">
        <button class="btn ghost small" data-act="edit" data-id="${p.id}">Edit</button>
        <button class="btn ghost small" data-act="toggle" data-id="${p.id}">${p.available?'Hide':'Show'}</button>
      </div>`;
    div.querySelector('[data-act="edit"]').onclick   = guarded(()=>fillProduct(p));
    div.querySelector('[data-act="toggle"]').onclick = guarded(async ()=>{
      await supabase.from('products').update({ available: !p.available }).eq('id', p.id);
      loadProducts();
    });
    box.appendChild(div);
  });
}

function fillProduct(p){
  document.getElementById('pCat').value   = p.category_id;
  document.getElementById('pName').value  = p.name;
  document.getElementById('pPrice').value = p.price;
  document.getElementById('pDesc').value  = p.description||'';
  document.getElementById('pAvail').checked = !!p.available;
  document.getElementById('pStock').value = p.available_stock||0;
  document.getElementById('prodForm').dataset.editId = p.id;
}

async function saveProduct(e){
  const body = {
    category_id: document.getElementById('pCat').value,
    name:        document.getElementById('pName').value,
    price:       Number(document.getElementById('pPrice').value || 0),
    description: document.getElementById('pDesc').value || null,
    available:   document.getElementById('pAvail').checked,
    available_stock: Number(document.getElementById('pStock').value || 0)
  };
  const id = e.target.dataset.editId;
  if(id) await supabase.from('products').update(body).eq('id', id);
  else   await supabase.from('products').insert(body);
  e.target.reset(); delete e.target.dataset.editId;
  await loadProducts(); await loadCategories();
}

/* ===== On-hand ===== */
async function addOnhand(e){
  const prodId   = document.getElementById('invProd').value;
  const username = document.getElementById('invUser').value;
  const secret   = document.getElementById('invSecret').value;
  const notes    = document.getElementById('invNotes').value;

  if(!prodId || !username || !secret) return alert('Complete all fields.');
  const { error } = await supabase.from('onhand_accounts').insert({ product_id:prodId, username, secret, notes });
  if(error) alert(error.message);
  else await supabase.rpc('increment_stock', { p_product_id: prodId });
  e.target.reset(); loadOnhand(); loadProducts();
}

async function loadOnhand(){
  const box = document.getElementById('invList');
  const { data, error } = await supabase.from('onhand_accounts')
    .select('*, products(name)').order('assigned, created_at');
  if(error){ box.textContent = error.message; return; }
  box.innerHTML = '';
  (data||[]).forEach(a=>{
    const div=document.createElement('div');
    div.className='card';
    div.innerHTML=`
      <b>${a.products?.name||''}</b> • ${a.username}
      <div class="muted">${a.assigned ? 'Assigned':'Available'}</div>
    `;
    box.appendChild(div);
  });
}

/* ===== Orders ===== */
async function loadOrders(){
  const box = document.getElementById('orderList');
  const { data, error } = await supabase.from('orders').select('*').order('created_at',{ascending:false});
  if(error){ box.textContent = error.message; return; }
  box.innerHTML='';
  (data||[]).forEach(o=>{
    const div = document.createElement('div');
    div.className='card';
    div.innerHTML = `
      <b>${o.product_name}</b> — ₱${Number(o.price).toFixed(2)} • <i>${o.payment_method}</i>
      <div class="muted">Order ${o.id} • ${o.customer_name} • ${o.customer_email}</div>
      ${o.payment_ref?`<div class="muted">Ref: ${o.payment_ref}</div>`:''}
      ${o.receipt_url?`<div><a href="${o.receipt_url}" target="_blank">View receipt</a></div>`:''}
      ${o.drop_payload ? `<div class="card"><b>Delivered:</b> ${o.drop_payload.username} / ${o.drop_payload.secret}<br><small>${o.drop_payload.notes||''}</small></div>`:''}
      <div class="hstack">
        <label>Status
          <select class="input status" data-id="${o.id}">
            ${['pending','paid','completed','cancelled'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}
          </select>
        </label>
        <div class="hstack right" style="flex:1">
          <button class="btn ghost save" data-id="${o.id}">Save</button>
          <button class="btn drop" data-id="${o.id}">Confirm Paid & Auto-Drop</button>
        </div>
      </div>
    `;
    div.querySelector('.save').onclick = guarded(async ()=>{
      const st = div.querySelector('.status').value;
      await supabase.from('orders').update({ status: st }).eq('id', o.id);
      loadStats(); loadOrders();
    });
    div.querySelector('.drop').onclick = guarded(async ()=>{
      await supabase.from('orders').update({ status: 'paid' }).eq('id', o.id);
      const { error } = await supabase.rpc('fulfill_order', { p_order_id: o.id });
      if(error) alert(error.message);
      await loadProducts(); await loadOnhand(); await loadOrders(); await loadStats();
    });
    box.appendChild(div);
  });
}

/* ===== Stats ===== */
async function loadStats(){
  const { data } = await supabase.from('orders')
    .select('product_name,status').in('status',['paid','completed']);
  const counts = {};
  (data||[]).forEach(o=> counts[o.product_name]=(counts[o.product_name]||0)+1 );
  const html = Object.entries(counts).map(([k,v])=>`<div class="card"><h4>${k}</h4><p class="muted">${v} sold</p></div>`).join('');
  document.getElementById('stats').innerHTML = html || '<p class="muted">No sales yet.</p>';
}

/* ===== Export CSV ===== */
async function exportCSV(){
  const { data, error } = await supabase.from('orders').select('*');
  if(error){ alert(error.message); return; }
  if(!data.length){ alert('No orders.'); return; }
  const headers = Object.keys(data[0]);
  const rows = [headers.join(',')];
  data.forEach(r=>{
    rows.push(headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='orders.csv'; a.click(); URL.revokeObjectURL(url);
}
