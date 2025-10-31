/* global supabase */

// Tweakables
const SHARED_FACTOR = 0.60;      // shared price multiplier
const GCASH_NUMBER  = '09XX-XXX-XXXX';
const MAYA_NUMBER   = '09YY-YYY-YYYY';

const el = id => document.getElementById(id);

let me = null;
let products = [];

init();

async function init(){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){
    // show simple inline auth form here (no redirect)
    document.getElementById('authGate').style.display = '';
    bindInlineAuth();
    return;
  }
  me = session.user;

  el('logoutBtn').onclick = async ()=>{ await supabase.auth.signOut(); location.reload(); };

  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = '';

  await Promise.all([loadProducts(), loadOrders()]);
  bindCheckout();
}

function bindInlineAuth(){
  const email = el('loginEmail'), pass = el('loginPass'), msg = el('authMsg');
  el('loginBtn').onclick = async ()=>{
    msg.textContent=''; const {error}=await supabase.auth.signInWithPassword({ email:email.value.trim(), password:pass.value });
    if(error){ msg.textContent=error.message; return; } location.reload();
  };
  el('signupBtn').onclick = async ()=>{
    msg.textContent=''; const {error}=await supabase.auth.signUp({ email:email.value.trim(), password:pass.value });
    msg.textContent = error ? error.message : 'Account created. Please sign in.';
  };
}

async function loadProducts(){
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,available')
    .eq('available', true)
    .order('name');
  if(error){ alert(error.message); return; }
  products = data || [];

  const pSel = el('pSel');
  pSel.innerHTML = '';
  products.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    pSel.appendChild(opt);
  });

  el('ownSel').value = 'solo';
  el('credSel').value = 'account';
  el('durSel').value  = '30';
  updateAmount();
}

function bindCheckout(){
  ['pSel','ownSel','credSel','durSel'].forEach(id=> el(id).addEventListener('change', updateAmount));

  document.querySelectorAll('input[name="pm"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      const pm = getPM();
      el('gcashInfo').style.display = pm==='gcash' ? 'flex' : 'none';
      el('mayaInfo').style.display  = pm==='maya'  ? 'flex' : 'none';
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
  const days = parseInt(el('durSel').value,10);
  const months = Math.max(1, Math.round(days/30*100)/100);
  const isShared = el('ownSel').value === 'shared';
  const total = (Number(prod.price||0) * months) * (isShared? SHARED_FACTOR : 1);
  el('amountTxt').textContent = `₱${total.toFixed(2)}`;
}

async function placeOrder(){
  try{
    el('msg').textContent = '';
    const prod = products.find(p=>p.id === el('pSel').value); if(!prod) throw new Error('Pick a product.');

    const payload = {
      product_id: prod.id,
      product_name: prod.name,
      price: Number(el('amountTxt').textContent.replace(/[₱,]/g,''))||0,
      status: 'pending',
      payment_method: getPM(),
      payment_ref: el('refNo').value.trim() || null,
      payment_sent_at: el('sentAt').value ? new Date(el('sentAt').value).toISOString() : null,
      duration_days: parseInt(el('durSel').value,10)||30,
      ownership_kind: el('ownSel').value,
      cred_kind: el('credSel').value,
      customer_id: me?.id ?? null,
      customer_email: me?.email ?? null
    };

    let { data: order, error } = await supabase.from('orders').insert(payload).select().single();
    if(error) throw error;

    const f = el('receiptFile').files?.[0];
    if(f){
      const path = `${order.id}/${Date.now()}_${f.name.replace(/[^a-z0-9_.-]/gi,'_')}`;
      const up = await supabase.storage.from('receipts').upload(path, f, { upsert:false });
      if(!up.error){
        const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
        await supabase.from('orders').update({ receipt_url: pub.publicUrl }).eq('id', order.id);
      }
    }

    el('msg').textContent = 'Order placed. It will appear below after a moment.';
    el('refNo').value = ''; el('sentAt').value=''; el('receiptFile').value='';
    await loadOrders();
  }catch(err){ el('msg').textContent = err.message; }
}

async function loadOrders(){
  const q = supabase.from('orders')
    .select('id,product_name,status,price,created_at,delivered_at,drop_payload,duration_days,payment_method,payment_ref,receipt_url')
    .order('created_at',{ascending:false})
    .eq('customer_id', me?.id);

  const { data, error } = await q;
  if(error){ el('ordersBox').innerHTML = `<p class="warn">${error.message}</p>`; return; }
  if(!data?.length){ el('ordersBox').innerHTML = '<p class="muted">No orders yet.</p>'; return; }

  el('ordersBox').innerHTML = '';
  data.forEach(o=>{
    const div = document.createElement('div'); div.className = 'card';
    const price = `₱${Number(o.price||0).toFixed(2)}`;
    const when = new Date(o.created_at).toLocaleString();
    let deliveredView = '';
    if(o.delivered_at && o.drop_payload){
      const pp = o.drop_payload || {};
      const exp = pp.expiry_at ? new Date(pp.expiry_at).toLocaleString() : '';
      deliveredView = `
        <details style="margin-top:8px">
          <summary>View delivered credentials</summary>
          <div class="field" style="margin-top:8px">
            <div><b>User/Email/Code:</b> ${escapeHtml(pp.username||'')}</div>
            <div><b>Password/Token:</b> ${escapeHtml(pp.secret||'')}</div>
            ${pp.notes ? `<div><b>Notes:</b> ${escapeHtml(pp.notes)}</div>`:''}
            ${exp ? `<div class="muted">Expires: ${exp}</div>`:''}
            <div class="muted">Delivered: ${new Date(o.delivered_at).toLocaleString()}</div>
          </div>
        </details>`;
    }
    const receipt = o.receipt_url ? `<a class="btn ghost" href="${o.receipt_url}" target="_blank">View receipt</a>` : '';

    div.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>${escapeHtml(o.product_name)}</b> <span class="chip">${o.status}</span></div>
        <div class="price">${price}</div>
      </div>
      <div class="muted">Placed: ${when} • Duration: ${o.duration_days||30} days</div>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <div class="muted">Payment: ${escapeHtml(o.payment_method||'')} ${o.payment_ref?`• Ref: ${escapeHtml(o.payment_ref)}`:''}</div>
        <div class="row" style="gap:8px">${receipt}<a class="btn" href="feedback.html" target="_blank">Leave feedback</a></div>
      </div>
      ${deliveredView}
    `;
    el('ordersBox').appendChild(div);
  });
}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
