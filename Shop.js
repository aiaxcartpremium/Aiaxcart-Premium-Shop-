import { supabase } from './app.js';

/* ---------- Tabs ---------- */
const tabs = document.querySelectorAll('#topTabs a');
const sections = document.querySelectorAll('.tab');
tabs.forEach(t => t.addEventListener('click', e=>{
  e.preventDefault();
  tabs.forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  sections.forEach(s=>s.classList.toggle('hidden', s.id !== t.dataset.tab));
}));

/* ---------- DOM ---------- */
const catChips = document.getElementById('catChips');
const grid = document.getElementById('grid');
const onhandList = document.getElementById('onhandList');
const dlg = document.getElementById('checkout');

let CATS=[], PRODS=[];

await bootstrap();

async function bootstrap(){
  await loadCats();
  await loadProducts();
  await loadOnhand();
  await loadFeedbacks();
}

async function loadCats(){
  const { data } = await supabase.from('categories').select('*').order('sort');
  CATS = data || [];
  renderCatChips();
}
function renderCatChips(){
  catChips.innerHTML='';
  catChips.appendChild(chip('All', true, ()=>renderProducts()));
  CATS.forEach(c => {
    catChips.appendChild(chip(c.name,false,()=>renderProducts(c.id)));
  });
}
function chip(label, active, onClick){
  const el = document.createElement('button');
  el.className='chip'+(active?' active':'');
  el.textContent = label;
  el.onclick = ()=>{
    [...catChips.children].forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    onClick();
  };
  return el;
}

async function loadProducts(){
  const { data } = await supabase.from('products')
    .select('*').eq('available', true)
    .order('created_at',{ascending:false});
  PRODS = data || [];
  renderProducts();
}

function renderProducts(catId){
  const list = catId ? PRODS.filter(x=>x.category_id===catId) : PRODS;
  grid.innerHTML = list.length ? list.map(p=>`
    <div class="card">
      <h3>${p.name}</h3>
      <p class="muted">${p.description||''}</p>
      <p><b>₱${Number(p.price).toFixed(2)}</b></p>
      <button class="btn" data-id="${p.id}">Order</button>
    </div>
  `).join('') : '<p class="muted">No products found.</p>';

  grid.querySelectorAll('[data-id]').forEach(b=>{
    b.onclick = ()=>openCheckout(b.dataset.id);
  });
}

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
