import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import './VideoManagement.css'

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'
const CHUNK_SIZE = 10 * 1024 * 1024
const MAX_FILE_SIZE = 500 * 1024 * 1024

interface Video {
  id: string
  title: string
  description: string | null
  category_id: number | null
  category_name?: string
  thumbnail_url: string | null
  duration: number
  status: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'BLOCKED'
  consent_verified: number
  rights_verified: number
  created_at: string
}

interface Category {
  id: number
  name: string
}

interface ApiResult {
  success: boolean
  message?: string
  [key: string]: any
}

const emptyForm = {
  title: '',
  description: '',
  category_id: '',
  thumbnail_url: '',
  duration: '0',
  consent_confirmed: false,
  rights_confirmed: false,
}

export default function VideoManagement() {
  const [videos, setVideos] = useState<Video[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState('')
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getAccessToken = async () => {
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!data.session?.access_token) {
      throw new Error('Session expirée. Reconnectez-vous.')
    }
    return data.session.access_token
  }

  const apiRequest = async (
    endpoint: string,
    method = 'GET',
    body?: unknown
  ): Promise<ApiResult> => {
    const token = await getAccessToken()
    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      throw new Error(result.message || `Erreur API (${response.status})`)
    }
    return result
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [videoResult, categoryResult] = await Promise.all([
        apiRequest('/api/admin/videos'),
        apiRequest('/api/admin/categories'),
      ])
      setVideos(videoResult.videos || [])
      setCategories(categoryResult.categories || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const resetForm = () => {
    if (thumbnailPreview.startsWith('blob:')) URL.revokeObjectURL(thumbnailPreview)
    setForm(emptyForm)
    setSelectedFile(null)
    setThumbnailFile(null)
    setThumbnailPreview('')
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = ''
  }

  const openNewForm = () => {
    setEditingId(null)
    resetForm()
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  const openEditForm = (video: Video) => {
    setEditingId(video.id)
    setSelectedFile(null)
    setThumbnailFile(null)
    setThumbnailPreview('')
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = ''
    setUploadProgress(0)
    setForm({
  ...emptyForm,
  title: video.title,
  description: video.description || '',
  category_id: video.category_id?.toString() || '',
  thumbnail_url: video.thumbnail_url || '',
  duration: video.duration?.toString() || '0',
})
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  // Sélection et validation du fichier vidéo
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setError('')
    setUploadProgress(0)

    if (!file) {
      setSelectedFile(null)
      return
    }

    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    if (!allowedTypes.includes(file.type)) {
      setSelectedFile(null)
      event.target.value = ''
      setError('Format non accepté. Choisissez un fichier MP4, WebM ou MOV.')
      return
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      setSelectedFile(null)
      event.target.value = ''
      setError('La vidéo doit avoir une taille comprise entre 1 octet et 500 Mo.')
      return
    }

    setSelectedFile(file)
  }

  // Sélection et aperçu de la miniature
  const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setError('')

    if (thumbnailPreview.startsWith('blob:')) {
      URL.revokeObjectURL(thumbnailPreview)
    }

    if (!file) {
      setThumbnailFile(null)
      setThumbnailPreview('')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      event.target.value = ''
      setThumbnailFile(null)
      setThumbnailPreview('')
      setError('Format non accepté. Choisissez une image JPG, PNG ou WebP.')
      return
    }

    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      event.target.value = ''
      setThumbnailFile(null)
      setThumbnailPreview('')
      setError('La miniature ne doit pas dépasser 5 Mo.')
      return
    }

    setThumbnailFile(file)
    setThumbnailPreview(URL.createObjectURL(file))
  }

  // Envoi de la miniature vers le dossier thumbnails/ de R2
  const uploadThumbnailToR2 = async (): Promise<string | null> => {
    if (!thumbnailFile) return null

    const token = await getAccessToken()
    const formData = new FormData()
    formData.append('thumbnail', thumbnailFile)

    const response = await fetch(`${API_URL}/api/admin/thumbnails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    const result: ApiResult = await response.json().catch(() => ({}))
    if (!response.ok || !result.success || typeof result.thumbnail_url !== 'string') {
      throw new Error(result.message || "Échec du téléversement de la miniature.")
    }

    return result.thumbnail_url
  }

  const uploadVideoToR2 = async () => {
    if (!selectedFile) throw new Error('Sélectionnez un fichier vidéo.')
    const token = await getAccessToken()
    setUploading(true)
    setUploadProgress(0)

    // 1. Créer une session multipart dans le Worker et R2.
    const initResponse = await fetch(`${API_URL}/api/admin/uploads/init`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
  title: form.title.trim(),
  description: form.description.trim(),
  category_id: form.category_id ? Number(form.category_id) : null,
  file_size: selectedFile.size,
  content_type: selectedFile.type,
  consent_confirmed: form.consent_confirmed,
  rights_confirmed: form.rights_confirmed,
}),
    })
    const initResult: ApiResult = await initResponse.json().catch(() => ({}))
    if (!initResponse.ok || !initResult.success || !initResult.upload?.id) {
      throw new Error(initResult.message || 'Impossible de démarrer le téléversement.')
    }

    const uploadId: string = initResult.upload.id
    const totalParts = Math.ceil(selectedFile.size / CHUNK_SIZE)

    // 2. Envoyer les morceaux séquentiellement (10 Mio chacun).
    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      const start = (partNumber - 1) * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, selectedFile.size)
      const chunk = selectedFile.slice(start, end)
      const partResponse = await fetch(
        `${API_URL}/api/admin/uploads/${uploadId}/parts/${partNumber}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: chunk,
        }
      )
      const partResult: ApiResult = await partResponse.json().catch(() => ({}))
      if (!partResponse.ok || !partResult.success) {
        throw new Error(partResult.message || `Échec de l'envoi du morceau ${partNumber}.`)
      }
      setUploadProgress(Math.round((partNumber / totalParts) * 100))
    }

    // 3. Assembler les morceaux et créer la vidéo en brouillon.
    const completeResult = await apiRequest(`/api/admin/uploads/${uploadId}/complete`, 'POST', {})
    const videoId = completeResult.video?.id
    if (!videoId || typeof videoId !== 'string') {
      throw new Error("La vidéo a été transférée, mais l'identifiant retourné est introuvable.")
    }
    return videoId as string
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.title.trim()) {
      setError('Le titre est obligatoire.')
      return
    }

    if (!editingId && !selectedFile) {
      setError('Sélectionnez le fichier vidéo à téléverser.')
      return
    }

    if (!editingId && (!form.consent_confirmed || !form.rights_confirmed)) {
      setError('Vous devez confirmer le consentement et les droits de diffusion avant le téléversement.')
      return
    }

    setSaving(true)
    try {
      // La miniature est envoyée d'abord. Son URL est ensuite enregistrée avec la vidéo.
      const uploadedThumbnailUrl = await uploadThumbnailToR2()
      const thumbnailUrl = uploadedThumbnailUrl || form.thumbnail_url.trim() || null

      if (editingId) {
        await apiRequest(`/api/admin/videos/${editingId}`, 'PUT', {
          title: form.title.trim(),
          description: form.description.trim(),
          category_id: form.category_id ? Number(form.category_id) : null,
          thumbnail_url: thumbnailUrl,
          duration: Math.max(0, Number(form.duration) || 0),
        })
        setSuccess('Informations de la vidéo et miniature mises à jour.')
      } else {
        setUploading(true)
        const newVideoId = await uploadVideoToR2()

        if (thumbnailUrl) {
          await apiRequest(`/api/admin/videos/${newVideoId}`, 'PUT', {
            title: form.title.trim(),
            description: form.description.trim(),
            category_id: form.category_id ? Number(form.category_id) : null,
            thumbnail_url: thumbnailUrl,
            duration: Math.max(0, Number(form.duration) || 0),
          })
        }

        setSuccess('Vidéo téléversée et enregistrée en brouillon.')
      }

      setShowForm(false)
      resetForm()
      setEditingId(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l’enregistrement.")
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const handleDelete = async (video: Video) => {
    const confirmed = window.confirm(`Voulez-vous vraiment supprimer « ${video.title} » ?`)
    if (!confirmed) return
    setError('')
    try {
      await apiRequest(`/api/admin/videos/${video.id}`, 'DELETE')
      setSuccess('Vidéo supprimée.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression.')
    }
  }

  const handleVerify = async (video: Video) => {
    const confirmed = window.confirm(
      `Confirmez-vous avoir personnellement contrôlé les justificatifs de majorité, de consentement éclairé et les autorisations de diffusion pour « ${video.title} » ?`
    )
    if (!confirmed) return

    setError('')
    setSuccess('')
    setBusyVideoId(video.id)
    try {
      await apiRequest(`/api/admin/videos/${video.id}/verification`, 'POST', {
        consent_verified: true,
        rights_verified: true,
      })
      setSuccess('Vérifications enregistrées. La vidéo peut être publiée si tous les contrôles sont conformes.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la vérification.')
    } finally {
      setBusyVideoId(null)
    }
  }

  const handlePublish = async (video: Video) => {
    if (video.consent_verified !== 1 || video.rights_verified !== 1) {
      setError('La vidéo ne peut pas être publiée : les vérifications ne sont pas terminées.')
      return
    }

    const confirmed = window.confirm(
      `Publier « ${video.title} » ? Assurez-vous que les preuves de majorité, de consentement et de droits de diffusion ont été contrôlées.`
    )
    if (!confirmed) return

    setError('')
    setSuccess('')
    setBusyVideoId(video.id)
    try {
      await apiRequest(`/api/admin/videos/${video.id}/publish`, 'POST', {})
      setSuccess('Vidéo publiée avec succès.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la publication.')
    } finally {
      setBusyVideoId(null)
    }
  }

  const getThumbnailSrc = (value: string | null | undefined) => {
    if (!value) return ''
    if (/^https?:\/\//i.test(value)) return value
    return `${API_URL}${value.startsWith('/') ? value : `/${value}`}`
  }

  const statusLabel = (status: Video['status']) => {
    const labels: Record<Video['status'], string> = {
      DRAFT: 'Brouillon',
      PENDING: 'En attente',
      PUBLISHED: 'Publiée',
      BLOCKED: 'Bloquée',
    }
    return labels[status]
  }

  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || video.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <section className="video-management">
      <div className="video-management-heading">
        <div>
          <h2>🎬 Gestion des vidéos</h2>
          <p>Gérez les vidéos et les informations de votre catalogue.</p>
        </div>
        <button className="video-add-button" onClick={openNewForm}>
          + Nouvelle vidéo
        </button>
      </div>

      <div className="video-management-stats">
        <div><span>Total des vidéos</span><strong>{videos.length}</strong></div>
        <div><span>Brouillons</span><strong>{videos.filter(v => v.status === 'DRAFT').length}</strong></div>
        <div><span>En attente</span><strong>{videos.filter(v => v.status === 'PENDING').length}</strong></div>
        <div><span>Publiées</span><strong>{videos.filter(v => v.status === 'PUBLISHED').length}</strong></div>
      </div>

      {error && (
        <div className="video-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      )}
      {success && (
        <div className="video-success" role="status">
          {success}
          <button type="button" onClick={() => setSuccess('')}>×</button>
        </div>
      )}

      <div className="video-toolbar">
        <input
          type="search"
          placeholder="Rechercher une vidéo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">Tous les statuts</option>
          <option value="DRAFT">Brouillons</option>
          <option value="PENDING">En attente</option>
          <option value="PUBLISHED">Publiées</option>
          <option value="BLOCKED">Bloquées</option>
        </select>
        <button className="video-refresh-button" onClick={() => void loadData()}>
          ↻ Actualiser
        </button>
      </div>

      {loading ? (
        <div className="video-loading">Chargement des vidéos...</div>
      ) : filteredVideos.length === 0 ? (
        <div className="video-empty">
          <span>🎬</span>
          <h3>Aucune vidéo trouvée</h3>
          <p>Votre catalogue est actuellement vide.</p>
        </div>
      ) : (
        <div className="video-table-container">
          <table className="video-table">
            <thead>
              <tr>
                <th>Vidéo</th><th>Catégorie</th><th>Statut</th>
                <th>Vérifications</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVideos.map(video => (
                <tr key={video.id}>
                  <td>
                    <div className="video-table-info">
                      {video.thumbnail_url
                        ? <img src={getThumbnailSrc(video.thumbnail_url)} alt="" />
                        : <div className="video-no-thumbnail">🎬</div>}
                      <strong>{video.title}</strong>
                    </div>
                  </td>
                  <td>{video.category_name || 'Sans catégorie'}</td>
                  <td>
                    <span className={`video-status ${video.status.toLowerCase()}`}>
                      {statusLabel(video.status)}
                    </span>
                  </td>
                  <td>
                    {video.consent_verified === 1 && video.rights_verified === 1
                      ? '✓ Vérifiées' : 'À vérifier'}
                  </td>
                  <td>
                    {video.created_at
                      ? new Date(video.created_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td>
                    <div className="video-actions">
                      {video.status !== 'PUBLISHED' && (
                        video.consent_verified === 1 && video.rights_verified === 1 ? (
                          <button
                            type="button"
                            onClick={() => void handlePublish(video)}
                            disabled={busyVideoId === video.id}
                            title="Publier la vidéo"
                          >
                            {busyVideoId === video.id ? '…' : '📢 Publier'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleVerify(video)}
                            disabled={busyVideoId === video.id}
                            title="Confirmer les vérifications après contrôle des justificatifs"
                          >
                            {busyVideoId === video.id ? '…' : '✓ Vérifier'}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => openEditForm(video)}
                        title="Modifier"
                        disabled={busyVideoId === video.id}
                      >✏️</button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(video)}
                        title="Supprimer"
                        disabled={busyVideoId === video.id}
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="video-modal-overlay">
          <form className="video-modal" onSubmit={handleSave}>
            <div className="video-modal-header">
              <h2>{editingId ? 'Modifier la vidéo' : 'Ajouter une vidéo'}</h2>
              <button
                type="button"
                onClick={() => {
                  if (saving) return
                  setShowForm(false)
                  resetForm()
                }}
                disabled={saving}
              >×</button>
            </div>

            <label>
              Titre *
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Titre de la vidéo"
              />
            </label>

            <label>
              Description
              <textarea
                rows={4}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Description de la vidéo"
              />
            </label>

            <label>
              Catégorie
              <select
                value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">Choisir une catégorie</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>

           {!editingId && (
  <>
    <label>
      Fichier vidéo * (MP4, WebM ou MOV — maximum 500 Mo)
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleFileChange}
        required
      />

      {selectedFile && (
        <small>
          {selectedFile.name} — {(selectedFile.size / (1024 * 1024)).toFixed(2)} Mo
        </small>
      )}
    </label>

    <div className="video-legal-confirmations">
      <label>
        <input
          type="checkbox"
          checked={form.consent_confirmed}
          onChange={e =>
            setForm({ ...form, consent_confirmed: e.target.checked })
          }
        />
        Je confirme que toutes les personnes représentées sont majeures
        (18 ans ou plus) et ont donné leur consentement éclairé.
      </label>

      <label>
        <input
          type="checkbox"
          checked={form.rights_confirmed}
          onChange={e =>
            setForm({ ...form, rights_confirmed: e.target.checked })
          }
        />
        Je confirme disposer des autorisations et droits nécessaires
        pour stocker et diffuser cette vidéo.
      </label>
    </div>
  </>
)}
            <label>
  Choisir une miniature (JPG, PNG ou WebP — maximum 5 Mo)

  <input
    ref={thumbnailInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onChange={handleThumbnailChange}
  />

  {thumbnailFile && (
    <small>
      Image sélectionnée : {thumbnailFile.name}
    </small>
  )}
</label>

{(thumbnailPreview || form.thumbnail_url.trim()) && (
  <div className="video-thumbnail-preview">
    <p>Aperçu de la miniature :</p>

    <img
      src={thumbnailPreview || getThumbnailSrc(form.thumbnail_url)}
      alt="Aperçu de la miniature"
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '320px',
        aspectRatio: '16 / 9',
        objectFit: 'cover',
        borderRadius: '8px',
      }}
    />
  </div>
)}

            <label>
              Durée (secondes)
              <input
                type="number"
                min="0"
                value={form.duration}
                onChange={e => setForm({ ...form, duration: e.target.value })}
              />
            </label>
          
            {uploading && (
              <div className="video-upload-progress">
                <div className="video-upload-progress-track">
                  <div style={{ width: `${uploadProgress}%` }} />
                </div>
                <span>Téléversement : {uploadProgress}%</span>
              </div>
            )}

            <div className="video-form-notice">
              La vidéo est enregistrée en brouillon dans le stockage privé.
              Avant toute publication, vérifiez l’âge, le consentement et les droits
              de diffusion des personnes représentées.
            </div>

            <div className="video-modal-actions">
              <button
                type="button"
                className="video-cancel-button"
                onClick={() => {
                  if (saving) return
                  setShowForm(false)
                  resetForm()
                }}
                disabled={saving}
              >Annuler</button>
              <button
                type="submit"
                className="video-save-button"
                disabled={saving || uploading}
              >
                {uploading
                  ? `Téléversement ${uploadProgress}%...`
                  : saving
                    ? 'Enregistrement...'
                    : editingId
                      ? 'Enregistrer les modifications'
                      : 'Téléverser la vidéo'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
