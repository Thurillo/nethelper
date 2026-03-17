import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Wifi, Lock, User, AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { useLogin } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'

const LoginPage: React.FC = () => {
  const { user } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()

  if (user) return <Navigate to="/" replace />

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate({ username, password })
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Pannello sinistro (branding) ──────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 relative overflow-hidden flex-col items-center justify-center p-12">
        {/* Pattern griglia */}
        <div className="absolute inset-0 bg-grid-slate opacity-100" />

        {/* Cerchi decorativi */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />

        <div className="relative z-10 text-center">
          {/* Logo grande */}
          <div className="w-24 h-24 bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <Wifi size={48} className="text-white" />
          </div>

          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">NetHelper</h1>
          <p className="text-primary-200 text-lg mb-12 text-balance">
            Gestione semplificata<br />della rete aziendale
          </p>

          {/* Feature list */}
          <div className="space-y-3 text-left max-w-xs mx-auto">
            {[
              'Discovery SNMP/SSH automatico',
              'Armadi rack con vista grafica',
              'IPAM e gestione VLAN',
              'Topologia di rete interattiva',
              'API REST per n8n e Telegram',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary-500/40 border border-primary-400/40 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-300" />
                </div>
                <span className="text-primary-100 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pannello destro (form) ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-surface-50 p-6">
        <div className="w-full max-w-sm animate-fade-in">

          {/* Logo mobile */}
          <div className="flex flex-col items-center mb-10 lg:hidden">
            <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Wifi size={30} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">NetHelper</h1>
            <p className="text-sm text-gray-500 mt-1">Gestione rete aziendale</p>
          </div>

          {/* Header form */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Accedi</h2>
            <p className="text-sm text-gray-500 mt-1">Inserisci le tue credenziali per continuare</p>
          </div>

          {/* Errore */}
          {login.isError && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">Credenziali non valide. Riprova.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="form-label">Nome utente</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="utente"
                  required
                  autoFocus
                  autoComplete="username"
                  className="form-input pl-9"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="form-input pl-9"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={login.isPending || !username || !password}
              className="btn btn-primary btn-lg w-full mt-2"
            >
              {login.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Accesso in corso…
                </>
              ) : (
                <>
                  Accedi
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-gray-400">
            NetHelper v1.0 — Uso interno aziendale
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
