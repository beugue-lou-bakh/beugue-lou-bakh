-- =========================================
-- 0004 : VISIONNAGES DES VIDEOS
-- =========================================

CREATE TABLE IF NOT EXISTS video_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    viewer_key TEXT NOT NULL,
    user_id TEXT,
    viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (video_id)
        REFERENCES videos(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    -- Une seule vue comptabilisée par spectateur et par vidéo.
    UNIQUE (video_id, viewer_key)
);

CREATE INDEX IF NOT EXISTS idx_video_views_video
ON video_views(video_id);

CREATE INDEX IF NOT EXISTS idx_video_views_user
ON video_views(user_id);

CREATE INDEX IF NOT EXISTS idx_video_views_viewed_at
ON video_views(viewed_at);
