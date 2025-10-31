/* global supabase */

// shop.js = homepage controller (auth state, tabs, product list)

// ---------- UI refs ----------
const openAuthBtn   = document.getElementById('openAuth');
const myAccLink     = document.getElementById('myAccountLink');
const adminLink     = document.getElementById('adminLink');
const authModal     = document.getElementById('authModal');
const closeAuthBtn  = document.getElementById('closeAuth');
const emailInput    = document.getElementById('authEmail');
const passInput     = document.getElementById('authPass');
const loginBtn      = document.getElementById('doLogin');
const signupBtn     = document.getElementById('doSignup');
const authMsg       = document.getElementById('authMsg');

const tabsBar       = document.getElementById('tabs');
const productsGrid  = document.getElementById('productsGrid');

// ---------- state ----------
let session = null;
let products = [];

// ---------- boot ----------
init();

async function init() {
  guardSupabase();

  // tab behaviour
  tabsBar?.addEventListener('click', onTabClick);

  // open/close auth
  openAuthBtn?.addEventListener('click', () => authModal.showModal());
  closeAuthBtn?.addEventListener('click', () => authModal.close());

  // auth actions
  loginBtn?.addEventListener('click', signIn);
  signupBtn?.addEventListener('click', signUp);

  // initial auth state
  const { data } = await supabase.auth.getSession();
  session = data.session || null;
  toggleAuthUI(!!session);

  // reactive auth state
  supabase.auth.onAuthStateChange((_event, sess) => {
    session = sess;
    toggleAuthUI(!!session);
  });

  // load products
  await loadProducts();
}

// ---------- helpers ----------
function guardSupabase() {
  if (!window.supabase || !supabase.auth) {
    console.error('Supabase client missing. Ensure app.js creates the client BEFORE shop.js.');
  }
}

function toggleAuthUI(isLoggedIn) {
  if (isLoggedIn) {
    openAuthBtn.style.display = 'none';
    myAccLink.style.display = '';
  } else {
    openAuthBtn.style.display = '';
    myAccLink.style.display = 'none';
  }
}

// Tabs switching
function onTabClick(e) {
  const a = e.target.closest('a.tab');
  if (!a) return;
  e.preventDefault();

  // activate tab
  [...tabsBar.querySelectorAll('.tab')].forEach(t => t.classList.remove('active'));
  a.classList.add('active');

  const key = a.dataset.tab;
  // show panel
  ['accounts','payments','rules','feedback','about'].forEach(k => {
    const pn = document.getElementById(`tab-${k}`);
    if (pn) pn.style.display = (k === key) ? '' : 'none';
  });
}

// ---------- auth actions ----------
async function signIn() {
  authMsg.textContent = '';
  const email = emailInput.value.trim();
  const password = passInput.value;
  if (!email || !password) {
    authMsg.textContent = 'Enter email and password.';
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    authMsg.textContent = error.message;
    return;
  }
  authModal.close();
}

async function signUp() {
  authMsg.textContent = '';
  const email = emailInput.value.trim();
  const password = passInput.value;
  if (!email || !password) {
    authMsg.textContent = 'Enter email and password.';
    return;
  }
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) { authMsg.textContent = error.message; return; }
  authMsg.textContent = 'Account created. Please sign in.';
}

// ---------- products ----------
async function loadProducts() {
  productsGrid.innerHTML = `<p class="muted">Loading…</p>`;

  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,available,category')
    .eq('available', true)
    .order('name');

  if (error) {
    productsGrid.innerHTML = `<p class="warn">${error.message}</p>`;
    return;
  }
  products = data || [];

  if (!products.length) {
    productsGrid.innerHTML = `<p class="muted">No available accounts yet.</p>`;
    return;
  }

  productsGrid.innerHTML = '';
  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <h3 style="margin:0">${escapeHtml(p.name)}</h3>
          <div class="muted">${escapeHtml(p.category || '')}</div>
        </div>
      </div>
      <div class="muted" style="margin:6px 0">₱${Number(p.price||0).toFixed(2)} / month (computed on checkout)</div>
      <div class="row" style="gap:8px">
        <a class="btn" href="account.html">Order</a>
      </div>
    `;
    productsGrid.appendChild(card);
  });
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
