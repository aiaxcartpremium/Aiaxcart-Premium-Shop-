/* global supabase */

// QUICK allow-list. Add your admin emails here:
const ADMIN_EMAILS = [
  'shanaiamau99@gmail.com'
];

const loginGate = document.getElementById('loginGate');
const consoleBox = document.getElementById('console');

const adEmail = document.getElementById('adEmail');
const adPass  = document.getElementById('adPass');
const adLogin = document.getElementById('adLogin');
const adLogout= document.getElementById('adLogout');
const adMsg   = document.getElementById('adMsg');

const pName = document.getElementById('pName');
const pCat  = document.getElementById('pCat');
const pPrice= document.getElementById('pPrice');
const pAvail= document.getElementById('pAvail');
const addProd = document.getElementById('addProd');
const prodList= document.getElementById('prodList');

const invProd = document.getElementById('invProd');
const invUser = document.getElementById('invUser');
const invSecret = document.getElementById('invSecret');
const invOwn = document.getElementById('invOwn');
const invCred = document.getElementById('invCred');
const invDays = document.getElementById('invDays');
const invNotes = document.getElementById('invNotes');
const addInv = document.getElementById('addInv');
const invList = document.getElementById('invList');

const ordersBox = document.getElementById('ordersBox');

let me = null;
let products = [];

init();

async function init(){
  const { data } = await supabase.auth.getSession();
  me = data.session?.user ?? null;

  if(!me){
    // show login form
    loginGate.style.display = '';
    adLogin.onclick = doAdminLogin;
    return;
  }
  // already logged in — check role
  if(!isAdmin(me.email)){
    showNotAdmin();
    return;
  }
  bootstrapConsole();
}

function isAdmin(email){
  return ADMIN_EMAILS.map(s=>s.toLowerCase().trim()).includes((email||'').toLowerCase().trim());
}

async function doAdminLogin(){
  adMsg.textContent = '';
  const { data, error } = await supabase.auth.signInWithPassword({
    email: adEmail.value.trim(),
    password: adPass.value
  });
  if(error){ adMsg.textContent = error.message; return; }
  me = data.user;
  if(!isAdmin(me.email)){
    adMsg.textContent = 'Your account is not authorized as admin.';
    await supabase.auth.signOut();
    return;
  }
  bootstrapConsole();
}

function showNotAdmin(){
  loginGate.style.display = '';
  adMsg.textContent = 'Your account is not authorized as admin.';
}

function bootstrapConsole(){
  loginGate.style.display = 'none';
  consoleBox.style.display = '';
  adLogout.onclick = async ()=>{ await supabase.auth.signOut(); location.href='index.html'; };
  wireActions();
  refreshAll();
}

function wireActions(){
  addProd.onclick = upsertProduct;
  addInv.onclick = addInventory;
}

async function refreshAll(){
  await loadProducts();
  await loadInventory();
  await loadOrders();
}

// ----- PRODUCTS -----
async function loadProducts(){
  const { data, error } = await supabase
    .from('products')
    .select('id,name,category,price,available')
    .order('name');

  if(error){ prodList.innerHTML = `<p class="warn">${error.message}</p>`; return; }
  products = data || [];

  // fill select
  invProd.innerHTML = '';
  products.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    invProd.appendChild(opt);
  });

  // list
  prodList.innerHTML = '';
  products.forEach(p=>{
    const item = document.createElement('div');
    item.className = 'row';
    item.style.justifyContent = 'space-between';
    item.innerHTML = `
      <div>
        <b>${escapeHtml(p.name)}</b>
        <span class="muted">${escapeHtml(p.category||'')}</span>
        <span class="muted">₱${Number(p.price||0).toFixed(2)}/mo</span>
        ${p.available ? '<span class="chip">Available</span>' : '<span class="chip">Hidden</span>'}
      </div>
      <button class="btn ghost" data-id="${p.id}">Edit</button>
    `;
    item.querySelector('button').onclick = ()=>fillProduct(p);
    prodList.appendChild(item);
  });
}

function fillProduct(p){
  pName.value = p.name || '';
  pCat.value  = p.category || '';
  pPrice.value= p.price ?? '';
  pAvail.checked = !!p.available;
  // keep current product id on the button dataset
  addProd.dataset.editId = p.id;
}

async function upsertProduct(){
  const name = pName.value.trim();
  if(!name){ alert('Name required'); return; }

  const payload = {
    name,
    category: pCat.value.trim() || null,
    price: Number(pPrice.value||0),
    available: !!pAvail.checked
  };

  let q = supabase.from('products');
  const id = addProd.dataset.editId;
  if(id){
    const { error } = await q.update(payload).eq('id', id);
    if(error){ alert(error.message); return; }
    addProd.dataset.editId = '';
  }else{
    const { error } = await q.insert(payload);
    if(error){ alert(error.message); return; }
  }
  pName.value = pCat.value = pPrice.value = '';
  pAvail.checked = true;
  await loadProducts();
}

// ----- INVENTORY -----
async function loadInventory(){
  const { data, error } = await supabase
    .from('onhand_accounts')
    .select('id, product_id, username, ownership_kind, cred_kind, duration_days, assigned')
    .order('created_at', { ascending:false })
    .limit(50);

  if(error){ invList.innerHTML = `<p class="warn">${error.message}</p>`; return; }
  const byId = Object.fromEntries(products.map(p=>[p.id,p]));
  invList.innerHTML = '';
  (data||[]).forEach(r=>{
    const div = document.createElement('div');
    div.className = 'row';
    div.style.justifyContent = 'space-between';
    const prod = byId[r.product_id];
    div.innerHTML = `
      <div>
        <b>${escapeHtml(prod?.name || 'Unknown')}</b>
        <span class="muted">${escapeHtml(r.username||'')}</span>
        <span class="muted">${escapeHtml(r.ownership_kind||'')} • ${escapeHtml(r.cred_kind||'')} • ${r.duration_days||0}d</span>
        ${r.assigned ? '<span class="chip">Assigned</span>' : '<span class="chip">Available</span>'}
      </div>
      <button class="btn ghost" data-id="${r.id}">Delete</button>
    `;
    div.querySelector('button').onclick = ()=>deleteInventory(r.id);
    invList.appendChild(div);
  });
}

async function addInventory(){
  const payload = {
    product_id: invProd.value,
    username: invUser.value.trim(),
    secret: invSecret.value.trim(),
    ownership_kind: invOwn.value,
    cred_kind: invCred.value,
    duration_days: parseInt(invDays.value,10)||30,
    notes: invNotes.value.trim() || null,
    assigned: false
  };
  if(!payload.product_id || !payload.username || !payload.secret){
    alert('Product, username and password/token are required.');
    return;
  }
  const { error } = await supabase.from('onhand_accounts').insert(payload);
  if(error){ alert(error.message); return; }
  invUser.value = invSecret.value = invNotes.value = '';
  await loadInventory();
}

async function deleteInventory(id){
  const { error } = await supabase.from('onhand_accounts').delete().eq('id', id);
  if(error){ alert(error.message); return; }
  await loadInventory();
}

// ----- ORDERS -----
async function loadOrders(){
  const { data, error } = await supabase
    .from('orders')
    .select('id,created_at,product_name,status,price,customer_email,payment_method,payment_ref,delivered_at')
    .order('created_at', { ascending:false })
    .limit(100);

  if(error){ ordersBox.innerHTML = `<p class="warn">${error.message}</p>`; return; }

  ordersBox.innerHTML = '';
  (data||[]).forEach(o=>{
    const div = document.createElement('div');
    div.className = 'row';
    div.style.justifyContent = 'space-between';
    div.innerHTML = `
      <div>
        <b>${escapeHtml(o.product_name)}</b> <span class="chip">${o.status}</span>
        <div class="muted">${escapeHtml(o.customer_email||'')}</div>
        <div class="muted">Payment: ${escapeHtml(o.payment_method||'')} ${o.payment_ref?('• Ref: '+escapeHtml(o.payment_ref)) : ''}</div>
        <div class="muted">${new Date(o.created_at).toLocaleString()}</div>
      </div>
      <div class="price">₱${Number(o.price||0).toFixed(2)}</div>
    `;
    ordersBox.appendChild(div);
  });
}

function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
