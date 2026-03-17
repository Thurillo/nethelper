import React from 'react'
import AuditLogTable from '../components/audit/AuditLogTable'

const AuditLogPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Storico modifiche</h1>
        <p className="text-sm text-gray-500 mt-1">Registro di tutte le operazioni effettuate nel sistema</p>
      </div>
      <AuditLogTable />
    </div>
  )
}

export default AuditLogPage
