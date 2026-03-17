import React, { useState } from 'react'
import ScanLauncher from '../components/scan/ScanLauncher'
import IpRangeScanForm from '../components/scan/IpRangeScanForm'
import ScanJobList from '../components/scan/ScanJobList'
import ScanResultPanel from '../components/scan/ScanResultPanel'
import type { ScanJob } from '../types'

const ScanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'device' | 'ip_range'>('device')
  const [selectedJob, setSelectedJob] = useState<ScanJob | null>(null)

  const handleScanStarted = () => {
    setSelectedJob(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scansione</h1>
        <p className="text-sm text-gray-500 mt-1">Avvia scansioni di rete sui dispositivi</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          <button
            onClick={() => setActiveTab('device')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'device'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Scansione dispositivo
          </button>
          <button
            onClick={() => setActiveTab('ip_range')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'ip_range'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Scansione range IP
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {activeTab === 'device' ? (
            <ScanLauncher onScanStarted={handleScanStarted} />
          ) : (
            <IpRangeScanForm onScanStarted={handleScanStarted} />
          )}
        </div>

        <div>
          <ScanJobList
            filters={activeTab === 'ip_range' ? { scan_type: 'ip_range' } : undefined}
            onSelectJob={setSelectedJob}
            selectedJobId={selectedJob?.id}
          />
        </div>
      </div>

      {/* Scan result panel */}
      {selectedJob && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Risultato scansione</h3>
          <ScanResultPanel job={selectedJob} />
        </div>
      )}
    </div>
  )
}

export default ScanPage
