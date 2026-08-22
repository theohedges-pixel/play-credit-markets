CREATE OR REPLACE FUNCTION public.buy_shares(p_market_id uuid, p_side trade_side, p_shares numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_market markets%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_price numeric;
  v_cost numeric;
  v_new_yes_price numeric;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error','Not authenticated'); END IF;
  IF p_shares IS NULL OR p_shares <= 0 THEN RETURN jsonb_build_object('error','Enter a number of shares'); END IF;

  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Market not found'); END IF;
  IF v_market.status <> 'open' THEN RETURN jsonb_build_object('error','Market is not open'); END IF;
  IF v_market.closes_at IS NOT NULL AND v_market.closes_at < now() THEN
    RETURN jsonb_build_object('error','Market has closed');
  END IF;

  -- Price shown in the UI, rounded to whole cents.
  v_price := round(v_market.no_pool / (v_market.yes_pool + v_market.no_pool), 2);
  IF p_side = 'no' THEN v_price := round(1 - v_price, 2); END IF;
  IF v_price <= 0 THEN v_price := 0.01; END IF;

  v_cost := round(p_shares * v_price, 2);

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Profile not found'); END IF;
  IF v_profile.credits < v_cost THEN RETURN jsonb_build_object('error','Insufficient credits'); END IF;

  UPDATE profiles SET credits = credits - v_cost WHERE id = v_user_id;

  -- Buying a side makes that side more expensive.
  IF p_side = 'yes' THEN
    UPDATE markets SET no_pool = no_pool + v_cost, volume = volume + v_cost WHERE id = p_market_id;
  ELSE
    UPDATE markets SET yes_pool = yes_pool + v_cost, volume = volume + v_cost WHERE id = p_market_id;
  END IF;

  SELECT no_pool / (yes_pool + no_pool) INTO v_new_yes_price FROM markets WHERE id = p_market_id;

  INSERT INTO positions (user_id, market_id, yes_shares, no_shares, credits_spent)
  VALUES (v_user_id, p_market_id,
          CASE WHEN p_side = 'yes' THEN p_shares ELSE 0 END,
          CASE WHEN p_side = 'no' THEN p_shares ELSE 0 END,
          v_cost)
  ON CONFLICT (user_id, market_id) DO UPDATE SET
    yes_shares = positions.yes_shares + EXCLUDED.yes_shares,
    no_shares = positions.no_shares + EXCLUDED.no_shares,
    credits_spent = positions.credits_spent + EXCLUDED.credits_spent;

  INSERT INTO trades (user_id, market_id, side, action, shares, credits, price)
  VALUES (v_user_id, p_market_id, p_side, 'buy', p_shares, v_cost, v_price);

  INSERT INTO price_history (market_id, yes_price) VALUES (p_market_id, v_new_yes_price);

  RETURN jsonb_build_object('success', true, 'shares', p_shares, 'cost', v_cost, 'price', v_price,
                            'credits_remaining', v_profile.credits - v_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buy_shares(uuid, trade_side, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_shares(uuid, trade_side, numeric) TO authenticated;