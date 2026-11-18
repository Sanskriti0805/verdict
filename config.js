/* Verdict — deployment config.
   The publishable (anon) key is PUBLIC by design. It is safe here because the
   table is protected by row-level security: anon may insert and select, and
   nothing else. Never add update or delete to those policies. */

window.VerdictConfig = {
  SUPABASE_URL: 'PASTE_PROJECT_URL_HERE',
  SUPABASE_ANON_KEY: 'PASTE_PUBLISHABLE_ANON_KEY_HERE',

  // Shown in the footer so anyone can flag an entry.
  CONTACT_EMAIL: 'parth@valcat.co',

  // Rows logged from our own interviews and from public Reddit threads.
  // Disclosed on the page — seeding is fine, hiding it is not.
  SEEDED_NOTE: true
};
