
<!-- app.js -->
<script>
window.SUPABASE_URL = 'https://rvwahejdkijdigsxnjzk.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2d2FoZWpka2lqZGlnc3huanprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTEwMDQsImV4cCI6MjA3NzQ2NzAwNH0.sNl2rGAM_Ofx6kp7rNA3z_S_9uOWFd4r-yxJc0c4UHg';
</script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="app.js"></script>   <!-- has createClient(...) -->
<script src="shop.js" defer></script>
<script src="https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" defer></script>
<script defer>
  // Init client
  window.supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // Small helper
  window.$id = (x) => document.getElementById(x);
  window.$on = (el, evt, fn) => el && el.addEventListener(evt, fn);
</script>
