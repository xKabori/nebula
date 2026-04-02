#!/bin/bash

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/etudiant/nebula/backups"

mkdir -p $BACKUP_DIR

# Trouver le container PostgreSQL
PG_CONTAINER=$(docker ps -q -f name=nebula_postgres)

# Dump de la base
docker exec $PG_CONTAINER pg_dump -U nebula nebula > $BACKUP_DIR/nebula_$DATE.sql

# Garder seulement les 7 dernières sauvegardes
ls -t $BACKUP_DIR/nebula_*.sql | tail -n +8 | xargs -r rm

echo "Sauvegarde créée : $BACKUP_DIR/nebula_$DATE.sql"
