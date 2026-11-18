import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './UserMessaging.css'

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'

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

interface Conversation {
  id: string
  status: string
}

export default function UserMessaging() {
  const [isOpen, setIsOpen] = useState(false)
  const [conversation, setConversation] =
    useState<Conversation | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [initializing, setInitializing] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const apiRequest = useCallback(async (
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const { data, error } = await supabase.auth.getSession()

    if (error || !data.session?.access_token) {
      throw new Error('Veuillez vous reconnecter.')
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Erreur de communication.')
    }

    return result
  }, [])

  const initializeConversation = useCallback(async () => {
    try {
      setInitializing(true)
      setError('')

      let result = await apiRequest('/api/chat/conversation')

      let currentConversation = result.conversation

      if (!currentConversation) {
        result = await apiRequest('/api/chat/conversation', {
          method: 'POST',
        })

        currentConversation = result.conversation
      }

      if (!currentConversation?.id) {
        throw new Error('Impossible de créer votre conversation.')
      }

      setConversation(currentConversation)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de connexion.'
      )
    } finally {
      setInitializing(false)
    }
  }, [apiRequest])

  const loadMessages = useCallback(async (
    conversationId: string,
    showLoader = false
  ) => {
    try {
      if (showLoader) setLoading(true)

      const result = await apiRequest(
        `/api/chat/messages?conversation_id=${encodeURIComponent(conversationId)}`
      )

      setMessages(result.messages || [])
      setError('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Chargement impossible.'
      )
    } finally {
      setLoading(false)
    }
  }, [apiRequest])

  useEffect(() => {
    if (!isOpen) return

    initializeConversation()
  }, [isOpen, initializeConversation])

  useEffect(() => {
    if (!isOpen || !conversation?.id) return

    loadMessages(conversation.id, true)

    const timer = window.setInterval(() => {
      loadMessages(conversation.id)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [isOpen, conversation?.id, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages])

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()

    if (!conversation?.id || !newMessage.trim() || sending) {
      return
    }

    try {
      setSending(true)
      setError('')

      await apiRequest('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversation.id,
          message: newMessage.trim(),
        }),
      })

      setNewMessage('')

      await loadMessages(conversation.id)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Envoi impossible.'
      )
    } finally {
      setSending(false)
    }
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="user-chat-widget">

      {isOpen && (
        <section className="user-chat-window">

          <header className="user-chat-header">
            <div className="user-chat-brand">
              <div className="user-chat-logo">
                B
              </div>

              <div>
                <h3>BEUGUE LOU BAKH</h3>
                <span>
                  <i /> Service assistance
                </span>
              </div>
            </div>

            <button
              className="user-chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="Fermer la messagerie"
            >
              ×
            </button>
          </header>

          <div className="user-chat-welcome">
            <strong>Bienvenue ! 👋</strong>

            <p>
              Une question ou besoin d'assistance ?
              Notre équipe est à votre écoute.
            </p>
          </div>

          <div className="user-chat-messages">

            {initializing && (
              <p className="user-chat-info">
                Initialisation de votre conversation...
              </p>
            )}

            {loading && messages.length === 0 && (
              <p className="user-chat-info">
                Chargement des messages...
              </p>
            )}

            {messages.map((message) => {
              const isMine = message.sender_role !== 'ADMIN'

              return (
                <div
                  key={message.id}
                  className={
                    isMine
                      ? 'user-chat-message mine'
                      : 'user-chat-message received'
                  }
                >
                  {!isMine && (
                    <small>Assistance BEUGUE LOU BAKH</small>
                  )}

                  <p>{message.message}</p>

                  <time>
                    {formatTime(message.created_at)}
                  </time>
                </div>
              )
            })}

            {!initializing &&
              !loading &&
              messages.length === 0 &&
              conversation && (
                <div className="user-chat-empty">
                  <span>💬</span>
                  <p>
                    Votre conversation est prête.
                    Envoyez-nous votre premier message.
                  </p>
                </div>
              )}

            <div ref={messagesEndRef} />

          </div>

          {error && (
            <div className="user-chat-error">
              {error}
            </div>
          )}

          <form
            className="user-chat-form"
            onSubmit={handleSend}
          >
            <input
              type="text"
              placeholder="Écrivez votre message..."
              value={newMessage}
              onChange={(event) =>
                setNewMessage(event.target.value)
              }
              maxLength={5000}
              disabled={!conversation || initializing}
            />

            <button
              type="submit"
              disabled={
                sending ||
                !newMessage.trim() ||
                !conversation
              }
              aria-label="Envoyer"
            >
              {sending ? '...' : '➤'}
            </button>
          </form>

          <footer className="user-chat-footer">
            Messagerie privée et sécurisée
          </footer>

        </section>
      )}

      <button
        className={
          isOpen
            ? 'user-chat-toggle opened'
            : 'user-chat-toggle'
        }
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Ouvrir la messagerie"
      >
        {isOpen ? '×' : '💬'}
      </button>

    </div>
  )
}