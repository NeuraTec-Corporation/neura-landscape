CREATE TABLE working_calendar (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 weekdays integer[] NOT NULL CHECK(cardinality(weekdays)>0 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]),
 revision integer NOT NULL DEFAULT 1
);
CREATE TABLE employee_absences (
 id text PRIMARY KEY,employee_id text NOT NULL REFERENCES employees(id),
 starts_on date NOT NULL,ends_on date NOT NULL CHECK(ends_on>=starts_on),
 reason text NOT NULL,revision integer NOT NULL DEFAULT 1,cancelled_at timestamptz
);
CREATE INDEX employee_absence_dates ON employee_absences(employee_id,starts_on,ends_on) WHERE cancelled_at IS NULL;
INSERT INTO schema_migrations VALUES(23);
