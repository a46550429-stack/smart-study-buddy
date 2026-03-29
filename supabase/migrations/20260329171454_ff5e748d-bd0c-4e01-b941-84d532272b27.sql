
CREATE TABLE public.resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resources" ON public.resources FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own resources" ON public.resources FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own resources" ON public.resources FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own resources" ON public.resources FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('study-materials', 'study-materials', false);

-- Storage RLS policies
CREATE POLICY "Users can upload own materials" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'study-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view own materials" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'study-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own materials" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'study-materials' AND (storage.foldername(name))[1] = auth.uid()::text);
