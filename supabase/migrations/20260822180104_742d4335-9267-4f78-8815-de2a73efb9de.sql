DROP FUNCTION IF EXISTS public.place_trade(uuid, trade_side, numeric);
DROP FUNCTION IF EXISTS public.place_trade(uuid, trade_side, trade_action, numeric);

CREATE OR REPLACE FUNCTION public.place_trade(
  p_market_id uuid,
  p_side trade_side,
  p_action trade_action,
  p_credits numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_market markets%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_k numeric;
  v_shares numeric;
  v_price numeric;
  v_new_yes_pool numeric;
  v_new_no_pool numeric;
  v_new_yes_price numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  IF p_action <> 'buy' THEN
    RETURN jsonb_build_object('error', 'Only buying is supported right now');
  END IF;
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object('error', 'Amount must be greater than 0');
  END IF;

  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Market not found');
  END IF;
  IF v_market.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'Market is not open');
  END IF;
  IF v_market.closes_at IS NOT NULL AND v_market.closes_at < now() THEN
    RETURN jsonb_build_object('error', 'Market has closed');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  IF v_profile.credits < p_credits THEN
    RETURN jsonb_build_object('error', 'Insufficient credits');
  END IF;

  -- Constant product market maker: credits are added to both pools,
  -- then shares of the purchased side are withdrawn so that k is preserved.
  v_k := v_market.yes_pool * v_market.no_pool;

  IF p_side = 'yes' THEN
    v_shares := (v_market.yes_pool + p_credits) - v_k / (v_market.no_pool + p_credits);
    v_new_yes_pool := v_market.yes_pool + p_credits - v_shares;
    v_new_no_pool := v_market.no_pool + p_credits;
  ELSE
    v_shares := (v_market.no_pool + p_credits) - v_k / (v_market.yes_pool + p_credits);
    v_new_no_pool := v_market.no_pool + p_credits - v_shares;
    v_new_yes_pool := v_market.yes_pool + p_credits;
  END IF;

  IF v_shares IS NULL OR v_shares <= 0 THEN
    RETURN jsonb_build_object('error', 'Trade too small');
  END IF;

  v_price := p_credits / v_shares;
  v_new_yes_price := v_new_no_pool / (v_new_yes_pool + v_new_no_pool);

  UPDATE profiles SET credits = credits - p_credits WHERE id = v_user_id;

  UPDATE markets
     SET yes_pool = v_new_yes_pool,
         no_pool = v_new_no_pool,
         volume = volume + p_credits
   WHERE id = p_market_id;

  INSERT INTO positions (user_id, market_id, yes_shares, no_shares, credits_spent)
  VALUES (
    v_user_id, p_market_id,
    CASE WHEN p_side = 'yes' THEN v_shares ELSE 0 END,
    CASE WHEN p_side = 'no' THEN v_shares ELSE 0 END,
    p_credits
  )
  ON CONFLICT (user_id, market_id) DO UPDATE SET
    yes_shares = positions.yes_shares + EXCLUDED.yes_shares,
    no_shares = positions.no_shares + EXCLUDED.no_shares,
    credits_spent = positions.credits_spent + EXCLUDED.credits_spent;

  INSERT INTO trades (user_id, market_id, side, action, shares, credits, price)
  VALUES (v_user_id, p_market_id, p_side, 'buy', v_shares, p_credits, v_new_yes_price);

  INSERT INTO price_history (market_id, yes_price)
  VALUES (p_market_id, v_new_yes_price);

  RETURN jsonb_build_object(
    'success', true,
    'shares', v_shares,
    'price', v_price,
    'new_yes_price', v_new_yes_price,
    'credits_remaining', v_profile.credits - p_credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_trade(uuid, trade_side, trade_action, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_trade(uuid, trade_side, trade_action, numeric) TO authenticated;