/* global supabase */

import { supabase } from './app.js';

// ====== AUTH modal controls on storefront ======
(function authModalWiring(){
  const open = document.getElementById('openAuth');
  const close = document.getElementById('closeAuth');
  const modal = document.getElementById('authModal');
  const email = document.getElementById('authEmail');
  const pass  = document.getElementById('authPass');
  const msg   = document.getElementById('authMsg');

  if(!open || !modal) return;

  open.onclick  = ()=> { modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); };
  close.onclick = ()=> { modal.classList.add('hidden');    modal.setAttribute('aria-hidden','true');  };

  document.getElementById('doLogin').onclick = async ()=>{
    msg.textContent = '';
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(), password: pass.value
    });
    if(error){ msg.textContent = error.message; return; }
    // stay on page; user can now go to My Account
    modal.classList.add('hidden');
  };

  document.getElementById('doSignup').onclick = async ()=>{
    msg.textContent = '';
    const { error } = await supabase.auth.signUp({
      email: email.value.trim(), password: pass.value
    });
    if(error){ msg.textContent = error.message; return; }
    msg.textContent = 'Account created. Please sign in.';
  };
})();

// ====== PRODUCTS RENDERING ======
let products = []; // keep
const grid = document.getElementById('cards'); // your products container

export async function loadProductsForStore(){
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,available')
    .eq('available', true)
    .order('name');

  if(error){ console.error(error); return; }
  products = data || [];

  // Render cards (use your existing card template if you like)
  grid.innerHTML = products.map(p => `
    <div class="card">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="muted">₱${Number(p.price||0).toFixed(2)}</div>
      <button class="btn order-btn" data-id="${p.id}">Order</button>
    </div>
  `).join('');
}

// ====== ORDER BUTTON HANDLER (event delegation) ======
grid?.addEventListener('click', (e)=>{
  const btn = e.target.closest('.order-btn');
  if(!btn) return;
  const id = btn.dataset.id;
  openCheckout(id);
});

// ====== OPEN CHECKOUT WITH YOUR EXISTING FLOW ======
function openCheckout(productId){
  // preload product in your existing checkout panel / modal
  const sel = document.getElementById('pSel');
  if(sel){
    sel.value = productId;
    sel.dispatchEvent(new Event('change'));
  }
  // show the checkout panel/modal you already have
  document.getElementById('checkoutPanel')?.classList.remove('hidden');
}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// kick it
loadProductsForStore();


/* ---------- On-hand (public view) ---------- */
async function loadOnhand(){
  const { data } = await supabase.from('onhand_public').select('*').eq('assigned',false);
  onhandList.innerHTML = data?.length ? data.map(o=>`
    <div class="card">
      <h4>${o.product_name}</h4>
      <p>User: ${o.username}</p>
      <p class="muted">${o.notes||''}</p>
    </div>
  `).join('') : '<p class="muted">No on-hand accounts yet.</p>';
}

/* ---------- Checkout ---------- */
let CURRENT=null;

function openCheckout(id){
  CURRENT = PRODS.find(p=>p.id===id);
  if(!CURRENT) return;
  document.getElementById('ckTitle').textContent = CURRENT.name;
  document.getElementById('ckSubtitle').textContent = '₱' + Number(CURRENT.price).toFixed(2);
  document.getElementById('ckName').value='';
  document.getElementById('ckEmail').value='';
  document.getElementById('ckRef').value='';
  document.getElementById('ckFile').value='';
  document.getElementById('ckMsg').textContent='';
  dlg.showModal();
}

document.getElementById('placeBtn').onclick = async ()=>{
  const name = document.getElementById('ckName').value.trim();
  const email= document.getElementById('ckEmail').value.trim();
  const ref  = document.getElementById('ckRef').value.trim();
  const file = document.getElementById('ckFile').files[0];
  const msgEl= document.getElementById('ckMsg');

  if(!name || !email){ msgEl.textContent='Please fill your name and email.'; return; }
  if(!ref && !file){ msgEl.textContent='Provide a reference number or upload receipt.'; return; }

  msgEl.textContent='Uploading…';

  let receipt_url = null;
  if(file){
    const key = `r_${Date.now()}_${file.name}`;
    const up = await supabase.storage.from('receipts').upload(key, file);
    if(up.error){ msgEl.textContent = up.error.message; return; }
    const pub = supabase.storage.from('receipts').getPublicUrl(up.data.path);
    receipt_url = pub.data.publicUrl;
  }

  msgEl.textContent='Placing order…';
  const { error } = await supabase.from('orders').insert({
    product_id: CURRENT.id,
    product_name: CURRENT.name,
    price: CURRENT.price,
    customer_name: name,
    customer_email: email,
    payment_ref: ref || null,
    receipt_url,
    status: 'pending'
  });

  msgEl.textContent = error ? error.message : 'Order placed! We will process shortly.';
  if(!error){ setTimeout(()=>dlg.close(), 900); }
};

/* ---------- Feedback ---------- */
document.getElementById('sendFeedback').onclick = async ()=>{
  const txt = document.getElementById('feedbackText').value.trim();
  if(!txt) return alert('Write something first.');
  const { error } = await supabase.from('feedbacks').insert({ content: txt });
  if(error) alert(error.message);
  else document.getElementById('feedbackText').value='';
  await loadFeedbacks();
};

async function loadFeedbacks(){
  const { data } = await supabase.from('feedbacks').select('*').order('created_at',{ascending:false});
  document.getElementById('feedbackList').innerHTML =
    data?.length ? data.map(f=>`<div class="card">${f.content}</div>`).join('') :
    '<p class="muted">No feedback yet.</p>';
}
