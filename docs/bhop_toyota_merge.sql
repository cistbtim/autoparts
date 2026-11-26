-- Merge BHOP Toyota vehicles that duplicate vehicles you already had (same model + same generation).
--   TY192A C-HR MAXA10 2018+        -> TY044A C-HR
--   TY203A Avalon AXXA5 2019+       -> TY154A AVALON (XX50)
--   TY218A Fortuner 2016+           -> TY049D FORTUNER MK4
--   TY164A Camry ASV7 2018+         -> TY026H CAMRY 6 XV70
--   TY177A/TY178A Land Cruiser 200  -> TY146A LAND CRUISER 200
--   TY201A RAV4 2020+               -> TY040I RAV4 2019-2022
-- Part fitments move to the kept vehicle, empty photo slots are filled from the duplicate, duplicates are deleted.
BEGIN;
CREATE TEMP TABLE m(dup text, keep text) ON COMMIT DROP;
INSERT INTO m VALUES ('TY192A','TY044A'),('TY203A','TY154A'),('TY218A','TY049D'),('TY164A','TY026H'),('TY177A','TY146A'),('TY178A','TY146A'),('TY201A','TY040I');

UPDATE vehicles k SET
  photo_front = CASE WHEN COALESCE(k.photo_front,'')='' THEN d.photo_front ELSE k.photo_front END,
  photo_rear  = CASE WHEN COALESCE(k.photo_rear,'')=''  THEN d.photo_rear  ELSE k.photo_rear  END
FROM m JOIN vehicles d ON d.code = m.dup
WHERE k.code = m.keep;

INSERT INTO part_fitments (part_id, vehicle_id, notes)
SELECT f.part_id, k.id, f.notes
FROM m JOIN vehicles d ON d.code = m.dup JOIN vehicles k ON k.code = m.keep
JOIN part_fitments f ON f.vehicle_id = d.id
WHERE NOT EXISTS (SELECT 1 FROM part_fitments x WHERE x.part_id = f.part_id AND x.vehicle_id = k.id);

DELETE FROM part_fitments WHERE vehicle_id IN (SELECT d.id FROM m JOIN vehicles d ON d.code = m.dup);
DELETE FROM vehicles WHERE code IN (SELECT dup FROM m);
COMMIT;

SELECT v.code, v.model, count(f.id) AS parts FROM vehicles v LEFT JOIN part_fitments f ON f.vehicle_id = v.id
WHERE v.code IN ('TY044A','TY154A','TY049D','TY026H','TY146A','TY040I') GROUP BY v.code, v.model ORDER BY v.code;
