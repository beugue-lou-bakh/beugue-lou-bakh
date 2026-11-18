import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './AdminDashboard.css'
import VideoManagement from './VideoManagement'
import CategoryManagement from './CategoryManagement'
import UserManagement from './UserManagement'
import SecuritySettings from './SecuritySettings'
import AdminMessaging from './AdminMessaging'

interface Stats {
  total_videos: number
  total_users: number
  total_categories: number
  pending_videos: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    total_videos: 0,
    total_users: 0,
    total_categories: 0,
    pending_videos: 0,
  })

  const [activePage, setActivePage] = useState('dashboard')
  const [adminName, setAdminName] = useState('Administrateur')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

 const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'

  useEffect(() => {
    loadDashboard()
  }, [])

  const apiRequest = async (endpoint: string) => {
    const { data } = await supabase.auth.getSession()

    if (!data.session) {
      throw new Error('Votre session a expiré. Reconnectez-vous.')
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Erreur API')
    }

    return result
  }

  const loadDashboard = async () => {
    setLoading(true)
    setError('')

    try {
      const [adminResult, statsResult] = await Promise.all([
        apiRequest('/api/admin/check'),
        apiRequest('/api/admin/stats'),
      ])

      setAdminName(adminResult.admin.full_name)
      setStats(statsResult.stats)

    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de connexion'
      )
    } finally {
      setLoading(false)
    }
  }

  // =====================================
// DÉCONNEXION ADMINISTRATEUR
// =====================================

const handleLogout = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    alert('Erreur lors de la déconnexion.')
    console.error(error.message)
    return
  }

  window.location.replace('/')
}

  const navigation = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
    { id: 'videos', label: 'Gestion des vidéos', icon: '🎬' },
    { id: 'categories', label: 'Catégories', icon: '📁' },
    { id: 'users', label: 'Utilisateurs', icon: '👥' },
    { id: 'moderation', label: 'Modération', icon: '🛡️' },
    { id: 'settings', label: 'Paramètres', icon: '⚙️' },
    { id: 'messaging', label: 'Messagerie', icon: '💬' },
  ]

  return (
    <div className="admin-layout">

      {/* SIDEBAR */}
      <aside className="admin-sidebar">

        <div className="admin-brand">
          <img src="/logo.png" alt="BEUGUE LOU BAKH" />
          <span>ADMINISTRATION</span>
        </div>

        <div className="admin-menu-title">
          MENU PRINCIPAL
        </div>

        <nav className="admin-navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={
                activePage === item.id
                  ? 'admin-nav-item active'
                  : 'admin-nav-item'
              }
              onClick={() => setActivePage(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">

  <div className="admin-system-status">
    <span className="admin-online-dot"></span>
    Système opérationnel
  </div>

  <button
    type="button"
    className="admin-logout-button"
    onClick={handleLogout}
  >
    <span>↪</span>
    Déconnexion
  </button>

</div>

      </aside>

      {/* CONTENU */}
      <main className="admin-main">

        <header className="admin-header">
          <div>
            <span className="admin-header-label">
              ESPACE ADMINISTRATEUR
            </span>
            <h1>
              {navigation.find((item) => item.id === activePage)?.label}
            </h1>
          </div>

          <div className="admin-header-user">
            <div className="admin-avatar">A</div>
            <div>
              <strong>{adminName}</strong>
              <small>Administrateur</small>
            </div>

            <button
              className="admin-refresh"
              onClick={loadDashboard}
              title="Actualiser"
            >
              ↻
            </button>
          </div>
        </header>

        {loading ? (
          <div className="admin-loading">
            Chargement des données...
          </div>
        ) : error ? (
          <div className="admin-error">
            <p>{error}</p>
            <button onClick={loadDashboard}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            {activePage === 'dashboard' && (
              <section className="admin-content">

                <div className="admin-welcome">
                  <div>
                    <h2>Bienvenue, {adminName} 👋</h2>
                    <p>
                      Voici un aperçu de votre plateforme.
                    </p>
                  </div>
                  <span>🇸🇳 BEUGUE LOU BAKH</span>
                </div>

                <div className="admin-stats-grid">

                  <div className="admin-stat-card">
                    <span>🎬</span>
                    <p>Total des vidéos</p>
                    <strong>{stats.total_videos}</strong>
                  </div>

                  <div className="admin-stat-card">
                    <span>👥</span>
                    <p>Utilisateurs</p>
                    <strong>{stats.total_users}</strong>
                  </div>

                  <div className="admin-stat-card">
                    <span>📁</span>
                    <p>Catégories</p>
                    <strong>{stats.total_categories}</strong>
                  </div>

                  <div className="admin-stat-card pending">
                    <span>⏳</span>
                    <p>Vidéos en attente</p>
                    <strong>{stats.pending_videos}</strong>
                  </div>

                </div>

                <div className="admin-information">
                  <h3>État de la plateforme</h3>

                  <div className="admin-status">
                    <span className="admin-online-dot"></span>
                    API Cloudflare Workers opérationnelle
                  </div>

                  <div className="admin-status">
                    <span className="admin-online-dot"></span>
                    Authentification Supabase connectée
                  </div>

                  <div className="admin-status">
                    <span className="admin-online-dot"></span>
                    Base de données D1 connectée
                  </div>
                </div>

              </section>
            )}

            {activePage === 'videos' && (
  <VideoManagement />
)}

            {activePage === 'categories' && (
  <CategoryManagement />
)}

            {activePage === 'users' && (
  <UserManagement />
)}

{activePage === 'messaging' && <AdminMessaging />}

            {activePage === 'moderation' && (
              <section className="admin-placeholder">
                <h2>🛡️ Modération</h2>
                <p>
                  Les signalements et vérifications seront affichés ici.
                </p>
              </section>
            )}

            {activePage === 'settings' && (
  <SecuritySettings />
)}
          </>
        )}

      </main>
    </div>
  )
}