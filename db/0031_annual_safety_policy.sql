CREATE TABLE company_safety_policies (
  company_id uuid NOT NULL REFERENCES companies(id),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  policy text NOT NULL CHECK (char_length(btrim(policy)) BETWEEN 1 AND 4000),
  goals text NOT NULL CHECK (char_length(btrim(goals)) BETWEEN 1 AND 2000),
  representative text NOT NULL CHECK (char_length(btrim(representative)) BETWEEN 1 AND 100),
  established_on date NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year)
);
