-- Storage bucket for business logos.
--
-- Public-read on purpose: a logo is printed on invoices and quotations that
-- anonymous recipients open via a share link, so it has to be fetchable
-- without a session. Writes are restricted to the owner's own folder.
--
-- SVG is deliberately NOT an allowed type. An SVG served from a public bucket
-- can carry script, and this bucket is read by anonymous visitors.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-logos',
  'business-logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Objects are stored as "<supabase auth uid>/<filename>", so the first path
-- segment is the tenant boundary. auth.uid() is used rather than the Prisma
-- User.id because RLS can only see the Supabase session.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'business_logos_public_read') THEN
    CREATE POLICY "business_logos_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'business-logos');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'business_logos_insert_own') THEN
    CREATE POLICY "business_logos_insert_own" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'business-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'business_logos_update_own') THEN
    CREATE POLICY "business_logos_update_own" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'business-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'business-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'business_logos_delete_own') THEN
    CREATE POLICY "business_logos_delete_own" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'business-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
