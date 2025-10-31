/* global supabase */

const openAuthBtn  = document.getElementById('openAuth');
const myAccLink    = document.getElementById('myAccountLink');
const authModal    = document.getElementById('authModal');
const closeAuthBtn = document.getElementById('closeAuth');
const doLogin      = document.getElementById('doLogin');
const doSignup     = document.getElementById('doSignup');
const authEmail    = document.getElementById('authEmail');
const authPass     = document.getElementById('authPass');
const authMsg      = document.getElementById('authMsg');

const tabs = document.getElementById('tabs');
const productsGrid = document.getElementById('productsGrid');

let session = null;

init();

async function init(){
  const { data } = await supabase.auth.getSession();
  session = data.session || null;
  toggleNav(!!session);

  supabase.auth.onAuthStateChange((_e, s) => {
    session = s;
    toggleNav(!!session);
  });

  openAuthBtn.onclick = () => authModal.showModal();
  closeAuthBtn.onclick = () => authModal.close();
  doLogin.onclick = signIn;
  doSignup.onclick = signUp;

  tabs.addEventListener('click', switchTab);

  await loadProducts();
}

function toggleNav(isLoggedIn){
  document.getElementById('openAuth').style.display = isLoggedIn ? 'none' : '';
  document.getElementById('myAccountLink').style.display = isLoggedIn ? '' : 'none';
}

function switchTab(e){
  const a = e.target.closest('a.tab'); if(!a) return e.preventDefault();
  e.preventDefault();
  [...tabs.querySelectorAll('.tab')].forEach(t => t.classList.remove('active'));
  a.classList.add('active');
  const key = a.dataset.tab;
  ['accounts','payments','rules','feedback','about'].forEach(k=>{
    const s = document.getElementById(`tab-${k}`);
    if(s) s.style.display = (k === key) ? '' : 'none';
  });
}

async function signIn(){
  authMsg.textContent = '';
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail.value.trim(),
    password: authPass.value
  });
  if(error){ authMsg.textContent = error.message; return; }
  authModal.close();
}

async function signUp(){
  authMsg.textContent = '';
  const { error } = await supabase.auth.signUp({
    email: authEmail.value.trim(),
    password: authPass.value
  });
  if(error){ authMsg.textContent = error.message; return; }
  authMsg.textContent = 'Account created. Please sign in.';
}

async function loadProducts(){
  productsGrid.innerHTML = '<p class="muted">Loading…</p>';
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,category,available')
    .eq('available', true)
    .order('name');

  if(error){ productsGrid.innerHTML = `<p class="warn">${error.message}</p>`; return; }
  if(!data?.length){ productsGrid.innerHTML = '<p class="muted">No available accounts.</p>'; return; }

  productsGrid.innerHTML = '';
  data.forEach(p=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3 style="margin:0">${escapeHtml(p.name)}</h3>
      <div class="muted">${escapeHtml(p.category||'')}</div>
      <div class="muted" style="margin:6px 0">Price shown at checkout</div>
      <a href="account.html" class="btn">Order</a>
    `;
    productsGrid.appendChild(card);
  });
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
