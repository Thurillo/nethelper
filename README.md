# 🌐 NetHelper

> **Gestione semplificata della rete aziendale** — discovery SNMP/SSH, inventario dispositivi, armadi rack, patch panel, IPAM, VLAN e topologia visuale.

NetHelper è un'alternativa semplificata a NetBox, pensata per reti di piccole e medie dimensioni. Supporta **Cisco, UniFi, Fortinet, HPE Aruba, Juniper, Netgear** e qualsiasi switch con SNMP+LLDP standard. Tutto il backend è interrogabile via **REST API**, ideale per flussi **n8n** e bot **Telegram**.

---

## 📋 Indice

- [Funzionalità](#-funzionalità)
- [Architettura](#-architettura)
- [Installazione su Debian 13 (LXC Proxmox)](#-installazione-su-debian-13-lxc-proxmox)
- [Gestione utenti (CLI)](#-gestione-utenti-cli)
- [Guida all'uso](#-guida-alluso)
- [REST API](#-rest-api)
- [Aggiungere un nuovo vendor](#-aggiungere-un-nuovo-vendor)

---

## ✨ Funzionalità

| Area | Dettaglio |
|------|-----------|
| 🔍 **Discovery** | Scansione SNMP (v2c/v3) e SSH — interfacce, MAC address, ARP, LLDP/CDP |
| 🌐 **Scan IP range** | Ping sweep + TCP port check su range IP personalizzato |
| 📦 **Importazione massiva** | Selezione multipla degli host scoperti → import bulk con tipo, armadio e vendor per riga |
| 🔑 **Credenziali per dispositivo** | SNMP community/v3 e SSH username/password configurabili per singolo dispositivo (override vendor) |
| 🗄️ **Inventario** | Dispositivi, interfacce, cavi, indirizzi IP e MAC inseribili anche manualmente |
| 📊 **Dashboard** | Statistiche, grafici dispositivi per tipo/stato, ultime scan, conflitti in attesa e **grafici di andamento storico 30 giorni** |
| 🗺️ **Planimetria sede** | Caricamento planimetria PNG/JPG con **armadi posizionabili drag-and-drop** sulla mappa |
| 🔎 **Ricerca globale** | Barra di ricerca ⌘K per trovare qualsiasi dispositivo per nome, IP o MAC |
| 🏗️ **Armadi rack** | Diagramma visuale con colori per tipo dispositivo |
| 🔌 **Patch panel** | Panel virtuali con etichette porte personalizzate e stanza di destinazione |
| 🗺️ **Topologia** | Mappa force-directed dei collegamenti tra dispositivi |
| 📡 **VLAN** | Gestione VLAN con collegamento a interfacce e prefissi |
| 🔢 **IPAM** | Gestione prefissi/pool IP, utilizzo in percentuale, IPs liberi |
| ⚠️ **Conflitti** | Scansioni periodiche generano conflitti da accettare/rifiutare — nessuna scrittura automatica |
| 🕵️ **Switch non gestiti** | Rilevamento automatico porte con ≥3 MAC (probabile switch non gestito) |
| 📜 **Audit log** | Ogni modifica tracciata con utente, timestamp, campo e valore precedente |
| 📥 **Export CSV** | Esportazione inventario dispositivi con filtri attivi |
| 🔔 **Notifiche** | Toast automatici al completamento o fallimento di ogni scan |
| 🔐 **Autenticazione** | JWT con ruoli **Admin** (lettura/scrittura) e **Sola lettura** |
| 🤖 **REST API** | Tutte le funzionalità esposte via API — compatibile con n8n e Telegram bot |
| 📖 **Guida integrata** | Documentazione d'uso disponibile direttamente nell'interfaccia web |
| 🔗 **Integrazione CheckMK** | Collegamento device NetHelper ↔ host CheckMK con badge UP/DOWN/UNREACHABLE in tempo reale |
| 🗺️ **Diagramma di rete interattivo** | Posiziona dispositivi sulla planimetria aziendale, visualizza connessioni fisiche (cavi), filtra per tipo (Switch, Stampanti, Telefoni, ecc.) |

---

## 🏛️ Architettura

```
┌─────────────────────────────────────────────────────────┐
│                        Nginx                            │
│          /api/* → Uvicorn        /* → dist/             │
└───────────────┬────────────────────────────────────────-┘
                │
    ┌───────────▼───────────┐      ┌─────────────────────┐
    │   FastAPI (Python)    │      │   React + Vite      │
    │   porta 8000          │      │   (frontend/dist)   │
    └───────────┬───────────┘      └─────────────────────┘
                │
    ┌───────────▼───────────┐      ┌─────────────────────┐
    │   PostgreSQL 16        │      │   Redis             │
    │   (dati persistenti)  │      │   (Celery broker)   │
    └───────────────────────┘      └──────────┬──────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Celery Worker      │
                                   │  (SNMP/SSH/scan)    │
                                   ├─────────────────────┤
                                   │  Celery Beat        │
                                   │  (scan periodici)   │
                                   └─────────────────────┘
```

**Stack tecnologico:**
- **Backend:** Python 3.12 · FastAPI · SQLAlchemy async · Alembic
- **Database:** PostgreSQL 16
- **Task queue:** Celery 5 + Redis (worker + beat scheduler)
- **SNMP:** puresnmp (async, pure Python)
- **SSH:** netmiko + ntc-templates
- **Frontend:** React 18 · Vite · TypeScript · Tailwind CSS · TanStack Query

---

## 🚀 Installazione su Debian 13 (LXC Proxmox)

### 1. Creare il container LXC su Proxmox

Eseguire sul **nodo Proxmox** (non nel container):

```bash
pveam update
pveam download local debian-13-standard_13.0-1_amd64.tar.zst

pct create 200 local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst \
    --hostname nethelper \
    --cores 2 --memory 2048 --swap 512 \
    --rootfs local-lvm:20 \
    --net0 name=eth0,bridge=vmbr0,ip=dhcp \
    --unprivileged 1 --features nesting=1 \
    --start 1

pct enter 200
```

> 💡 **Risorse consigliate:** 2 vCPU · 2 GB RAM · 20 GB disco. Per reti >200 dispositivi: 4 GB RAM.

---

### 2. Eseguire lo script di installazione

All'interno del container LXC, come **root**:

```bash
apt install -y curl git
curl -fsSL https://raw.githubusercontent.com/Thurillo/NetHelper/master/deploy/scripts/setup.sh -o setup.sh
bash setup.sh
```

Si apre il menu di gestione:

```
  ╔══════════════════════════════════════════════════╗
  ║           NetHelper  –  Gestione                ║
  ╠══════════════════════════════════════════════════╣
  ║                                                  ║
  ║   1)  Nuova installazione                        ║
  ║   2)  Aggiornamento  (mantiene tutti i dati)     ║
  ║   3)  Cambia password utente                     ║
  ║   0)  Esci                                       ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
```

Scegliere **1** per la prima installazione.

Lo script installa automaticamente:
- Tutti i pacchetti di sistema (Python 3.12, Node.js, PostgreSQL, Redis, Nginx…)
- Il codice da GitHub
- Il virtualenv Python con tutte le dipendenze
- Il file `.env` con chiavi generate casualmente
- Le migrazioni del database
- I profili vendor predefiniti (Cisco, UniFi, Fortinet, Aruba, HP, Juniper, Netgear…)
- I servizi systemd (api, worker, beat)
- Nginx come reverse proxy

Al termine chiede solo **username** e **password** del primo utente admin.

---

### 3. Accedere all'applicazione

```
http://<IP_DEL_CONTAINER>          Interfaccia web
http://<IP_DEL_CONTAINER>/api/docs  Swagger API
```

---

## 👤 Gestione utenti (CLI)

Tutte le operazioni sugli utenti possono essere eseguite tramite il menu `setup.sh` **oppure** direttamente da riga di comando.

### Accedere agli script

```bash
# Sul server Debian
sudo bash /opt/nethelper/deploy/scripts/setup.sh
```

Oppure direttamente (come root o utente nethelper):

```bash
source /opt/nethelper/venv/bin/activate
cd /opt/nethelper/backend
```

---

### Creare un nuovo utente admin

**Via menu setup.sh → opzione 1** (solo al primo avvio), oppure da CLI:

```bash
python -m app.scripts.create_admin
```

Verrà chiesto username, email (opzionale) e password in modo interattivo.

Per creare un utente senza interazione (es. da script):

```bash
python -m app.scripts.create_admin --username mario --password password123
```

> Crea sempre un utente con ruolo **Admin**. Per creare utenti con ruolo *Sola lettura*, usare la sezione **Impostazioni → Utenti** nell'interfaccia web (richiede login come admin).

---

### Cambiare la password di un utente

**Via menu setup.sh → opzione 3**, oppure da CLI:

```bash
python -m app.scripts.change_password
```

Oppure senza interazione:

```bash
python -m app.scripts.change_password --username mario --password nuovapassword
```

---

### Aggiornare NetHelper

**Via menu setup.sh → opzione 2** — aggiorna il codice da GitHub, applica le nuove migrazioni, ricompila il frontend e riavvia i servizi. **I dati nel database vengono preservati.**

---

## 📖 Guida all'uso

### Login

Accedere all'indirizzo dell'applicazione e inserire le credenziali create durante l'installazione.

| Ruolo | Permessi |
|-------|----------|
| **Admin** | Lettura + scrittura + gestione utenti + accettazione conflitti |
| **Sola lettura** | Solo visualizzazione di tutti i dati |

---

### Pannello di controllo

La schermata iniziale mostra:
- Statistiche globali (dispositivi, sedi, prefissi IP, conflitti in attesa)
- **Grafici di andamento** — sparkline con i valori degli ultimi 30 giorni per dispositivi, IP, prefissi e conflitti (visibili dopo la prima notte di raccolta dati)
- Distribuzione dispositivi per tipo e per stato
- Ultime scansioni eseguite
- Badge arancione con numero conflitti da risolvere

> I dati storici vengono raccolti automaticamente ogni notte dal processo **Celery Beat**.

---

### Sedi e Armadi

**Sedi → Armadi** è la gerarchia fisica:

1. Creare una **Sede** (edificio, piano, sala server)
2. Creare uno o più **Armadi** nella sede, specificando:
   - Nome identificativo
   - Numero di unità rack (U) — es. 12U, 24U, 42U

#### Planimetria sede

Dalla pagina **Sedi**, cliccare il pulsante **Mappa** su qualsiasi sede per aprire la planimetria interattiva:
- **Caricamento planimetria** — caricare una foto o disegno della sala server (JPG, PNG, WebP)
- **Posizionamento armadi** — trascinare i marker degli armadi sulla planimetria
- Le posizioni vengono salvate automaticamente al click su **Salva posizioni**
- Un indicatore verde (●) nella lista sedi segnala che la planimetria è già caricata

#### Diagramma rack

Aprendo un armadio si visualizza il **diagramma rack** interattivo:
- Ogni riga rappresenta 1U
- I dispositivi sono posizionati trascinandoli (drag-and-drop) nella posizione U desiderata
- Colori diversi per tipo dispositivo (switch, patch panel, server, PDU…)

---

### Dispositivi

Un dispositivo rappresenta qualsiasi apparato fisico in rete.

**Tipi dispositivo supportati:**
`switch` · `router` · `access_point` · `server` · `patch_panel` · `pdu` · `firewall` · `ups` · `unmanaged_switch` · `workstation` · `printer` · `camera` · `phone` · `other`

**Campi principali:**
| Campo | Descrizione |
|-------|-------------|
| Tipo | Switch, Router, Access Point, Server, Patch Panel, PDU, Firewall, UPS… |
| IP primario | Indirizzo di management per le scansioni |
| Vendor | Profilo vendor con credenziali SNMP/SSH predefinite |
| SNMP community | Override per questo dispositivo (v2c o v3) |
| SNMPv3 | Username, auth protocol/password, priv protocol/password |
| Credenziali SSH | Username/password o chiave privata, porta |
| Posizione U | Slot nell'armadio |
| Altezza | Numero di U occupate |

> Le credenziali per dispositivo si impostano nella modale Modifica → sezione collassabile **Credenziali SNMP/SSH**. Sovrascrivono i default del vendor.

**Scheda dispositivo — Tab disponibili:**
- **Interfacce** — tutte le porte fisiche con MAC, VLAN, velocità, stato
- **Indirizzi IP** — IPs assegnati (da scan o manuali)
- **Tabella MAC** — MAC address visti sull'ultima scansione con porta e VLAN
- **Scansioni** — storico job di scansione con log

---

### Vendor supportati

I seguenti vendor sono preconfigurati con profili SNMP/SSH predefiniti:

| Vendor | Driver | Note |
|--------|--------|------|
| Cisco IOS / IOS-XE | `cisco_ios` | CDP, per-VLAN MAC walk |
| Cisco NX-OS | `cisco_nxos` | Nexus datacenter |
| Ubiquiti UniFi | `unifi` | SSH mca-dump JSON |
| Fortinet FortiSwitch | `generic_lldp` | SNMP + LLDP standard |
| HPE Aruba | `generic_lldp` | Aruba CX / AOS |
| HP ProCurve | `hp_procurve` | Legacy e OfficeConnect |
| Juniper | `generic_lldp` | EX / QFX series |
| Netgear | `generic_lldp` | Switch managed |
| MikroTik | `generic_lldp` | RouterOS / SwOS |
| D-Link | `generic_lldp` | Switch managed |
| TP-Link / Omada | `generic_lldp` | Switch managed |

Qualsiasi switch che supporta **SNMP v2c + LLDP standard** funziona con il driver `generic_lldp` anche se non in lista.

---

### Scansione

#### Scansione manuale dispositivo

1. Aprire **Scansione** dal menu laterale
2. Selezionare il dispositivo da scansionare
3. Scegliere il tipo: `SNMP Completo`, `SNMP ARP`, `SNMP MAC`, `SNMP LLDP`, `SSH Completo`
4. Cliccare **Avvia scansione**
5. Il log in tempo reale mostra l'avanzamento

#### Scansione IP range (ping sweep)

1. **Scansione → Scansione IP Range**
2. Inserire **IP iniziale** e **IP finale** (es. `192.168.1.1` → `192.168.1.254`)
3. Opzionale: specificare le **porte TCP** da verificare (default: 22, 80, 443)
4. Cliccare **Avvia**

#### Importazione massiva dagli host scoperti

Dopo una scansione IP Range, nella tabella **Host trovati**:
1. Selezionare uno o più host con le **checkbox** (o _Seleziona tutti_)
2. Cliccare **Importa selezionati (N)** — compare il bottone quando N > 0
3. Nella modale: impostare tipo, armadio e vendor per ogni riga (o applicare globalmente)
4. Cliccare **Importa N dispositivi**
5. Il sistema crea i dispositivi, salta i duplicati (per IP) e mostra il riepilogo

---

#### Scansioni pianificate

1. **Pianificazione scan** → **Nuova pianificazione**
2. Selezionare dispositivo e tipo scan
3. Inserire espressione **cron** (es. `0 2 * * *` = ogni notte alle 02:00)
4. Abilitare/disabilitare senza eliminare

---

### Conflitti

Le scansioni periodiche **non sovrascrivono** i dati esistenti. Se rilevano differenze, creano **conflitti** da revisionare.

**Pagina Conflitti:**
- Ogni conflitto mostra: dispositivo, campo, **Valore attuale** vs **Valore rilevato**
- ✅ **Accetta** — applica il nuovo valore al database
- ❌ **Rifiuta** — mantiene il valore attuale
- ⏭️ **Ignora** — chiude il conflitto senza azione
- **Accetta tutti / Rifiuta tutti** — azione bulk per dispositivo o scan job

**Switch non gestiti sospetti:** porta con ≥3 MAC → conflitto speciale. L'admin può confermarlo come dispositivo `Switch non gestito` o ignorarlo.

---

### Patch Panel

1. Creare un dispositivo di tipo **Patch Panel** e assegnarlo a un armadio
2. Aprire **Patch Panel** dal menu → selezionare il panel
3. Visualizzazione a griglia delle porte:
   - 🟢 **Verde** — porta collegata a una porta switch
   - 🟡 **Giallo** — stanza di destinazione annotata
   - ⬜ **Grigio** — porta libera

| Campo porta | Esempio |
|-------------|---------|
| Etichetta | `PC-SALA-RIUNIONI-01` |
| Stanza di destinazione | `Piano 2 – Sala Riunioni` |
| Collegamento a switch | `SW-CORE / Gi0/12` |

---

### VLAN

1. **VLAN → Nuova VLAN** — inserire ID (1–4094), nome, sede (opzionale)
2. Le VLAN vengono associate automaticamente alle interfacce durante la scansione
3. Da una VLAN: visualizzare tutte le interfacce che la usano e i prefissi IP associati

---

### Prefissi IP (IPAM)

1. **Prefissi IP → Nuovo prefisso** — inserire blocco CIDR (es. `192.168.20.0/24`)
2. Associare opzionalmente a sede e/o VLAN
3. La scheda mostra:
   - **Utilizzo** — barra percentuale
   - **IP disponibili** — prossimi indirizzi liberi
   - **IP assegnati** — con dispositivo, interfaccia e sorgente

**Aggiungere IP manualmente:** Prefissi IP → selezionare prefisso → **Aggiungi IP**

---

### Topologia

Grafo interattivo force-directed di tutti i dispositivi collegati:
- **Nodi** = dispositivi colorati per tipo
- **Archi** = cavi (con tipo: Cat6, Fibra, DAC…)
- **Hover** su un nodo → mostra nome, IP, armadio, sede
- **Filtri** per sede e tipo dispositivo

---

### Storico modifiche (Audit Log)

Ogni creazione, modifica ed eliminazione è registrata con utente, data/ora, entità, campo, valore precedente e nuovo valore, IP client.

---

### Gestione utenti (solo Admin)

**Impostazioni → Utenti → Nuovo utente**

| Campo | Note |
|-------|-------|
| Username | Identificativo login |
| Email | Opzionale |
| Password | Minimo 8 caratteri |
| Ruolo | `Admin` o `Sola lettura` |

---

## 🔌 REST API

```
http://<IP_NETHELPER>/api/docs      # Swagger UI (interattivo)
http://<IP_NETHELPER>/api/redoc     # ReDoc
```

### Autenticazione

```bash
# Ottenere il token
curl -X POST http://<IP>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'

# Risposta:
# {"access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "bearer"}

# Usare il token nelle richieste successive
curl http://<IP>/api/v1/devices \
  -H "Authorization: Bearer eyJ..."
```

### Esempi

```bash
GET  /api/v1/devices?status=active           # lista dispositivi attivi
GET  /api/v1/devices?device_type=switch      # filtra per tipo
GET  /api/v1/devices/5/mac-entries           # MAC visti su un dispositivo
GET  /api/v1/conflicts?status=pending        # conflitti in attesa
POST /api/v1/devices/5/scan                  # avvia scansione SNMP
     body: {"scan_type": "snmp_full"}
POST /api/v1/scan-jobs/ip-range              # ping sweep
     body: {"start_ip": "192.168.1.1", "end_ip": "192.168.1.254"}
POST /api/v1/devices/bulk                    # import massivo da scan
     body: {"devices": [{"name": "...", "primary_ip": "...", "device_type": "server"}], "skip_duplicates": true}
GET  /api/v1/prefixes/1/utilization          # utilizzo prefisso IP
POST /api/v1/prefixes/assign-ips             # collega IP ai prefissi per CIDR (fix utilizzo)
GET  /api/v1/dashboard/stats                 # statistiche dashboard
GET  /api/v1/dashboard/history?days=30       # andamento storico (snapshot giornalieri)
PUT  /api/v1/sites/1/floor-plan              # carica planimetria sede (base64)
DELETE /api/v1/sites/1/floor-plan            # rimuove planimetria sede
```

---

## 🔧 Aggiungere un nuovo vendor

Per aggiungere un vendor non in lista (es. un modello specifico con CLI proprietaria):

1. **Creare il driver** in `backend/app/discovery/drivers/nuovovendor.py`:

```python
from .base import BaseDriver, CollectedData

class NuovoVendorDriver(BaseDriver):
    async def collect(self) -> CollectedData:
        # Raccolta dati via SSH o SNMP vendor-specific
        ...
```

2. **Registrare il driver** in `backend/app/discovery/vendor_registry.py`:

```python
VENDOR_DRIVERS = {
    "cisco_ios":    CiscoIosDriver,
    "unifi":        UnifiDriver,
    "generic_lldp": GenericLldpDriver,
    "nuovovendor":  NuovoVendorDriver,   # ← aggiungere qui
}
```

3. **Inserire il record vendor** via interfaccia web (**Impostazioni → Vendor**) o con `seed_vendors.py`.

> Per switch che usano solo SNMP standard + LLDP, non serve scrivere un driver: basta inserire il vendor con `driver_class: "generic_lldp"`.

---

## 🔗 Integrazione CheckMK

NetHelper può collegarsi a **CheckMK RAW 2.4** per mostrare lo stato UP/DOWN/UNREACHABLE direttamente nella lista dispositivi e nel dettaglio.

### Prerequisiti

- CheckMK RAW 2.4 o superiore
- Utente `automation` con API key generata nella console CheckMK

### Configurazione

1. Accedi a **Admin → Supporto → Integrazioni**
2. Inserisci URL base (es. `http://192.168.1.100/cmk`), username `automation` e API key
3. Abilita l'integrazione con il toggle e clicca **Salva**
4. Clicca **Verifica connessione** per confermare che tutto funzioni

### Collegamento device ↔ host

1. Apri il dettaglio di un dispositivo
2. Nella sezione **Monitoraggio CheckMK**, seleziona l'host dal dropdown
3. Clicca **Collega**
4. Il badge UP/DOWN appare nella lista dispositivi e nel dettaglio

### Badge di stato

| Badge | Significato |
|-------|-------------|
| ● UP (verde) | Il dispositivo risponde in CheckMK |
| ● DOWN (rosso) | Il dispositivo non risponde |
| ● UNREACHABLE (arancio) | Nodo non raggiungibile (parent down) |
| ○ PENDING (grigio) | Check in attesa del primo risultato |
| ⚠ non trovato (giallo) | Collegato in NetHelper ma assente in CheckMK |
| *(nessun badge)* | Dispositivo non collegato a CheckMK |

Le discrepanze vengono gestite silenziosamente — nessun errore se un IP non è presente in CheckMK.

---

## 🛠️ Comandi utili post-installazione

```bash
# Riaprire il menu di gestione
sudo bash /opt/nethelper/deploy/scripts/setup.sh

# Log in tempo reale
journalctl -u nethelper-api    -f
journalctl -u nethelper-worker -f
journalctl -u nethelper-beat   -f

# Riavvio servizi
systemctl restart nethelper-api nethelper-worker nethelper-beat

# Backup database
pg_dump -U nethelper nethelper > backup_$(date +%Y%m%d).sql

# Ripristino backup
psql -U nethelper nethelper < backup_20240101.sql
```

---

## 📁 Struttura del progetto

```
NetHelper/
├── backend/
│   ├── app/
│   │   ├── models/        # Modelli SQLAlchemy
│   │   ├── schemas/       # Schemi Pydantic
│   │   ├── routers/       # Endpoint FastAPI
│   │   ├── crud/          # Accesso al database
│   │   ├── discovery/     # SNMP, SSH, driver vendor
│   │   ├── scripts/       # create_admin, change_password, seed_vendors
│   │   └── tasks/         # Celery worker e beat
│   ├── alembic/           # Migrazioni database
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/    # Componenti React
│       └── pages/         # Pagine dell'applicazione
└── deploy/
    ├── nginx/             # Configurazione Nginx
    ├── systemd/           # Servizi systemd
    └── scripts/
        └── setup.sh       # Script installazione/aggiornamento/gestione
```

---

## 📄 Licenza

Uso interno aziendale.
