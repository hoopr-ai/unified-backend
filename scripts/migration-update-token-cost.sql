-- Update tokenCost to 1 for licenses where original payment was via tokens
-- Generated on: 2026-04-14T11:43:41.547Z
-- Total records: 50

BEGIN;

UPDATE licenses l
SET "tokenCost" = 1
FROM users u
WHERE l."userId" = u.id
  AND u.platform = 'ENTERPRISE'
  AND (u.email, l."trackCode") IN (
    ('ananya.asija@magicpin.in', '121'),
    ('ananya.asija@magicpin.in', '2395'),
    ('anil@vervemobi.com', '161'),
    ('anumpharm2008@gmail.com', '79'),
    ('ashishmehta@bombayshavingcompany.com', '3185'),
    ('darshana.hedaoo@zouk.co.in', '7814'),
    ('dhyaan.shah@bigshorts.co', '6176'),
    ('dhyaan.shah@bigshorts.co', '7572'),
    ('dhyaan.shah@bigshorts.co', '7598'),
    ('dhyaan.shah@bigshorts.co', '330'),
    ('dhyaan.shah@bigshorts.co', '7034'),
    ('dhyaan.shah@bigshorts.co', '7363'),
    ('dhyaan.shah@bigshorts.co', '7837'),
    ('dhyaan.shah@bigshorts.co', '7649'),
    ('dhyaan.shah@bigshorts.co', '7844'),
    ('dhyaan.shah@bigshorts.co', '7390'),
    ('dhyaan.shah@bigshorts.co', '7599'),
    ('dhyaan.shah@bigshorts.co', '7535'),
    ('dhyaan.shah@bigshorts.co', '7028'),
    ('dhyaan.shah@bigshorts.co', '7609'),
    ('dhyaan.shah@bigshorts.co', '6985'),
    ('dhyaan.shah@bigshorts.co', '6849'),
    ('dhyaan.shah@bigshorts.co', '7027'),
    ('dhyaan.shah@bigshorts.co', '7520'),
    ('dhyaan.shah@bigshorts.co', '822'),
    ('dhyaan.shah@bigshorts.co', '438'),
    ('dhyaan.shah@bigshorts.co', '7846'),
    ('dhyaan.shah@bigshorts.co', '8155'),
    ('dhyaan.shah@bigshorts.co', '6178'),
    ('dhyaan.shah@bigshorts.co', '6174'),
    ('dhyaan.shah@bigshorts.co', '7391'),
    ('dhyaan.shah@bigshorts.co', '7843'),
    ('dhyaan.shah@bigshorts.co', '6267'),
    ('dhyaan.shah@bigshorts.co', '7838'),
    ('dhyaan.shah@bigshorts.co', '5380'),
    ('dhyaan.shah@bigshorts.co', '7693'),
    ('dhyaan.shah@bigshorts.co', '7836'),
    ('dhyaan.shah@bigshorts.co', '7879'),
    ('dhyaan.shah@bigshorts.co', '7355'),
    ('dhyaan.shah@bigshorts.co', '7687'),
    ('dhyaan.shah@bigshorts.co', '7482'),
    ('dhyaan.shah@bigshorts.co', '6913'),
    ('dhyaan.shah@bigshorts.co', '8161'),
    ('dhyaan.shah@bigshorts.co', '7847'),
    ('dhyaan.shah@bigshorts.co', '485'),
    ('dhyaan.shah@bigshorts.co', '7924'),
    ('dipeeka.sanwal@tonicworldwide.com', '87'),
    ('ishhloh95@gmail.com', '2395'),
    ('nimesh.shinde@1702.com', '2208'),
    ('sales@gruham.studio', '7363')
  );

COMMIT;

-- Summary: 50 licenses updated with tokenCost = 1
