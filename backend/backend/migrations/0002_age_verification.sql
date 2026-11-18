-- =========================================
-- VERIFICATION DE MAJORITE DES UTILISATEURS
-- =========================================

ALTER TABLE users
ADD COLUMN age_verified INTEGER NOT NULL DEFAULT 0
CHECK (age_verified IN (0, 1));

ALTER TABLE users
ADD COLUMN age_verified_at TEXT;

ALTER TABLE users
ADD COLUMN age_verification_method TEXT;