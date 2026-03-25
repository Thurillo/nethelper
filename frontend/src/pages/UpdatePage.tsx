import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw, GitCommit, CheckCircle2, XCircle,
  AlertCircle, Download, RotateCcw, GitBranch, Clock, Hammer,
} from 'lucide-react'
import { systemApi } from '../api/system'
import type { UpdateCheckResult } from '../api/system'
import { useAuthStore } from '../store/authStore'

type LogLevel = 'info' | 'warn' | 'error' | 'done'
interface LogEntry { msg: string; level: LogLevel }

// ── Small helpers ──────────────────────────────────────────────────────────────

function LogLine({ entry }: { entry: LogEntry }) {
  if (entry.level === 'error') {
    return (
      <span className="flex items-start gap-1.5 text-red-400">
        <XCircle size={13} className="mt-0.5 flex-shrink-0" />
        <span>{entry.msg}</span>
      </span>
    )
  }
  if (entry.level === 'warn') {
    return (
      <span className="flex items-start gap-1.5 text-yellow-400">
        <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
        <span>{entry.msg}</span>
      </span>
    )
  }
  return <span className="text-gray-300">{entry.msg}</span>
}

// ── Main component ─────────────────────────────────────────────────────────────

const UpdatePage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [updating, setUpdating] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle')
  const [waitingRestart, setWaitingRestart] = useState(false)
  const [serverBack, setServerBack] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)

  const logBoxRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Current version info
  const { data: info } = useQuery({
    queryKey: ['system-info'],
    queryFn: systemApi.getInfo,
    staleTime: 60_000,
  })

  // Auto-scroll log
  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
  }, [logs])

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // ── Check for updates ──────────────────────────────────────────────────────
  const handleCheck = async () => {
    setChecking(true)
    setCheckError(null)
    setCheckResult(null)
    try {
      const result = await systemApi.checkUpdate()
      setCheckResult(result)
    } catch {
      setCheckError('Impossibile contattare GitHub. Controlla la connessione.')
    } finally {
      setChecking(false)
    }
  }

  // ── Apply update ───────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    setLogs([])
    setUpdating(true)
    setUpdateStatus('running')
    setWaitingRestart(false)
    setServerBack(false)

    try {
      const response = await systemApi.applyUpdate()
      if (!response.body) throw new Error('No stream')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const entry: LogEntry = JSON.parse(line.slice(6))
            if (entry.level === 'done') {
              if (entry.msg === '__DONE_OK__') {
                setUpdateStatus('ok')
                setWaitingRestart(true)
                startPolling()
              } else {
                setUpdateStatus('error')
                setUpdating(false)
              }
            } else {
              setLogs(prev => [...prev, entry])
            }
          } catch { /* ignore malformed */ }
        }
      }
    } catch {
      setLogs(prev => [...prev, { msg: 'Connessione interrotta (atteso dopo il riavvio)', level: 'warn' }])
      setUpdateStatus('ok')
      setWaitingRestart(true)
      startPolling()
    }
  }

  // ── Force rebuild frontend ─────────────────────────────────────────────────
  const handleRebuild = async () => {
    setLogs([])
    setRebuilding(true)
    setUpdating(true)
    setUpdateStatus('running')
    setWaitingRestart(false)
    setServerBack(false)

    try {
      const response = await systemApi.rebuildFrontend()
      if (!response.body) throw new Error('No stream')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const entry: LogEntry = JSON.parse(line.slice(6))
            if (entry.level === 'done') {
              if (entry.msg === '__DONE_OK__') {
                setUpdateStatus('ok')
                setWaitingRestart(true)
                startPolling()
              } else {
                setUpdateStatus('error')
                setUpdating(false)
              }
            } else {
              setLogs(prev => [...prev, entry])
            }
          } catch { /* ignore malformed */ }
        }
      }
    } catch {
      setLogs(prev => [...prev, { msg: 'Connessione interrotta (atteso dopo il riavvio)', level: 'warn' }])
      setUpdateStatus('ok')
      setWaitingRestart(true)
      startPolling()
    } finally {
      setRebuilding(false)
    }
  }

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/health')
        if (r.ok) {
          if (pollRef.current) clearInterval(pollRef.current)
          setServerBack(true)
          setWaitingRestart(false)
          setUpdating(false)
          setTimeout(() => window.location.reload(), 1500)
        }
      } catch { /* server not back yet */ }
    }, 2000)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Aggiornamento sistema</h1>
        <p className="text-sm text-gray-500 mt-1">
          Verifica e applica aggiornamenti direttamente da GitHub
        </p>
      </div>

      {/* ── Versione corrente ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
          Versione installata
        </h2>
        {info ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <GitBranch size={15} className="text-gray-400" />
              <span className="text-gray-500">Branch:</span>
              <span className="font-mono text-gray-800">{info.branch}</span>
            </div>
            <div className="flex items-center gap-2">
              <GitCommit size={15} className="text-gray-400" />
              <span className="text-gray-500">Commit:</span>
              <span className="font-mono text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded text-xs">{info.hash}</span>
              <span className="text-gray-700 truncate">{info.message}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-gray-400" />
              <span className="text-gray-500">Data:</span>
              <span className="text-gray-700">{info.date.slice(0, 16)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Caricamento...</p>
        )}
      </div>

      {/* ── Controlla aggiornamenti ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Aggiornamenti disponibili
          </h2>
          <button
            onClick={handleCheck}
            disabled={checking || updating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Controllo...' : 'Controlla ora'}
          </button>
        </div>

        {checkError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {checkError}
          </p>
        )}

        {checkResult && !checking && (
          <>
            {checkResult.has_update ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Download size={15} />
                  <span>
                    <strong>{checkResult.commits_behind}</strong> commit disponibili
                    {' '}(remote: <code className="font-mono text-xs">{checkResult.remote_hash}</code>)
                  </span>
                </div>

                {/* Lista commit */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {checkResult.new_commits.map((c) => (
                    <div key={c.hash} className="flex items-start gap-3 px-3 py-2 border-b border-gray-100 last:border-0 text-sm">
                      <code className="font-mono text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">{c.hash}</code>
                      <span className="flex-1 text-gray-700">{c.message}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{c.date}</span>
                    </div>
                  ))}
                </div>

                {isAdmin() && (
                  <button
                    onClick={handleUpdate}
                    disabled={updating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    <Download size={15} />
                    {updating ? 'Aggiornamento in corso...' : `Aggiorna ora (${checkResult.commits_behind} commit)`}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 size={15} />
                Sei già all'ultima versione ({checkResult.local_hash})
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Ricompila frontend manualmente ── */}
      {isAdmin() && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Strumenti di recupero
          </h2>
          <p className="text-xs text-gray-500">
            Usa questi strumenti se un aggiornamento precedente è fallito prima di completarsi (es. build frontend mancante).
          </p>
          <button
            onClick={handleRebuild}
            disabled={updating || rebuilding}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Hammer size={14} />
            {rebuilding ? 'Ricompilazione...' : 'Ricompila frontend'}
          </button>
        </div>
      )}

      {/* ── Log aggiornamento ── */}
      {(logs.length > 0 || waitingRestart || serverBack) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Log aggiornamento
            </h2>
            {updateStatus === 'ok' && !waitingRestart && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 size={13} /> Completato
              </span>
            )}
            {updateStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <XCircle size={13} /> Errore
              </span>
            )}
          </div>

          <div
            ref={logBoxRef}
            className="bg-gray-950 rounded-lg p-4 font-mono text-xs space-y-1.5 max-h-72 overflow-y-auto"
          >
            {logs.map((e, i) => (
              <div key={i}>
                <LogLine entry={e} />
              </div>
            ))}
            {updating && !waitingRestart && (
              <div className="flex items-center gap-2 text-gray-500">
                <span className="inline-block w-2 h-2 bg-primary-400 rounded-full animate-pulse" />
                In esecuzione...
              </div>
            )}
          </div>

          {/* Attesa riavvio */}
          {waitingRestart && (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <RotateCcw size={15} className="animate-spin flex-shrink-0" />
              <span>Riavvio in corso — riconnessione automatica...</span>
            </div>
          )}

          {/* Server di nuovo online */}
          {serverBack && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              <span>Server online. Ricaricamento pagina...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UpdatePage
