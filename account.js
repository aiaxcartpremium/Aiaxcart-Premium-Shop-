import { supabase } from './app.js';

// ---------- DOM ----------
const authBox = document.getElementById('authBox');
const acctBox = document.getElementById('acctBox');
const meName  = document.getElementById('meName');

const suName = document.getElementById('suName');
const suEmail = document.getElementById('suEmail');
const suPass = document.getElementById('suPass');
const suBtn = document.getElementById('suBtn');
const suMsg = document.getElementById('suMsg');

const siEmail = document.getElementById('siEmail');
const siPass = document.getElementById('siPass');
const siBtn = document.getElementById('siBtn');
const siMsg = document.getElementById('siMsg');

const outBtn = document.getElementById('outBtn');

const oProd = document.getElementById('oProd');
const oPay  = document.getElementById('oPay');
const oRef  = document.getElementById('oRef');
const oFile = document.getElementById('oFile');
const oBtn  = document.getElementById('oBtn');
const oMsg  = document.getElementById('oMsg');
const oList = document.getElementById('oList');

let sessionUser = null;

// ---------- helpers ----------
function showAuth(signedIn){
  if(signedIn){ authBox.style.display='none'; acctBox.style.display='block'; }
  else        { acctBox.style.display='none'; authBox.style.display='block'; }
}

async function loadProducts(){
  const { data, error } = await supabase.from('products')
    .select('id,name,category,price,available,available_stock')
    .eq('available', true)
    .order('category', { ascending: true });
  oProd.innerHTML = '';
  if(error){ oProd.innerHTML = '<option>Failed to load</option>'; return; }
  data.forEach(p=>{
    const label = `${p.category || '—'} • ${p.name} ${p.price ? '— ₱'+Number(p.price).toFixed(2) : ''} ${p.available_stock!=null?'• '+p.available_stock+' on-hand':''}`;
    oProd.insertAdjacentHTML('beforeend', `<option value="${p.id}">${label}</option>`);
  });
}

async function loadOrders(){
  const { data, error } = await supabase
    .from('orders')
    .select('id,created_at,product_id,product_name,price,payment_method,payment_ref,status,drop_payload,delivered_at')
    .order('created_at',{ascending:false});
  if(error){ oList.textContent = error.message; return; }
  if(!data?.length){ oList.textContent = 'No orders yet.'; return; }
  oList.innerHTML = data.map(row=>{
    const cred = row.drop_payload ? `
      <div class="cred">
        <b>Delivered:</b> ${new Date(row.delivered_at).toLocaleString()}<br/>
        <pre>${JSON.stringify(row.drop_payload, null, 2)}</pre>
      </div>` : '';
    return `
    <div class="card" style="margin:10px 0">
      <div><b>${row.product_name || '(product)'}</b>
        <span class="pill">${row.status}</span>
      </div>
      <div class="muted">Order ${row.id} • ${new Date(row.created_at).toLocaleString()}</div>
      ${cred}
    </div>`;
  }).join('');
}

// ---------- auth listeners ----------
supabase.auth.onAuthStateChange(async (_evt, sess)=>{
  sessionUser = sess?.user || null;
  if(sessionUser){
    showAuth(true);
    meName.textContent = sessionUser.user_metadata?.full_name || sessionUser.email;
    await loadProducts();
    await loadOrders();
  }else{
    showAuth(false);
  }
});

// ---------- actions ----------
suBtn.onclick = async ()=>{
  suMsg.textContent = 'Creating account...';
  const { data, error } = await supabase.auth.signUp({
    email: suEmail.value.trim(),
    password: suPass.value,
    options: { data: { full_name: suName.value.trim() } }
  });
  suMsg.textContent = error ? error.message : 'Check your inbox to confirm email, then sign in.';
};

siBtn.onclick = async ()=>{
  siMsg.textContent = 'Signing in...';
  const { error } = await supabase.auth.signInWithPassword({
    email: siEmail.value.trim(),
    password: siPass.value
  });
  siMsg.textContent = error ? error.message : '';
};

outBtn.onclick = async ()=>{ await supabase.auth.signOut(); };

// ---------- place order ----------
oBtn.onclick = async ()=>{
  if(!sessionUser) return;
  oBtn.disabled = true; oMsg.textContent = 'Placing order...';

  // optional receipt upload
  let receipt_url = null;
  const file = oFile.files?.[0];
  if(file){
    // store under receipts/<user_id>/<timestamp>_<filename>
    const path = `${sessionUser.id}/${Date.now()}_${file.name}`;
    const up = await supabase.storage.from('receipts').upload(path, file, { upsert:false });
    if(up.error){ oMsg.textContent = 'Upload failed: ' + up.error.message; oBtn.disabled = false; return; }
    const pub = supabase.storage.from('receipts').getPublicUrl(path);
    receipt_url = pub.data.publicUrl;
  }

  // fetch product data (for name/price snapshot)
  const pid = oProd.value;
  const { data: prod } = await supabase.from('products').select('id,name,price').eq('id', pid).single();

  // create order for *this* user
  const { data: ord, error } = await supabase.from('orders').insert({
    user_id: sessionUser.id,
    product_id: pid,
    product_name: prod?.name || null,
    price: prod?.price || 0,
    payment_method: oPay.value,
    payment_ref: oRef.value.trim(),
    receipt_url,
    status: 'pending'   // or 'paid' if you auto-confirm
  }).select('id').single();

  if(error){ oMsg.textContent = error.message; oBtn.disabled = false; return; }
  oMsg.textContent = 'Order placed! ID: ' + ord.id + '. Once paid & confirmed, credentials will appear below.';
  oRef.value=''; oFile.value = '';
  await loadOrders();
  oBtn.disabled = false;
};
