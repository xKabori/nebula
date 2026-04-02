#!/bin/bash

REGISTRY="10.100.5.145:5000"
VERSION=${1:-2.0}

echo "=== Scan de sécurité Nebula v$VERSION ==="

for SERVICE in auth-service post-service timeline-service notification-service media-service; do
  echo "--- Scan $SERVICE ---"
  trivy image --severity HIGH,CRITICAL $REGISTRY/$SERVICE:$VERSION
done

echo "=== Scan terminé ==="
