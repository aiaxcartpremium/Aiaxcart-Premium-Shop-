/* global supabase, $id, $on */

// Gate
document.addEventListener('DOMContentLoaded', init);

async function init(){
  const { data: { session } } = await supabase.auth.getSession();

  if(!session){
    $id('authGate').style.display='';
    bindAuth();
    return;
  }
  $id('authGate').style.display='none';
  $id('app').style.display='';
  $id('logoutBtn').onclick = async ()=>{ await supabase.auth.signOut(); location.href='index.html'; };

  await loadOrders();
}

function bindAuth(){
  const email = $id('loginEmail'), pass = $id('loginPass'), msg = $id('authMsg');

  $id('loginForm').addEventListener('submit', e=>e.preventDefault());

  $id('loginBtn').onclick = async ()=>{
    msg.textContent = '';
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if(error){ msg.textContent = error.message; return; }
    location.reload();
  };

  $id('signupBtn').onclick = async ()=>{
    msg.textContent = '';
    const { error } = await supabase.auth.signUp({ email: email.value.trim(), password: pass.value });
    if(error){ msg.textContent = error.message; return; }
    msg.textContent = 'Account created. Please sign in.';
  };
}

const ordersBox = $id('ordersBox');

async function loadOrders(){
  ordersBox.innerHTML = '<p class="muted">Loading…</p>';

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;

  const { data, error } = await supabase.from('orders')
    .select('id,product_name,status,price,created_at,delivered_at,drop_payload,duration_days,payment_method,payment_ref,receipt_url')
    .eq('customer_id', uid)
    .order('created_at',{ascending:false});

  if(error){ ordersBox.innerHTML = `<p class="muted">${error.message}</p>`; return; }
  if(!data?.length){ ordersBox.innerHTML = '<p class="muted">No orders yet.</p>'; return; }

  ordersBox.innerHTML = data.map(renderOrder).join('');
}

function renderOrder(o){
  const when = new Date(o.created_at).toLocaleString();
  const price = `₱${Number(o.price||0).toFixed(2)}`;

  let delivered = '';
  if(o.delivered_at && o.drop_payload){
    const pp = o.drop_payload||{};
    const exp = pp.expiry_at ? new Date(pp.expiry_at).toLocaleString() : '';
    delivered = `
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

  const receipt = o.receipt_url ? `<a class="btn ghost small" target="_blank" href="${o.receipt_url}">View receipt</a>`:'';

  return `
    <div class="card">
      <div class="flex"><b>${escapeHtml(o.product_name)}</b><span class="chip">${o.status}</span></div>
      <div class="muted">Placed: ${when} • Duration: ${o.duration_days||30} days</div>
      <div class="divider"></div>
      <div class="row" style="justify-content:space-between">
        <div class="muted">Payment: ${escapeHtml(o.payment_method||'')} ${o.payment_ref?`• Ref: ${escapeHtml(o.payment_ref)}`:''}</div>
        <div class="row" style="gap:8px">${receipt}<a class="btn" href="feedback.html" target="_blank">Leave feedback</a></div>
      </div>
      <div class="price" style="margin-top:6px">${price}</div>
      ${delivered}
    </div>`;
}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
