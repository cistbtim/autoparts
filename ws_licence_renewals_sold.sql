-- Customer sold the car → stop renewal reminders for it (Licence Agent page)
ALTER TABLE ws_licence_renewals ADD COLUMN IF NOT EXISTS vehicle_sold boolean DEFAULT false;
ALTER TABLE ws_licence_renewals ADD COLUMN IF NOT EXISTS vehicle_sold_at timestamptz;
