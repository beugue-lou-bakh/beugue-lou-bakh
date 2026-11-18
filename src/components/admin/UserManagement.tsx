import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './UserManagement.css'

const API_URL = import.meta.env.VITE_API_URL || 'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'

interface User {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'ADMIN' | 'USER'
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
  created_at: string
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const apiRequest = async (
    endpoint: string,
    method = 'GET',
    body?: unknown
  ) => {
    const { data } = await supabase.auth.getSession()

    if (!data.session) {
      throw new Error('Session expirée. Reconnectez-vous.')
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Erreur API')
    }

    return result
  }

  const loadUsers = async () => {
    setLoading(true)
    setError('')

    try {
      const result = await apiRequest('/api/admin/users')
      setUsers(result.users || [])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de chargement'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const changeStatus = async (user: User) => {
    if (user.role === 'ADMIN') {
      setError('La modification du compte administrateur est protégée.')
      return
    }

    const newStatus =
      user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'

    const confirmed = window.confirm(
      `Voulez-vous vraiment ${
        newStatus === 'SUSPENDED' ? 'suspendre' : 'réactiver'
      } le compte de ${user.full_name} ?`
    )

    if (!confirmed) return

    setError('')

    try {
      await apiRequest(
        `/api/admin/users/${user.id}/status`,
        'PATCH',
        { status: newStatus }
      )

      await loadUsers()
      setSelectedUser(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de modification'
      )
    }
  }

  const filteredUsers = users.filter(user => {
    const text = search.toLowerCase()

    const matchesSearch =
      user.full_name.toLowerCase().includes(text) ||
      user.email.toLowerCase().includes(text) ||
      (user.phone || '').toLowerCase().includes(text)

    const matchesStatus =
      statusFilter === 'ALL' || user.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const statusLabel = (status: User['status']) => {
    const labels = {
      ACTIVE: 'Actif',
      SUSPENDED: 'Suspendu',
      DISABLED: 'Désactivé',
    }

    return labels[status]
  }

  return (
    <section className="user-management">

      <div className="user-heading">
        <div>
          <h2>👥 Gestion des utilisateurs</h2>
          <p>Consultez et gérez les comptes de votre plateforme.</p>
        </div>

        <button
          className="user-refresh-button"
          onClick={loadUsers}
        >
          ↻ Actualiser
        </button>
      </div>

      <div className="user-stats">
        <div>
          <span>Total utilisateurs</span>
          <strong>{users.length}</strong>
        </div>

        <div>
          <span>Comptes actifs</span>
          <strong>
            {users.filter(u => u.status === 'ACTIVE').length}
          </strong>
        </div>

        <div>
          <span>Comptes suspendus</span>
          <strong>
            {users.filter(u => u.status === 'SUSPENDED').length}
          </strong>
        </div>

        <div>
          <span>Administrateurs</span>
          <strong>
            {users.filter(u => u.role === 'ADMIN').length}
          </strong>
        </div>
      </div>

      {error && (
        <div className="user-error">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="user-toolbar">
        <input
          type="search"
          placeholder="Rechercher par nom, email ou téléphone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="SUSPENDED">Suspendus</option>
          <option value="DISABLED">Désactivés</option>
        </select>
      </div>

      {loading ? (
        <div className="user-empty">Chargement des utilisateurs...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="user-empty">
          <span>👥</span>
          <h3>Aucun utilisateur trouvé</h3>
          <p>Aucun compte ne correspond à votre recherche.</p>
        </div>
      ) : (
        <div className="user-table-container">
          <table className="user-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Inscription</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name}</strong>
                  </td>

                  <td>{user.email}</td>

                  <td>{user.phone || '—'}</td>

                  <td>
                    <span className={`user-role ${user.role.toLowerCase()}`}>
                      {user.role === 'ADMIN' ? 'Administrateur' : 'Utilisateur'}
                    </span>
                  </td>

                  <td>
                    <span className={`user-status ${user.status.toLowerCase()}`}>
                      {statusLabel(user.status)}
                    </span>
                  </td>

                  <td>
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>

                  <td>
                    <button
                      className="user-action-button"
                      onClick={() => setSelectedUser(user)}
                    >
                      Voir le profil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <div className="user-modal-overlay">
          <div className="user-modal">

            <div className="user-modal-header">
              <h2>Profil utilisateur</h2>

              <button onClick={() => setSelectedUser(null)}>
                ×
              </button>
            </div>

            <div className="user-profile-avatar">
              {selectedUser.full_name.charAt(0).toUpperCase()}
            </div>

            <div className="user-profile-details">
              <p>
                <span>Nom complet</span>
                <strong>{selectedUser.full_name}</strong>
              </p>

              <p>
                <span>Email</span>
                <strong>{selectedUser.email}</strong>
              </p>

              <p>
                <span>Téléphone</span>
                <strong>{selectedUser.phone || 'Non renseigné'}</strong>
              </p>

              <p>
                <span>Rôle</span>
                <strong>
                  {selectedUser.role === 'ADMIN'
                    ? 'Administrateur'
                    : 'Utilisateur'}
                </strong>
              </p>

              <p>
                <span>Statut</span>
                <strong>{statusLabel(selectedUser.status)}</strong>
              </p>

              <p>
                <span>Date d'inscription</span>
                <strong>
                  {selectedUser.created_at
                    ? new Date(selectedUser.created_at).toLocaleDateString('fr-FR')
                    : '—'}
                </strong>
              </p>
            </div>

            {selectedUser.role !== 'ADMIN' && (
              <button
                className={
                  selectedUser.status === 'ACTIVE'
                    ? 'user-suspend-button'
                    : 'user-activate-button'
                }
                onClick={() => changeStatus(selectedUser)}
              >
                {selectedUser.status === 'ACTIVE'
                  ? 'Suspendre ce compte'
                  : 'Réactiver ce compte'}
              </button>
            )}

          </div>
        </div>
      )}

    </section>
  )
}