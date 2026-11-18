import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface TotpFactor {
  id: string
  status: string
  friendly_name?: string
}

export default function SecuritySettings() {
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [factor, setFactor] = useState<TotpFactor | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState('')

  const [qrCode, setQrCode] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadFactors = async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error } = await supabase.auth.mfa.listFactors()

      if (error) throw error

      const verified = data.totp.find(
        (item) => item.status === 'verified'
      )

      const pending = data.all.find(
        (item) =>
          item.factor_type === 'totp' &&
          item.status === 'unverified'
      )

      setFactor(verified || null)
      setPendingFactorId(pending?.id || '')

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de vérifier la sécurité du compte.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFactors()
  }, [])

  const startEnrollment = async () => {
    setError('')
    setMessage('')
    setEnrolling(true)

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'BEUGUE LOU BAKH - Administrateur',
      })

      if (error) throw error

      setPendingFactorId(data.id)
      setQrCode(data.totp.qr_code)

      setMessage(
        'Scanne le QR code avec ton application Authenticator.'
      )

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur pendant l’activation.'
      )
    } finally {
      setEnrolling(false)
    }
  }

  const verifyEnrollment = async () => {
    if (!pendingFactorId) return

    if (!/^\d{6}$/.test(code)) {
      setError('Entre un code valide de 6 chiffres.')
      return
    }

    setVerifying(true)
    setError('')
    setMessage('')

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pendingFactorId,
        code,
      })

      if (error) throw error

      setQrCode('')
      setCode('')
      setPendingFactorId('')

      setMessage(
        'Double authentification activée avec succès !'
      )

      await loadFactors()

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Code incorrect. Réessaie.'
      )
    } finally {
      setVerifying(false)
    }
  }

  const cancelEnrollment = async () => {
    if (!pendingFactorId) return

    const confirmed = window.confirm(
      'Veux-tu annuler cette configuration MFA ?'
    )

    if (!confirmed) return

    setError('')

    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: pendingFactorId,
      })

      if (error) throw error

      setQrCode('')
      setCode('')
      setPendingFactorId('')
      setMessage('Configuration annulée.')

      await loadFactors()

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’annuler la configuration.'
      )
    }
  }

  if (loading) {
    return (
      <section className="admin-placeholder">
        <p>Vérification de la sécurité du compte...</p>
      </section>
    )
  }

  return (
    <section className="admin-content">

      <div className="admin-placeholder">
        <h2>🔐 Sécurité du compte administrateur</h2>

        <p>
          Protège ton compte avec une double authentification.
          Un code temporaire sera demandé en complément de ton mot de passe.
        </p>

        <div style={{ marginTop: 24 }}>

          {factor ? (
            <div>
              <h3>🟢 Double authentification active</h3>

              <p>
                Ton compte dispose d'un facteur Authenticator vérifié.
              </p>

              <p>
                Appareil : {factor.friendly_name || 'Authenticator'}
              </p>
            </div>
          ) : (
            <div>
              <h3>🟠 Double authentification non activée</h3>

              <p>
                Active la protection TOTP pour sécuriser ton compte.
              </p>

              {!qrCode && !pendingFactorId && (
                <button
                  type="button"
                  disabled={enrolling}
                  onClick={startEnrollment}
                >
                  {enrolling
                    ? 'Préparation...'
                    : 'Activer la double authentification'}
                </button>
              )}
            </div>
          )}

          {qrCode && (
            <div style={{ marginTop: 24 }}>
              <h3>Étape 1 — Scanner le QR code</h3>

              <p>
                Ouvre Google Authenticator ou Microsoft Authenticator
                sur ton téléphone et scanne ce QR code.
              </p>

              <img
                src={qrCode}
                alt="QR code MFA"
                style={{
                  width: 220,
                  height: 220,
                  background: '#fff',
                  padding: 12,
                  borderRadius: 12,
                }}
              />

              <h3>Étape 2 — Vérifier le code</h3>

              <p>
                Saisis le code à 6 chiffres affiché sur ton téléphone.
              </p>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value.replace(/\D/g, '').slice(0, 6)
                  )
                }
              />

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  disabled={verifying || code.length !== 6}
                  onClick={verifyEnrollment}
                >
                  {verifying
                    ? 'Vérification...'
                    : 'Confirmer et activer'}
                </button>

                <button
                  type="button"
                  onClick={cancelEnrollment}
                  style={{ marginLeft: 12 }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {pendingFactorId && !qrCode && !factor && (
            <div>
              <p>
                Une configuration MFA non terminée existe déjà.
                Annule-la pour recommencer proprement.
              </p>

              <button
                type="button"
                onClick={cancelEnrollment}
              >
                Annuler la configuration en attente
              </button>
            </div>
          )}

          {error && (
            <p style={{ color: '#ff5555', marginTop: 20 }}>
              {error}
            </p>
          )}

          {message && (
            <p style={{ color: '#20c878', marginTop: 20 }}>
              {message}
            </p>
          )}

        </div>
      </div>

    </section>
  )
}