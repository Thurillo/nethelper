#!/usr/bin/env bash
# =============================================================================
# NetHelper – Script di installazione per Debian 13 (LXC Proxmox)
# Eseguire come root all'interno del container LXC
# =============================================================================
set -euo pipefail

# ─── Colori output ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Variabili configurabili ──────────────────────────────────────────────────
APP_USER="nethelper"
APP_DIR="/opt/nethelper"
DB_NAME="nethelper"
DB_USER="nethelper"
REPO_URL="${REPO_URL:-}"           # es: https://github.com/yourorg/nethelper.git
APP_HOST="${APP_HOST:-_}"          # hostname Nginx (default: qualsiasi)

# ─── Controllo root ───────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Eseguire come root (sudo ./install.sh)"

info "╔══════════════════════════════════════════════╗"
info "║        NetHelper – Installazione             ║"
info "╚══════════════════════════════════════════════╝"

# ─── 1. Aggiornamento sistema ─────────────────────────────────────────────────
info "1/10  Aggiornamento pacchetti sistema..."
apt-get update -qq
apt-get upgrade -y -qq

# ─── 2. Dipendenze sistema ────────────────────────────────────────────────────
info "2/10  Installazione dipendenze..."
apt-get install -y -qq \
    python3.12 python3.12-venv python3.12-dev python3-pip \
    libpq-dev libssl-dev libffi-dev build-essential \
    postgresql postgresql-contrib \
    redis-server \
    nginx \
    nodejs npm \
    git curl wget \
    snmp iputils-ping \
    acl

# ─── 3. Utente applicazione ───────────────────────────────────────────────────
info "3/10  Creazione utente $APP_USER..."
id "$APP_USER" &>/dev/null || useradd -r -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
chown "$APP_USER":"$APP_USER" "$APP_DIR"

# ─── 4. Database PostgreSQL ───────────────────────────────────────────────────
info "4/10  Configurazione PostgreSQL..."
systemctl enable --now postgresql

# Genera password casuale se non specificata
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
info "    Password DB generata: $DB_PASS (salvarla in .env!)"

su - postgres -c "psql -tc \"SELECT 1 FROM pg_user WHERE usename='$DB_USER'\"" | grep -q 1 || \
    su - postgres -c "createuser $DB_USER"
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1 || \
    su - postgres -c "createdb $DB_NAME -O $DB_USER"
su - postgres -c "psql -c \"ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';\""

# ─── 5. Redis ─────────────────────────────────────────────────────────────────
info "5/10  Avvio Redis..."
systemctl enable --now redis-server

# ─── 6. Codice sorgente ───────────────────────────────────────────────────────
info "6/10  Installazione codice sorgente..."
if [[ -n "$REPO_URL" ]]; then
    su - "$APP_USER" -c "git clone '$REPO_URL' '$APP_DIR'"
else
    warn "REPO_URL non impostato – copiare manualmente i file in $APP_DIR"
    warn "Poi rieseguire questo script con REPO_URL=... ./install.sh"
fi

# ─── 7. Backend Python ───────────────────────────────────────────────────────
info "7/10  Installazione backend Python..."
su - "$APP_USER" -c "
    python3.12 -m venv $APP_DIR/venv
    source $APP_DIR/venv/bin/activate
    pip install --quiet --upgrade pip
    pip install --quiet -r $APP_DIR/backend/requirements.txt
"

# Genera SECRET_KEY e ENCRYPTION_KEY casuali (64 hex chars = 32 byte ciascuna)
SECRET_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Crea .env da .env.example
if [[ ! -f "$APP_DIR/backend/.env" ]]; then
    cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
    sed -i "s|postgresql+asyncpg://nethelper:CHANGE_ME@localhost/nethelper|postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME|g" "$APP_DIR/backend/.env"
    sed -i "s|CHANGE_THIS_TO_A_RANDOM_64_CHAR_HEX_STRING|$SECRET_KEY|g" "$APP_DIR/backend/.env"
    sed -i "s|CHANGE_THIS_TO_A_RANDOM_64_CHAR_HEX_KEY|$ENCRYPTION_KEY|g" "$APP_DIR/backend/.env"
    chmod 600 "$APP_DIR/backend/.env"
    chown "$APP_USER":"$APP_USER" "$APP_DIR/backend/.env"
    info "    File .env creato in $APP_DIR/backend/.env"
fi

# Esegui migrazioni Alembic
su - "$APP_USER" -c "
    source $APP_DIR/venv/bin/activate
    cd $APP_DIR/backend
    PYTHONPATH=$APP_DIR/backend alembic upgrade head
"
info "    Migrazioni database completate."

# Crea utente admin iniziale
info "    Creazione utente admin..."
su - "$APP_USER" -c "
    source $APP_DIR/venv/bin/activate
    cd $APP_DIR/backend
    python -m app.scripts.create_admin
" || warn "Creazione admin saltata (già esistente o errore interattivo)"

# ─── 8. Frontend Node.js ──────────────────────────────────────────────────────
info "8/10  Build frontend..."
su - "$APP_USER" -c "
    cd $APP_DIR/frontend
    npm install --silent
    npm run build
"
info "    Frontend compilato in $APP_DIR/frontend/dist/"

# ─── 9. Systemd services ──────────────────────────────────────────────────────
info "9/10  Installazione servizi systemd..."
cp "$APP_DIR/deploy/systemd/nethelper-api.service"    /etc/systemd/system/
cp "$APP_DIR/deploy/systemd/nethelper-worker.service" /etc/systemd/system/
cp "$APP_DIR/deploy/systemd/nethelper-beat.service"   /etc/systemd/system/

# Fix: percorso APP_DIR nei file service (già /opt/nethelper di default)
systemctl daemon-reload
systemctl enable --now nethelper-api nethelper-worker nethelper-beat

sleep 2
systemctl is-active nethelper-api    && info "    nethelper-api    ✓ attivo" || warn "nethelper-api non attivo"
systemctl is-active nethelper-worker && info "    nethelper-worker ✓ attivo" || warn "nethelper-worker non attivo"
systemctl is-active nethelper-beat   && info "    nethelper-beat   ✓ attivo" || warn "nethelper-beat non attivo"

# ─── 10. Nginx ───────────────────────────────────────────────────────────────
info "10/10 Configurazione Nginx..."
cp "$APP_DIR/deploy/nginx/nethelper.conf" /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/nethelper.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default   # rimuovi default

# Sostituisce placeholder hostname
sed -i "s|server_name _;|server_name $APP_HOST;|g" /etc/nginx/sites-available/nethelper.conf

nginx -t && systemctl enable --now nginx && systemctl reload nginx
info "    Nginx configurato e avviato."

# ─── Riepilogo finale ─────────────────────────────────────────────────────────
HOST_IP=$(hostname -I | awk '{print $1}')
echo ""
info "╔══════════════════════════════════════════════╗"
info "║   Installazione completata con successo!     ║"
info "╠══════════════════════════════════════════════╣"
info "║  URL:          http://$HOST_IP              "
info "║  API Docs:     http://$HOST_IP/api/docs     "
info "║  DB password:  $DB_PASS                     "
info "║  .env:         $APP_DIR/backend/.env        "
info "╚══════════════════════════════════════════════╝"
info ""
info "Comandi utili:"
info "  journalctl -u nethelper-api    -f   # log API"
info "  journalctl -u nethelper-worker -f   # log worker Celery"
info "  journalctl -u nethelper-beat   -f   # log Beat"
info "  systemctl restart nethelper-api     # riavvia API"
