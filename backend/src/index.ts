// ==========================================
// BEUGUE LOU BAKH
// CLOUDFLARE WORKERS + D1 + SUPABASE AUTH
// BACKEND ADMINISTRATION
// ==========================================
// TYPES D1
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<{ success: boolean; meta?: unknown }>;
}
interface D1Database {
  prepare(query: string): D1Statement;
}
interface R2UploadedPartBinding {
  partNumber: number;
  etag: string;
}
interface R2MultipartUploadBinding {
  key: string;
  uploadId: string;
  uploadPart(
    partNumber: number,
    value:
      | ReadableStream
      | ArrayBuffer
      | ArrayBufferView
      | string
      | Blob
  ): Promise<R2UploadedPartBinding>;
  complete(
    uploadedParts: R2UploadedPartBinding[]
  ): Promise<{
    key: string;
    size: number;
    etag: string;
    httpEtag: string;
  }>;
  abort(): Promise<void>;
}
interface R2BucketBinding {
  list(options?: { limit?: number }): Promise<{
    objects: unknown[];
  }>;

  put(
    key: string,
    value:
      | ReadableStream
      | ArrayBuffer
      | ArrayBufferView
      | string
      | Blob,
    options?: {
      httpMetadata?: {
        contentType?: string;
        contentDisposition?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    }
  ): Promise<{
    key: string;
    size: number;
    etag: string;
  } | null>;

  get(
    key: string,
    options?: {
      range?: {
        offset?: number;
        length?: number;
        suffix?: number;
      };
    }
  ): Promise<{
    body: ReadableStream;
    size: number;
    httpEtag: string;
    range?: {
      offset: number;
      length: number;
    };
    writeHttpMetadata(headers: Headers): void;
  } | null>;

  delete(key: string | string[]): Promise<void>;

  createMultipartUpload(
    key: string,
    options?: {
      httpMetadata?: {
        contentType?: string;
        contentDisposition?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    }
  ): Promise<R2MultipartUploadBinding>;

  resumeMultipartUpload(
    key: string,
    uploadId: string
  ): R2MultipartUploadBinding;
}
interface Env {
  DB: D1Database;
  VIDEOS: R2BucketBinding;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PLAYBACK_TOKEN_SECRET: string;
}
interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
}
interface AppUser {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
}
interface Video {
  id: string;
  title: string;
  description: string | null;
  category_id: number | null;
  thumbnail_url: string | null;
  storage_reference: string | null;
  duration: number;
  status: string;
  created_by: string;
  consent_verified: number;
  rights_verified: number;
  created_at: string;
}
interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}
// ==========================================
// CORS
// ==========================================
const ALLOWED_ORIGINS = [
  "http\://localhost:5173",
  "http\://localhost:5174",
  "http\://localhost:4173",
];
function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
// ==========================================
// REPONSE JSON
// ==========================================
function json(
  data: unknown,
  status = 200,
  request?: Request
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...(request ? getCorsHeaders(request) : {}),
      "Content-Type": "application/json",
    },
  });
}
// ==========================================
// OUTILS
// ==========================================
function newId(): string {
  return crypto.randomUUID();
}
async function readBody(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
// ==========================================
// AUTHENTIFICATION SUPABASE
// ==========================================
async function verifyAuth(
  request: Request,
  env: Env
): Promise<AuthUser | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.substring(7);
  try {
    const response = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!response.ok) return null;
    return await response.json() as AuthUser;
  } catch {
    return null;
  }
}
// ==========================================
// UTILISATEUR D1
// ==========================================
async function getUser(
  authUserId: string,
  env: Env
): Promise<AppUser | null> {
  return await env.DB.prepare(`
    SELECT id, auth_user_id, full_name, email, phone, role, status
    FROM users
    WHERE auth_user_id = ?
    LIMIT 1
  `)
    .bind(authUserId)
    .first<AppUser>();
}
// ==========================================
// VERIFICATION ADMIN AVEC MFA OBLIGATOIRE
// ==========================================

async function verifyAdmin(
  request: Request,
  env: Env
): Promise<AppUser | null> {

  // 1. Vérifier le jeton auprès de Supabase
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return null;
  }

  // 2. Exiger une authentification MFA validée
  const aal = getTokenAal(request);

  if (aal !== "aal2") {
    return null;
  }

  // 3. Vérifier le rôle et le statut dans D1
  const user = await getUser(authUser.id, env);

  if (
    !user ||
    user.role !== "ADMIN" ||
    user.status !== "ACTIVE"
  ) {
    return null;
  }

  return user;
}

// ==========================================
// VERIFICATION DU NIVEAU MFA SUPABASE
// ==========================================

function getTokenAal(request: Request): string | null {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const token = authorization.substring(7);
    const parts = token.split(".");

    if (parts.length !== 3) return null;

    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const decoded = atob(
      payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")
    );

    const claims = JSON.parse(decoded);

    return claims.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return null;
  }
}
// ==========================================
// JOURNALISATION
// ==========================================
async function logAction(
  env: Env,
  adminId: string,
  action: string,
  entityType: string,
  entityId: string
) {
  await env.DB.prepare(`
    INSERT INTO audit_logs
    (admin_id, action, entity_type, entity_id)
    VALUES (?, ?, ?, ?)
  `)
    .bind(adminId, action, entityType, entityId)
    .run();
}
// ==========================================
// APPLICATION
// ==========================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }
    try {
      // ======================================
      // TEST API
      // ======================================
      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          message: "BEUGUE LOU BAKH API fonctionne",
          status: "ONLINE",
        }, 200, request);
      }
      // ======================================
      // TEST D1
      // ======================================
      if (path === "/api/db-check" && method === "GET") {
        const result = await env.DB.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `).all();
        return json({
          success: true,
          message: "Connexion D1 réussie",
          tables: result.results,
        }, 200, request);
      }
      // ======================================
      // SYNCHRONISATION PROFIL
      // ======================================
      if (path === "/api/profile/sync" && method === "POST") {
        const authUser = await verifyAuth(request, env);
        if (!authUser || !authUser.email) {
          return json({
            success: false,
            message: "Authentification invalide",
          }, 401, request);
        }
        const body = await readBody(request);
        const fullName =
          String(body?.full_name || authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name || authUser.email)
          .trim()
          .slice(0, 150);
        await env.DB.prepare(`
          INSERT INTO users (
            id,
            auth_user_id,
            full_name,
            email,
            role,
            status
          )
          VALUES (?, ?, ?, ?, 'USER', 'ACTIVE')
          ON CONFLICT(auth_user_id)
          DO UPDATE SET
            full_name = excluded.full_name,
            email = excluded.email
        `)
          .bind(
            authUser.id,
            authUser.id,
            fullName,
            authUser.email
          )
          .run();
        const user = await getUser(authUser.id, env);
        if (!user || user.status !== "ACTIVE") {
          return json({
            success: false,
            message: "Compte non autorisé",
          }, 403, request);
        }
        return json({
          success: true,
          message: "Profil synchronisé",
          user,
        }, 200, request);
      }
      // ======================================
      // PROFIL UTILISATEUR
      // ======================================
      if (path === "/api/me" && method === "GET") {
        const authUser = await verifyAuth(request, env);
        if (!authUser) {
          return json({
            success: false,
            message: "Authentification invalide",
          }, 401, request);
        }
        const user = await getUser(authUser.id, env);
        if (!user || user.status !== "ACTIVE") {
          return json({
            success: false,
            message: "Compte non autorisé",
          }, 403, request);
        }
        return json({
          success: true,
          user,
        }, 200, request);
      }
      // ======================================
      // VERIFICATION ADMIN
      // ======================================
      if (path === "/api/admin/check" && method === "GET") {
        const authUser = await verifyAuth(request, env);
        if (!authUser) {
          return json({
            success: false,
            message: "Authentification invalide",
          }, 401, request);
        }
        const admin = await verifyAdmin(request, env);
        if (!admin) {
          return json({
            success: false,
            message: "Accès administrateur refusé",
          }, 403, request);
        }
        return json({
          success: true,
          message: "Bienvenue dans l'administration BEUGUE LOU BAKH",
          admin,
        }, 200, request);
      }

      // ==========================================
// IDENTIFICATION DU ROLE ADMIN
// Accessible après authentification simple
// Ne donne aucun accès aux fonctions ADMIN
// ==========================================

if (path === "/api/auth/admin-status" && method === "GET") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({
      success: false,
      message: "Authentification invalide",
    }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  return json({
    success: true,
    isAdmin: Boolean(
      user &&
      user.role === "ADMIN" &&
      user.status === "ACTIVE"
    ),
  }, 200, request);
}

// ==========================================
// MESSAGERIE PRIVÉE - UTILISATEUR
// ==========================================

// Récupérer la conversation de l'utilisateur
if (path === "/api/chat/conversation" && method === "GET") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({ success: false, message: "Connexion requise" }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({ success: false, message: "Compte utilisateur inactif" }, 403, request);
  }

  const conversation = await env.DB.prepare(`
    SELECT id, user_id, status, created_at, updated_at
    FROM chat_conversations
    WHERE user_id = ? AND status = 'OPEN'
    LIMIT 1
  `).bind(authUser.id).first();

  return json({ success: true, conversation }, 200, request);
}

// Créer une conversation
if (path === "/api/chat/conversation" && method === "POST") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({ success: false, message: "Connexion requise" }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({ success: false, message: "Compte utilisateur inactif" }, 403, request);
  }

  let conversation = await env.DB.prepare(`
    SELECT id, user_id, status, created_at, updated_at
    FROM chat_conversations
    WHERE user_id = ? AND status = 'OPEN'
    LIMIT 1
  `).bind(authUser.id).first();

  if (!conversation) {
    const id = newId();

    try {
      await env.DB.prepare(`
        INSERT INTO chat_conversations (id, user_id, status)
        VALUES (?, ?, 'OPEN')
      `).bind(id, authUser.id).run();
    } catch {
      // Une autre requête peut avoir créé la conversation entre-temps.
    }

    conversation = await env.DB.prepare(`
      SELECT id, user_id, status, created_at, updated_at
      FROM chat_conversations
      WHERE user_id = ? AND status = 'OPEN'
      LIMIT 1
    `).bind(authUser.id).first();
  }

  return json({ success: true, conversation }, 200, request);
}

// Lire les messages de sa conversation
if (path === "/api/chat/messages" && method === "GET") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({ success: false, message: "Connexion requise" }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({ success: false, message: "Compte utilisateur inactif" }, 403, request);
  }

  const conversationId = new URL(request.url).searchParams.get("conversation_id");

  if (!conversationId) {
    return json({ success: false, message: "Conversation manquante" }, 400, request);
  }

  const conversation = await env.DB.prepare(`
    SELECT id
    FROM chat_conversations
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(conversationId, authUser.id).first();

  if (!conversation) {
    return json({ success: false, message: "Conversation introuvable" }, 404, request);
  }

  const result = await env.DB.prepare(`
    SELECT
      m.id,
      m.conversation_id,
      m.sender_id,
      m.message,
      m.message_type,
      m.is_read,
      m.created_at,
      u.full_name AS sender_name,
      u.role AS sender_role,

      (
        SELECT a.id
        FROM chat_attachments a
        WHERE a.message_id = m.id
        LIMIT 1
      ) AS attachment_id,

      (
        SELECT a.file_name
        FROM chat_attachments a
        WHERE a.message_id = m.id
        LIMIT 1
      ) AS attachment_file_name,

      (
        SELECT a.mime_type
        FROM chat_attachments a
        WHERE a.message_id = m.id
        LIMIT 1
      ) AS attachment_mime_type,

      (
        SELECT a.file_size
        FROM chat_attachments a
        WHERE a.message_id = m.id
        LIMIT 1
      ) AS attachment_file_size,

      (
        SELECT a.media_type
        FROM chat_attachments a
        WHERE a.message_id = m.id
        LIMIT 1
      ) AS attachment_media_type,

      (
        SELECT a.scan_status
        FROM chat_attachments a
        WHERE a.message_id = m.id
        LIMIT 1
      ) AS attachment_scan_status

    FROM chat_messages m
    JOIN users u ON u.auth_user_id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).bind(conversationId).all();

  await env.DB.prepare(`
    UPDATE chat_messages
    SET is_read = 1
    WHERE conversation_id = ?
      AND sender_id != ?
      AND is_read = 0
  `).bind(conversationId, authUser.id).run();

  return json({ success: true, messages: result.results }, 200, request);
}

// Envoyer un message texte
if (path === "/api/chat/messages" && method === "POST") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({ success: false, message: "Connexion requise" }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({ success: false, message: "Compte utilisateur inactif" }, 403, request);
  }

  const body = await readBody(request);
  const conversationId = String(body?.conversation_id || "");
  const message = String(body?.message || "").trim();

  if (!conversationId || !message || message.length > 5000) {
    return json({
      success: false,
      message: "Message invalide : 1 à 5000 caractères requis"
    }, 400, request);
  }

  const conversation = await env.DB.prepare(`
    SELECT id
    FROM chat_conversations
    WHERE id = ? AND user_id = ? AND status = 'OPEN'
    LIMIT 1
  `).bind(conversationId, authUser.id).first();

  if (!conversation) {
    return json({ success: false, message: "Conversation introuvable ou fermée" }, 404, request);
  }

  const messageId = newId();

  await env.DB.prepare(`
    INSERT INTO chat_messages
      (id, conversation_id, sender_id, message, message_type)
    VALUES (?, ?, ?, ?, 'TEXT')
  `).bind(messageId, conversationId, authUser.id, message).run();

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(conversationId).run();

  return json({
    success: true,
    message: "Message envoyé",
    message_id: messageId
  }, 201, request);
}
      // ==========================================
// CATALOGUE PUBLIC : VIDÉOS PUBLIÉES
// ==========================================

if (request.method === "GET" && path === "/api/videos") {
  const result = await env.DB.prepare(`
    SELECT
      v.id,
      v.title,
      v.description,
      v.thumbnail_url,
      v.duration,
      v.created_at,
      c.name AS category_name,
      (
        SELECT COUNT(*)
        FROM video_views vv
        WHERE vv.video_id = v.id
      ) AS views_count
    FROM videos v
    LEFT JOIN categories c
      ON c.id = v.category_id
    WHERE v.status = 'PUBLISHED'
    ORDER BY v.created_at DESC
  `).all();

  return json({
    success: true,
    videos: result.results ?? []
  }, 200, request);
}

// =====================================================
// CHAT PRIVÉ - INITIALISATION UPLOAD PIECE JOINTE
// =====================================================

if (
  path === "/api/chat/attachments/init" &&
  method === "POST"
) {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({
      success: false,
      message: "Connexion requise"
    }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({
      success: false,
      message: "Compte utilisateur inactif"
    }, 403, request);
  }

  const body = await readBody(request);

  const conversationId = String(
    body?.conversation_id || ""
  );

  const fileName = String(
    body?.file_name || ""
  ).trim();

  const contentType = String(
    body?.content_type || ""
  ).toLowerCase();

  const fileSize = Number(body?.file_size);

  if (!conversationId || !fileName) {
    return json({
      success: false,
      message: "Informations du fichier incomplètes"
    }, 400, request);
  }

  const allowedTypes: Record<string, "IMAGE" | "VIDEO"> = {
    "image/jpeg": "IMAGE",
    "image/png": "IMAGE",
    "image/webp": "IMAGE",
    "video/mp4": "VIDEO",
    "video/webm": "VIDEO"
  };

  const mediaType = allowedTypes[contentType];

  if (!mediaType) {
    return json({
      success: false,
      message: "Format accepté : JPG, PNG, WebP, MP4 ou WebM"
    }, 400, request);
  }

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

  const maxSize = mediaType === "IMAGE"
    ? MAX_IMAGE_SIZE
    : MAX_VIDEO_SIZE;

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > maxSize
  ) {
    return json({
      success: false,
      message: mediaType === "IMAGE"
        ? "Image limitée à 10 Mo"
        : "Vidéo limitée à 100 Mo"
    }, 400, request);
  }

  const safeFileName = fileName
    .replace(/[\/\\]/g, "_")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 180);

  if (!safeFileName) {
    return json({
      success: false,
      message: "Nom de fichier invalide"
    }, 400, request);
  }

  // Vérifier que la conversation appartient à l'utilisateur
  const conversation = await env.DB.prepare(`
    SELECT id
    FROM chat_conversations
    WHERE id = ?
      AND user_id = ?
      AND status = 'OPEN'
    LIMIT 1
  `).bind(
    conversationId,
    authUser.id
  ).first();

  if (!conversation) {
    return json({
      success: false,
      message: "Conversation introuvable ou fermée"
    }, 404, request);
  }

  const uploadSessionId = newId();

  const objectKey =
    `private/chat/${conversationId}/${uploadSessionId}`;

  const expiresAt = new Date(
    Date.now() + 60 * 60 * 1000
  ).toISOString();

  let multipart: R2MultipartUploadBinding | null = null;

  try {
    // Créer le transfert multipart dans R2
    multipart = await env.VIDEOS.createMultipartUpload(
      objectKey,
      {
        httpMetadata: {
          contentType
        },
        customMetadata: {
          conversationId,
          uploadSessionId,
          uploaderId: authUser.id,
          mediaType
        }
      }
    );

    // Enregistrer la session dans D1
    await env.DB.prepare(`
      INSERT INTO chat_attachment_uploads (
        id,
        conversation_id,
        uploader_auth_user_id,
        object_key,
        upload_id,
        file_name,
        mime_type,
        file_size,
        media_type,
        status,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADING', ?)
    `).bind(
      uploadSessionId,
      conversationId,
      authUser.id,
      objectKey,
      multipart.uploadId,
      safeFileName,
      contentType,
      fileSize,
      mediaType,
      expiresAt
    ).run();

    return json({
      success: true,
      message: "Session de transfert créée",
      upload: {
        id: uploadSessionId,
        chunk_size: 10 * 1024 * 1024,
        total_parts: Math.ceil(
          fileSize / (10 * 1024 * 1024)
        ),
        file_size: fileSize,
        media_type: mediaType
      }
    }, 201, request);

  } catch (error) {
    if (multipart) {
      try {
        await multipart.abort();
      } catch {
        // Ne pas masquer l'erreur initiale
      }
    }

    console.error(
      "Erreur initialisation pièce jointe :",
      error
    );

    return json({
      success: false,
      message: "Impossible de créer la session de transfert"
    }, 500, request);
  }
}

// =====================================================
// CHAT PRIVÉ - UPLOAD DES MORCEAUX VERS R2
// =====================================================

const chatUploadPartMatch = path.match(
  /^\/api\/chat\/attachments\/([^/]+)\/parts\/(\d+)$/
);

if (chatUploadPartMatch && method === "PUT") {

  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({
      success: false,
      message: "Connexion requise"
    }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({
      success: false,
      message: "Compte utilisateur inactif"
    }, 403, request);
  }

  const uploadSessionId = chatUploadPartMatch[1];
  const partNumber = Number(chatUploadPartMatch[2]);

  const CHUNK_SIZE = 10 * 1024 * 1024;

  if (
    !Number.isSafeInteger(partNumber) ||
    partNumber < 1
  ) {
    return json({
      success: false,
      message: "Numéro de morceau invalide"
    }, 400, request);
  }

  try {

    const session = await env.DB.prepare(`
      SELECT *
      FROM chat_attachment_uploads
      WHERE id = ?
        AND uploader_auth_user_id = ?
        AND status = 'UPLOADING'
    `).bind(
      uploadSessionId,
      authUser.id
    ).first<{
      id: string;
      conversation_id: string;
      object_key: string;
      upload_id: string;
      file_size: number;
      status: string;
      expires_at: string;
    }>();

    if (!session) {
      return json({
        success: false,
        message: "Session introuvable ou accès refusé"
      }, 404, request);
    }

    if (
      !session.object_key.startsWith("private/chat/") ||
      session.object_key.includes("..")
    ) {
      return json({
        success: false,
        message: "Clé de stockage invalide"
      }, 403, request);
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return json({
        success: false,
        message: "Session de transfert expirée"
      }, 410, request);
    }

    const conversation = await env.DB.prepare(`
      SELECT id
      FROM chat_conversations
      WHERE id = ?
        AND user_id = ?
        AND status = 'OPEN'
      LIMIT 1
    `).bind(
      session.conversation_id,
      authUser.id
    ).first();

    if (!conversation) {
      return json({
        success: false,
        message: "Conversation introuvable ou fermée"
      }, 404, request);
    }

    const totalParts = Math.ceil(
      session.file_size / CHUNK_SIZE
    );

    if (partNumber > totalParts) {
      return json({
        success: false,
        message: "Numéro de morceau supérieur au nombre attendu"
      }, 400, request);
    }

    const expectedSize =
      partNumber === totalParts
        ? session.file_size - CHUNK_SIZE * (totalParts - 1)
        : CHUNK_SIZE;

    const contentLengthHeader =
  request.headers.get("Content-Length");

if (
  contentLengthHeader !== null &&
  Number(contentLengthHeader) !== expectedSize
) {
      return json({
        success: false,
        message: "Taille du morceau incorrecte",
        expected_size: expectedSize,
        received_size: contentLengthHeader === null
  ? null
  : Number(contentLengthHeader)
      }, 400, request);
    }

    const data = await request.arrayBuffer();

    if (data.byteLength !== expectedSize) {
      return json({
        success: false,
        message: "Taille du morceau incorrecte",
        expected_size: expectedSize,
        received_size: data.byteLength
      }, 400, request);
    }

    const multipart = env.VIDEOS.resumeMultipartUpload(
      session.object_key,
      session.upload_id
    );

    const uploadedPart = await multipart.uploadPart(
      partNumber,
      data
    );

    await env.DB.prepare(`
      INSERT INTO chat_attachment_upload_parts (
        upload_session_id,
        part_number,
        etag
      )
      VALUES (?, ?, ?)
      ON CONFLICT(upload_session_id, part_number)
      DO UPDATE SET etag = excluded.etag
    `).bind(
      session.id,
      uploadedPart.partNumber,
      uploadedPart.etag
    ).run();

    return json({
      success: true,
      message: "Morceau envoyé avec succès",
      part_number: uploadedPart.partNumber,
      etag: uploadedPart.etag,
      total_parts: totalParts
    }, 200, request);

  } catch (error) {

    console.error(
      "Erreur upload pièce jointe chat :",
      error
    );

    return json({
      success: false,
      message: "Erreur lors de l'envoi du morceau"
    }, 500, request);
  }
}

// =====================================================
// CHAT PRIVÉ - FINALISATION DE LA PIECE JOINTE
// =====================================================

const chatCompleteMatch = path.match(
  /^\/api\/chat\/attachments\/([^/]+)\/complete$/
);

if (chatCompleteMatch && method === "POST") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({
      success: false,
      message: "Connexion requise"
    }, 401, request);
  }

  const user = await getUser(authUser.id, env);

  if (!user || user.status !== "ACTIVE") {
    return json({
      success: false,
      message: "Compte utilisateur inactif"
    }, 403, request);
  }

  const uploadSessionId = chatCompleteMatch[1];
  const CHUNK_SIZE = 10 * 1024 * 1024;

  try {
    // 1. Récupérer la session de transfert
    const session = await env.DB.prepare(`
      SELECT *
      FROM chat_attachment_uploads
      WHERE id = ?
        AND uploader_auth_user_id = ?
        AND status = 'UPLOADING'
      LIMIT 1
    `).bind(
      uploadSessionId,
      authUser.id
    ).first<{
      id: string;
      conversation_id: string;
      uploader_auth_user_id: string;
      object_key: string;
      upload_id: string;
      file_name: string;
      mime_type: string;
      file_size: number;
      media_type: string;
      status: string;
      expires_at: string;
    }>();

    if (!session) {
      return json({
        success: false,
        message: "Session introuvable ou déjà terminée"
      }, 404, request);
    }

    if (
      !session.object_key.startsWith("private/chat/") ||
      session.object_key.includes("..")
    ) {
      return json({
        success: false,
        message: "Clé de stockage invalide"
      }, 403, request);
    }

    // 2. Vérifier l'expiration
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return json({
        success: false,
        message: "Session de transfert expirée"
      }, 410, request);
    }

    // 3. Vérifier que la conversation appartient à l'utilisateur
    const conversation = await env.DB.prepare(`
      SELECT id
      FROM chat_conversations
      WHERE id = ?
        AND user_id = ?
        AND status = 'OPEN'
      LIMIT 1
    `).bind(
      session.conversation_id,
      authUser.id
    ).first();

    if (!conversation) {
      return json({
        success: false,
        message: "Conversation introuvable ou fermée"
      }, 404, request);
    }

    // 4. Vérifier les morceaux enregistrés
    const totalParts = Math.ceil(
      session.file_size / CHUNK_SIZE
    );

    const partsResult = await env.DB.prepare(`
      SELECT part_number, etag
      FROM chat_attachment_upload_parts
      WHERE upload_session_id = ?
      ORDER BY part_number ASC
    `).bind(session.id).all<{
      part_number: number;
      etag: string;
    }>();

    const parts = partsResult.results || [];

    if (parts.length !== totalParts) {
      return json({
        success: false,
        message: "Certains morceaux sont manquants",
        expected_parts: totalParts,
        received_parts: parts.length
      }, 400, request);
    }

    for (let i = 0; i < totalParts; i++) {
      if (
        parts[i].part_number !== i + 1 ||
        !parts[i].etag
      ) {
        return json({
          success: false,
          message: "Liste des morceaux incomplète ou invalide"
        }, 400, request);
      }
    }

    // 5. Finaliser le transfert multipart R2
    const multipart = env.VIDEOS.resumeMultipartUpload(
      session.object_key,
      session.upload_id
    );

    const completedObject = await multipart.complete(
      parts.map(part => ({
        partNumber: part.part_number,
        etag: part.etag
      }))
    );

    // 6. Vérifier la taille finale
    if (completedObject.size !== session.file_size) {
      await env.VIDEOS.delete(session.object_key);

      await env.DB.prepare(`
        UPDATE chat_attachment_uploads
        SET status = 'ABORTED'
        WHERE id = ?
      `).bind(session.id).run();

      return json({
        success: false,
        message: "La taille du fichier assemblé est incorrecte"
      }, 400, request);
    }

    // 7. Vérifier la signature réelle du fichier
    const headerObject = await env.VIDEOS.get(
      session.object_key,
      {
        range: {
          offset: 0,
          length: 16
        }
      }
    );

    if (!headerObject) {
      await env.VIDEOS.delete(session.object_key);

      return json({
        success: false,
        message: "Impossible de vérifier le fichier"
      }, 400, request);
    }

   const header = new Uint8Array(
  await new Response(headerObject.body).arrayBuffer()
);

    const startsWith = (...bytes: number[]) =>
      bytes.every((byte, index) => header[index] === byte);

    let signatureValid = false;

    switch (session.mime_type) {
      case "image/jpeg":
        signatureValid = startsWith(0xFF, 0xD8, 0xFF);
        break;

      case "image/png":
        signatureValid = startsWith(
          0x89, 0x50, 0x4E, 0x47,
          0x0D, 0x0A, 0x1A, 0x0A
        );
        break;

      case "image/webp":
        signatureValid =
          startsWith(0x52, 0x49, 0x46, 0x46) &&
          header[8] === 0x57 &&
          header[9] === 0x45 &&
          header[10] === 0x42 &&
          header[11] === 0x50;
        break;

      case "video/mp4":
        signatureValid =
          header[4] === 0x66 &&
          header[5] === 0x74 &&
          header[6] === 0x79 &&
          header[7] === 0x70;
        break;

      case "video/webm":
        signatureValid = startsWith(
          0x1A, 0x45, 0xDF, 0xA3
        );
        break;
    }

    if (!signatureValid) {
      await env.VIDEOS.delete(session.object_key);

      await env.DB.prepare(`
        UPDATE chat_attachment_uploads
        SET status = 'ABORTED'
        WHERE id = ?
      `).bind(session.id).run();

      return json({
        success: false,
        message: "Le contenu réel du fichier ne correspond pas à son format déclaré"
      }, 400, request);
    }

    // 8. Créer le message et la pièce jointe
    const messageId = newId();
    const attachmentId = newId();

    try {
      await env.DB.prepare(`
        INSERT INTO chat_messages (
          id,
          conversation_id,
          sender_id,
          message,
          message_type
        )
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        messageId,
        session.conversation_id,
        authUser.id,
        "",
        session.media_type
      ).run();

      await env.DB.prepare(`
        INSERT INTO chat_attachments (
          id,
          message_id,
          storage_key,
          file_name,
          mime_type,
          file_size,
          media_type,
          scan_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).bind(
        attachmentId,
        messageId,
        session.object_key,
        session.file_name,
        session.mime_type,
        session.file_size,
        session.media_type
      ).run();

      // 9. Mettre à jour la conversation
      await env.DB.prepare(`
        UPDATE chat_conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(session.conversation_id).run();

      // 10. Marquer le transfert comme terminé
      await env.DB.prepare(`
        UPDATE chat_attachment_uploads
        SET status = 'COMPLETED'
        WHERE id = ?
      `).bind(session.id).run();

    } catch (dbError) {
      // Nettoyage du fichier si l'enregistrement D1 échoue
      await env.VIDEOS.delete(session.object_key);

      await env.DB.prepare(`
        DELETE FROM chat_messages
        WHERE id = ?
      `).bind(messageId).run();

      throw dbError;
    }

    return json({
      success: true,
      message: "Pièce jointe envoyée avec succès",
      attachment: {
        id: attachmentId,
        message_id: messageId,
        file_name: session.file_name,
        mime_type: session.mime_type,
        file_size: session.file_size,
        media_type: session.media_type,
        scan_status: "PENDING"
      }
    }, 201, request);

  } catch (error) {
    console.error(
      "Erreur finalisation pièce jointe :",
      error
    );

    return json({
      success: false,
      message: "Impossible de finaliser la pièce jointe"
    }, 500, request);
  }
}

// ==========================================
// AFFICHAGE PUBLIC DES MINIATURES R2
// ==========================================

const thumbnailMatch = path.match(
  /^\/api\/thumbnails\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))$/
)

if (thumbnailMatch && method === "GET") {
  try {
    const objectKey = `thumbnails/${thumbnailMatch[1]}`
    const object = await env.VIDEOS.get(objectKey)

    if (!object) {
      return json({
        success: false,
        message: "Miniature introuvable"
      }, 404, request)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("Cache-Control", "public, max-age=86400")
    headers.set("X-Content-Type-Options", "nosniff")

    return new Response(object.body, {
      status: 200,
      headers
    })
  } catch (error) {
    console.error("Erreur lecture miniature :", error)

    return json({
      success: false,
      message: "Impossible de charger la miniature"
    }, 500, request)
  }
}
// ==========================================
// LECTURE SECURISEE DES VIDEOS R2
// ==========================================

const playbackMatch = path.match(
  /^\/api\/videos\/([^/]+)\/stream$/
);

if (playbackMatch && method === "GET") {

  try {

    // Lecture publique : aucun compte n'est requis pour regarder une vidéo publiée.
    // Si un utilisateur connecté et actif existe, sa vue est comptabilisée ci-dessous.
    const authUser = await verifyAuth(request, env);
    const user = authUser ? await getUser(authUser.id, env) : null;

    // Récupérer la vidéo publiée

    const videoId = decodeURIComponent(playbackMatch[1]);

    const video = await env.DB.prepare(`
      SELECT
        id,
        title,
        storage_reference,
        status,
        consent_verified,
        rights_verified
      FROM videos
      WHERE id = ?
      LIMIT 1
    `)
      .bind(videoId)
      .first<{
        id: string;
        title: string;
        storage_reference: string | null;
        status: string;
        consent_verified: number;
        rights_verified: number;
      }>();

    if (!video || video.status !== "PUBLISHED") {
      return json({
        success: false,
        message: "Vidéo indisponible"
      }, 404, request);
    }

    // 4. Vérifier les autorisations enregistrées

    if (
      video.consent_verified !== 1 ||
      video.rights_verified !== 1
    ) {
      return json({
        success: false,
        message: "Les autorisations de diffusion ne sont pas validées"
      }, 403, request);
    }

    // 5. Vérifier la référence privée R2

    const objectKey = video.storage_reference;

    if (
      !objectKey ||
      !objectKey.startsWith("private/videos/") ||
      objectKey.includes("..")
    ) {
      return json({
        success: false,
        message: "Fichier vidéo introuvable"
      }, 404, request);
    }

    // 6. Lire la demande HTTP Range

    const rangeHeader = request.headers.get("Range");

    let rangeOptions:
      | { offset: number; length: number }
      | undefined;

    if (rangeHeader) {

      const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

      if (!match || (!match[1] && !match[2])) {
        return new Response(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": "bytes */*"
          }
        });
      }

      const start = match[1] ? Number(match[1]) : null;
      const end = match[2] ? Number(match[2]) : null;

      if (
        (start !== null && !Number.isSafeInteger(start)) ||
        (end !== null && !Number.isSafeInteger(end))
      ) {
        return new Response(null, { status: 416 });
      }

      if (start !== null && end !== null) {

        if (end < start) {
          return new Response(null, { status: 416 });
        }

        rangeOptions = {
          offset: start,
          length: end - start + 1
        };

      } else if (start !== null) {

        rangeOptions = {
          offset: start,
          length: 1024 * 1024 * 5
        };

      } else if (end !== null) {

        rangeOptions = {
          offset: 0,
          length: end
        };

      }

    }

    // 7. Récupérer le fichier privé dans R2

    const object = await env.VIDEOS.get(
      objectKey,
      rangeOptions ? { range: rangeOptions } : undefined
    );

    if (!object) {
      return json({
        success: false,
        message: "Fichier vidéo absent du stockage"
      }, 404, request);
    }

    // Comptabiliser la vue des utilisateurs connectés actifs.
    // Les visiteurs anonymes peuvent lire la vidéo sans qu'une ligne D1 soit créée.
    if (user && user.status === "ACTIVE") {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO video_views (
          video_id,
          viewer_key,
          user_id
        )
        VALUES (?, ?, ?)
      `)
        .bind(videoId, user.id, user.id)
        .run();
    }

    // 8. Préparer les en-têtes HTTP

    const headers = new Headers(getCorsHeaders(request));

    object.writeHttpMetadata(headers);

    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", "inline");
    headers.set(
      "Content-Type",
      headers.get("Content-Type") || "video/mp4"
    );

    // 9. Réponse complète ou partielle

    if (rangeOptions) {

      const actualRange = object.range;

      if (!actualRange) {
        return new Response(null, {
          status: 416,
          headers
        });
      }

      headers.set(
        "Content-Length",
        String(actualRange.length)
      );

      headers.set(
        "Content-Range",
        `bytes ${actualRange.offset}-${actualRange.offset + actualRange.length - 1}/${object.size}`
      );

      return new Response(object.body, {
        status: 206,
        headers
      });

    }

    headers.set("Content-Length", String(object.size));

    return new Response(object.body, {
      status: 200,
      headers
    });

  } catch (error) {

    console.error("Erreur lecture vidéo R2:", error);

    return json({
      success: false,
      message: "Erreur pendant la lecture de la vidéo"
    }, 500, request);

  }

}
      // ======================================
      // ROUTES ADMIN
      // ======================================
      const admin = await verifyAdmin(request, env);
      if (path.startsWith("/api/admin/") && !admin) {
        return json({
          success: false,
          message: "Accès administrateur refusé",
        }, 403, request);
      }
      if (admin) {

        // ==========================================
// UPLOAD DES MINIATURES VERS R2
// ==========================================

if (path === "/api/admin/thumbnails" && method === "POST") {
  try {
    const contentType = request.headers.get("Content-Type") || ""

    if (!contentType.includes("multipart/form-data")) {
      return json({
        success: false,
        message: "Format de requête invalide"
      }, 400, request)
    }

    const formData = await request.formData()
    const file = formData.get("thumbnail")

    if (!(file instanceof File)) {
      return json({
        success: false,
        message: "Aucune image sélectionnée"
      }, 400, request)
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ]

    if (!allowedTypes.includes(file.type)) {
      return json({
        success: false,
        message: "Format accepté : JPG, PNG ou WebP"
      }, 400, request)
    }

    const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024

    if (file.size <= 0 || file.size > MAX_THUMBNAIL_SIZE) {
      return json({
        success: false,
        message: "La miniature ne doit pas dépasser 5 Mo"
      }, 400, request)
    }

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    }[file.type]

    const filename = `${newId()}.${extension}`
    const objectKey = `thumbnails/${filename}`

    await env.VIDEOS.put(
      objectKey,
      await file.arrayBuffer(),
      {
        httpMetadata: {
          contentType: file.type,
          cacheControl: "public, max-age=86400"
        },
        customMetadata: {
          uploadedBy: admin.id
        }
      }
    )

    await logAction(
      env,
      admin.id,
      "UPLOAD_THUMBNAIL",
      "THUMBNAIL",
      filename
    )

    return json({
      success: true,
      message: "Miniature téléversée avec succès",
      thumbnail_url: `/api/thumbnails/${filename}`
    }, 201, request)

  } catch (error) {
    console.error("Erreur upload miniature :", error)

    return json({
      success: false,
      message: "Erreur lors du téléversement de la miniature"
    }, 500, request)
  }
}
        
// ==========================================
// MESSAGERIE PRIVÉE - ADMINISTRATEUR
// ==========================================

// 1. Liste des conversations
if (path === "/api/admin/chat/conversations" && method === "GET") {

  const result = await env.DB.prepare(`
    SELECT
      c.id AS conversation_id,
      c.user_id,
      c.status,
      c.created_at,
      c.updated_at,
      u.full_name AS user_name,
      u.email AS user_email,

      (
        SELECT m.message
        FROM chat_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message,

      (
        SELECT m.created_at
        FROM chat_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_at,

      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id != ?
          AND m.is_read = 0
      ) AS unread_count

    FROM chat_conversations c
    JOIN users u ON u.auth_user_id = c.user_id
    ORDER BY c.updated_at DESC
  `).bind(admin.auth_user_id).all();

  return json({
    success: true,
    conversations: result.results
  }, 200, request);
}


// 2. Lire les messages d'une conversation
if (path === "/api/admin/chat/messages" && method === "GET") {

  const conversationId =
    new URL(request.url).searchParams.get("conversation_id");

  if (!conversationId) {
    return json({
      success: false,
      message: "Conversation manquante"
    }, 400, request);
  }

  const conversation = await env.DB.prepare(`
    SELECT id
    FROM chat_conversations
    WHERE id = ?
    LIMIT 1
  `).bind(conversationId).first();

  if (!conversation) {
    return json({
      success: false,
      message: "Conversation introuvable"
    }, 404, request);
  }

  const result = await env.DB.prepare(`
          m.id,
      m.conversation_id,
      m.sender_id,
      m.message,
      m.message_type,
      m.is_read,
      m.created_at,
      u.full_name AS sender_name,
      u.role AS sender_role,
      (
        SELECT a.id FROM chat_attachments a
        WHERE a.message_id = m.id LIMIT 1
      ) AS attachment_id,
      (
        SELECT a.file_name FROM chat_attachments a
        WHERE a.message_id = m.id LIMIT 1
      ) AS attachment_file_name,
      (
        SELECT a.mime_type FROM chat_attachments a
        WHERE a.message_id = m.id LIMIT 1
      ) AS attachment_mime_type,
      (
        SELECT a.file_size FROM chat_attachments a
        WHERE a.message_id = m.id LIMIT 1
      ) AS attachment_file_size,
      (
        SELECT a.media_type FROM chat_attachments a
        WHERE a.message_id = m.id LIMIT 1
      ) AS attachment_media_type,
      (
        SELECT a.scan_status FROM chat_attachments a
        WHERE a.message_id = m.id LIMIT 1
      ) AS attachment_scan_status
    FROM chat_messages m
    JOIN users u ON u.auth_user_id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).bind(conversationId).all();

  // Marquer les messages des utilisateurs comme lus
  await env.DB.prepare(`
    UPDATE chat_messages
    SET is_read = 1
    WHERE conversation_id = ?
      AND sender_id != ?
      AND is_read = 0
  `).bind(conversationId, admin.auth_user_id).run();

  return json({
    success: true,
    messages: result.results
  }, 200, request);
}


// 3. Répondre à un utilisateur
if (path === "/api/admin/chat/messages" && method === "POST") {

  const body = await readBody(request);

  const conversationId =
    String(body?.conversation_id || "");

  const message =
    String(body?.message || "").trim();

  if (!conversationId || !message || message.length > 5000) {
    return json({
      success: false,
      message: "Message invalide : 1 à 5000 caractères requis"
    }, 400, request);
  }

  const conversation = await env.DB.prepare(`
    SELECT id
    FROM chat_conversations
    WHERE id = ?
      AND status = 'OPEN'
    LIMIT 1
  `).bind(conversationId).first();

  if (!conversation) {
    return json({
      success: false,
      message: "Conversation introuvable ou fermée"
    }, 404, request);
  }

  const messageId = newId();

  await env.DB.prepare(`
    INSERT INTO chat_messages
      (id, conversation_id, sender_id, message, message_type)
    VALUES (?, ?, ?, ?, 'TEXT')
  `).bind(
    messageId,
    conversationId,
    admin.auth_user_id,
    message
  ).run();

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(conversationId).run();

  return json({
    success: true,
    message: "Réponse envoyée",
    message_id: messageId
  }, 201, request);
}
        // ========================================
// INITIALISATION UPLOAD MULTIPART R2
// ========================================
if (path === "/api/admin/uploads/init" && method === "POST") {
  const body = await readBody(request);
  if (
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim()
  ) {
    return json({
      success: false,
      message: "Le titre de la vidéo est obligatoire"
    }, 400, request);
  }
  if (
  body.consent_confirmed !== true ||
  body.rights_confirmed !== true
) {
  return json({
    success: false,
    message: "Vous devez confirmer la majorité, le consentement et les droits de diffusion avant le téléversement."
  }, 400, request);
}

  const fileSize = Number(body.file_size);
  const contentType = String(body.content_type || "");
  const allowedTypes = [
    "video/mp4",
    "video/webm",
    "video/quicktime"
  ];
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > 500 * 1024 * 1024
  ) {
    return json({
      success: false,
      message: "La taille du fichier doit être comprise entre 1 octet et 500 Mo"
    }, 400, request);
  }
  if (!allowedTypes.includes(contentType)) {
    return json({
      success: false,
      message: "Format vidéo non autorisé"
    }, 400, request);
  }
  const id = newId();
  const objectKey = `private/videos/${id}`;
  let multipart: R2MultipartUploadBinding | null = null;
  try {
    multipart = await env.VIDEOS.createMultipartUpload(
      objectKey,
      {
        httpMetadata: {
          contentType
        },
        customMetadata: {
          uploadId: id,
          createdBy: admin.id
        }
      }
    );
    await env.DB.prepare(`
  INSERT INTO video_uploads (
    id,
    upload_id,
    object_key,
    created_by,
    title,
    description,
    category_id,
    file_size,
    content_type,
    status,
    consent_confirmed,
    rights_confirmed
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADING', ?, ?)
`).bind(
  id,
  multipart.uploadId,
  objectKey,
  admin.id,
  body.title.trim().slice(0, 200),
  typeof body.description === "string"
    ? body.description.slice(0, 5000)
    : null,
  body.category_id ? Number(body.category_id) : null,
  fileSize,
  contentType,
  body.consent_confirmed === true ? 1 : 0,
  body.rights_confirmed === true ? 1 : 0
).run();
    await logAction(
      env,
      admin.id,
      "INIT_VIDEO_UPLOAD",
      "VIDEO_UPLOAD",
      id
    );
    return json({
      success: true,
      message: "Session d'upload créée",
      upload: {
        id,
        file_size: fileSize,
        chunk_size: 10 * 1024 * 1024,
        total_parts: Math.ceil(fileSize / (10 * 1024 * 1024))
      }
    }, 201, request);
  } catch (error) {
    if (multipart) {
      try {
        await multipart.abort();
      } catch {
        // L'échec de l'annulation ne masque pas l'erreur initiale.
      }
    }
    console.error("Erreur initialisation upload:", error);
    return json({
      success: false,
      message: "Impossible de créer la session d'upload"
    }, 500, request);
  }
}
// ========================================
// UPLOAD DES MORCEAUX VERS CLOUDFLARE R2
// ========================================
const uploadPartMatch = path.match(
  /^\/api\/admin\/uploads\/([^/]+)\/parts\/(\d+)$/
);
if (uploadPartMatch && method === "PUT") {
  const uploadSessionId = uploadPartMatch[1];
  const partNumber = Number(uploadPartMatch[2]);
  const CHUNK_SIZE = 10 * 1024 * 1024;
  if (
    !Number.isSafeInteger(partNumber) ||
    partNumber < 1
  ) {
    return json({
      success: false,
      message: "Numéro de morceau invalide"
    }, 400, request);
  }
  try {
    const session = await env.DB.prepare(`
      SELECT *
      FROM video_uploads
      WHERE id = ?
        AND created_by = ?
        AND status = 'UPLOADING'
    `).bind(
      uploadSessionId,
      admin.id
    ).first<{
      id: string;
      upload_id: string;
      object_key: string;
      file_size: number;
      status: string;
    }>();
    if (!session) {
      return json({
        success: false,
        message: "Session introuvable ou accès refusé"
      }, 404, request);
    }
    const totalParts = Math.ceil(
      session.file_size / CHUNK_SIZE
    );
    if (partNumber > totalParts) {
      return json({
        success: false,
        message: "Numéro de morceau supérieur au nombre attendu"
      }, 400, request);
    }
    const expectedSize =
      partNumber === totalParts
        ? session.file_size - CHUNK_SIZE * (totalParts - 1)
        : CHUNK_SIZE;
    const data = await request.arrayBuffer();
    if (data.byteLength !== expectedSize) {
      return json({
        success: false,
        message: "Taille du morceau incorrecte",
        expected_size: expectedSize,
        received_size: data.byteLength
      }, 400, request);
    }
    const multipart = env.VIDEOS.resumeMultipartUpload(
      session.object_key,
      session.upload_id
    );
    const uploadedPart = await multipart.uploadPart(
      partNumber,
      data
    );
    await env.DB.prepare(`
      INSERT INTO video_upload_parts (
        upload_session_id,
        part_number,
        etag
      )
      VALUES (?, ?, ?)
      ON CONFLICT(upload_session_id, part_number)
      DO UPDATE SET etag = excluded.etag
    `).bind(
      session.id,
      uploadedPart.partNumber,
      uploadedPart.etag
    ).run();
    return json({
      success: true,
      message: "Morceau envoyé avec succès",
      part_number: uploadedPart.partNumber,
      etag: uploadedPart.etag
    }, 200, request);
  } catch (error) {
    console.error("Erreur upload morceau:", error);
    return json({
      success: false,
      message: "Erreur lors de l'envoi du morceau"
    }, 500, request);
  }
}
// ========================================
// FINALISATION UPLOAD MULTIPART R2
// ========================================
const completeUploadMatch = path.match(
  /^\/api\/admin\/uploads\/([^/]+)\/complete$/
);
if (completeUploadMatch && method === "POST") {
  const uploadSessionId = completeUploadMatch[1];
  const CHUNK_SIZE = 10 * 1024 * 1024;
  try {
    const session = await env.DB.prepare(`
      SELECT *
      FROM video_uploads
      WHERE id = ?
        AND created_by = ?
        AND status = 'UPLOADING'
    `).bind(
      uploadSessionId,
      admin.id
    ).first<{
      id: string;
      upload_id: string;
      object_key: string;
      title: string;
      description: string | null;
      category_id: number | null;
      file_size: number;
      content_type: string;
      consent_confirmed: number;
rights_confirmed: number;
    }>();
    
    if (!session) {
      return json({
        success: false,
        message: "Session introuvable ou déjà terminée"
      }, 404, request);
    }
    if (
  session.consent_confirmed !== 1 ||
  session.rights_confirmed !== 1
) {
  return json({
    success: false,
    message: "Finalisation refusée : les confirmations de majorité, de consentement et de droits sont obligatoires."
  }, 403, request);
}
    const totalParts = Math.ceil(
      session.file_size / CHUNK_SIZE
    );
    const partsResult = await env.DB.prepare(`
      SELECT part_number, etag
      FROM video_upload_parts
      WHERE upload_session_id = ?
      ORDER BY part_number ASC
    `).bind(session.id).all<{
      part_number: number;
      etag: string;
    }>();
    const parts = partsResult.results || [];
    if (parts.length !== totalParts) {
      return json({
        success: false,
        message: "Certains morceaux sont manquants",
        expected_parts: totalParts,
        received_parts: parts.length
      }, 400, request);
    }
    for (let i = 0; i < totalParts; i++) {
      if (
        parts[i].part_number !== i + 1 ||
        !parts[i].etag
      ) {
        return json({
          success: false,
          message: "Liste des morceaux incomplète ou invalide"
        }, 400, request);
      }
    }
    const multipart = env.VIDEOS.resumeMultipartUpload(
      session.object_key,
      session.upload_id
    );
    const completedObject = await multipart.complete(
      parts.map(part => ({
        partNumber: part.part_number,
        etag: part.etag
      }))
    );
    if (completedObject.size !== session.file_size) {
      await env.VIDEOS.delete(session.object_key);
      await env.DB.prepare(`
        UPDATE video_uploads
        SET status = 'ABORTED'
        WHERE id = ?
      `).bind(session.id).run();
      return json({
        success: false,
        message: "La taille du fichier assemblé est incorrecte"
      }, 400, request);
    }
    const videoId = newId();
    try {
      await env.DB.prepare(`
        INSERT INTO videos (
          id,
          title,
          description,
          category_id,
          thumbnail_url,
          storage_reference,
          duration,
          status,
          created_by,
          consent_verified,
          rights_verified
        )
        VALUES (?, ?, ?, ?, NULL, ?, 0, 'DRAFT', ?, 0, 0)
      `).bind(
        videoId,
        session.title,
        session.description,
        session.category_id,
        session.object_key,
        admin.id
      ).run();
      await env.DB.prepare(`
        UPDATE video_uploads
        SET status = 'COMPLETED',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(session.id).run();
      await logAction(
        env,
        admin.id,
        "COMPLETE_VIDEO_UPLOAD",
        "VIDEO",
        videoId
      );
    } catch (dbError) {
      await env.VIDEOS.delete(session.object_key);
      await env.DB.prepare(`
        UPDATE video_uploads
        SET status = 'ABORTED'
        WHERE id = ?
      `).bind(session.id).run();
      throw dbError;
    }
    return json({
      success: true,
      message: "Vidéo transférée avec succès et enregistrée en brouillon",
      video: {
        id: videoId,
        title: session.title,
        storage_reference: session.object_key,
        status: "DRAFT",
        consent_verified: false,
        rights_verified: false
      }
    }, 201, request);
  } catch (error) {
    console.error("Erreur finalisation upload:", error);
    return json({
      success: false,
      message: "Impossible de finaliser l'upload"
    }, 500, request);
  }
}
// ========================================
// ANNULATION D'UN UPLOAD MULTIPART
// ========================================
const abortUploadMatch = path.match(
  /^\/api\/admin\/uploads\/([^/]+)$/
);
if (abortUploadMatch && method === "DELETE") {
  const uploadSessionId = abortUploadMatch[1];
  try {
    const session = await env.DB.prepare(`
      SELECT id, upload_id, object_key
      FROM video_uploads
      WHERE id = ?
        AND created_by = ?
        AND status = 'UPLOADING'
    `).bind(
      uploadSessionId,
      admin.id
    ).first<{
      id: string;
      upload_id: string;
      object_key: string;
    }>();
    if (!session) {
      return json({
        success: false,
        message: "Session introuvable ou déjà terminée"
      }, 404, request);
    }
    const multipart = env.VIDEOS.resumeMultipartUpload(
      session.object_key,
      session.upload_id
    );
    await multipart.abort();
    await env.DB.prepare(`
      UPDATE video_uploads
      SET status = 'ABORTED'
      WHERE id = ?
        AND created_by = ?
    `).bind(
      session.id,
      admin.id
    ).run();
    await logAction(
      env,
      admin.id,
      "ABORT_VIDEO_UPLOAD",
      "VIDEO_UPLOAD",
      session.id
    );
    return json({
      success: true,
      message: "Upload annulé avec succès"
    }, 200, request);
  } catch (error) {
    console.error("Erreur annulation upload:", error);
    return json({
      success: false,
      message: "Impossible d'annuler l'upload"
    }, 500, request);
  }
}
        // ====================================
// TEST CONNEXION CLOUDFLARE R2
// ====================================
if (path === "/api/admin/r2-check" && method === "GET") {
  const result = await env.VIDEOS.list({ limit: 1 });
  return json({
    success: true,
    message: "Connexion Cloudflare R2 réussie",
    bucket: "beugue-lou-bakh-videos",
    connected: true,
    objects_found: result.objects.length,
  }, 200, request);
}
        // ====================================
        // STATISTIQUES
        // ====================================
        if (path === "/api/admin/stats" && method === "GET") {
          const [videos, users, categories, pending] =
            await Promise.all([
              env.DB.prepare(`
                SELECT COUNT(*) AS total FROM videos
              `).first<{ total: number }>(),
              env.DB.prepare(`
                SELECT COUNT(*) AS total FROM users
              `).first<{ total: number }>(),
              env.DB.prepare(`
                SELECT COUNT(*) AS total FROM categories
              `).first<{ total: number }>(),
              env.DB.prepare(`
                SELECT COUNT(*) AS total
                FROM videos
                WHERE status = 'PENDING'
              `).first<{ total: number }>(),
            ]);
          return json({
            success: true,
            stats: {
              total_videos: videos?.total || 0,
              total_users: users?.total || 0,
              total_categories: categories?.total || 0,
              pending_videos: pending?.total || 0,
            },
          }, 200, request);
        }
        // ====================================
        // LISTE DES VIDEOS
        // ====================================
        if (path === "/api/admin/videos" && method === "GET") {
          const status = url.searchParams.get("status");
          const search = url.searchParams.get("search");
          let query = `
            SELECT
              videos.*,
              categories.name AS category_name,
              users.full_name AS creator_name
            FROM videos
            LEFT JOIN categories ON categories.id = videos.category_id
            LEFT JOIN users ON users.id = videos.created_by
            WHERE 1 = 1
          `;
          const values: unknown[] = [];
          if (
            status &&
            ["DRAFT", "PENDING", "PUBLISHED", "BLOCKED"].includes(status)
          ) {
            query += " AND videos.status = ?";
            values.push(status);
          }
          if (search) {
            query += " AND videos.title LIKE ?";
            values.push(`%${search.slice(0, 100)}%`);
          }
          query += " ORDER BY videos.created_at DESC LIMIT 200";
          const result = await env.DB.prepare(query)
            .bind(...values)
            .all();
          return json({
            success: true,
            videos: result.results,
          }, 200, request);
        }
        // ====================================
        // AJOUT VIDEO
        // ====================================
        if (path === "/api/admin/videos" && method === "POST") {
          const body = await readBody(request);
          if (!body || typeof body.title !== "string" || !body.title.trim()) {
            return json({
              success: false,
              message: "Le titre est obligatoire",
            }, 400, request);
          }
          const id = newId();
          await env.DB.prepare(`
            INSERT INTO videos (
              id,
              title,
              description,
              category_id,
              thumbnail_url,
              storage_reference,
              duration,
              status,
              created_by,
              consent_verified,
              rights_verified
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, 0, 0)
          `)
            .bind(
              id,
              body.title.trim().slice(0, 200),
              body.description || null,
              body.category_id || null,
              body.thumbnail_url || null,
              body.storage_reference || null,
              Math.max(0, Number(body.duration) || 0),
              admin.id
            )
            .run();
          await logAction(env, admin.id, "CREATE_VIDEO", "VIDEO", id);
          return json({
            success: true,
            message: "Vidéo créée en brouillon",
            id,
          }, 201, request);
        }
        // ====================================
        // MODIFIER VIDEO
        // ====================================
        const videoMatch = path.match(/^\/api\/admin\/videos\/([^/]+)$/);
        if (videoMatch && method === "PUT") {
          const id = videoMatch[1];
          const body = await readBody(request);
          if (!body || typeof body.title !== "string" || !body.title.trim()) {
            return json({
              success: false,
              message: "Titre invalide",
            }, 400, request);
          }
          const result = await env.DB.prepare(`
            UPDATE videos
            SET
              title = ?,
              description = ?,
              category_id = ?,
              thumbnail_url = ?,
              storage_reference = COALESCE(?, storage_reference),
              duration = ?
            WHERE id = ?
          `)
            .bind(
              body.title.trim().slice(0, 200),
              body.description || null,
              body.category_id || null,
              body.thumbnail_url || null,
              body.storage_reference || null,
              Math.max(0, Number(body.duration) || 0),
              id
            )
            .run();
          await logAction(env, admin.id, "UPDATE_VIDEO", "VIDEO", id);
          return json({
            success: true,
            message: "Vidéo modifiée",
          }, 200, request);
        }
        // ====================================
        // VERIFICATION CONSENTEMENT ET DROITS
        // ====================================
        const verificationMatch =
          path.match(/^\/api\/admin\/videos\/([^/]+)\/verification$/);
        if (verificationMatch && method === "POST") {
          const id = verificationMatch[1];
          const body = await readBody(request);
          if (
            body?.consent_verified !== true ||
            body?.rights_verified !== true
          ) {
            return json({
              success: false,
              message: "Les deux vérifications doivent être validées",
            }, 400, request);
          }
          const video = await env.DB.prepare(`
            SELECT id FROM videos WHERE id = ?
          `)
            .bind(id)
            .first<{ id: string }>();
          if (!video) {
            return json({
              success: false,
              message: "Vidéo introuvable",
            }, 404, request);
          }
          await env.DB.prepare(`
            UPDATE videos
            SET consent_verified = 1,
                rights_verified = 1
            WHERE id = ?
          `)
            .bind(id)
            .run();
          await logAction(
            env,
            admin.id,
            "VERIFY_VIDEO_RIGHTS_AND_CONSENT",
            "VIDEO",
            id
          );
          return json({
            success: true,
            message: "Vérifications enregistrées",
          }, 200, request);
        }
        // ====================================
        // PUBLIER VIDEO
        // ====================================
        const publishMatch =
          path.match(/^\/api\/admin\/videos\/([^/]+)\/publish$/);
        if (publishMatch && method === "POST") {
          const id = publishMatch[1];
          const video = await env.DB.prepare(`
            SELECT id, consent_verified, rights_verified
            FROM videos
            WHERE id = ?
          `)
            .bind(id)
            .first<Video>();
          if (!video) {
            return json({
              success: false,
              message: "Vidéo introuvable",
            }, 404, request);
          }
          if (
            video.consent_verified !== 1 ||
            video.rights_verified !== 1
          ) {
            return json({
              success: false,
              message: "Publication impossible : vérifications obligatoires non validées",
            }, 403, request);
          }
          await env.DB.prepare(`
            UPDATE videos
            SET status = 'PUBLISHED'
            WHERE id = ?
          `)
            .bind(id)
            .run();
          await logAction(env, admin.id, "PUBLISH_VIDEO", "VIDEO", id);
          return json({
            success: true,
            message: "Vidéo publiée",
          }, 200, request);
        }
        // ====================================
        // SUPPRIMER VIDEO
        // ====================================
        if (videoMatch && method === "DELETE") {
  const id = videoMatch[1];

  // 1. Récupérer la référence du fichier vidéo dans D1
  const video = await env.DB.prepare(`
    SELECT id, storage_reference
    FROM videos
    WHERE id = ?
  `)
    .bind(id)
    .first<{ id: string; storage_reference: string | null }>();

  if (!video) {
    return json({
      success: false,
      message: "Vidéo introuvable",
    }, 404, request);
  }

  // 2. Supprimer le fichier dans R2 uniquement
  // si sa référence appartient au dossier privé des vidéos
  if (
    video.storage_reference &&
    video.storage_reference.startsWith("private/videos/")
  ) {
    await env.VIDEOS.delete(video.storage_reference);
  }

  // 3. Supprimer l'enregistrement dans D1
  await env.DB.prepare(`
    DELETE FROM videos
    WHERE id = ?
  `)
    .bind(id)
    .run();

  // 4. Enregistrer l'action dans les journaux
  await logAction(
    env,
    admin.id,
    "DELETE_VIDEO",
    "VIDEO",
    id
  );

  return json({
    success: true,
    message: "Vidéo et fichier associés supprimés avec succès",
  }, 200, request);
}
        // ====================================
        // LISTE CATEGORIES
        // ====================================
        if (path === "/api/admin/categories" && method === "GET") {
          const result = await env.DB.prepare(`
            SELECT * FROM categories ORDER BY name ASC
          `).all<Category>();
          return json({
            success: true,
            categories: result.results,
          }, 200, request);
        }
        // ====================================
        // CREER CATEGORIE
        // ====================================
        if (path === "/api/admin/categories" && method === "POST") {
          const body = await readBody(request);
          if (!body?.name || typeof body.name !== "string") {
            return json({
              success: false,
              message: "Nom de catégorie obligatoire",
            }, 400, request);
          }
          const name = body.name.trim().slice(0, 100);
          const slug = slugify(name);
          await env.DB.prepare(`
            INSERT INTO categories (name, slug, description)
            VALUES (?, ?, ?)
          `)
            .bind(name, slug, body.description || null)
            .run();
          await logAction(
            env,
            admin.id,
            "CREATE_CATEGORY",
            "CATEGORY",
            slug
          );
          return json({
            success: true,
            message: "Catégorie créée",
          }, 201, request);
        }
        // ====================================
        // MODIFIER CATEGORIE
        // ====================================
        const categoryMatch =
          path.match(/^\/api\/admin\/categories\/(\d+)$/);
        if (categoryMatch && method === "PUT") {
          const id = Number(categoryMatch[1]);
          const body = await readBody(request);
          if (!body?.name || typeof body.name !== "string") {
            return json({
              success: false,
              message: "Nom obligatoire",
            }, 400, request);
          }
          const name = body.name.trim().slice(0, 100);
          await env.DB.prepare(`
            UPDATE categories
            SET name = ?, slug = ?, description = ?
            WHERE id = ?
          `)
            .bind(
              name,
              slugify(name),
              body.description || null,
              id
            )
            .run();
          await logAction(
            env,
            admin.id,
            "UPDATE_CATEGORY",
            "CATEGORY",
            String(id)
          );
          return json({
            success: true,
            message: "Catégorie modifiée",
          }, 200, request);
        }
        // ====================================
        // SUPPRIMER CATEGORIE
        // ====================================
        if (categoryMatch && method === "DELETE") {
          const id = Number(categoryMatch[1]);
          const videos = await env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM videos
            WHERE category_id = ?
          `)
            .bind(id)
            .first<{ total: number }>();
          if ((videos?.total || 0) > 0) {
            return json({
              success: false,
              message: "Impossible : cette catégorie contient des vidéos",
            }, 409, request);
          }
          await env.DB.prepare(`
            DELETE FROM categories WHERE id = ?
          `)
            .bind(id)
            .run();
          await logAction(
            env,
            admin.id,
            "DELETE_CATEGORY",
            "CATEGORY",
            String(id)
          );
          return json({
            success: true,
            message: "Catégorie supprimée",
          }, 200, request);
        }
        // ====================================
        // LISTE UTILISATEURS
        // ====================================
        if (path === "/api/admin/users" && method === "GET") {
          const result = await env.DB.prepare(`
            SELECT
              id,
              full_name,
              email,
              phone,
              role,
              status,
              created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 300
          `).all();
          return json({
            success: true,
            users: result.results,
          }, 200, request);
        }
        // ====================================
        // SUSPENDRE / REACTIVER UTILISATEUR
        // ====================================
        const userMatch =
          path.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
        if (userMatch && method === "PATCH") {
          const id = userMatch[1];
          const body = await readBody(request);
          if (!["ACTIVE", "SUSPENDED"].includes(body?.status)) {
            return json({
              success: false,
              message: "Statut invalide",
            }, 400, request);
          }
          const target = await env.DB.prepare(`
            SELECT id, role
            FROM users
            WHERE id = ?
          `)
            .bind(id)
            .first<{ id: string; role: string }>();
          if (!target) {
            return json({
              success: false,
              message: "Utilisateur introuvable",
            }, 404, request);
          }
          if (target.id === admin.id) {
            return json({
              success: false,
              message: "Vous ne pouvez pas modifier votre propre statut",
            }, 403, request);
          }
          await env.DB.prepare(`
            UPDATE users
            SET status = ?
            WHERE id = ?
          `)
            .bind(body.status, id)
            .run();
          await logAction(
            env,
            admin.id,
            body.status === "ACTIVE"
              ? "ACTIVATE_USER"
              : "SUSPEND_USER",
            "USER",
            id
          );
          return json({
            success: true,
            message: "Statut utilisateur mis à jour",
          }, 200, request);
        }
      }
// ==========================================
// LECTURE DES PIECES JOINTES DU CHAT PRIVE
// ==========================================

if (path === "/api/chat/attachments" && method === "GET") {
  const authUser = await verifyAuth(request, env);

  if (!authUser) {
    return json({
      success: false,
      message: "Connexion requise"
    }, 401, request);
  }

  const attachmentId = url.searchParams.get("attachment_id");

  if (!attachmentId) {
    return json({
      success: false,
      message: "Identifiant de pièce jointe manquant"
    }, 400, request);
  }

  const user = await getUser(authUser.id, env);
  const admin = await verifyAdmin(request, env);

  if (!admin && (!user || user.status !== "ACTIVE")) {
    return json({
      success: false,
      message: "Accès refusé"
    }, 403, request);
  }

  const attachment = await env.DB.prepare(`
    SELECT
      a.storage_key,
      a.file_name,
      a.mime_type,
      a.media_type,
      c.user_id
    FROM chat_attachments a
    JOIN chat_messages m ON m.id = a.message_id
    JOIN chat_conversations c ON c.id = m.conversation_id
    WHERE a.id = ?
    LIMIT 1
  `).bind(attachmentId).first<{
    storage_key: string;
    file_name: string;
    mime_type: string;
    media_type: string;
    user_id: string;
  }>();

  if (!attachment) {
    return json({
      success: false,
      message: "Pièce jointe introuvable"
    }, 404, request);
  }

  if (!admin && attachment.user_id !== authUser.id) {
    return json({
      success: false,
      message: "Vous ne pouvez pas consulter cette pièce jointe"
    }, 403, request);
  }

  if (!attachment.storage_key.startsWith("private/chat/")) {
    return json({
      success: false,
      message: "Emplacement de fichier invalide"
    }, 403, request);
  }

  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm"
  ];

  if (!allowedMimeTypes.includes(attachment.mime_type)) {
    return json({
      success: false,
      message: "Format de fichier interdit"
    }, 415, request);
  }

  const object = await env.VIDEOS.get(attachment.storage_key);

  if (!object) {
    return json({
      success: false,
      message: "Fichier introuvable dans le stockage"
    }, 404, request);
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);

  headers.set("Content-Type", attachment.mime_type);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");

  return new Response(object.body, {
    status: 200,
    headers
  });
}

      // ======================================
      // ROUTE INTROUVABLE
      // ======================================
      return json({
        success: false,
        message: "Route API introuvable",
      }, 404, request);
    } catch (error) {
      console.error("API ERROR:", error);
      return json({
        success: false,
        message: "Une erreur est survenue",
        error: error instanceof Error
          ? error.message
          : "Erreur inconnue",
      }, 500, request);
    }
  },
};
