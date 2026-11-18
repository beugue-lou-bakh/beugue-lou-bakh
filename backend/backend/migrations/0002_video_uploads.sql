CREATE TABLE IF NOT EXISTS video_uploads (
    id TEXT PRIMARY KEY,
    upload_id TEXT NOT NULL UNIQUE,
    object_key TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id INTEGER,
    file_size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPLOADING'
        CHECK(status IN ('UPLOADING', 'COMPLETED', 'ABORTED')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    consent_confirmed INTEGER NOT NULL DEFAULT 0,
    rights_confirmed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS video_upload_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_session_id TEXT NOT NULL,
    part_number INTEGER NOT NULL,
    etag TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(upload_session_id, part_number),
    FOREIGN KEY(upload_session_id)
        REFERENCES video_uploads(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_uploads_created_by
ON video_uploads(created_by);

CREATE INDEX IF NOT EXISTS idx_video_upload_parts_session
ON video_upload_parts(upload_session_id);