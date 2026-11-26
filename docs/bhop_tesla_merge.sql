-- Merge duplicate BHOP Tesla vehicles into the ones you already had.
--   TS007A (Model Y, no years)  -> TS004A (Model Y 2020-2025)
--   TS005A (Model 3, no years)  -> TS002A (Model 3 2017-2025)
-- Kept as separate generations: TS006A Model 3 facelift 2023+, TS008A Model Y 2025, TS009A Model Y L 2025.
-- Parts fitments move to the kept vehicle, empty photo slots are filled from the duplicate, then the duplicate is deleted.
BEGIN;
CREATE TEMP TABLE m(dup text, keep text) ON COMMIT DROP;
INSERT INTO m VALUES ('TS007A','TS004A'),('TS005A','TS002A');

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
WHERE v.code LIKE 'TS%' GROUP BY v.code, v.model ORDER BY v.code;
