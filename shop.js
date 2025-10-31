/* global supabase, $id, $on */

// CONFIG you can change
const SHARED_FACTOR = 0.60;  // shared price multiplier
const GCASH_NUMBER  = '09XX-XXX-XXXX';
const MAYA_NUMBER   = '09YY-YYY-YYYY';

let products = [];           // [{id,name,category,price,available}]
let currentProd = null;      // product for checkout

document.addEventListener('DOMContentLoaded', initStore);

async function initStore(){
  // set collector numbers
  $id('gcashNum').textContent = GCASH_NUMBER;
  $id('mayaNum').textContent  = MAYA_NUMBER;

  // toggle PM info
  document.querySelectorAll('input[name="pm"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      const pm = getPM();
      $id('gcashInfo').classList.toggle('hidden', pm!=='gcash');
      $id('mayaInfo').classList.toggle('hidden', pm!=='maya');
    });
  });

  // modal buttons
  $on($id('ckClose'), 'click', ()=>$id('ckModal').style.display='none');

  // amount recompute on changes
  ;['ownSel','credSel','durSel'].forEach(id=>{
    $on($id(id),'change', updateAmount);
  });

  $on($id('placeBtn'),'click', placeOrder);

  // load products
  await loadProducts();
  renderByCategory();

  // click handlers (order buttons)
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('.orderBtn');
    if(!b) return;
    e.preventDefault();
    const id = b.dataset.id;
    const prod = products.find(p=>p.id===id);
    openCheckout(prod);
  });
}

function getPM(){
  return document.querySelector('input[name="pm"]:checked')?.value || 'gcash';
}

async function loadProducts(){
  const { data, error } = await supabase.from('products')
    .select('id,name,category,price,available')
    .eq('available', true)
    .order('category', {ascending:true})
    .order('name', {ascending:true});
  if(error){ alert(error.message); return; }
  products = data || [];
}

function groupBy(arr, key){
  return arr.reduce((m,x)=>((m[x[key]]??=[]).push(x),m),{});
}

function renderByCategory(){
  const cats = groupBy(products,'category');
  const pills = $id('catPills'); pills.innerHTML='';
  const sec  = $id('catSections'); sec.innerHTML='';

  const catNames = Object.keys(cats);
  catNames.forEach((c,i)=>{
    const pill = document.createElement('div');
    pill.className = 'pill' + (i===0?' active':'');
    pill.textContent = c;
    pill.dataset.cat = c;
    pills.appendChild(pill);
  });

  pills.addEventListener('click', e=>{
    const p = e.target.closest('.pill'); if(!p) return;
    pills.querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');
    showCat(p.dataset.cat);
  });

  // sections for each category with preview + view all
  for(const c of catNames){
    const wrap = document.createElement('section');
    wrap.className = 'card';
    wrap.innerHTML = `
      <div class="flex"><h3>${c}</h3>
        <button class="btn ghost small viewAll" data-cat="${c}">View all</button>
      </div>
      <div class="grid" id="grid-${cssId(c)}"></div>
    `;
    sec.appendChild(wrap);
    renderGrid(c, /*preview*/ true);
  }

  // view all toggles
  sec.addEventListener('click', e=>{
    const b = e.target.closest('.viewAll'); if(!b) return;
    renderGrid(b.dataset.cat, /*preview*/ false);
  });

  // initial cat highlight shows first section at top – already rendered
}

function cssId(s){ return s.toLowerCase().replace(/\s+/g,'-'); }

function renderGrid(cat, preview){
  const list = products.filter(p=>p.category===cat);
  const items = preview ? list.slice(0,8) : list;

  const grid = $id(`grid-${cssId(cat)}`);
  grid.innerHTML = items.map(p => `
    <div class="card">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="muted">Click order to see pricing</div>
      <div class="divider"></div>
      <button class="btn orderBtn" data-id="${p.id}">Order</button>
    </div>
  `).join('');
}

function openCheckout(prod){
  currentProd = prod;
  $id('ckTitle').textContent = `Checkout — ${prod.name}`;
  $id('ownSel').value = 'solo';
  $id('credSel').value = 'account';
  $id('durSel').value  = '30';
  updateAmount();
  $id('ckModal').style.display = 'flex';
}

function updateAmount(){
  if(!currentProd){ $id('amountTxt').textContent='₱0.00'; return; }

  const days = parseInt($id('durSel').value,10);
  const months = Math.max(1, Math.round(days/30*100)/100);
  const isShared = ($id('ownSel').value === 'shared');
  const base = Number(currentProd.price) * months;
  const total = isShared ? base * SHARED_FACTOR : base;

  $id('amountTxt').textContent = `₱${(total||0).toFixed(2)}`;
}

async function placeOrder(){
  try{
    const { data: sess } = await supabase.auth.getSession();
    if(!sess.session){
      alert('Please sign in first (top right: Login / Sign up).');
      return;
    }
    const me = sess.session.user;

    const payload = {
      product_id: currentProd.id,
      product_name: currentProd.name,
      price: Number($id('amountTxt').textContent.replace(/[₱,]/g,'')) || 0,
      status: 'pending',
      payment_method: getPM(),
      payment_ref: $id('refNo').value.trim() || null,
      payment_sent_at: $id('sentAt').value ? new Date($id('sentAt').value).toISOString() : null,
      duration_days: parseInt($id('durSel').value,10) || 30,
      ownership_kind: $id('ownSel').value,
      cred_kind: $id('credSel').value,
      customer_id: me.id,
      customer_email: me.email,
      customer_name: me.user_metadata?.name || null
    };

    // 1) create order
    const { data: order, error } = await supabase.from('orders').insert(payload).select().single();
    if(error) throw error;

    // 2) upload receipt (optional)
    const f = $id('receiptFile').files?.[0];
    if(f){
      const path = `${order.id}/${Date.now()}_${f.name.replace(/[^a-z0-9_.-]/gi,'_')}`;
      const up = await supabase.storage.from('receipts').upload(path, f, { upsert:false });
      if(!up.error){
        const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
        await supabase.from('orders').update({ receipt_url: pub.publicUrl }).eq('id', order.id);
      }
    }

    // 3) notify admin (Edge Function)
    try{
      await supabase.functions.invoke('notify', { body: { 
        kind:'new_order',
        order_id: order.id,
        product: order.product_name,
        amount: order.price,
        customer: order.customer_email,
        pm: order.payment_method
      }});
    }catch(_){/* ignore */}

    $id('msg').textContent = 'Order placed! We’ll verify payment then deliver credentials by email.';
    setTimeout(()=>{ $id('ckModal').style.display='none'; }, 1500);
  }catch(err){
    $id('msg').textContent = err.message;
  }
}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
