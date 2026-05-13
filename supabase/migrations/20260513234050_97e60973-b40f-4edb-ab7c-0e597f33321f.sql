
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.market_status AS ENUM ('open', 'closed', 'resolved');
CREATE TYPE public.market_resolution AS ENUM ('yes', 'no', 'invalid');
CREATE TYPE public.trade_side AS ENUM ('yes', 'no');
CREATE TYPE public.trade_action AS ENUM ('buy', 'sell');

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  credits NUMERIC(18,2) NOT NULL DEFAULT 1000,
  last_daily_claim DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================
-- CATEGORIES
-- =========================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

INSERT INTO public.categories (name, slug, icon) VALUES
  ('Politics', 'politics', 'Landmark'),
  ('Crypto', 'crypto', 'Bitcoin'),
  ('Sports', 'sports', 'Trophy'),
  ('Pop Culture', 'pop-culture', 'Sparkles'),
  ('Tech', 'tech', 'Cpu'),
  ('Science', 'science', 'Atom');

-- =========================
-- MARKETS
-- =========================
CREATE TABLE public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution public.market_resolution,
  status public.market_status NOT NULL DEFAULT 'open',
  -- Constant-product AMM pools (shares of yes / no held by AMM)
  yes_pool NUMERIC(18,4) NOT NULL DEFAULT 1000,
  no_pool NUMERIC(18,4) NOT NULL DEFAULT 1000,
  volume NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.markets(category_id);
CREATE INDEX ON public.markets(status);

-- =========================
-- POSITIONS
-- =========================
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  yes_shares NUMERIC(18,4) NOT NULL DEFAULT 0,
  no_shares NUMERIC(18,4) NOT NULL DEFAULT 0,
  credits_spent NUMERIC(18,2) NOT NULL DEFAULT 0,
  UNIQUE (user_id, market_id)
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.positions(user_id);
CREATE INDEX ON public.positions(market_id);

-- =========================
-- TRADES
-- =========================
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  side public.trade_side NOT NULL,
  action public.trade_action NOT NULL,
  shares NUMERIC(18,4) NOT NULL,
  credits NUMERIC(18,2) NOT NULL,
  price NUMERIC(6,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.trades(market_id, created_at DESC);
CREATE INDEX ON public.trades(user_id, created_at DESC);

-- =========================
-- PRICE HISTORY
-- =========================
CREATE TABLE public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  yes_price NUMERIC(6,4) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.price_history(market_id, recorded_at);

-- =========================
-- RLS POLICIES
-- =========================
-- profiles
CREATE POLICY "profiles readable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "roles readable by all" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- categories
CREATE POLICY "categories readable by all" ON public.categories FOR SELECT USING (true);
CREATE POLICY "admins manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- markets
CREATE POLICY "markets readable by all" ON public.markets FOR SELECT USING (true);
CREATE POLICY "authenticated create markets" ON public.markets FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "creator or admin updates market" ON public.markets FOR UPDATE
  USING (auth.uid() = creator_id OR public.has_role(auth.uid(), 'admin'));

-- positions
CREATE POLICY "positions readable by all" ON public.positions FOR SELECT USING (true);
-- writes only via SECURITY DEFINER RPC

-- trades
CREATE POLICY "trades readable by all" ON public.trades FOR SELECT USING (true);

-- price_history
CREATE POLICY "price history readable by all" ON public.price_history FOR SELECT USING (true);

-- =========================
-- AUTO PROFILE TRIGGER
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INT := 0;
BEGIN
  base_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    split_part(NEW.email, '@', 1),
    'trader'
  );
  -- sanitize
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF base_username = '' THEN base_username := 'trader'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, credits)
  VALUES (NEW.id, final_username, 1000);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- PLACE TRADE RPC (constant-product AMM)
-- =========================
-- Buying YES: user pays `credits`, AMM uses CPMM:
--   new_yes_pool * new_no_pool = k
--   user adds `credits` to both pools, then receives shares of chosen side
-- We implement: invariant k = yes_pool * no_pool; price_yes = no_pool/(yes_pool+no_pool)
-- Buy YES with C credits:
--   add C to both pools -> (Y+C)*(N+C); user receives shares = (Y+C) - k/(N+C)
--   so AMM yes_pool decreases by that amount.
CREATE OR REPLACE FUNCTION public.place_trade(
  _market_id UUID,
  _side public.trade_side,
  _credits NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  m RECORD;
  k NUMERIC;
  shares_out NUMERIC;
  new_yes NUMERIC;
  new_no NUMERIC;
  new_price NUMERIC;
  user_credits NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _credits <= 0 THEN RAISE EXCEPTION 'Credits must be positive'; END IF;

  SELECT credits INTO user_credits FROM public.profiles WHERE id = uid FOR UPDATE;
  IF user_credits IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF user_credits < _credits THEN RAISE EXCEPTION 'Insufficient credits'; END IF;

  SELECT * INTO m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF m.status <> 'open' THEN RAISE EXCEPTION 'Market not open'; END IF;
  IF m.closes_at <= now() THEN RAISE EXCEPTION 'Market has closed'; END IF;

  k := m.yes_pool * m.no_pool;

  IF _side = 'yes' THEN
    new_yes := m.yes_pool + _credits;
    new_no  := m.no_pool  + _credits;
    -- shares received reduces yes_pool back so invariant holds
    shares_out := new_yes - (k / new_no);
    new_yes := new_yes - shares_out;
  ELSE
    new_yes := m.yes_pool + _credits;
    new_no  := m.no_pool  + _credits;
    shares_out := new_no - (k / new_yes);
    new_no := new_no - shares_out;
  END IF;

  IF shares_out <= 0 THEN RAISE EXCEPTION 'Trade too small'; END IF;

  new_price := new_no / (new_yes + new_no);

  -- Debit user
  UPDATE public.profiles SET credits = credits - _credits WHERE id = uid;

  -- Update market pools and volume
  UPDATE public.markets
    SET yes_pool = new_yes, no_pool = new_no, volume = volume + _credits
    WHERE id = _market_id;

  -- Upsert position
  INSERT INTO public.positions (user_id, market_id, yes_shares, no_shares, credits_spent)
  VALUES (uid, _market_id,
    CASE WHEN _side = 'yes' THEN shares_out ELSE 0 END,
    CASE WHEN _side = 'no'  THEN shares_out ELSE 0 END,
    _credits)
  ON CONFLICT (user_id, market_id) DO UPDATE
    SET yes_shares = public.positions.yes_shares + EXCLUDED.yes_shares,
        no_shares  = public.positions.no_shares  + EXCLUDED.no_shares,
        credits_spent = public.positions.credits_spent + EXCLUDED.credits_spent;

  -- Log trade
  INSERT INTO public.trades (user_id, market_id, side, action, shares, credits, price)
  VALUES (uid, _market_id, _side, 'buy', shares_out, _credits, new_price);

  -- Snapshot price
  INSERT INTO public.price_history (market_id, yes_price)
  VALUES (_market_id, new_price);

  RETURN jsonb_build_object(
    'shares', shares_out,
    'price', new_price,
    'credits_remaining', user_credits - _credits
  );
END;
$$;

-- =========================
-- DAILY CLAIM RPC
-- =========================
CREATE OR REPLACE FUNCTION public.claim_daily_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  last_claim DATE;
  new_credits NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT last_daily_claim INTO last_claim FROM public.profiles WHERE id = uid FOR UPDATE;
  IF last_claim = current_date THEN
    RAISE EXCEPTION 'Already claimed today';
  END IF;
  UPDATE public.profiles
    SET credits = credits + 100, last_daily_claim = current_date
    WHERE id = uid
    RETURNING credits INTO new_credits;
  RETURN jsonb_build_object('credits', new_credits, 'claimed', 100);
END;
$$;

-- =========================
-- RESOLVE MARKET RPC
-- =========================
CREATE OR REPLACE FUNCTION public.resolve_market(
  _market_id UUID,
  _resolution public.market_resolution
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  m RECORD;
  pos RECORD;
  payout NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO m FROM public.markets WHERE id = _market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF NOT (uid = m.creator_id OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Not allowed to resolve';
  END IF;
  IF m.status = 'resolved' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  FOR pos IN SELECT * FROM public.positions WHERE market_id = _market_id LOOP
    IF _resolution = 'yes' THEN
      payout := pos.yes_shares;
    ELSIF _resolution = 'no' THEN
      payout := pos.no_shares;
    ELSE
      payout := pos.credits_spent; -- refund on invalid
    END IF;
    IF payout > 0 THEN
      UPDATE public.profiles SET credits = credits + payout WHERE id = pos.user_id;
    END IF;
  END LOOP;

  UPDATE public.markets
    SET status = 'resolved', resolution = _resolution, resolved_at = now()
    WHERE id = _market_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
