/* global supabase, $id */

// Small helpers
const msg = (el, t)=> (el.textContent=t);

// State
let currentUser = null;

// Gate
document.addEventListener('DOMContentLoaded', async ()=>{
  await requireAdminSession().then(ok=>{ if(ok) initAdmin(); });
  $id('loginBtn').onclick = doLogin;
  $id('logoutBtn').onclick = async ()=>{ await supabase.auth.signOut(); location.reload(); };
});

async function doLogin(){
  const { error } = await supabase.auth.signInWithPassword({
    email: $id('email').value.trim(),
    password: $id('password').value
  });
  if(error){ msg($id('authMsg'), error.message); return; }
  const ok = await requireAdminSession(); if(ok) initAdmin();
}

async function requireAdminSession(){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){ $id('authBox').classList.remove('hidden'); $id('adminArea').classList.add('hidden'); return false; }
  currentUser = session.user;

  // verify role
  const { data, error } = await supabase.from('user_roles')
    .select('role').eq('user_id', currentUser.id).single();
  if(error || !data || data.role!=='admin'){
    await supabase.auth.signOut();
    msg($id('authMsg'), 'Your account is not authorized as admin.');
    $id('authBox').classList.remove('hidden');
    $id('adminArea').classList.add('hidden');
    return false;
  }
  $id('authBox').classList.add('hidden'); $id('adminArea').classList.remove('hidden');
  return true;
}

async function initAdmin(){
  await Promise.all([loadProducts(), loadOnhand(), loadOrders(), loadStats()]);
  $id('pSave').onclick   = guarded(saveProduct);
  $id('addInv').onclick  = guarded(addOnhand);
  $id('csvBtn').onclick  = guarded(exportCSV);
}

function guarded(fn){ return async (...a)=>{ if(await requireAdminSession()) fn(...a); }; }

/* ========== PRODUCTS ========== */
async function loadProducts(){
  // categories dropdowns
  const { data: prods } = await supabase.from('products').select('id,name,category,price,available,available_stock,description').order('created_at',{ascending:false});
  const catSel = $id('invProd'); catSel.innerHTML = '';
  prods?.forEach(p=>{
    const o = document.createElement('option');
    o.value=p.id; o.textContent=`${p.category} — ${p.name}`; catSel.appendChild(o);
  });

  const list = $id('prodList'); list.innerHTML = '';
  (prods||[]).forEach(p=>{
    const div = document.createElement('div');
    div.className='card';
    div.innerHTML = `
      <div class="flex"><b>${p.name}</b> <span class="muted">${p.category}</span></div>
      <div class="muted">₱${Number(p.price).toFixed(2)} / mo • Stock: ${p.available_stock||0} • ${p.available?'Available':'Hidden'}</div>
      <div class="row" style="margin-top:6px">
        <button class="btn ghost small edit">Edit</button>
        <button class="btn ghost small toggle">${p.available?'Hide':'Show'}</button>
      </div>`;
    div.querySelector('.edit').onclick = ()=>{
      $id('pCat').value = p.category; $id('pName').value=p.name; $id('pPrice').value=p.price;
      $id('pDesc').value=p.description||''; $id('pAvail').checked=!!p.available; $id('pStock').value=p.available_stock||0;
      $id('pSave').dataset.editId = p.id;
    };
    div.querySelector('.toggle').onclick = guarded(async ()=>{
      await supabase.from('products').update({available:!p.available}).eq('id', p.id); loadProducts();
    });
    list.appendChild(div);
  });
}

async function saveProduct(){
  const body = {
    category: $id('pCat').value,
    name: $id('pName').value.trim(),
    price: Number($id('pPrice').value||0),
    description: $id('pDesc').value||null,
    available: $id('pAvail').checked,
    available_stock: Number($id('pStock').value||0)
  };
  const id = $id('pSave').dataset.editId;
  if(id) await supabase.from('products').update(body).eq('id', id);
  else   await supabase.from('products').insert(body);
  delete $id('pSave').dataset.editId;
  [$id('pName'),$id('pPrice'),$id('pDesc'),$id('pStock')].forEach(i=>i.value=''); $id('pAvail').checked=true;
  await loadProducts();
}

/* ========== ON-HAND ========== */
async function addOnhand(){
  const body = {
    product_id: $id('invProd').value,
    username:   $id('invUser').value,
    secret:     $id('invSecret').value,
    notes:      $id('invNotes').value || null,
    ownership_kind: $id('invOwn').value,
    cred_kind:  $id('invCred').value,
    duration_days: parseInt($id('invDur').value,10)
  };
  await supabase.from('onhand_accounts').insert(body);
  await supabase.rpc('increment_stock', { p_product_id: body.product_id });
  [$id('invUser'),$id('invSecret'),$id('invNotes')].forEach(i=>i.value='');
  await loadOnhand(); await loadProducts();
}

async function loadOnhand(){
  const { data, error } = await supabase.from('onhand_accounts')
    .select('id, products(name), username, assigned, assigned_at, ownership_kind, cred_kind, duration_days')
    .order('assigned, created_at');
  const list = $id('invList'); if(error){ list.textContent=error.message; return; }
  list.innerHTML = '';
  (data||[]).forEach(a=>{
    const d = document.createElement('div');
    d.className='card';
    d.innerHTML = `<b>${a.products?.name||''}</b> • ${a.username}
      <div class="muted">${a.assigned?'Assigned':'Available'} ${a.assigned_at?('• '+new Date(a.assigned_at).toLocaleString()):''}
      • ${a.ownership_kind}/${a.cred_kind} • ${a.duration_days}d</div>`;
    list.appendChild(d);
  });
}

/* ========== ORDERS ========== */
async function loadOrders(){
  const { data, error } = await supabase.from('orders').select('*').order('created_at',{ascending:false});
  const box = $id('orderList'); if(error){ box.textContent=error.message; return; }
  box.innerHTML='';
  (data||[]).forEach(o=>{
    const d = document.createElement('div');
    d.className='card';
    d.innerHTML = `
      <div class="flex"><b>${o.product_name}</b><span class="chip">${o.status}</span></div>
      <div class="muted">Order ${o.id} • ${o.customer_email||''}</div>
      <div class="muted">₱${Number(o.price||0).toFixed(2)} • ${o.payment_method||''} ${o.payment_ref?('• Ref '+o.payment_ref):''}</div>
      ${o.receipt_url?`<div><a href="${o.receipt_url}" target="_blank" class="btn ghost small">View receipt</a></div>`:''}
      <div class="row" style="margin-top:8px">
        <select class="stSel">
          ${['pending','paid','completed','cancelled'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}
        </select>
        <button class="btn ghost small save">Save</button>
        <button class="btn small drop">Confirm Paid & Auto-Drop</button>
      </div>`;
    d.querySelector('.save').onclick = async ()=>{
      const st = d.querySelector('.stSel').value;
      await supabase.from('orders').update({status:st}).eq('id', o.id);
      loadOrders(); loadStats();
    };
    d.querySelector('.drop').onclick = async ()=>{
      await supabase.from('orders').update({status:'paid'}).eq('id', o.id);
      const { error } = await supabase.rpc('fulfill_order', { p_order_id: o.id });
      if(error) alert(error.message);
      await loadOnhand(); await loadProducts(); await loadOrders(); await loadStats();
    };
    box.appendChild(d);
  });
}

async function loadStats(){
  const { data } = await supabase.from('orders')
    .select('product_name,status').in('status',['paid','completed']);
  const counts = {}; data?.forEach(o=>counts[o.product_name]=(counts[o.product_name]||0)+1);
  $id('stats').innerHTML = Object.entries(counts).map(([k,v])=>`<div class="card row"><b>${k}</b><span class="muted">${v} sold</span></div>`).join('') || '<p class="muted">No sales yet.</p>';
}

async function exportCSV(){
  const { data, error } = await supabase.from('orders').select('*');
  if(error) return alert(error.message);
  if(!data.length) return alert('No orders.');
  const headers=Object.keys(data[0]); const rows=[headers.join(',')];
  data.forEach(r=>rows.push(headers.map(h=>`"${(r[h]??'').toString().replace(/"/g,'""')}"`).join(',')));
  const blob=new Blob([rows.join('\n')],{type:'text/csv'}), url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='orders.csv'; a.click(); URL.revokeObjectURL(url);
}
