-- Seed default conferences
insert into public.conferences (key, display_name, cfbd_name, espn_group_id, is_depleting, sort_order) values
  ('ACC',       'ACC',                    'ACC',              '1',  false, 1),
  ('B12',       'Big 12',                 'Big 12',           '4',  false, 2),
  ('B1G',       'Big Ten',                'Big Ten',          '5',  false, 3),
  ('SEC',       'SEC',                    'SEC',              '8',  false, 4),
  ('AAC',       'American Athletic',      'American Athletic','151',false, 5),
  ('CUSA',      'Conference USA',         'Conference USA',   '12', false, 6),
  ('MAC',       'MAC',                    'Mid-American',     '15', false, 7),
  ('MW',        'Mountain West',          'Mountain West',    '17', false, 8),
  ('SBC',       'Sun Belt',               'Sun Belt',         '37', false, 9),
  ('PAC12_IND', 'Pac-12 / Independent',   null,               null, true,  10)
on conflict (key) do nothing;
