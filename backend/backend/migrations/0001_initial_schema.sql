PRAGMA foreign_keys = ON;

-- =========================================
-- UTILISATEURS
-- =========================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    auth_user_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'USER'
        CHECK (role IN ('USER', 'ADMIN')),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- CATÉGORIES
-- =========================================

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- VIDÉOS
-- =========================================

CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category_id INTEGER,
    thumbnail_url TEXT,
    storage_reference TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (
            status IN (
                'DRAFT',
                'PENDING',
                'PUBLISHED',
                'BLOCKED'
            )
        ),
    created_by TEXT NOT NULL,
    consent_verified INTEGER NOT NULL DEFAULT 0,
    rights_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

-- =========================================
-- JOURNAL DES ACTIONS ADMINISTRATEUR
-- =========================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (admin_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

-- =========================================
-- INDEX POUR LES PERFORMANCES
-- =========================================

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
ON users(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_videos_status
ON videos(status);

CREATE INDEX IF NOT EXISTS idx_videos_category
ON videos(category_id);

CREATE INDEX IF NOT EXISTS idx_videos_created_by
ON videos(created_by);

CREATE INDEX IF NOT EXISTS idx_videos_created_at
ON videos(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin
ON audit_logs(admin_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs(created_at);