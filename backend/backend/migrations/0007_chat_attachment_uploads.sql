-- ==========================================
-- BEUGUE LOU BAKH
-- GESTION DES TRANSFERTS DE PIECES JOINTES
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_attachment_uploads (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    uploader_auth_user_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    upload_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    media_type TEXT NOT NULL
        CHECK (media_type IN ('IMAGE', 'VIDEO')),
    status TEXT NOT NULL DEFAULT 'UPLOADING'
        CHECK (status IN ('UPLOADING', 'COMPLETED', 'ABORTED')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,

    FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(id) ON DELETE CASCADE,

    FOREIGN KEY (uploader_auth_user_id)
        REFERENCES users(auth_user_id)
);

CREATE INDEX IF NOT EXISTS
idx_chat_attachment_uploads_conversation
ON chat_attachment_uploads(conversation_id);

CREATE INDEX IF NOT EXISTS
idx_chat_attachment_uploads_status
ON chat_attachment_uploads(status);

CREATE TABLE IF NOT EXISTS chat_attachment_upload_parts (
    upload_session_id TEXT NOT NULL,
    part_number INTEGER NOT NULL,
    etag TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (upload_session_id, part_number),

    FOREIGN KEY (upload_session_id)
        REFERENCES chat_attachment_uploads(id) ON DELETE CASCADE
);

-- ==========================================
-- FIN DE LA MIGRATION
-- ==========================================