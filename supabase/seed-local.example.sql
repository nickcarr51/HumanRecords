-- Copy to supabase/seed.local.sql (gitignored) to seed your own real accounts
-- locally. Runs after seed.sql, which defines seed_helpers.seed_user.
do $$
begin
  perform seed_helpers.seed_user('you@example.com', 'label_member', 'Your Name');
end;
$$;
