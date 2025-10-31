/* global supabase */

// -------------------- Config you can tweak --------------------
const SHARED_FACTOR = 0.60;  // shared price = price * factor
const GCASH_NUMBER  = '09XX-XXX-XXXX';
const MAYA_NUMBER   = '09YY-YYY-YYYY';
// --------------------------------------------------------------

const el = id => document.getElementById(id);
const ordersBox = el('ordersBox');

let me = null;
let products = [];

// ===== INIT / AUTH GATE ======================================
init();

async function init(){
  // 1) Ensure Supabase client exists
  if (!supabase || !supabase.auth) {
    console.error('Supabase client missing. Check app.js include order.');
    return;
  }

  // 2) Check session
  const { data: { session } } = await supabase.auth.getSession();

  if(!session){
    // show auth gate, wire events
    el('authGate').style.display = '';
    el('app').style.display      = 'none';
    bindAuth();
    return;
  }

  // logged-in view
  me = session.user;
  el('logoutBtn').style.display = '';
  el('logoutBtn').onclick = async ()=>{
    await supabase.auth.signOut();
    location.reload();
  };

  el('authGate').style.display = 'none';
  el('app').style.display      = '';

  await Promise.all([loadProducts(), loadOrders()]);
  bindCheckout();
}

function bindAuth(){
  const email = el('loginEmail');
  const pass  = el('loginPass');
  const msg   = el('authMsg');
  const form  = document.getElementById('signinForm');

  async function doSignIn(){
    msg.textContent = '';
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: pass.value
    });
    if (error){
      msg.textContent = error.message;
      return;
    }
    // Only on success we reload (to show the app section)
    location.reload();
  }

  async function doSignUp(){
    msg.textContent = '';
    const { error } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: pass.value
    });
    if (error){
      msg.textContent = error.message;
      return;
    }
    msg.textContent = 'Account created. Please check your email to confirm, then sign in.';
  }

  // Submit (Enter) – prevents default, won’t clear fields
  form?.addEventListener('submit', (e)=>{
    e.preventDefault();
    doSignIn();
  });

  // Clicks
  el('loginBtn') ?.addEventListener('click', (e)=>{ e.preventDefault(); doSignIn(); });
  el('signupBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); doSignUp();  });
}

// ===== PRODUCTS + CHECKOUT ===================================
async function loadProducts(){
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,available')
    .eq('available', true)
    .order('name');

  if(error){ console.error(error); alert(error.message); return; }
  products = data || [];

  const pSel = el('pSel');
  pSel.innerHTML = '';
  products.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ₱${Number(p.price).toFixed(2)}/mo`;
    pSel.appendChild(opt);
  });

  // defaults
  el('ownSel').value = 'solo';
  el('credSel').value = 'account';
  el('durSel').value  = '30';

  updateAmount();
}

function bindCheckout(){
  ['pSel','ownSel','credSel','durSel'].forEach(id=>{
    el(id).addEventListener('change', updateAmount);
  });

  document.querySelectorAll('input[name="pm"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      const pm = getPM();
      el('gcashInfo').style.display = (pm==='gcash')? 'flex':'none';
      el('mayaInfo').style.display  = (pm==='maya')?  'flex':'none';
    });
  });

  el('gcashNum').textContent = GCASH_NUMBER;
  el('mayaNum').textContent  = MAYA_NUMBER;

  el('placeBtn').onclick = placeOrder;
}

function getPM(){
  return document.querySelector('input[name="pm"]:checked')?.value || 'gcash';
}

function updateAmount(){
  const prod = products.find(p=>p.id === el('pSel').value);
  if(!prod){ el('amountTxt').textContent = '₱0.00'; return; }

  const days    = parseInt(el('durSel').value,10);
  const months  = Math.max(1, Math.round(days / 30 * 100) / 100); // approx to 2dp
  const shared  = (el('ownSel').value === 'shared');

  const base  = Number(prod.price) * months;
  const total = shared ? base * SHARED_FACTOR : base;

  el('amountTxt').textContent = `₱${total.toFixed(2)}`;
}

// ===== PLACE ORDER ===========================================
async function placeOrder(){
  try{
    el('msg').textContent = '';

    const prod = products.find(p=>p.id === el('pSel').value);
    if(!prod) throw new Error('Please select a product.');

    const payload = {
      product_id:     prod.id,
      product_name:   prod.name,
      price:          Number(el('amountTxt').textContent.replace(/[₱,]/g,'')) || 0,
      status:         'pending',
      payment_method: getPM(),
      payment_ref:    el('refNo').value.trim() || null,
      payment_sent_at: el('sentAt').value ? new Date(el('sentAt').value).toISOString() : null,
      duration_days:  parseInt(el('durSel').value,10) || 30,
      ownership_kind: el('ownSel').value,
      cred_kind:      el('credSel').value,
      customer_id:    me?.id ?? null,
      customer_email: me?.email ?? null,
      customer_name:  me?.user_metadata?.name ?? null
    };

    let { data: order, error } = await supabase
      .from('orders')
      .insert(payload)
      .select()
      .single();

    if(error) throw error;

    // optional receipt upload
    const f = el('receiptFile').files?.[0];
    if(f){
      const path = `${order.id}/${Date.now()}_${f.name.replace(/[^a-z0-9_.-]/gi,'_')}`;
      const up = await supabase.storage.from('receipts').upload(path, f, { upsert:false });
      if(up.error) throw up.error;

      const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
      await supabase.from('orders').update({ receipt_url: pub.publicUrl }).eq('id', order.id);
    }

    el('msg').textContent = 'Order placed. You’ll see it below after refresh.';
    el('refNo').value = ''; el('sentAt').value=''; el('receiptFile').value = '';

    await loadOrders();
  }catch(err){
    el('msg').textContent = err.message;
  }
}

// ===== ORDERS VIEW ===========================================
async function loadOrders(){
  ordersBox.innerHTML = '<p class="muted">Loading…</p>';

  const filter = me?.id
    ? q => q.eq('customer_id', me.id)
    : q => q.eq('customer_email', me?.email ?? '__');

  let q = supabase.from('orders')
    .select('id, product_name, status, price, created_at, delivered_at, drop_payload, duration_days, payment_method, payment_ref, receipt_url')
    .order('created_at',{ascending:false});

  const { data, error } = await filter(q);

  if(error){ ordersBox.innerHTML = `<p class="muted">${error.message}</p>`; return; }
  if(!data?.length){ ordersBox.innerHTML = '<p class="muted">No orders yet.</p>'; return; }

  ordersBox.innerHTML = '';
  data.forEach(o=>{
    const div = document.createElement('div');
    div.className = 'card';
    const price = `₱${Number(o.price||0).toFixed(2)}`;

    let deliveredView = '';
    if(o.delivered_at && o.drop_payload){
      const pp = o.drop_payload;
      const exp = pp.expiry_at ? new Date(pp.expiry_at).toLocaleString() : '';
      deliveredView = `
        <details style="margin-top:8px">
          <summary>View delivered credentials</summary>
          <div class="field" style="margin-top:8px">
            <div><b>Username/Email/Code:</b> ${escapeHtml(pp.username||'')}</div>
            <div><b>Password/Token:</b> ${escapeHtml(pp.secret||'')}</div>
            ${pp.notes ? `<div><b>Notes:</b> ${escapeHtml(pp.notes)}</div>`:''}
            <div class="muted">Ownership: ${escapeHtml(pp.ownership_kind||'')}</div>
            <div class="muted">Type: ${escapeHtml(pp.cred_kind||'')}</div>
            ${exp ? `<div class="muted">Expires: ${exp}</div>`:''}
            <div class="muted">Delivered: ${new Date(o.delivered_at).toLocaleString()}</div>
          </div>
        </details>`;
    }

    const receiptLink = o.receipt_url ? `<a class="btn ghost" href="${o.receipt_url}" target="_blank">View receipt</a>` : '';

    div.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>${escapeHtml(o.product_name)}</b> <span class="chip">${o.status}</span></div>
        <div style="font-weight:700">${price}</div>
      </div>
      <div class="muted">Placed: ${new Date(o.created_at).toLocaleString()} • Duration: ${o.duration_days||30} days</div>
      <div class="row" style="justify-content:space-between; margin-top:8px">
        <div class="muted">Payment: ${escapeHtml(o.payment_method||'')} ${o.payment_ref?`• Ref: ${escapeHtml(o.payment_ref)}`:''}</div>
        <div class="row">
          ${receiptLink}
          <a class="btn" href="feedback.html" target="_blank">Leave feedback</a>
        </div>
      </div>
      ${deliveredView}
    `;
    ordersBox.appendChild(div);
  });
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  ));
}
