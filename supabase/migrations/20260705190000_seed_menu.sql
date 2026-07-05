-- Menu seed, generated from data/*.txt by scripts/gen-seed-migration.ts.
-- Regenerate after editing the txt files: npx tsx scripts/gen-seed-migration.ts

insert into bases (id, name, price) values
  ('B1', 'Thin Crust', 149),
  ('B2', 'Thick Crust', 169),
  ('B3', 'Whole Wheat', 179),
  ('B4', 'Multigrain', 199),
  ('B5', 'Cheese Burst', 229)
on conflict (id) do update set name = excluded.name, price = excluded.price;

insert into pizzas (id, name, price) values
  ('P1', 'Margherita', 299),
  ('P2', 'California Veggie', 319),
  ('P3', 'Farm House', 329),
  ('P4', 'Paneer Tikka', 339),
  ('P5', 'Greek Mediterranean', 349),
  ('P6', 'Pepperoni Classic', 359),
  ('P7', 'BBQ Chicken', 369),
  ('P8', 'Chicago Deep Dish', 379)
on conflict (id) do update set name = excluded.name, price = excluded.price;

insert into toppings (id, name, price) values
  ('T1', 'Caramelised Onions', 39),
  ('T2', 'Sweet Corn', 39),
  ('T3', 'Black Olives', 49),
  ('T4', 'Green Peppers', 49),
  ('T5', 'Jalapenos', 49),
  ('T6', 'Roasted Garlic', 49),
  ('T7', 'Button Mushrooms', 59),
  ('T8', 'Peri-Peri Drizzle', 59),
  ('T9', 'Extra Cheese', 69),
  ('T10', 'Sun-Dried Tomatoes', 69)
on conflict (id) do update set name = excluded.name, price = excluded.price;

insert into beverages (id, name, price) values
  ('D1', 'Cola', 59),
  ('D2', 'Masala Chaas', 69),
  ('D3', 'Fresh Lime Soda', 79),
  ('D4', 'Orange Crush', 89),
  ('D5', 'Iced Tea', 99),
  ('D6', 'Cold Coffee', 129)
on conflict (id) do update set name = excluded.name, price = excluded.price;
