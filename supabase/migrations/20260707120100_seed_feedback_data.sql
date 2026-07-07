-- Seed post-order + Google review text so the Insight Miner has real patterns
-- to cluster. Negatives are intentionally weighted into a few recurring themes
-- (cold on arrival > wrong order > too oily) so the LLM surfaces actionable issues,
-- not noise. Guarded so it never double-seeds or clobbers real feedback.

do $$
declare
  i int;
  neg_rating int;
begin
  if (select count(*) from order_feedback) >= 20 then
    return;
  end if;

  -- Recurring negative: cold on arrival (top issue) — 14
  for i in 1..14 loop
    neg_rating := 2 + (random() < 0.5)::int;
    insert into order_feedback(rating, comment, source, created_at) values (
      neg_rating,
      (array[
        'Pizza arrived cold at our table.',
        'Slice was lukewarm by the time it reached me.',
        'Ordered hot, served cold — had to ask them to reheat.'
      ])[1 + floor(random() * 3)::int],
      case when random() < 0.3 then 'google' else 'post_order' end,
      now() - (random() * 56 || ' days')::interval
    );
  end loop;

  -- Recurring negative: wrong / incomplete order — 10
  for i in 1..10 loop
    insert into order_feedback(rating, comment, source, created_at) values (
      2,
      (array[
        'Got the wrong pizza — ordered Margherita, received Farm House.',
        'They missed my extra cheese topping.',
        'Asked for cola, got Masala Chaas instead.'
      ])[1 + floor(random() * 3)::int],
      case when random() < 0.3 then 'google' else 'post_order' end,
      now() - (random() * 56 || ' days')::interval
    );
  end loop;

  -- Recurring negative: too oily / greasy — 8
  for i in 1..8 loop
    neg_rating := 2 + (random() < 0.5)::int;
    insert into order_feedback(rating, comment, source, created_at) values (
      neg_rating,
      (array[
        'Way too oily this time.',
        'Crust was soggy and greasy in the middle.',
        'Felt heavier and greasier than usual.'
      ])[1 + floor(random() * 3)::int],
      case when random() < 0.3 then 'google' else 'post_order' end,
      now() - (random() * 56 || ' days')::interval
    );
  end loop;

  -- Secondary negative: slow / unresponsive staff — 6
  for i in 1..6 loop
    neg_rating := 2 + (random() < 0.5)::int;
    insert into order_feedback(rating, comment, source, created_at) values (
      neg_rating,
      (array[
        'Waited almost 40 minutes, service was slow.',
        'Nobody responded when I pressed call waiter.',
        'Staff seemed rushed and forgot our table twice.'
      ])[1 + floor(random() * 3)::int],
      case when random() < 0.3 then 'google' else 'post_order' end,
      now() - (random() * 56 || ' days')::interval
    );
  end loop;

  -- Minor negative: value / pricing — 4
  for i in 1..4 loop
    insert into order_feedback(rating, comment, source, created_at) values (
      3,
      (array[
        'Bit pricey for the portion size.',
        'Toppings cost too much for what you get.'
      ])[1 + floor(random() * 2)::int],
      case when random() < 0.3 then 'google' else 'post_order' end,
      now() - (random() * 56 || ' days')::interval
    );
  end loop;

  -- Positive feedback — 50 (praise clusters around taste + service)
  for i in 1..50 loop
    insert into order_feedback(rating, comment, source, created_at) values (
      4 + (random() < 0.65)::int,
      (array[
        'Best paneer tikka pizza in town!',
        'Loved the crust, perfectly crisp.',
        'Fresh and delicious as always.',
        'Quick service and hot pizza, great job.',
        'Waiter was super friendly and helpful.',
        'Order was spot on and arrived fast.',
        'Great value on the combo, will come back.',
        'Kids loved it — clean tables too.',
        'Cheese pull was unreal, 10/10.',
        'Consistently good every visit.'
      ])[1 + floor(random() * 10)::int],
      case when random() < 0.35 then 'google' else 'post_order' end,
      now() - (random() * 56 || ' days')::interval
    );
  end loop;

  -- Seed a starter insight snapshot (deterministic) so the dashboard has content
  -- immediately. The weekly cron / "Generate now" button replaces it with a live
  -- LLM-mined snapshot.
  insert into feedback_insights(
    window_start, window_end, feedback_count, avg_rating, summary, themes, top_issues, suggestions, source, model
  ) values (
    now() - interval '56 days',
    now(),
    (select count(*) from order_feedback),
    (select round(avg(rating), 2) from order_feedback where rating is not null),
    'Taste and service are widely praised, but three recurring, fixable issues are quietly costing repeat visits: pizzas reaching tables cold (biggest), wrong or incomplete orders, and a greasy finish on some pizzas.',
    '[
      {"label": "Cold on arrival", "count": 14, "sentiment": "negative"},
      {"label": "Wrong or incomplete order", "count": 10, "sentiment": "negative"},
      {"label": "Too oily / greasy", "count": 8, "sentiment": "negative"},
      {"label": "Loved the taste", "count": 30, "sentiment": "positive"},
      {"label": "Fast, friendly service", "count": 18, "sentiment": "positive"}
    ]'::jsonb,
    '[
      {"category": "delivery_time", "issue": "Pizzas repeatedly reaching tables cold or lukewarm", "severity": "high", "evidence_count": 14},
      {"category": "order_accuracy", "issue": "Wrong pizza or missing toppings/beverages served", "severity": "high", "evidence_count": 10},
      {"category": "taste", "issue": "Several diners find pizzas too oily or greasy", "severity": "medium", "evidence_count": 8}
    ]'::jsonb,
    '[
      {"action": "Add a heat-lamp holding step and cut kitchen-to-table time at peak hours", "rationale": "14 recent notes cite cold pizza — the single biggest driver of dissatisfaction."},
      {"action": "Add an order-readback / ticket-match check before pizzas leave the pass", "rationale": "10 guests got the wrong pizza or missing add-ons; a quick confirm step removes most of these."},
      {"action": "Review oil and cheese quantity on the top pizzas and blot before serving", "rationale": "8 reviews describe food as too oily; a small recipe tweak protects taste scores."}
    ]'::jsonb,
    'fallback',
    null
  );
end $$;
