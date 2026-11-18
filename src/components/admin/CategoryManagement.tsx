import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './CategoryManagement.css'

const API_URL = import.meta.env.VITE_API_URL || 'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'

interface Category {
  id: number
  name: string
  slug: string
  description: string | null
  created_at: string
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
}

export default function CategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

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

  const loadCategories = async () => {
    setLoading(true)
    setError('')

    try {
      const result = await apiRequest('/api/admin/categories')
      setCategories(result.categories || [])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de chargement'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const generateSlug = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const openNewForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEditForm = (category: Category) => {
    setEditingId(category.id)
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
    })
    setShowForm(true)
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Le nom de la catégorie est obligatoire.')
      return
    }

    const payload = {
      name: form.name.trim(),
      slug: generateSlug(form.slug || form.name),
      description: form.description.trim(),
    }

    setSaving(true)
    setError('')

    try {
      if (editingId !== null) {
        await apiRequest(
          `/api/admin/categories/${editingId}`,
          'PUT',
          payload
        )
      } else {
        await apiRequest(
          '/api/admin/categories',
          'POST',
          payload
        )
      }

      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)

      await loadCategories()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur d’enregistrement'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category: Category) => {
    const confirmed = window.confirm(
      `Voulez-vous supprimer la catégorie « ${category.name} » ?`
    )

    if (!confirmed) return

    setError('')

    try {
      await apiRequest(
        `/api/admin/categories/${category.id}`,
        'DELETE'
      )

      await loadCategories()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de suppression'
      )
    }
  }

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(search.toLowerCase()) ||
    category.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <section className="category-management">

      <div className="category-heading">
        <div>
          <h2>📁 Gestion des catégories</h2>
          <p>Organisez les vidéos de votre catalogue.</p>
        </div>

        <button
          className="category-add-button"
          onClick={openNewForm}
        >
          + Nouvelle catégorie
        </button>
      </div>

      <div className="category-summary">
        <span>Total des catégories</span>
        <strong>{categories.length}</strong>
      </div>

      {error && (
        <div className="category-error">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="category-toolbar">
        <input
          type="search"
          placeholder="Rechercher une catégorie..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <button
          onClick={loadCategories}
          className="category-refresh-button"
        >
          ↻ Actualiser
        </button>
      </div>

      {loading ? (
        <div className="category-empty">
          Chargement des catégories...
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="category-empty">
          <span>📁</span>
          <h3>Aucune catégorie trouvée</h3>
          <p>Ajoutez votre première catégorie.</p>
        </div>
      ) : (
        <div className="category-table-container">
          <table className="category-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Identifiant URL</th>
                <th>Description</th>
                <th>Date de création</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCategories.map(category => (
                <tr key={category.id}>
                  <td><strong>{category.name}</strong></td>
                  <td>{category.slug}</td>
                  <td>{category.description || '—'}</td>
                  <td>
                    {category.created_at
                      ? new Date(category.created_at).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                  <td>
                    <div className="category-actions">
                      <button
                        onClick={() => openEditForm(category)}
                        title="Modifier"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => handleDelete(category)}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="category-modal-overlay">
          <form
            className="category-modal"
            onSubmit={handleSave}
          >
            <div className="category-modal-header">
              <h2>
                {editingId !== null
                  ? 'Modifier la catégorie'
                  : 'Ajouter une catégorie'}
              </h2>

              <button
                type="button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <label>
              Nom de la catégorie *
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm({
                    ...form,
                    name,
                    slug: editingId === null
                      ? generateSlug(name)
                      : form.slug,
                  })
                }}
                placeholder="Exemple : Culture"
              />
            </label>

            <label>
              Identifiant URL
              <input
                value={form.slug}
                onChange={e =>
                  setForm({
                    ...form,
                    slug: generateSlug(e.target.value),
                  })
                }
                placeholder="culture"
              />
            </label>

            <label>
              Description
              <textarea
                rows={4}
                value={form.description}
                onChange={e =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
                placeholder="Description de la catégorie"
              />
            </label>

            <div className="category-modal-actions">
              <button
                type="button"
                className="category-cancel-button"
                onClick={() => setShowForm(false)}
              >
                Annuler
              </button>

              <button
                type="submit"
                className="category-save-button"
                disabled={saving}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

    </section>
  )
}