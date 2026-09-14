ALTER TYPE public.friendship_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS decline_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;