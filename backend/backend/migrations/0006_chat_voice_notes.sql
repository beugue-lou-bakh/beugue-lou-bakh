PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_voice_notes (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    storage_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL
        CHECK (duration_seconds > 0 AND duration_seconds <= 300),
    scan_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (
            scan_status IN (
                'PENDING',
                'SCANNING',
                'CLEAN',
                'QUARANTINED',
                'REJECTED',
                'ERROR'
            )
        ),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (message_id)
        REFERENCES chat_messages(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_voice_notes_scan
ON chat_voice_notes(scan_status);

CREATE INDEX IF NOT EXISTS idx_chat_voice_notes_message
ON chat_voice_notes(message_id);