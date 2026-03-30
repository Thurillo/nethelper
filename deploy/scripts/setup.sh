#!/usr/bin/env bash
# =============================================================================
# NetHelper – Script di gestione per Debian 13 (LXC Proxmox)
# Eseguire come root all'interno del container LXC
# =============================================================================
set -euo pipefail

# ─── Colori output ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
step()    { echo -e "${CYAN}${BOLD}───── $* ${NC}"; }

# ─── Configurazione ───────────────────────────────────────────────────────────
APP_USER="nethelper"
APP_DIR="/opt/nethelper"
DB_NAME="nethelper"
DB_USER="nethelper"
REPO_URL="https://github.com/Thurillo/NetHelper.git"

# ─── Funzione: verifica root ──────────────────────────────────────────────────
check_root() {
    [[ $EUID -eq 0 ]] || error "Eseguire come root: sudo bash setup.sh"
}

# ─── Funzione: verifica installazione esistente ───────────────────────────────
check_installed() {
    [[ -d "$APP_DIR/.git" ]] || error "NetHelper non trovato in $APP_DIR. Eseguire prima l'installazione (opzione 1)."
    [[ -d "$APP_DIR/venv" ]] || error "Virtualenv Python non trovato. Eseguire prima l'installazione (opzione 1)."
}

# ─── MENU ─────────────────────────────────────────────────────────────────────
show_menu() {
    clear
    echo -e "${CYAN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════════╗"
    echo "  ║           NetHelper  –  Gestione                ║"
    echo "  ╠══════════════════════════════════════════════════╣"
    echo "  ║                                                  ║"
    echo "  ║   1)  Nuova installazione                        ║"
    echo "  ║   2)  Aggiornamento  (mantiene tutti i dati)     ║"
    echo "  ║   3)  Cambia password utente                     ║"
    echo "  ║   0)  Esci                                       ║"
    echo "  ║                                                  ║"
    echo "  ╚══════════════════════════════════════════════════╝"
    echo -e "${NC}"
    read -rp "  Scegli un'opzione [0-3]: " SCELTA
}

# ═════════════════════════════════════════════════════════════════════════════
# OPZIONE 1 — NUOVA INSTALLAZIONE
# ═════════════════════════════════════════════════════════════════════════════
do_install() {
    check_root

    echo ""
    info "Avvio installazione NetHelper su Debian 13..."
    echo ""

    # ── 1. Aggiornamento sistema ───────────────────────────────────────────────
    step "1/11  Aggiornamento pacchetti sistema"
    apt-get update -qq
    apt-get upgrade -y -qq
    ok "Sistema aggiornato."

    # ── 2. Dipendenze ─────────────────────────────────────────────────────────
    step "2/11  Installazione dipendenze"
    apt-get install -y -qq \
        git curl wget \
        python3 python3-venv python3-dev python3-pip \
        libpq-dev libssl-dev libffi-dev build-essential \
        postgresql postgresql-contrib \
        redis-server \
        nginx \
        nodejs npm \
        snmp iputils-ping \
        acl
    ok "Dipendenze installate."

    # ── 3. Utente applicazione ────────────────────────────────────────────────
    step "3/11  Utente di sistema"
    if ! id "$APP_USER" &>/dev/null; then
        useradd -r -m -s /bin/bash "$APP_USER"
        ok "Utente '$APP_USER' creato."
    else
        ok "Utente '$APP_USER' già esistente."
    fi
    mkdir -p "$APP_DIR"
    chown "$APP_USER":"$APP_USER" "$APP_DIR"

    # ── 4. PostgreSQL ─────────────────────────────────────────────────────────
    step "4/11  Database PostgreSQL"
    systemctl enable --now postgresql
    DB_PASS="$(openssl rand -hex 16)"
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1 || \
        su - postgres -c "createuser $DB_USER"
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1 || \
        su - postgres -c "createdb $DB_NAME -O $DB_USER"
    su - postgres -c "psql -c \"ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';\""
    ok "Database pronto. Password DB: ${YELLOW}$DB_PASS${NC}"

    # ── 5. Redis ─────────────────────────────────────────────────────────────
    step "5/11  Redis"
    systemctl enable --now redis-server
    ok "Redis avviato."

    # ── 6. Codice sorgente ────────────────────────────────────────────────────
    step "6/11  Download codice sorgente"
    if [[ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
        su - "$APP_USER" -c "git clone '$REPO_URL' '$APP_DIR'"
        ok "Repository clonato."
    else
        warn "La directory $APP_DIR non è vuota — skip clone. Contenuto esistente mantenuto."
    fi

    # ── 7. Backend Python ─────────────────────────────────────────────────────
    step "7/11  Backend Python"
    su - "$APP_USER" -c "
        python3 -m venv $APP_DIR/venv
        source $APP_DIR/venv/bin/activate
        pip install --quiet --upgrade pip
        pip install --quiet -r $APP_DIR/backend/requirements.txt
    "
    ok "Dipendenze Python installate."

    # ── 8. File .env ──────────────────────────────────────────────────────────
    step "8/11  Configurazione ambiente"
    SECRET_KEY="$(openssl rand -hex 32)"
    ENCRYPTION_KEY="$(openssl rand -hex 32)"

    if [[ ! -f "$APP_DIR/backend/.env" ]]; then
        cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
        sed -i "s|postgresql+asyncpg://nethelper:CHANGE_ME@localhost/nethelper|postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME|g" \
            "$APP_DIR/backend/.env"
        # Sostituisci placeholder chiavi (64 hex chars = 32 byte, AES-256)
        sed -i "s|CHANGE_THIS_TO_A_RANDOM_64_CHAR_HEX_STRING|$SECRET_KEY|g" "$APP_DIR/backend/.env"
        sed -i "s|CHANGE_THIS_TO_A_RANDOM_64_CHAR_HEX_KEY|$ENCRYPTION_KEY|g" "$APP_DIR/backend/.env"
        chmod 600 "$APP_DIR/backend/.env"
        chown "$APP_USER":"$APP_USER" "$APP_DIR/backend/.env"
        ok "File .env creato."
    else
        warn ".env già esistente — non sovrascritto."
    fi

    # ── 9. Migrazioni + seed ──────────────────────────────────────────────────
    step "9/11  Database: migrazioni e dati iniziali"
    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        cd $APP_DIR/backend
        PYTHONPATH=$APP_DIR/backend alembic upgrade head
    "
    ok "Migrazioni completate."

    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        cd $APP_DIR/backend
        python -m app.scripts.seed_vendors
    "
    ok "Vendor predefiniti inseriti."

    # ── Credenziali primo admin ───────────────────────────────────────────────
    echo ""
    echo -e "${CYAN}${BOLD}  Creazione primo utente amministratore${NC}"
    echo ""

    while true; do
        read -rp "  Username admin: " ADMIN_USER
        [[ -n "$ADMIN_USER" ]] && break
        warn "Lo username non può essere vuoto."
    done

    while true; do
        read -rsp "  Password admin: " ADMIN_PASS; echo ""
        read -rsp "  Conferma password: " ADMIN_PASS2; echo ""
        if [[ "$ADMIN_PASS" == "$ADMIN_PASS2" ]]; then
            [[ -n "$ADMIN_PASS" ]] && break
            warn "La password non può essere vuota."
        else
            warn "Le password non corrispondono. Riprovare."
        fi
    done

    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        cd $APP_DIR/backend
        python -m app.scripts.create_admin --username '$ADMIN_USER' --password '$ADMIN_PASS'
    "
    ok "Utente admin '$ADMIN_USER' creato."

    # ── 10. Frontend ──────────────────────────────────────────────────────────
    step "10/11 Build frontend"
    su - "$APP_USER" -c "
        cd $APP_DIR/frontend
        npm install --silent
        npm run build
    "
    ok "Frontend compilato in $APP_DIR/frontend/dist/"

    # ── 11. Systemd + Nginx ───────────────────────────────────────────────────
    step "11/11 Systemd + Nginx"
    cp "$APP_DIR/deploy/systemd/nethelper-api.service"    /etc/systemd/system/
    cp "$APP_DIR/deploy/systemd/nethelper-worker.service" /etc/systemd/system/
    cp "$APP_DIR/deploy/systemd/nethelper-beat.service"   /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable --now nethelper-api nethelper-worker nethelper-beat
    sleep 2
    systemctl is-active nethelper-api    &>/dev/null && ok "nethelper-api    attivo" || warn "nethelper-api non attivo"
    systemctl is-active nethelper-worker &>/dev/null && ok "nethelper-worker attivo" || warn "nethelper-worker non attivo"
    systemctl is-active nethelper-beat   &>/dev/null && ok "nethelper-beat   attivo" || warn "nethelper-beat non attivo"

    # Permessi ICMP per ping da processo non-root (necessario per scan IP range)
    setcap cap_net_raw+p "$(which ping)" 2>/dev/null && ok "Permessi ICMP (setcap) configurati" || warn "setcap non disponibile — il ping potrebbe non funzionare nelle scan"

    cp "$APP_DIR/deploy/nginx/nethelper.conf" /etc/nginx/sites-available/
    ln -sf /etc/nginx/sites-available/nethelper.conf /etc/nginx/sites-enabled/nethelper.conf
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl enable --now nginx && systemctl reload nginx
    ok "Nginx configurato."

    # ── Riepilogo ─────────────────────────────────────────────────────────────
    HOST_IP="$(hostname -I | awk '{print $1}')"
    echo ""
    echo -e "${GREEN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════════╗"
    echo "  ║      Installazione completata con successo!      ║"
    echo "  ╠══════════════════════════════════════════════════╣"
    echo -e "  ║  Accesso:   ${CYAN}http://$HOST_IP${GREEN}                     "
    echo -e "  ║  API Docs:  ${CYAN}http://$HOST_IP/api/docs${GREEN}            "
    echo -e "  ║  Admin:     ${CYAN}$ADMIN_USER${GREEN}                          "
    echo -e "  ║  Password DB salvata in: ${CYAN}$APP_DIR/backend/.env${GREEN}  "
    echo "  ╠══════════════════════════════════════════════════╣"
    echo "  ║  Comandi utili:                                  ║"
    echo "  ║    journalctl -u nethelper-api -f                ║"
    echo "  ║    journalctl -u nethelper-worker -f             ║"
    echo "  ║    systemctl restart nethelper-api               ║"
    echo "  ╚══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ═════════════════════════════════════════════════════════════════════════════
# OPZIONE 2 — AGGIORNAMENTO
# ═════════════════════════════════════════════════════════════════════════════
do_update() {
    check_root
    check_installed

    echo ""
    info "Avvio aggiornamento NetHelper..."
    echo ""

    # ── Arresto servizi ───────────────────────────────────────────────────────
    step "1/6  Arresto servizi"
    systemctl stop nethelper-api nethelper-worker nethelper-beat 2>/dev/null || true
    ok "Servizi fermati."

    # ── Aggiornamento codice ──────────────────────────────────────────────────
    step "2/6  Aggiornamento codice sorgente"
    su - "$APP_USER" -c "git -C '$APP_DIR' pull --ff-only" || \
        error "git pull fallito. Risolvere eventuali conflitti manualmente."
    VERSIONE="$(su - "$APP_USER" -c "git -C '$APP_DIR' log --oneline -1")"
    ok "Codice aggiornato: $VERSIONE"

    # ── Dipendenze Python ─────────────────────────────────────────────────────
    step "3/6  Aggiornamento dipendenze Python"
    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        pip install --quiet --upgrade pip
        pip install --quiet -r $APP_DIR/backend/requirements.txt
    "
    ok "Dipendenze Python aggiornate."

    # ── Migrazioni + seed vendor ──────────────────────────────────────────────
    step "4/6  Migrazioni database"
    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        cd $APP_DIR/backend
        PYTHONPATH=$APP_DIR/backend alembic upgrade head
    "
    ok "Migrazioni completate."

    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        cd $APP_DIR/backend
        python -m app.scripts.seed_vendors
    "
    ok "Profili vendor aggiornati."

    # ── Build frontend ────────────────────────────────────────────────────────
    step "5/6  Build frontend"
    su - "$APP_USER" -c "
        cd $APP_DIR/frontend
        npm install --silent
        npm run build
    "
    ok "Frontend compilato."

    # ── Riavvio servizi ───────────────────────────────────────────────────────
    step "6/6  Riavvio servizi"
    cp "$APP_DIR/deploy/systemd/nethelper-api.service"    /etc/systemd/system/
    cp "$APP_DIR/deploy/systemd/nethelper-worker.service" /etc/systemd/system/
    cp "$APP_DIR/deploy/systemd/nethelper-beat.service"   /etc/systemd/system/
    systemctl daemon-reload
    systemctl start nethelper-api nethelper-worker nethelper-beat
    sleep 2
    systemctl is-active nethelper-api    &>/dev/null && ok "nethelper-api    attivo" || warn "nethelper-api non attivo"
    systemctl is-active nethelper-worker &>/dev/null && ok "nethelper-worker attivo" || warn "nethelper-worker non attivo"
    systemctl is-active nethelper-beat   &>/dev/null && ok "nethelper-beat   attivo" || warn "nethelper-beat non attivo"

    echo ""
    echo -e "${GREEN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════════╗"
    echo "  ║       Aggiornamento completato con successo!     ║"
    echo -e "  ║  Versione: ${CYAN}$VERSIONE${GREEN}"
    echo "  ║  I dati esistenti sono stati preservati.         ║"
    echo "  ╚══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ═════════════════════════════════════════════════════════════════════════════
# OPZIONE 3 — CAMBIA PASSWORD UTENTE
# ═════════════════════════════════════════════════════════════════════════════
do_change_password() {
    check_root
    check_installed

    echo ""
    echo -e "${CYAN}${BOLD}  Cambio password utente NetHelper${NC}"
    echo ""

    read -rp "  Username: " TARGET_USER
    [[ -n "$TARGET_USER" ]] || error "Username non può essere vuoto."

    while true; do
        read -rsp "  Nuova password: " NEW_PASS; echo ""
        read -rsp "  Conferma password: " NEW_PASS2; echo ""
        if [[ "$NEW_PASS" == "$NEW_PASS2" ]]; then
            [[ -n "$NEW_PASS" ]] && break
            warn "La password non può essere vuota."
        else
            warn "Le password non corrispondono. Riprovare."
        fi
    done

    su - "$APP_USER" -c "
        source $APP_DIR/venv/bin/activate
        cd $APP_DIR/backend
        python -m app.scripts.change_password --username '$TARGET_USER' --password '$NEW_PASS'
    " && ok "Password aggiornata per '$TARGET_USER'." || error "Impossibile aggiornare la password."
    echo ""
}

# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
main() {
    show_menu
    case "$SCELTA" in
        1) do_install ;;
        2) do_update ;;
        3) do_change_password ;;
        0) echo ""; info "Uscita."; exit 0 ;;
        *) warn "Opzione non valida: '$SCELTA'"; sleep 1; main ;;
    esac
}

main
