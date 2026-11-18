CREATE TABLE property_zones(
 id text PRIMARY KEY,property_id text NOT NULL REFERENCES properties(id),name text NOT NULL,kind text NOT NULL,
 area numeric CHECK(area>=0),unit text NOT NULL CHECK(unit IN ('sqft','sqm')),measurement_status text NOT NULL CHECK(measurement_status IN ('estimated','measured','verified')),
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),longitude double precision CHECK(longitude BETWEEN -180 AND 180),notes text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,deleted_at timestamptz,
 UNIQUE(id,property_id),CHECK((latitude IS NULL)=(longitude IS NULL))
);
CREATE TABLE property_elements(
 id text PRIMARY KEY,property_id text NOT NULL REFERENCES properties(id),zone_id text NOT NULL,name text NOT NULL,kind text NOT NULL,quantity numeric NOT NULL CHECK(quantity>0),unit text NOT NULL,
 service text NOT NULL,frequency text NOT NULL,season text NOT NULL,protection_notes text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),longitude double precision CHECK(longitude BETWEEN -180 AND 180),revision integer NOT NULL DEFAULT 1,deleted_at timestamptz,
 FOREIGN KEY(zone_id,property_id) REFERENCES property_zones(id,property_id),UNIQUE(id,property_id),CHECK((latitude IS NULL)=(longitude IS NULL))
);
CREATE TABLE property_photos(
 id text PRIMARY KEY,property_id text NOT NULL REFERENCES properties(id),zone_id text,element_id text,viewpoint text NOT NULL,caption text NOT NULL,
 pathname text NOT NULL UNIQUE,width integer NOT NULL,height integer NOT NULL,bytes integer NOT NULL CHECK(bytes>0),latitude double precision,longitude double precision,uploaded_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 FOREIGN KEY(zone_id,property_id) REFERENCES property_zones(id,property_id),FOREIGN KEY(element_id,property_id) REFERENCES property_elements(id,property_id),CHECK((latitude IS NULL)=(longitude IS NULL))
);
CREATE INDEX property_zones_property ON property_zones(property_id);
CREATE INDEX property_elements_property ON property_elements(property_id);
CREATE INDEX property_photos_property ON property_photos(property_id);
INSERT INTO schema_migrations VALUES(5);
CREATE TABLE media_budget(id integer PRIMARY KEY CHECK(id=1),bytes bigint NOT NULL DEFAULT 0);
INSERT INTO media_budget VALUES(1,0);
CREATE TABLE property_photo_data(photo_id text PRIMARY KEY REFERENCES property_photos(id),content bytea NOT NULL);
