# 🌐 NetHelper

> **Gestione semplificata della rete aziendale** — discovery SNMP/SSH, inventario dispositivi, armadi rack, patch panel, IPAM, VLAN e topologia visuale.

NetHelper è un'alternativa semplificata a NetBox, pensata per reti di piccole e medie dimensioni con dispositivi **Cisco** e **Ubiquiti UniFi**. Tutto il backend è interrogabile via **REST API**, ideale per flussi **n8n** e bot **Telegram**.

---

## 📋 Indice

- [Funzionalità](#-funzionalità)
- [Architettura](#-architettura)
- [Installazione su Debian 13 (LXC Proxmox)](#-installazione-su-debian-13-lxc-proxmox)
- [Avvio rapido in locale](#-avvio-rapido-in-locale)
- [Guida all'uso](#-guida-alluso)
- [REST API](#-rest-api)
- [Aggiungere un nuovo vendor](#-aggiungere-un-nuovo-vendor)

---

## ✨ Funzionalità

| Area | Dettaglio |
|------|-----------|
| 🔍 **Discovery** | Scansione SNMP (v2c/v3) e SSH — interfacce, MAC address, ARP, LLDP/CDP |
| 🌐 **Scan IP range** | Ping sweep + TCP port check su range IP personalizzato |
| 🗄️ **Inventario** | Dispositivi, interfacce, cavi, indirizzi IP e MAC inseribili anche manualmente |
| 🏗️ **Armadi rack** | Diagramma visuale drag-and-drop, configurazione U personalizzabile |
| 🔌 **Patch panel** | Panel virtuali con etichette porte personalizzate e stanza di destinazione |
| 🗺️ **Topologia** | Mappa force-directed dei collegamenti tra dispositivi |
| 📡 **VLAN** | Gestione VLAN con collegamento a interfacce e prefissi |
| 🔢 **IPAM** | Gestione prefissi/pool IP, utilizzo in percentuale, IPs liberi |
| ⚠️ **Conflitti** | Scansioni periodiche generano conflitti da accettare/rifiutare — nessuna scrittura automatica |
| 🕵️ **Switch non gestiti** | Rilevamento automatico porte con ≥3 MAC (probabile switch non gestito) |
| 📜 **Audit log** | Ogni modifica tracciata con utente, timestamp, campo e valore precedente |
| 🔐 **Autenticazione** | JWT con ruoli **Admin** (lettura/scrittura) e **Sola lettura** |
| 🤖 **REST API** | Tutte le funzionalità esposte via API — compatibile con n8n e Telegram bot |

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
- **SSH:** netmiko + ntc-templates (Cisco IOS, UniFi)
- **Frontend:** React 18 · Vite · TypeScript · Tailwind CSS · TanStack Query

---

## 🚀 Installazione su Debian 13 (LXC Proxmox)

### 1. Creare il container LXC su Proxmox

Eseguire sul **nodo Proxmox** (non nel container):

```bash
# Scaricare il template Debian 13 se non presente
pveam update
pveam download local debian-13-standard_13.0-1_amd64.tar.zst

# Creare il container (ID 200, adattare a piacere)
pct create 200 local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst \
    --hostname nethelper \
    --cores 2 \
    --memory 2048 \
    --swap 512 \
    --rootfs local-lvm:20 \
    --net0 name=eth0,bridge=vmbr0,ip=dhcp \
    --unprivileged 1 \
    --features nesting=1 \
    --start 1

# Entrare nel container
pct enter 200
```

> 💡 **Risorse consigliate:** 2 vCPU, 2 GB RAM, 20 GB disco. Per reti >200 dispositivi aumentare a 4 GB RAM.

---

### 2. Preparazione sistema

```bash
# Aggiornare i pacchetti
apt update && apt upgrade -y

# Installare le dipendenze di sistema
apt install -y \
    python3.12 python3.12-venv python3.12-dev python3-pip \
    libpq-dev libssl-dev libffi-dev build-essential \
    postgresql postgresql-contrib \
    redis-server \
    nginx \
    nodejs npm \
    git curl wget \
    snmp iputils-ping \
    acl

# Verificare le versioni
python3.12 --version   # Python 3.12.x
node --version         # v18+
npm --version          # 9+
psql --version         # PostgreSQL 16.x
```

---

### 3. Creare l'utente applicazione

```bash
useradd -r -m -s /bin/bash nethelper
mkdir -p /opt/nethelper
chown nethelper:nethelper /opt/nethelper
```

---

### 4. Configurare PostgreSQL

```bash
# Avviare e abilitare PostgreSQL
systemctl enable --now postgresql

# Creare utente e database
su - postgres -c "createuser nethelper"
su - postgres -c "createdb nethelper -O nethelper"

# Impostare la password (sostituire CON_UNA_PASSWORD_SICURA)
su - postgres -c "psql -c \"ALTER USER nethelper WITH PASSWORD 'CON_UNA_PASSWORD_SICURA';\""
```

---

### 5. Configurare Redis

```bash
systemctl enable --now redis-server

# Verificare che Redis sia attivo
redis-cli ping   # risponde: PONG
```

---

### 6. Scaricare il codice

```bash
su - nethelper
cd /opt/nethelper
git clone https://github.com/Thurillo/nethelper.git .
```

---

### 7. Installare il backend Python

```bash
# Ancora come utente nethelper
python3.12 -m venv /opt/nethelper/venv
source /opt/nethelper/venv/bin/activate

pip install --upgrade pip
pip install -r /opt/nethelper/backend/requirements.txt
```

---

### 8. Configurare le variabili d'ambiente

```bash
cp /opt/nethelper/backend/.env.example /opt/nethelper/backend/.env
chmod 600 /opt/nethelper/backend/.env

# Generare chiavi sicure
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
ENCRYPTION_KEY=$(python3 -c "import secrets; print(secrets.token_hex(16))")

# Modificare il file .env
nano /opt/nethelper/backend/.env
```

Contenuto del file `.env` (valori da adattare):

```env
DATABASE_URL=postgresql+asyncpg://nethelper:CON_UNA_PASSWORD_SICURA@localhost/nethelper
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
SECRET_KEY=<incollare il SECRET_KEY generato sopra>
ENCRYPTION_KEY=<incollare l'ENCRYPTION_KEY generato sopra>
ACCESS_TOKEN_EXPIRE_MINUTES=480
REFRESH_TOKEN_EXPIRE_DAYS=7
APP_NAME=NetHelper
DEBUG=false
```

---

### 9. Eseguire le migrazioni del database

```bash
source /opt/nethelper/venv/bin/activate
cd /opt/nethelper/backend
alembic upgrade head
```

---

### 10. Creare il primo utente admin

```bash
source /opt/nethelper/venv/bin/activate
cd /opt/nethelper/backend
python -m app.scripts.create_admin
```

Seguire le istruzioni interattive:
```
Username: admin
Email (opzionale): admin@azienda.local
Password: ●●●●●●●●
✓ Utente admin creato con successo.
```

---

### 11. Compilare il frontend

```bash
cd /opt/nethelper/frontend
npm ci
npm run build
# Output: /opt/nethelper/frontend/dist/
```

---

### 12. Installare i servizi systemd

```bash
# Uscire dall'utente nethelper
exit

# Copiare i file di servizio
cp /opt/nethelper/deploy/systemd/nethelper-api.service    /etc/systemd/system/
cp /opt/nethelper/deploy/systemd/nethelper-worker.service /etc/systemd/system/
cp /opt/nethelper/deploy/systemd/nethelper-beat.service   /etc/systemd/system/

# Abilitare e avviare i servizi
systemctl daemon-reload
systemctl enable --now nethelper-api nethelper-worker nethelper-beat

# Verificare lo stato
systemctl status nethelper-api
systemctl status nethelper-worker
systemctl status nethelper-beat
```

---

### 13. Configurare Nginx

```bash
cp /opt/nethelper/deploy/nginx/nethelper.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/nethelper.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Sostituire l'underscore con il proprio hostname o IP
nano /etc/nginx/sites-available/nethelper.conf
# → server_name nethelper.local;   (o l'IP del container)

nginx -t && systemctl enable --now nginx
```

---

### 14. Verifica installazione

```bash
# Controllare che tutti i servizi siano attivi
systemctl is-active nethelper-api      # active
systemctl is-active nethelper-worker   # active
systemctl is-active nethelper-beat     # active
systemctl is-active nginx              # active
systemctl is-active postgresql         # active
systemctl is-active redis-server       # active

# Test API
curl -s http://localhost:8000/api/health | python3 -m json.tool
# {"status": "ok", "app": "NetHelper"}
```

Aprire il browser: **`http://<IP_DEL_CONTAINER>`** ✅

---

### Script di installazione automatica

In alternativa ai passi manuali, è disponibile uno script che automatizza tutta l'installazione:

```bash
# Come root nel container LXC
cd /opt/nethelper
REPO_URL=https://github.com/Thurillo/nethelper.git \
DB_PASS=password_sicura \
bash deploy/scripts/install.sh
```

---

### Aggiornamento

```bash
su - nethelper
cd /opt/nethelper
git pull origin master

source venv/bin/activate
pip install -r backend/requirements.txt   # aggiorna dipendenze Python
cd backend && alembic upgrade head        # applica nuove migrazioni

cd /opt/nethelper/frontend
npm ci && npm run build                   # ricompila frontend

exit
systemctl restart nethelper-api nethelper-worker nethelper-beat
```

---

## 💻 Avvio rapido in locale

Per sviluppo/test su macchina locale (richiede Python 3.12, Node 18+, PostgreSQL, Redis):

```bash
git clone https://github.com/Thurillo/nethelper.git
cd nethelper

# Backend
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # modificare le variabili
alembic upgrade head
python -m app.scripts.create_admin
uvicorn app.main:app --reload --port 8000

# Frontend (nuovo terminale)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

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
- Ultime scansioni eseguite
- Badge rosso con numero conflitti da risolvere

---

### Sedi e Armadi

**Sedi → Armadi** è la gerarchia fisica:

1. Creare una **Sede** (edificio, piano, sala server)
2. Creare uno o più **Armadi** nella sede, specificando:
   - Nome identificativo
   - Numero di unità rack (U) — es. 12U, 24U, 42U

#### Diagramma rack

Aprendo un armadio si visualizza il **diagramma rack** interattivo:
- Ogni riga rappresenta 1U
- I dispositivi sono posizionati trascinandoli (drag-and-drop) nella posizione U desiderata
- Colori diversi per tipo dispositivo (switch, patch panel, server, PDU…)

Per aggiungere un dispositivo all'armadio:
1. Aprire il dispositivo → campo **Posizione U** e **Armadio**
2. Oppure direttamente dal diagramma rack → tasto **Assegna dispositivo**

---

### Dispositivi

Un dispositivo rappresenta qualsiasi apparato fisico in rete.

**Campi principali:**
| Campo | Descrizione |
|-------|-------------|
| Tipo | Switch, Router, Access Point, Server, Patch Panel, PDU… |
| IP primario | Indirizzo di management per le scansioni |
| Vendor | Profilo vendor con credenziali SNMP/SSH predefinite |
| SNMP community | Override per questo dispositivo (v2c o v3) |
| Credenziali SSH | Username/password o chiave privata |
| Posizione U | Slot nell'armadio (da quale U parte) |
| Altezza | Numero di U occupate (es. 2U per uno switch 2U) |

**Scheda dispositivo — Tab disponibili:**
- **Interfacce** — tutte le porte fisiche con MAC, VLAN, velocità, stato
- **Indirizzi IP** — IPs assegnati (da scan o manuali)
- **Tabella MAC** — MAC address visti sull'ultima scansione con porta e VLAN
- **Scansioni** — storico job di scansione con log

---

### Scansione

#### Scansione manuale dispositivo

1. Aprire **Scansione** dal menu laterale
2. Selezionare il dispositivo da scansionare
3. Scegliere il tipo:
   - `SNMP Completo` — interfacce + ARP + tabella MAC + LLDP/CDP
   - `SNMP ARP` — solo tabella ARP
   - `SNMP MAC` — solo tabella MAC address
   - `SNMP LLDP` — solo neighbor discovery
   - `SSH Completo` — connessione SSH, raccolta dati via CLI
4. Cliccare **Avvia scansione**
5. Il log in tempo reale mostra l'avanzamento

#### Scansione IP range (ping sweep)

Utile per scoprire nuovi host sulla rete:

1. **Scansione → Scansione IP Range**
2. Inserire **IP iniziale** e **IP finale** (es. `192.168.1.1` → `192.168.1.254`)
3. Opzionale: specificare le **porte TCP** da verificare (default: 22, 80, 443, 8080, 8443)
4. Cliccare **Avvia**

Risultato: ogni host attivo viene aggiunto come `IpAddress` con sorgente `ip_range_scan`. Se già presente in un prefisso IPAM, viene associato automaticamente.

#### Scansioni pianificate

1. **Pianificazione scan** → **Nuova pianificazione**
2. Selezionare il dispositivo e il tipo di scan
3. Inserire un'espressione **cron** (es. `0 2 * * *` = ogni notte alle 02:00)
4. Abilitare/disabilitare senza eliminare

---

### Conflitti

Le scansioni periodiche **non sovrascrivono** i dati esistenti. Se rilevano differenze, creano dei **conflitti** da revisionare.

**Pagina Conflitti:**
- Ogni conflitto mostra: dispositivo, campo, **Valore attuale** vs **Valore rilevato**
- Azioni disponibili per ogni conflitto:
  - ✅ **Accetta** — applica il nuovo valore al database
  - ❌ **Rifiuta** — mantiene il valore attuale
  - ⏭️ **Ignora** — chiude il conflitto senza azione

- **Accetta tutti / Rifiuta tutti** — azione bulk per tutti i conflitti di un dispositivo

**Switch non gestiti sospetti:**
Quando una porta ha ≥ 3 MAC address distinti, viene creato un conflitto speciale `Switch non gestito sospetto`. L'admin può:
- **Conferma come Switch** — crea un dispositivo con tipo `Switch non gestito`
- **Ignora** — chiude il conflitto

---

### Patch Panel

I patch panel sono dispositivi speciali con gestione visuale delle porte.

1. Creare un dispositivo di tipo **Patch Panel** e assegnarlo a un armadio
2. Aprire **Patch Panel** dal menu → selezionare il panel
3. Visualizzazione a griglia delle porte con colori:
   - 🟢 **Verde** — porta collegata a una porta switch
   - 🟡 **Giallo** — solo stanza di destinazione annotata
   - ⬜ **Grigio** — porta libera

**Per ogni porta è possibile definire:**
| Campo | Esempio |
|-------|---------|
| Etichetta | `PC-SALA-RIUNIONI-01` |
| Stanza di destinazione | `Piano 2 – Sala Riunioni` |
| Collegamento a switch | `SW-CORE / Gi0/12` |
| Note | Qualsiasi annotazione libera |

---

### VLAN

1. **VLAN → Nuova VLAN**
2. Inserire VLAN ID (1–4094), nome, sede (opzionale)
3. Le VLAN vengono associate automaticamente alle interfacce durante la scansione
4. Da una VLAN è possibile vedere tutte le interfacce che la usano e i prefissi IP associati

---

### Prefissi IP (IPAM)

Gestione dei blocchi di indirizzi:

1. **Prefissi IP → Nuovo prefisso**
2. Inserire il blocco CIDR (es. `192.168.20.0/24`)
3. Associare opzionalmente a una sede e/o VLAN
4. La scheda del prefisso mostra:
   - **Utilizzo** — barra percentuale (IP usati / totale)
   - **IP disponibili** — lista dei prossimi indirizzi liberi
   - **IP assegnati** — con dispositivo, interfaccia e sorgente

**Aggiungere un IP manualmente:**
Prefissi IP → selezionare il prefisso → **Aggiungi IP** → inserire indirizzo, dispositivo e interfaccia.

---

### Topologia

La pagina **Topologia** mostra un grafo interattivo force-directed di tutti i dispositivi collegati via cavo:

- **Nodi** = dispositivi, colorati per tipo
- **Archi** = cavi (con tipo: Cat6, Fibra, DAC…)
- **Hover** su un nodo → mostra nome, IP, armadio, sede
- **Filtri** per sede e tipo dispositivo
- Zoom e pan con mouse/trackpad

---

### Storico modifiche (Audit Log)

Ogni creazione, modifica ed eliminazione è registrata con:
- Utente che ha effettuato l'azione
- Data e ora
- Entità modificata (dispositivo, interfaccia, IP…)
- Campo, valore precedente e nuovo valore
- IP del client

Accessibile da **Storico modifiche** — filtrabile per utente, entità e intervallo di date.

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

Tutta la documentazione interattiva è disponibile su:

```
http://<IP_NETHELPER>/api/docs      # Swagger UI
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

### Esempi di utilizzo (n8n / Telegram)

```bash
# Lista dispositivi attivi
GET /api/v1/devices?status=active

# Dispositivi in un armadio specifico
GET /api/v1/devices?cabinet_id=3

# MAC address visti su un dispositivo
GET /api/v1/devices/5/mac-entries

# Tutti i conflitti in attesa
GET /api/v1/conflicts?status=pending

# Avviare una scansione SNMP
POST /api/v1/devices/5/scan
{"scan_type": "snmp_full"}

# Scansione IP range
POST /api/v1/scan-jobs/ip-range
{"start_ip": "192.168.1.1", "end_ip": "192.168.1.254", "ports": [22, 80, 443]}

# Prefissi IP con utilizzo
GET /api/v1/prefixes/1/utilization

# Statistiche dashboard
GET /api/v1/dashboard/stats
```

---

## 🔧 Aggiungere un nuovo vendor

NetHelper supporta un sistema di driver estendibile. Per aggiungere un nuovo vendor (es. Aruba, HP, MikroTik):

1. **Creare il driver** in `backend/app/discovery/drivers/nuovovendor.py`:

```python
from .base import BaseDriver, CollectedData

class NuovoVendorDriver(BaseDriver):
    async def collect(self) -> CollectedData:
        # Implementare la raccolta dati via SSH o SNMP
        ...
```

2. **Registrare il driver** in `backend/app/discovery/vendor_registry.py`:

```python
VENDOR_DRIVERS = {
    "cisco_ios": CiscoIosDriver,
    "unifi":     UnifiDriver,
    "nuovovendor": NuovoVendorDriver,   # ← aggiungere qui
}
```

3. **Inserire il record vendor** nel database (o via interfaccia **Vendor**):

```json
{
  "name": "Nuovo Vendor",
  "slug": "nuovovendor",
  "driver_class": "nuovovendor",
  "snmp_default_community": "public",
  "ssh_default_port": 22
}
```

---

## 📁 Struttura del progetto

```
nethelper/
├── backend/
│   ├── app/
│   │   ├── models/        # Modelli SQLAlchemy
│   │   ├── schemas/       # Schemi Pydantic (request/response)
│   │   ├── routers/       # Endpoint FastAPI
│   │   ├── crud/          # Accesso al database
│   │   ├── discovery/     # SNMP, SSH, driver vendor
│   │   └── tasks/         # Celery worker e beat
│   ├── alembic/           # Migrazioni database
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/    # Componenti React (rack, topologia, patch panel…)
│       └── pages/         # Pagine dell'applicazione
└── deploy/
    ├── nginx/             # Configurazione Nginx
    ├── systemd/           # Servizi systemd (api, worker, beat)
    └── scripts/           # Script installazione automatica
```

---

## 🛠️ Comandi utili post-installazione

```bash
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

## 📄 Licenza

Uso interno aziendale.
