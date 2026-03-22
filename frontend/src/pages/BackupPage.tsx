import React, { useRef, useState } from 'react'
import { AlertTriangle, Download, HardDrive, Trash2, Upload } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../api/client'

const BackupPage: React.FC = () => {
  const { isAdmin } = useAuthStore()
  if (!isAdmin()) return <Navigate to="/" replace />

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // ── Import state ──────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Reset state ───────────────────────────────────────────────────────────
  const [resetScope, setResetScope] = useState<'network' | 'full'>('network')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExportLoading(true)
    setExportError(null)
    try {
      const response = await apiClient.get('/admin/backup/export', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `nethelper_backup_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Errore durante il download del backup.')
    } finally {
      setExportLoading(false)
    }
  }

  const handleImport = async () => {
    if (!importFile) return
    const confirmed = window.confirm(
      'Questa operazione sovrascriverà tutti i dati. Continuare?'
    )
    if (!confirmed) return

    setImportLoading(true)
    setImportError(null)
    setImportSuccess(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await apiClient.post('/admin/backup/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const counts = res.data.restored as Record<string, number>
      const total = Object.values(counts).reduce((s, n) => s + n, 0)
      setImportSuccess(`Ripristino completato. ${total} righe inserite in totale.`)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Errore durante il ripristino.'
      setImportError(String(msg))
    } finally {
      setImportLoading(false)
    }
  }

  const handleReset = async () => {
    const firstConfirm = window.confirm(
      resetScope === 'full'
        ? 'Stai per eliminare TUTTI i dati (tranne utenti e vendor). Continuare?'
        : 'Stai per eliminare tutti i dati di rete. Continuare?'
    )
    if (!firstConfirm) return

    const typed = window.prompt('Digita "RESET" per confermare:')
    if (typed !== 'RESET') {
      window.alert('Operazione annullata: testo non corrispondente.')
      return
    }

    setResetLoading(true)
    setResetError(null)
    setResetSuccess(null)
    try {
      const res = await apiClient.delete(`/admin/backup/reset?scope=${resetScope}`)
      const cleared: string[] = res.data.tables_cleared
      setResetSuccess(`Reset completato. Tabelle svuotate: ${cleared.join(', ')}.`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Errore durante il reset.'
      setResetError(String(msg))
    } finally {
      setResetLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
          <HardDrive size={18} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Backup &amp; Restore</h1>
          <p className="text-sm text-gray-500">Gestisci i backup del sistema</p>
        </div>
      </div>

      {/* ── Section 1: Export ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <Download size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-800">Esporta backup</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Scarica un file JSON con tutti i dati del sistema
            </p>
          </div>
        </div>

        {exportError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
            {exportError}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors"
        >
          <Download size={15} />
          {exportLoading ? 'Download in corso…' : 'Scarica backup'}
        </button>
      </div>

      {/* ── Section 2: Import ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <Upload size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-semibold text-gray-800">Ripristina backup</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Carica un file di backup JSON precedentemente esportato.{' '}
              <span className="font-medium text-orange-600">
                Tutti i dati attuali verranno sovrascritti.
              </span>
            </p>
          </div>
        </div>

        {importError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 text-sm">
            {importSuccess}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={(e) => {
              setImportFile(e.target.files?.[0] ?? null)
              setImportError(null)
              setImportSuccess(null)
            }}
            className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition-colors"
          />
          <button
            onClick={handleImport}
            disabled={!importFile || importLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-60 transition-colors"
          >
            <Upload size={15} />
            {importLoading ? 'Ripristino in corso…' : 'Ripristina'}
          </button>
        </div>
      </div>

      {/* ── Section 3: Reset (Danger zone) ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-semibold text-red-700">Reset dati — Zona pericolosa</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Elimina i dati in modo permanente. Utenti e vendor non vengono mai rimossi.
            </p>
          </div>
        </div>

        {resetError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
            {resetError}
          </div>
        )}
        {resetSuccess && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 text-sm">
            {resetSuccess}
          </div>
        )}

        <div className="space-y-3 mb-5">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="resetScope"
              value="network"
              checked={resetScope === 'network'}
              onChange={() => setResetScope('network')}
              className="mt-0.5 accent-red-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">Solo dati di rete</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Elimina dispositivi, interfacce, cavi, scansioni. Mantiene sedi, armadi,
                VLAN, utenti e vendor.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="resetScope"
              value="full"
              checked={resetScope === 'full'}
              onChange={() => setResetScope('full')}
              className="mt-0.5 accent-red-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">Tutti i dati</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Elimina tutto tranne utenti e vendor.
              </p>
            </div>
          </label>
        </div>

        <button
          onClick={handleReset}
          disabled={resetLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          <Trash2 size={15} />
          {resetLoading ? 'Reset in corso…' : 'Reset'}
        </button>
      </div>
    </div>
  )
}

export default BackupPage
