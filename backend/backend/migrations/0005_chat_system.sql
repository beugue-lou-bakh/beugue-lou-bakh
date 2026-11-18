-- ==========================================
-- BEUGUE LOU BAKH
-- SYSTEME DE MESSAGERIE PRIVEE
-- Migration 0005
-- ==========================================

PRAGMA foreign_keys = ON;

-- 1. CONVERSATIONS
CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CLOSED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(auth_user_id)
        ON DELETE CASCADE
);

-- Une seule conversation active par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS
idx_chat_one_open_conversation
ON chat_conversations(user_id)
WHERE status = 'OPEN';

-- 2. MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    message TEXT,
    message_type TEXT NOT NULL DEFAULT 'TEXT'
        CHECK (message_type IN ('TEXT', 'IMAGE', 'VIDEO')),
    is_read INTEGER NOT NULL DEFAULT 0
        CHECK (is_read IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(id)
        ON DELETE CASCADE,

    FOREIGN KEY (sender_id)
        REFERENCES users(auth_user_id)
);

-- 3. PIECES JOINTES
CREATE TABLE IF NOT EXISTS chat_attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    media_type TEXT NOT NULL
        CHECK (media_type IN ('IMAGE', 'VIDEO')),

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

-- 4. INDEX POUR LES PERFORMANCES
CREATE INDEX IF NOT EXISTS
idx_chat_messages_conversation
ON chat_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS
idx_chat_messages_unread
ON chat_messages(is_read, created_at);

CREATE INDEX IF NOT EXISTS
idx_chat_attachments_scan
ON chat_attachments(scan_status);