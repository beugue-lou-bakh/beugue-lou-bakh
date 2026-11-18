import { useEffect, useState } from 'react'
import './App.css'
import Auth from './components/Auth'
import { supabase } from './lib/supabase'
import AdminDashboard from './components/admin/AdminDashboard'
import UserMessaging from './components/UserMessaging'

// ==========================================
// CONFIGURATION API
// ==========================================

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'

// ==========================================
// CATÉGORIES
// ==========================================



// ==========================================
// TYPE VIDEO
// ==========================================

interface Video {
  id: string
  title: string
  description?: string | null
  category_name?: string | null
  thumbnail_url?: string | null
  duration?: number | string | null
  created_at?: string
}

// ==========================================
// IMAGES DE SECOURS
// ==========================================

const fallbackImages = [
  'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=700',
  'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=700',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=700',
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=700',
]

// ==========================================
// FORMATAGE DE LA DURÉE
// ==========================================

function formatDuration(duration?: number | string | null) {
  if (duration === null || duration === undefined || duration === '') {
    return '00:00'
  }

  if (typeof duration === 'string' && duration.includes(':')) {
    return duration
  }

  const totalSeconds = Number(duration)

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00'
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// ==========================================
// APPLICATION PRINCIPALE
// ==========================================

function App() {
  const [search, setSearch] = useState('')

  const [videos, setVideos] = useState<Video[]>([])
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
const [playerLoading, setPlayerLoading] = useState(false)
const [playerError, setPlayerError] = useState<string | null>(null)

  const [showAuth, setShowAuth] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [adminAccess, setAdminAccess] = useState<
  'checking' | 'allowed' | 'denied'
>('checking')



  // =====================================
  // CHARGEMENT DES VIDÉOS PUBLIÉES
  // =====================================

  useEffect(() => {
    let mounted = true

    const loadVideos = async () => {
      try {
        setLoadingVideos(true)
        setVideoError(null)

        const response = await fetch(`${API_BASE_URL}/api/videos`)

        if (!response.ok) {
          throw new Error(`Erreur serveur : ${response.status}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.message || 'Impossible de charger les vidéos.')
        }

        if (mounted) {
          setVideos(Array.isArray(data.videos) ? data.videos : [])
        }
      } catch (error) {
        console.error('Erreur chargement vidéos :', error)

        if (mounted) {
          setVideoError(
            'Impossible de charger les vidéos. Vérifiez que le serveur fonctionne.'
          )
        }
      } finally {
        if (mounted) {
          setLoadingVideos(false)
        }
      }
    }

    loadVideos()

    return () => {
      mounted = false
    }
  }, [])
  

  // =====================================
  // VÉRIFICATION SESSION SUPABASE
  // =====================================

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        console.error('Erreur de session Supabase :', error.message)
      }

      setUserEmail(data.session?.user.email ?? null)
      setLoadingAuth(false)
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUserEmail(session?.user.email ?? null)
        setLoadingAuth(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // =====================================
// PROTECTION DE LA ROUTE ADMIN
// =====================================

useEffect(() => {
  if (window.location.pathname !== '/admin') return

  let cancelled = false

  const verifyAdminAccess = async () => {
    try {
      setAdminAccess('checking')

      // Vérifier la session Supabase
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        throw new Error(error.message)
      }

      if (!data.session?.access_token) {
        throw new Error('Vous devez vous connecter pour accéder à cette page.')
      }

      // Vérifier le rôle administrateur auprès du Worker
      const response = await fetch(
        `${API_BASE_URL}/api/admin/check`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      )

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || 'Accès administrateur refusé.'
        )
      }

      if (!cancelled) {
        setAdminAccess('allowed')
      }

    } catch (error) {
      console.error('Vérification administrateur :', error)

      if (!cancelled) {
        setAdminAccess('denied')
      }
    }
  }

  verifyAdminAccess()

  return () => {
    cancelled = true
  }
}, [])
  // =====================================
// CHARGEMENT DU LECTEUR VIDEO SECURISE
// =====================================

useEffect(() => {
  if (!selectedVideo) {
    setVideoUrl(null)
    setPlayerError(null)
    return
  }

  const controller = new AbortController()
  let objectUrl: string | null = null

  const loadPlayer = async () => {
    try {
      setPlayerLoading(true)
      setPlayerError(null)
      setVideoUrl(null)

    
      // Lecture publique : aucune connexion Supabase n'est nécessaire.
      // Le Worker doit toujours vérifier publication, consentement et droits.
      const response = await fetch(
        `${API_BASE_URL}/api/videos/${encodeURIComponent(selectedVideo.id)}/stream`,
        {
          method: 'GET',
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        let message = 'Impossible de lire cette vidéo.'

        try {
          const result = await response.json()
          message = result.message || message
        } catch {
        
          // Conserver le message par défaut
        }

        throw new Error(message)
      }

      // Transformer la réponse en fichier lisible par le navigateur
      const blob = await response.blob()

      if (blob.size === 0) {
        throw new Error('Le fichier vidéo est vide.')
      }

      objectUrl = URL.createObjectURL(blob)
      setVideoUrl(objectUrl)

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }

      console.error('Erreur du lecteur vidéo :', error)

      setPlayerError(
        error instanceof Error
          ? error.message
          : 'Une erreur est survenue pendant la lecture.'
      )

    } finally {
      if (!controller.signal.aborted) {
        setPlayerLoading(false)
      }
    }
  }

  loadPlayer()

  return () => {
    controller.abort()

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  }
}, [selectedVideo])

  // =====================================
  // DÉCONNEXION
  // =====================================

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      alert('Erreur lors de la déconnexion.')
      console.error(error.message)
      return
    }

    setUserEmail(null)

    if (window.location.pathname === '/admin') {
      window.location.href = '/'
    }
  }

  // =====================================
  // FILTRAGE DES VIDÉOS
  // =====================================


const filteredVideos = videos.filter((video) => {
  const matchesSearch = video.title
    .toLowerCase()
    .includes(search.toLowerCase())

  return matchesSearch
})

 // =====================================
// ACCÈS AU TABLEAU DE BORD
// =====================================

if (window.location.pathname === '/admin') {

  if (adminAccess === 'checking') {
    return (
      <div className="admin-access-message">
        Vérification de votre accès administrateur...
      </div>
    )
  }

  if (adminAccess === 'denied') {
    return (
      <div className="admin-access-message">
        <h2>Accès refusé</h2>

        <p>
          Vous devez être connecté avec un compte administrateur
          pour accéder à cette page.
        </p>

        <button onClick={() => window.location.replace('/')}>
          Retour à l'accueil
        </button>
      </div>
    )
  }

  return <AdminDashboard />
}

  // =====================================
  // PAGE D'ACCUEIL
  // =====================================

  return (
    <div className="app">

      {/* NAVIGATION */}

      <header className="navbar">

        <a href="/" className="brand">
          <img
            src="/logo.png"
            alt="BEUGUE LOU BAKH"
            className="brand-logo"
          />
        </a>

        <nav className="nav-links">
          <a href="#accueil" className="active">
            Accueil
          </a>

          <a href="#categories">
            Catégories
          </a>

          <a href="#videos">
            Vidéos
          </a>

          <a href="#nouveautes">
            Nouveautés
          </a>
        </nav>

        <div className="nav-actions">

          <input
            type="search"
            placeholder="Rechercher une vidéo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loadingAuth ? (
            <span className="auth-loading">
              Chargement...
            </span>
          ) : userEmail ? (
            <div className="user-actions">

              <span className="user-email">
                {userEmail}
              </span>

              <button
                className="login-button"
                onClick={handleLogout}
              >
                Déconnexion
              </button>

            </div>
          ) : (
            <button
              className="login-button"
              onClick={() => setShowAuth(true)}
            >
              Connexion
            </button>
          )}

        </div>

      </header>

      {/* CONTENU PRINCIPAL */}

      <main>



        {/* VIDÉOS PUBLIÉES */}

        <section className="section" id="videos">

          <div className="section-heading">

            <h2>Vidéos à découvrir</h2>

            <span>
              {loadingVideos
                ? 'Chargement...'
                : `${filteredVideos.length} vidéos`}
            </span>

          </div>

          {/* CHARGEMENT */}

          {loadingVideos && (
            <p className="empty-message">
              Chargement des vidéos...
            </p>
          )}

          {/* ERREUR API */}

          {!loadingVideos && videoError && (
            <div className="empty-message">
              <p>{videoError}</p>

              <button
                className="login-button"
                onClick={() => window.location.reload()}
              >
                Réessayer
              </button>
            </div>
          )}

          {/* GRILLE DES VIDÉOS */}

          {!loadingVideos && !videoError && (
            <div className="video-grid">

              {filteredVideos.map((video, index) => (
                <article className="video-card" key={video.id}>

                  <div
                    className="video-thumbnail"
                    onClick={() => setSelectedVideo(video)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedVideo(video)
                      }
                    }}
                  >

                    <img
                      src={
                        video.thumbnail_url ||
                        fallbackImages[index % fallbackImages.length]
                      }
                      alt={video.title}
                    />

                    <span className="duration">
                      {formatDuration(video.duration)}
                    </span>

                    <span className="play-button">
                      ▶
                    </span>

                  </div>

                  <div className="video-info">

                    <h3>
                      {video.title}
                    </h3>

                    <p>
                      {video.category_name || 'Sans catégorie'}
                    </p>

                  </div>

                </article>
              ))}

            </div>
          )}

          {/* AUCUNE VIDÉO */}

          {!loadingVideos &&
            !videoError &&
            filteredVideos.length === 0 && (
              <p className="empty-message">
                Aucune vidéo publiée dans cette catégorie.
              </p>
            )}

        </section>

        {/* FOOTER */}

        <footer className="footer">

          <div className="footer-brand">
            BEUGUE <strong>LOU BAKH</strong>
          </div>

          <p>
            © 2026 BEUGUE LOU BAKH. Tous droits réservés.
          </p>

          <div className="footer-links">

            <a href="#conditions">
              Conditions d'utilisation
            </a>

            <a href="#confidentialite">
              Confidentialité
            </a>

            <a href="#contact">
              Contact
            </a>

          </div>

        </footer>

      </main>

      {/* AUTHENTIFICATION */}

      {showAuth && (
        <Auth
          onClose={() => setShowAuth(false)}
        />
      )}

      {/* MESSAGERIE PRIVÉE UTILISATEUR */}

{!loadingAuth && userEmail && (
  <UserMessaging />
)}

     {/* PAGE DE LECTURE VIDEO - BEUGUE LOU BAKH */}

{selectedVideo !== null && (
  <div
    className="watch-page-overlay"
    onClick={() => setSelectedVideo(null)}
  >
    <div
      className="watch-page"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="watch-close-button"
        onClick={() => setSelectedVideo(null)}
        aria-label="Fermer"
      >
        ✕
      </button>

      <div className="watch-layout">

        {/* COLONNE PRINCIPALE */}
        <main className="watch-main">

          {/* LECTEUR VIDEO */}
          <div className="watch-player">

            {playerLoading && (
              <div className="watch-message">
                Chargement de la vidéo...
              </div>
            )}
{playerError && (
  <div className="watch-message watch-error">
    {playerError}
  </div>
)}

{videoUrl && (
  <video
    src={videoUrl}
    controls
    autoPlay
    playsInline
    preload="metadata"
    className="watch-video"
  >
    Votre navigateur ne prend pas en charge la lecture vidéo.
  </video>
)}
            

            

          </div>

          {/* INFORMATIONS VIDEO */}
          <h1 className="watch-title">
            {selectedVideo.title}
          </h1>

          <div className="watch-information">
            <span>
              {selectedVideo.category_name || "Sans catégorie"}
            </span>

            <span>
              BEUGUE LOU BAKH
            </span>
          </div>

          <div className="watch-description">
            <h3>Description</h3>

            <p>
              {selectedVideo.description ||
                "Aucune description disponible."}
            </p>
          </div>

        </main>

        {/* COLONNE DES VIDEOS RECOMMANDEES */}
        <aside className="watch-recommendations">

          <h2>À découvrir ensuite</h2>

          {videos
            .filter((video) => video.id !== selectedVideo.id)
            .map((video) => (
              <div
                className="watch-recommendation"
                key={video.id}
                onClick={() => setSelectedVideo(video)}
              >
                <div className="watch-recommendation-thumbnail">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                    />
                  ) : (
                    <span>▶</span>
                  )}
                </div>

                <div className="watch-recommendation-info">
                  <h3>{video.title}</h3>

                  <p>
                    {video.category_name || "Sans catégorie"}
                  </p>

                  <small>BEUGUE LOU BAKH</small>
                </div>
              </div>
            ))}

          {videos.filter(
            (video) => video.id !== selectedVideo.id
          ).length === 0 && (
            <p>Aucune autre vidéo disponible.</p>
          )}

        </aside>

      </div>
    </div>
  </div>
)}

    </div>
  )
}

export default App
