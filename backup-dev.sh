#!/bin/bash
# Exports the current Firestore data of the dev project to GCS, timestamped.
set -e

PROJECT="turnero-1212-dev"
BUCKET="gs://turnero-1212-dev.appspot.com/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DEST="$BUCKET/$TIMESTAMP"

echo "Exportando Firestore ($PROJECT) a $DEST ..."
gcloud firestore export "$DEST" --project="$PROJECT"

echo ""
echo "Backup listo: $DEST"
echo "Para restaurarlo despues: ./restore-dev.sh $TIMESTAMP"
