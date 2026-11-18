import { useState, type FormEvent } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { supabase } from '../lib/supabase'
import './Auth.css'

interface AuthProps {
  onClose?: () => void
}

interface MFAChallenge {
  factorId: string
  challengeId: string
}

const API_URL = import.meta.env.VITE_API_URL || 'https://beugue-lou-bakh-api.ndiawtalla08.workers.dev'
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new Error('Réponse invalide du serveur.')
  }
}

async function syncProfile(accessToken: string, fullName?: string) {
  const response = await fetch(`${API_URL}/api/profile/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ full_name: fullName || '' }),
  })

  const result = await readJson(response)
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Impossible de synchroniser votre profil.')
  }
  return result.user
}

/**
 * Cette route doit identifier le rôle sans exiger AAL2.
 * Sinon, l'administrateur ne pourra pas atteindre l'étape de saisie MFA.
 */
async function isAdministrator(accessToken: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/auth/admin-status`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const result = await readJson(response)
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Impossible de vérifier le compte.')
  }
  return result.isAdmin === true
}

export default function Auth({ onClose }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null)

  const resetCaptcha = () => {
    setCaptchaToken('')
    setCaptchaKey((key) => key + 1)
  }

  const requireCaptcha = () => {
    if (!TURNSTILE_SITE_KEY) {
      throw new Error('La protection CAPTCHA n’est pas configurée. Contactez le responsable technique.')
    }
    if (!captchaToken) {
      throw new Error('Veuillez effectuer la vérification de sécurité.')
    }
  }

  const finishLogin = async (accessToken: string, fullName?: string) => {
    await syncProfile(accessToken, fullName)
    setMessageType('success')
    setMessage('Connexion réussie !')
    window.setTimeout(() => onClose?.(), 700)
  }

  const handleLogin = async () => {
    requireCaptcha()
    const cleanEmail = email.trim().toLowerCase()
    const token = captchaToken

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
        options: { captchaToken: token },
      })
      if (error) throw error
      if (!data.session) throw new Error('Aucune session Supabase active.')

      const accessToken = data.session.access_token
      const admin = await isAdministrator(accessToken)

      // Les utilisateurs ordinaires conservent leur connexion habituelle.
      if (!admin) {
        await finishLogin(accessToken, data.user.user_metadata?.full_name)
        return
      }

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assuranceError) throw assuranceError

      if (assurance.currentLevel === 'aal2') {
        await finishLogin(accessToken, data.user.user_metadata?.full_name)
        return
      }

      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors()
      if (factorsError) throw factorsError

      const verifiedFactor = factors.totp.find(
        (factor) => factor.status === 'verified',
      )

      if (!verifiedFactor) {
        await supabase.auth.signOut()
        throw new Error(
          'La double authentification n’est pas encore configurée pour ce compte administrateur. Terminez d’abord son enrôlement MFA.',
        )
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id })
      if (challengeError) throw challengeError

      setMfaChallenge({
        factorId: verifiedFactor.id,
        challengeId: challenge.id,
      })
      setMessageType('success')
      setMessage('Vérification supplémentaire requise. Ouvrez votre application Authenticator.')
    } finally {
      // Les jetons Turnstile sont à usage unique.
      resetCaptcha()
    }
  }

  const handleVerifyMFA = async () => {
    if (!mfaChallenge) return
    if (!/^\d{6}$/.test(otpCode)) {
      throw new Error('Entrez un code valide de 6 chiffres.')
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaChallenge.factorId,
      challengeId: mfaChallenge.challengeId,
      code: otpCode,
    })
    if (error) throw error

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) throw assuranceError
    if (assurance.currentLevel !== 'aal2') {
      throw new Error('La vérification MFA n’a pas permis d’obtenir le niveau AAL2.')
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!sessionData.session) throw new Error('Session expirée. Reconnectez-vous.')

    setMfaChallenge(null)
    setOtpCode('')
    await finishLogin(
      sessionData.session.access_token,
      sessionData.session.user.user_metadata?.full_name,
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (mfaChallenge) {
        await handleVerifyMFA()
        return
      }

      if (mode === 'register') {
        if (password.length < 8) {
          throw new Error('Le mot de passe doit contenir au moins 8 caractères.')
        }
        requireCaptcha()

        const cleanEmail = email.trim().toLowerCase()
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            captchaToken,
            data: { full_name: cleanEmail.split('@')[0] },
          },
        })
        resetCaptcha()
        if (error) throw error

        if (data.session && data.user) {
          await syncProfile(
            data.session.access_token,
            data.user.user_metadata?.full_name,
          )
          setMessageType('success')
          setMessage('Compte créé et profil synchronisé avec succès !')
          window.setTimeout(() => onClose?.(), 1000)
        } else {
          setMessageType('success')
          setMessage('Inscription réussie. Vérifiez votre adresse email pour confirmer votre compte.')
        }
      } else {
        await handleLogin()
      }
    } catch (error) {
      setMessageType('error')
      setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setMessageType('error')
      setMessage('Veuillez saisir votre adresse email.')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      requireCaptcha()
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/`,
        captchaToken,
      })
      if (error) throw error

      setMessageType('success')
      setMessage('Si cette adresse est enregistrée, un lien de réinitialisation sera envoyé.')
    } catch (error) {
      setMessageType('error')
      setMessage(error instanceof Error ? error.message : 'Impossible d’envoyer le lien.')
    } finally {
      resetCaptcha()
      setLoading(false)
    }
  }

  const cancelMFA = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      setMfaChallenge(null)
      setOtpCode('')
      setPassword('')
      setMessageType('error')
      setMessage('Connexion annulée. Reconnectez-vous pour réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-box">
        <button type="button" className="auth-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>

        <div className="auth-logo">B</div>
        <h2>BEUGUE LOU BAKH</h2>
        <p>
          {mfaChallenge
            ? 'Sécurisation de votre connexion administrateur'
            : mode === 'login'
              ? 'Connectez-vous à votre espace'
              : 'Créez votre compte utilisateur'}
        </p>

        <form onSubmit={handleSubmit}>
          {mfaChallenge ? (
            <>
              <p>🔐 Ouvrez votre application Authenticator et saisissez le code temporaire à 6 chiffres.</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code à 6 chiffres"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
                autoFocus
              />
              <button type="submit" className="auth-submit" disabled={loading || otpCode.length !== 6}>
                {loading ? 'Vérification...' : 'Vérifier le code'}
              </button>
              <button type="button" className="forgot-password" onClick={cancelMFA} disabled={loading}>
                Annuler la connexion
              </button>
            </>
          ) : (
            <>
              <input
                type="email"
                placeholder="Adresse email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
              <input
                type="password"
                placeholder="Mot de passe (8 caractères minimum)"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />

              {mode === 'login' && (
                <button type="button" className="forgot-password" onClick={handleForgotPassword} disabled={loading}>
                  Mot de passe oublié ?
                </button>
              )}

              {/* Un seul widget Turnstile pour éviter les jetons en double. */}
              <div className="auth-captcha">
                {TURNSTILE_SITE_KEY ? (
                  <Turnstile
                    key={captchaKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken('')}
                    onError={() => setCaptchaToken('')}
                  />
                ) : (
                  <p className="auth-message error">Configuration de sécurité indisponible.</p>
                )}
              </div>

              <button type="submit" className="auth-submit" disabled={loading || !TURNSTILE_SITE_KEY}>
                {loading ? 'Patientez...' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
              </button>
            </>
          )}
        </form>

        {message && (
          <div className={`auth-message ${messageType}`} role="status">
            {message}
          </div>
        )}

        {!mfaChallenge && (
          <div className="auth-switch">
            {mode === 'login' ? "Vous n'avez pas de compte ?" : 'Vous avez déjà un compte ?'}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setMessage('')
                resetCaptcha()
              }}
            >
              {mode === 'login' ? "S'inscrire" : 'Se connecter'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
