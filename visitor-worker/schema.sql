CREATE TABLE IF NOT EXISTS visits (
  day     TEXT    NOT NULL,  -- YYYY-MM-DD, Dhaka time
  country TEXT    NOT NULL,  -- ISO 3166-1 alpha-2, 'XX' if unknown
  city    TEXT    NOT NULL,  -- '' if unknown
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country, city)
);
