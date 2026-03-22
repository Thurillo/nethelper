import React, { useState } from 'react'
import {
  BookOpen, ChevronDown, ChevronRight, Scan, Server, Network,
  AlertTriangle, Globe, Grid3X3, GitBranch, Download,
  Terminal, Shield, Users, Zap, Search
} from 'lucide-react'

interface Section {
  id: string
  icon: React.ReactNode
  title: string
  content: React.ReactNode
}

const SectionBlock: React.FC<{ section: Section; defaultOpen?: boolean }> = ({ section, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-white hover:bg-gray-50 text-left transition-colors"
      >
        <span className="text-primary-600 flex-shrink-0">{section.icon}</span>
        <span className="flex-1 font-semibold text-gray-900 text-sm">{section.title}</span>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 bg-white border-t border-gray-100 text-sm text-gray-700 space-y-3 leading-relaxed">
          {section.content}
        </div>
      )}
    </div>
  )
}

const Code: React.FC<{ children: string }> = ({ children }) => (
  <code className="bg-gray-100 text-primary-700 text-xs px-1.5 py-0.5 rounded font-mono">{children}</code>
)

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto font-mono whitespace-pre">{children}</pre>
)

const InfoBox: React.FC<{ children: React.ReactNode; color?: 'blue' | 'yellow' | 'green' }> = ({ children, color = 'blue' }) => {
  const cls = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    green: 'bg-green-50 border-green-200 text-green-800',
  }[color]
  return <div className={`border rounded-lg px-3 py-2 text-xs ${cls}`}>{children}</div>
}

const Table: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-lg border border-gray-200">
    <table className="w-full text-xs">
      <thead className="bg-gray-50">
        <tr>{headers.map(h => <th key={h} className="text-left px-3 py-2 font-medium text-gray-600">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-gray-50">
            {row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const sections: Section[] = [
  {
    id: 'intro',
    icon: <BookOpen size={18} />,
    title: 'Panoramica — Cos\'è NetHelper',
    content: (
      <>
        <p>
          <strong>NetHelper</strong> è uno strumento di gestione della rete aziendale per reti di piccole e medie dimensioni.
          Permette di tenere traccia di tutti i dispositivi, scansionarli via SNMP o SSH, rilevare automaticamente
          interfacce e MAC address, gestire gli spazi rack e le patch panel, e monitorare i prefissi IP.
        </p>
        <Table
          headers={['Modulo', 'Funzione']}
          rows={[
            ['Dispositivi', 'Inventario di switch, router, server, access point, PDU…'],
            ['Scansione', 'Discovery SNMP/SSH e ping sweep su range IP'],
            ['Armadi rack', 'Diagramma visuale degli slot rack con drag-and-drop'],
            ['Patch Panel', 'Mappatura porte → stanza di destinazione → switch'],
            ['VLAN / Prefissi IP', 'Gestione VLAN e IPAM con utilizzo percentuale'],
            ['Conflitti', 'Revisione manuale di ogni modifica rilevata dalle scan'],
            ['Audit Log', 'Storico completo di ogni modifica con utente e timestamp'],
          ]}
        />
        <InfoBox color="green">
          Tutto il backend è interrogabile via <strong>REST API</strong> — ideale per automazioni con n8n, Telegram bot o script personalizzati.
          Documentazione Swagger disponibile su <Code>/api/docs</Code>.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'start',
    icon: <Zap size={18} />,
    title: 'Primi passi — Setup iniziale',
    content: (
      <>
        <p><strong>1. Accesso</strong> — Inserire username e password creati durante l'installazione.</p>
        <p><strong>2. Creare la struttura fisica:</strong></p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Sedi</strong> → creare almeno una sede (edificio, piano, sala server)</li>
          <li><strong>Armadi</strong> → creare gli armadi nella sede con il numero di U rack</li>
        </ul>
        <p><strong>3. Aggiungere i vendor</strong> — In <em>Admin → Vendor</em> verificare che i profili SNMP/SSH
          dei propri apparati siano presenti (Cisco, UniFi, MikroTik, TP-Link…). I vendor principali sono pre-inseriti.
        </p>
        <p><strong>4. Prima scansione</strong> — Usare <em>Scansione → Scansione IP Range</em> per scoprire
          tutti i dispositivi attivi nella rete e importarli massivamente.
        </p>
        <InfoBox color="yellow">
          Ruoli disponibili: <strong>Admin</strong> (lettura + scrittura + gestione utenti) e <strong>Sola lettura</strong> (solo visualizzazione).
        </InfoBox>
      </>
    ),
  },
  {
    id: 'devices',
    icon: <Server size={18} />,
    title: 'Dispositivi — Inventario e dettaglio',
    content: (
      <>
        <p>Ogni dispositivo fisico della rete viene modellato con i seguenti campi principali:</p>
        <Table
          headers={['Campo', 'Descrizione']}
          rows={[
            ['Tipo', 'Switch, Router, Access Point, Server, Patch Panel, PDU, UPS, Firewall…'],
            ['IP primario', 'Indirizzo usato per le scansioni SNMP/SSH'],
            ['Vendor', 'Profilo vendor con credenziali e driver predefiniti'],
            ['Posizione U / Altezza', 'Slot e spazio occupato nell\'armadio rack'],
            ['Modello / S/N', 'Modello hardware e numero di serie (opzionale)'],
          ]}
        />
        <p className="font-medium mt-2">Credenziali SNMP/SSH per dispositivo:</p>
        <p>Aprire la modale di modifica del dispositivo → sezione <strong>Credenziali SNMP/SSH</strong> (collassabile).
          Le credenziali impostate qui sovrascrivono i default del vendor.</p>
        <Table
          headers={['Protocollo', 'Campi']}
          rows={[
            ['SNMP v2c', 'Versione, Community string'],
            ['SNMP v3', 'Versione, Username, Auth protocol/password, Priv protocol/password'],
            ['SSH', 'Username, Password, Porta (default 22), Percorso chiave privata'],
          ]}
        />
        <p className="font-medium mt-2">Tab nel dettaglio dispositivo:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Interfacce</strong> — porte fisiche con MAC, VLAN, velocità, stato</li>
          <li><strong>Indirizzi IP</strong> — IPs assegnati (da scan o manuali)</li>
          <li><strong>Tabella MAC</strong> — MAC address visti sull'ultima scansione</li>
          <li><strong>Scansioni</strong> — storico job con log completo</li>
        </ul>
        <InfoBox>
          Per esportare l'inventario: pagina <strong>Dispositivi</strong> → pulsante <strong>CSV</strong> in alto a destra.
          Il CSV rispetta tutti i filtri attivi (tipo, stato, sede…).
        </InfoBox>
      </>
    ),
  },
  {
    id: 'scan',
    icon: <Scan size={18} />,
    title: 'Scansione — Discovery SNMP, SSH e IP Range',
    content: (
      <>
        <p className="font-medium">Scansione dispositivo singolo:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Aprire <em>Scansione → Scansione dispositivo</em></li>
          <li>Selezionare il dispositivo dall'elenco</li>
          <li>Scegliere il tipo di scansione</li>
          <li>Cliccare <strong>Avvia scansione</strong> — il log si aggiorna in tempo reale</li>
        </ol>
        <Table
          headers={['Tipo scan', 'Cosa raccoglie']}
          rows={[
            ['SNMP Completo', 'Interfacce, ARP, MAC table, LLDP/CDP — raccolta totale'],
            ['SNMP ARP', 'Solo tabella ARP (IP↔MAC)'],
            ['SNMP MAC', 'Solo tabella MAC forwarding (porte↔MAC)'],
            ['SNMP LLDP', 'Solo neighbor LLDP/CDP (topologia)'],
            ['SSH Completo', 'Raccolta via CLI SSH (Cisco, UniFi…)'],
          ]}
        />
        <p className="font-medium mt-3">Scansione IP Range (ping sweep):</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Aprire <em>Scansione → Scansione IP Range</em></li>
          <li>Inserire IP iniziale e finale (es. <Code>192.168.1.1</Code> → <Code>192.168.1.254</Code>)</li>
          <li>Selezionare le porte TCP da verificare (22, 80, 443…)</li>
          <li>Cliccare <strong>Avvia Scansione Range</strong></li>
          <li>Quando completata, selezionare gli host → <strong>Importa selezionati (N)</strong></li>
        </ol>
        <p className="font-medium mt-3">Importazione massiva dal risultato:</p>
        <p>Dalla tabella degli host trovati, selezionare uno o più host con le checkbox, poi cliccare
          <strong> Importa selezionati</strong>. La modale permette di impostare tipo, armadio e vendor
          per ogni riga prima di confermare l'importazione.</p>
        <InfoBox color="green">
          Una notifica toast appare in basso a destra quando una scansione è completata o fallita,
          anche se nel frattempo si è navigato in un'altra sezione.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'scheduled',
    icon: <Network size={18} />,
    title: 'Pianificazione scan — Cron automatici',
    content: (
      <>
        <p>Le scansioni pianificate permettono di mantenere l'inventario aggiornato automaticamente.</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Aprire <em>Pianificazione</em> → <strong>Nuova pianificazione</strong></li>
          <li>Selezionare il dispositivo e il tipo di scan</li>
          <li>Inserire l'espressione cron</li>
          <li>Abilitare il toggle — la scan partirà automaticamente</li>
        </ol>
        <Table
          headers={['Espressione cron', 'Significato']}
          rows={[
            ['0 2 * * *', 'Ogni notte alle 02:00'],
            ['0 */6 * * *', 'Ogni 6 ore'],
            ['*/30 * * * *', 'Ogni 30 minuti'],
            ['0 8 * * 1', 'Ogni lunedì alle 08:00'],
          ]}
        />
        <InfoBox color="yellow">
          Le scan pianificate <strong>non sovrascrivono</strong> i dati esistenti — creano conflitti da revisionare manualmente.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'conflicts',
    icon: <AlertTriangle size={18} />,
    title: 'Conflitti — Revisione modifiche rilevate',
    content: (
      <>
        <p>Quando una scansione rileva dati diversi da quelli in database, crea un <strong>conflitto</strong>
          che deve essere revisionato prima di aggiornare l'inventario.</p>
        <Table
          headers={['Azione', 'Effetto']}
          rows={[
            ['✅ Accetta', 'Applica il nuovo valore rilevato nel database'],
            ['❌ Rifiuta', 'Mantiene il valore attuale, chiude il conflitto'],
            ['⏭️ Ignora', 'Chiude il conflitto senza azione'],
            ['Accetta tutti', 'Applica tutte le modifiche per quel dispositivo o scan'],
          ]}
        />
        <p className="font-medium mt-2">Switch non gestiti sospetti:</p>
        <p>Quando su una porta vengono visti ≥3 MAC diversi, il sistema crea automaticamente un conflitto
          di tipo <em>Switch non gestito sospetto</em>. Accettando, il dispositivo viene marcato come
          <Code>unmanaged_switch</Code> per segnalarlo nella topologia.</p>
        <InfoBox>
          Il badge arancione nella sidebar mostra il numero di conflitti in attesa di revisione.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'rack',
    icon: <Server size={18} />,
    title: 'Armadi rack — Diagramma visuale',
    content: (
      <>
        <p>Ogni armadio ha un diagramma interattivo che mostra i dispositivi negli slot U.</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Aprire <em>Armadi</em> → selezionare un armadio → scheda <strong>Diagramma Rack</strong></li>
          <li>I dispositivi mostrano il nome, tipo (colore) e IP</li>
          <li>Aprendo un dispositivo nel rack si accede direttamente al suo dettaglio</li>
          <li>Assegnare la posizione U da <em>Dispositivi → Modifica → Posizione U</em></li>
        </ul>
        <InfoBox color="yellow">
          Impostare <strong>Posizione U</strong> e <strong>Altezza U</strong> nel dispositivo per vederlo nel diagramma.
          I dispositivi senza posizione U appaiono nella sezione "Non posizionati".
        </InfoBox>
      </>
    ),
  },
  {
    id: 'patchpanel',
    icon: <Grid3X3 size={18} />,
    title: 'Patch Panel — Mappatura porte',
    content: (
      <>
        <p>Il patch panel virtualizza le porte fisiche collegando ciascuna porta a una stanza di destinazione
          e/o a una porta dello switch.</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Creare un dispositivo di tipo <strong>Patch Panel</strong> e assegnarlo a un armadio</li>
          <li>Aprire <em>Patch Panel</em> dal menu → selezionare il panel</li>
          <li>Cliccare su una porta per modificarla</li>
        </ol>
        <Table
          headers={['Campo porta', 'Esempio']}
          rows={[
            ['Etichetta', 'PC-SALA-RIUNIONI-01'],
            ['Stanza di destinazione', 'Piano 2 – Sala Riunioni'],
            ['Collegamento a switch', 'SW-CORE / Gi0/12'],
          ]}
        />
        <p className="font-medium mt-2">Colori porte:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>🟢 <strong>Verde</strong> — collegata a una porta switch</li>
          <li>🟡 <strong>Giallo</strong> — stanza di destinazione annotata</li>
          <li>⬜ <strong>Grigio</strong> — porta libera</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ipam',
    icon: <Globe size={18} />,
    title: 'IPAM e VLAN — Gestione indirizzi',
    content: (
      <>
        <p className="font-medium">Prefissi IP:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Aprire <em>Prefissi IP</em> → <strong>Nuovo prefisso</strong></li>
          <li>Inserire il blocco CIDR (es. <Code>192.168.20.0/24</Code>)</li>
          <li>Associare opzionalmente a sede e VLAN</li>
          <li>La scheda mostra utilizzo %, IP disponibili e IP assegnati con fonte</li>
        </ol>
        <p className="font-medium mt-2">VLAN:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Aprire <em>VLAN</em> → <strong>Nuova VLAN</strong></li>
          <li>Inserire ID (1–4094), nome, sede</li>
          <li>Le VLAN vengono associate alle interfacce automaticamente durante le scan</li>
        </ol>
        <InfoBox>
          Gli IP vengono popolati automaticamente dalle scansioni SNMP (tabella ARP) con sorgente <Code>snmp</Code> o
          <Code>scan</Code>. Gli IP aggiunti manualmente hanno sorgente <Code>manual</Code>.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'topology',
    icon: <GitBranch size={18} />,
    title: 'Topologia — Mappa visuale della rete',
    content: (
      <>
        <p>Il grafo di topologia mostra tutti i dispositivi collegati tramite cavi registrati nel sistema.</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nodi</strong> = dispositivi, colorati per tipo</li>
          <li><strong>Archi</strong> = cavi (rame, fibra, DAC…)</li>
          <li><strong>Hover</strong> su un nodo → nome, IP, armadio, sede</li>
          <li><strong>Click</strong> su un nodo → apre il dettaglio dispositivo</li>
          <li>Filtri per sede e per tipo dispositivo</li>
        </ul>
        <InfoBox color="yellow">
          La topologia mostra solo i collegamenti registrati manualmente o rilevati via LLDP/CDP.
          Eseguire una scan SNMP LLDP per popolare automaticamente i collegamenti.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'search',
    icon: <Search size={18} />,
    title: 'Ricerca globale — Trovare qualsiasi dispositivo',
    content: (
      <>
        <p>La barra di ricerca nella topbar permette di trovare dispositivi per nome, IP o MAC.</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Aprire con <strong>⌘K</strong> (Mac) o <strong>Ctrl+K</strong> (Windows/Linux)</li>
          <li>Oppure cliccare sulla barra "Cerca…" in alto</li>
          <li>Digitare nome parziale, indirizzo IP o MAC address</li>
          <li>Premere <strong>Invio</strong> o cliccare per aprire il dispositivo</li>
          <li>Navigare i risultati con le frecce ↑↓</li>
        </ul>
      </>
    ),
  },
  {
    id: 'api',
    icon: <Terminal size={18} />,
    title: 'REST API — Automazioni e integrazioni',
    content: (
      <>
        <p>Tutte le funzionalità sono esposte via API REST. La documentazione interattiva Swagger è disponibile su:</p>
        <CodeBlock>{`http://<IP_NETHELPER>/api/docs      # Swagger UI
http://<IP_NETHELPER>/api/redoc     # ReDoc`}</CodeBlock>
        <p className="font-medium mt-2">Autenticazione:</p>
        <CodeBlock>{`POST /api/v1/auth/login
{ "username": "admin", "password": "password" }

→ { "access_token": "eyJ...", "token_type": "bearer" }

# Usare il token:
Authorization: Bearer eyJ...`}</CodeBlock>
        <p className="font-medium mt-2">Esempi principali:</p>
        <CodeBlock>{`GET  /api/v1/devices?status=active        # lista dispositivi attivi
GET  /api/v1/devices/5/mac-entries        # MAC visti su un dispositivo
POST /api/v1/devices/5/scan              # avvia scan SNMP
     { "scan_type": "snmp_full" }
POST /api/v1/scan-jobs/ip-range          # ping sweep
     { "start_ip": "192.168.1.1", "end_ip": "192.168.1.254" }
POST /api/v1/devices/bulk                # import massivo
     { "devices": [...], "skip_duplicates": true }
GET  /api/v1/dashboard/stats             # statistiche dashboard
GET  /api/v1/conflicts?status=pending    # conflitti in attesa`}</CodeBlock>
      </>
    ),
  },
  {
    id: 'admin',
    icon: <Users size={18} />,
    title: 'Gestione utenti e vendor (Admin)',
    content: (
      <>
        <p className="font-medium">Utenti:</p>
        <p>Sezione <em>Admin → Utenti</em> — creare, disabilitare, cambiare ruolo e password degli utenti.</p>
        <Table
          headers={['Ruolo', 'Permessi']}
          rows={[
            ['Admin', 'Lettura + scrittura + gestione utenti + accettazione conflitti'],
            ['Viewer', 'Solo visualizzazione di tutti i dati'],
          ]}
        />
        <p className="font-medium mt-2">Vendor:</p>
        <p>Sezione <em>Admin → Vendor</em> — ogni vendor ha credenziali SNMP/SSH predefinite usate da tutti
          i dispositivi associati (a meno di override per dispositivo).</p>
        <Table
          headers={['Campo vendor', 'Descrizione']}
          rows={[
            ['Driver class', 'Driver di discovery (cisco_ios, unifi, generic_lldp…)'],
            ['SNMP community default', 'Community v2c usata se non impostata sul dispositivo'],
            ['SSH username/password', 'Credenziali SSH predefinite per questo vendor'],
          ]}
        />
        <InfoBox color="yellow">
          Gerarchia credenziali: <strong>Dispositivo</strong> (override) → <strong>Vendor default</strong> → <strong>Fallback globale</strong> (<Code>public</Code>).
        </InfoBox>
      </>
    ),
  },
  {
    id: 'backup',
    icon: <Download size={18} />,
    title: 'Backup & Restore',
    content: (
      <>
        <p>La sezione <em>Admin → Backup & Restore</em> permette di esportare e ripristinare il database direttamente dall'interfaccia.</p>
        <p className="font-medium mt-2">Da riga di comando sul server:</p>
        <CodeBlock>{`# Backup
pg_dump -U nethelper nethelper > backup_$(date +%Y%m%d).sql

# Ripristino
psql -U nethelper nethelper < backup_20240101.sql`}</CodeBlock>
        <p className="font-medium mt-2">Aggiornamento NetHelper:</p>
        <CodeBlock>{`# Sul server LXC
sudo bash /opt/nethelper/deploy/scripts/setup.sh
# → scegliere opzione 2 (Aggiornamento)`}</CodeBlock>
        <InfoBox color="green">
          L'aggiornamento con <Code>setup.sh</Code> preserva tutti i dati. Esegue: git pull → pip install → alembic upgrade → build frontend → riavvio servizi.
        </InfoBox>
      </>
    ),
  },
  {
    id: 'security',
    icon: <Shield size={18} />,
    title: 'Sicurezza e buone pratiche',
    content: (
      <>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Cambiare la password admin dopo la prima installazione</li>
          <li>Creare utenti <em>Sola lettura</em> per chi deve solo consultare l'inventario</li>
          <li>Le credenziali SSH/SNMP sono cifrate nel database (AES-256)</li>
          <li>Il token JWT scade dopo 30 minuti — il refresh avviene automaticamente</li>
          <li>Usare SNMP v3 (con autenticazione) invece di v2c dove possibile</li>
          <li>Mantenere aggiornato NetHelper con <Code>setup.sh → opzione 2</Code></li>
          <li>Fare backup del database regolarmente prima di ogni aggiornamento</li>
        </ul>
        <p className="font-medium mt-2">Diagnostica rapida:</p>
        <CodeBlock>{`# Log API in tempo reale
journalctl -u nethelper-api -f

# Log worker (scansioni)
journalctl -u nethelper-worker -f

# Stato servizi
systemctl status nethelper-api nethelper-worker nethelper-beat

# Riavvio completo
systemctl restart nethelper-api nethelper-worker nethelper-beat`}</CodeBlock>
      </>
    ),
  },
]

const GuidaPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <BookOpen size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Guida all'uso</h1>
          <p className="text-sm text-gray-500">Documentazione completa di NetHelper</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 mt-4 mb-6">
        {sections.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={e => {
              e.preventDefault()
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-700 transition-colors"
          >
            {s.title.split('—')[0].trim()}
          </a>
        ))}
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sections.map((section, idx) => (
          <div key={section.id} id={section.id}>
            <SectionBlock section={section} defaultOpen={idx === 0} />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-400">
          NetHelper · Documentazione API completa disponibile su{' '}
          <a href="/api/docs" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
            /api/docs
          </a>
        </p>
      </div>
    </div>
  )
}

export default GuidaPage
