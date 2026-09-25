#!/bin/bash
# Restores a Firestore backup created by backup-dev.sh into the dev project.
# Wipes the app's data collections first (NOT "users" — keeps admin/staff
# access intact across test cycles) and imports the backup over them.
set -e

PROJECT="turnero-1212-dev"
BUCKET="gs://turnero-1212-dev.appspot.com/backups"
TIMESTAMP="$1"

if [ -z "$TIMESTAMP" ]; then
  echo "Uso: ./restore-dev.sh <timestamp>"
  echo ""
  echo "Backups disponibles:"
  gcloud storage ls "$BUCKET/" --project="$PROJECT"
  exit 1
fi

SOURCE="$BUCKET/$TIMESTAMP"
COLLECTIONS="sectors,queues,terminals,turns,appointments,appointmentServices,appointmentBlocks,appointmentCalls,rateLimits"

echo "Esto va a BORRAR los datos actuales de estas colecciones en $PROJECT:"
echo "  $COLLECTIONS"
echo "y reemplazarlos por el backup: $SOURCE"
read -p "Escribi 'si' para confirmar: " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Cancelado."
  exit 1
fi

echo "Borrando colecciones actuales..."
gcloud firestore bulk-delete --collection-ids="$COLLECTIONS" --project="$PROJECT"

echo "Restaurando desde $SOURCE ..."
gcloud firestore import "$SOURCE" --project="$PROJECT"

echo "Listo."
