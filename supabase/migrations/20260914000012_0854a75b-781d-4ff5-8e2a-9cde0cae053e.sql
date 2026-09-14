DELETE FROM public.price_history WHERE market_id = 'b09b6b97-b87c-4ae9-adb9-671f05271bf3';
DELETE FROM public.markets WHERE id = 'b09b6b97-b87c-4ae9-adb9-671f05271bf3';
DELETE FROM public.notifications WHERE kind IN ('suggestion_approved','suggestion_rejected') AND user_id = '52c0e4d0-0348-48d9-bac3-9c84e75e0044';
DELETE FROM public.market_suggestions WHERE suggested_by = '52c0e4d0-0348-48d9-bac3-9c84e75e0044';