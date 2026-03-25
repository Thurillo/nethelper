import React, { useState } from 'react'
import { Plug, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { checkmkApi } from '../api/checkmk'
import type { CheckMKSettings } from '../api/checkmk'

const IntegrationsPage: React.FC = () => {
  const qc = useQueryClient()

  // ----------------------------------------------------------------
  // CheckMK settings
  // ----------------------------------------------------------------
  const { data: settings, isLoading } = useQuery({
    queryKey: ['checkmk', 'settings'],
    queryFn: checkmkApi.getSettings,
    staleTime: 30_000,
  })

  const [form, setForm] = useState<CheckMKSettings>({
    url: '',
    username: '',
    api_key: '',
    enabled: false,
  })
  const [formDirty, setFormDirty] = useState(false)

  // Populate form when settings load
  React.useEffect(() => {
    if (settings && !formDirty) {
      setForm({
        url: settings.url,
        username: settings.username,
        api_key: '',
        enabled: settings.enabled,
      })
    }
  }, [settings, formDirty])

  const saveMutation = useMutation({
    mutationFn: checkmkApi.updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkmk', 'settings'] })
      setFormDirty(false)
      setSaveMessage({ ok: true, text: 'Impostazioni salvate.' })
    },
    onError: () => setSaveMessage({ ok: false, text: 'Errore durante il salvataggio.' }),
  })

  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const handleChange = (field: keyof CheckMKSettings, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }))
    setFormDirty(true)
    setSaveMessage(null)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate(form)
  }

  // ----------------------------------------------------------------
  // Test connection
  // ----------------------------------------------------------------
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; version?: string | null } | null>(null)
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await checkmkApi.testConnection()
      setTestResult(result)
    } catch {
      setTestResult({ ok: false, message: 'Errore di rete.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrazioni</h1>
        <p className="text-sm text-gray-500 mt-1">Configura le integrazioni con sistemi esterni</p>
      </div>

      {/* CheckMK card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-gray-50">
          <Plug size={20} className="text-blue-600" />
          <div>
            <h2 className="font-semibold text-gray-900">CheckMK</h2>
            <p className="text-xs text-gray-500">Monitoraggio UP/DOWN/UNREACHABLE in tempo reale</p>
          </div>
          <div className="ml-auto">
            {settings && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${settings.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${settings.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                {settings.enabled ? 'Abilitato' : 'Disabilitato'}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {isLoading && <p className="text-sm text-gray-400">Caricamento...</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">URL base CheckMK</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="http://192.168.1.100/cmk"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-400 mt-1">Es. http://192.168.1.100/cmk oppure https://checkmk.azienda.it/cmk</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username (automation)</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="automation"
                autoComplete="off"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key {settings?.api_key_set && !form.api_key && <span className="text-green-600 ml-1">(configurata)</span>}
              </label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => handleChange('api_key', e.target.value)}
                placeholder={settings?.api_key_set ? '••••••••••••••••' : 'Incolla la chiave API...'}
                autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-400 mt-1">Lascia vuoto per mantenere la chiave esistente</p>
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center gap-3 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => handleChange('enabled', !form.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? 'bg-primary-600' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <label className="text-sm font-medium text-gray-700 cursor-pointer" onClick={() => handleChange('enabled', !form.enabled)}>
              Integrazione abilitata
            </label>
          </div>

          {/* Messages */}
          {saveMessage && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${saveMessage.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {saveMessage.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {saveMessage.text}
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {testResult.message}
              {testResult.version && <span className="ml-1 text-green-600 font-mono text-xs">v{testResult.version}</span>}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvataggio...' : 'Salva impostazioni'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
              Verifica connessione
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default IntegrationsPage
