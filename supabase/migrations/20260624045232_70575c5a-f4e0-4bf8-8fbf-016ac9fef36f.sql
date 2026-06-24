
ALTER TABLE public.profiles
  ADD COLUMN bio TEXT;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 280);
