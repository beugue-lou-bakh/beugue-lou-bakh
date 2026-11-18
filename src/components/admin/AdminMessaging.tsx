
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import './AdminMessaging.css'

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'

interface Conversation {
  conversation_id: string
  user_id: string
  user_name: string
  user_email: string
  status: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  message: string
  message_type: string
  is_read: number
  created_at: string
  sender_name: string
  sender_role: string
}

export default function AdminMessaging() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const apiRequest = useCallback(async (
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const { data, error: sessionError } =
      await supabase.auth.getSession()

    if (sessionError) {
      throw new Error(sessionError.message)
    }

    const token = data.session?.access_token

    if (!token) {
      throw new Error('Session expirée. Reconnectez-vous.')
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? {
          'Content-Type': 'application/json',
        } : {}),
        ...options.headers,
      },
    })

    const responseText = await response.text()

    let result: any

    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch {
      throw new Error(
        `Réponse API invalide (${response.status}). Vérifiez votre Worker.`
      )
    }

    if (!response.ok) {
      throw new Error(
        result.message ||
        result.error ||
        `Erreur HTTP ${response.status}`
      )
    }

    if (result.success === false) {
      throw new Error(result.message || 'Erreur API')
    }

    return result
  }, [])

  // CHARGEMENT DES CONVERSATIONS

  const loadConversations = useCallback(async (
    showError = true
  ) => {
    try {
      const result = await apiRequest(
        '/api/admin/chat/conversations'
      )

      setConversations(result.conversations || [])

      return true

    } catch (err) {
      if (showError) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erreur de chargement des conversations'
        )
      }

      return false

    } finally {
      setLoading(false)
    }
  }, [apiRequest])

  // CHARGEMENT DES MESSAGES

  const loadMessages = useCallback(async (
    conversationId: string,
    showError = false
  ) => {
    try {
      const result = await apiRequest(
        `/api/admin/chat/messages?conversation_id=${encodeURIComponent(conversationId)}`
      )

      setMessages(result.messages || [])

      return true

    } catch (err) {
      if (showError) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erreur de chargement des messages'
        )
      }

      return false
    }
  }, [apiRequest])

  // INITIALISATION

  useEffect(() => {
    loadConversations()

    const timer = window.setInterval(() => {
      loadConversations(false)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [loadConversations])

  // ACTUALISATION DES MESSAGES

  useEffect(() => {
    if (!selected) return

    loadMessages(selected.conversation_id, true)

    const timer = window.setInterval(() => {
      loadMessages(selected.conversation_id)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [selected?.conversation_id, loadMessages])

  // SÉLECTION D'UNE CONVERSATION

  const handleSelect = (conversation: Conversation) => {
    setSelected(conversation)
    setMessages([])
    setError('')
  }

  // ENVOI D'UN MESSAGE

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()

    if (!selected || !newMessage.trim() || sending) return

    try {
      setSending(true)
      setError('')

      await apiRequest('/api/admin/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: selected.conversation_id,
          message: newMessage.trim(),
        }),
      })

      setNewMessage('')

      await loadMessages(selected.conversation_id, true)
      await loadConversations(false)

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d envoyer le message'
      )
    } finally {
      setSending(false)
    }
  }

  // AFFICHAGE

  if (loading) {
    return (
      <div className="chat-loading">
        Chargement des conversations...
      </div>
    )
  }

  return (
    <section className="admin-messaging">

      {/* LISTE DES CONVERSATIONS */}

      <div className="chat-sidebar">

        <h2>💬 Messages</h2>

        <p className="chat-count">
          {conversations.length} conversation(s)
        </p>

        {conversations.length === 0 && (
          <p className="chat-empty">
            Aucune conversation disponible.
          </p>
        )}

        {conversations.map((conversation) => (

          <button
            key={conversation.conversation_id}
            className={
              selected?.conversation_id === conversation.conversation_id
                ? 'chat-contact active'
                : 'chat-contact'
            }
            onClick={() => handleSelect(conversation)}
          >

            <strong>
              {conversation.user_name || 'Utilisateur'}
            </strong>

            <small>{conversation.user_email}</small>

            <span>
              {conversation.last_message || 'Aucun message'}
            </span>

            {Number(conversation.unread_count) > 0 && (
              <b className="chat-unread">
                {conversation.unread_count}
              </b>
            )}

          </button>

        ))}

      </div>

      {/* ESPACE DE DISCUSSION */}

      <div className="chat-main">

        {!selected ? (

          <div className="chat-empty">

            <span>💬</span>

            <h3>Messagerie administrateur</h3>

            <p>
              Sélectionnez une conversation pour consulter les messages.
            </p>

            {error && (
              <p className="chat-error">{error}</p>
            )}

          </div>

        ) : (

          <>

            <header className="chat-header">

              <div>
                <h3>{selected.user_name}</h3>
                <small>{selected.user_email}</small>
              </div>

              <span className="chat-status">
                ● {selected.status}
              </span>

            </header>

            <div className="chat-messages">

              {messages.length === 0 && !error && (
                <p className="chat-empty">
                  Aucun message dans cette conversation.
                </p>
              )}

              {messages.map((message) => (

                <div
                  key={message.id}
                  className={
                    message.sender_role === 'ADMIN'
                      ? 'chat-bubble admin'
                      : 'chat-bubble user'
                  }
                >

                  <small>{message.sender_name}</small>

                  <p>{message.message}</p>

                  <time>
                    {new Date(message.created_at).toLocaleString('fr-FR')}
                  </time>

                </div>

              ))}

            </div>

            {error && (
              <p className="chat-error">{error}</p>
            )}

            <form
              className="chat-form"
              onSubmit={handleSend}
            >

              <input
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                placeholder="Écrire une réponse..."
                maxLength={5000}
              />

              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
              >
                {sending ? 'Envoi...' : 'Envoyer ➤'}
              </button>

            </form>

          </>

        )}

      </div>

    </section>
  )
}
