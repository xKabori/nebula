#!/bin/bash

VERSION=${1:-latest}
REGISTRY="10.100.5.145:5000"
BASE="/home/etudiant/nebula/services"

echo "=== Déploiement Nebula v$VERSION ==="

for SERVICE in auth-service post-service timeline-service notification-service media-service; do
  echo "--- Build $SERVICE ---"
  docker build -t $REGISTRY/$SERVICE:$VERSION $BASE/$SERVICE
  docker push $REGISTRY/$SERVICE:$VERSION
done

for SERVICE in auth-service post-service timeline-service notification-service media-service; do
  echo "--- Update $SERVICE ---"
  docker service update --image $REGISTRY/$SERVICE:$VERSION nebula_$SERVICE
done

echo "=== Déploiement terminé ==="
docker service ls
