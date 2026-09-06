#!/usr/bin/env bash
# Prueba la Web App desde la terminal, antes de armar el atajo en el iPhone.
#
#   ./tools/probar-api.sh <URL_DE_LA_WEB_APP> <TOKEN>
#
# Hace tres cosas: ping, lee el catalogo de subcategorias y registra
# una transaccion de prueba de $1 en la primera subcategoria de gastos.

set -euo pipefail

URL="${1:?Falta la URL de la Web App}"
TOKEN="${2:?Falta el token}"

echo "==> 1. Ping"
curl -sS -L "${URL}?token=${TOKEN}&accion=ping"
echo; echo

echo "==> 2. Catalogo de subcategorias del mes"
curl -sS -L "${URL}?token=${TOKEN}&accion=catalogo"
echo; echo

echo "==> 3. Registrar \$1 de prueba (borralo despues de la hoja)"
curl -sS -L "$URL" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"${TOKEN}\",\"monto\":1,\"subcategoria\":\"groceries\",\"nota\":\"prueba desde la terminal\"}"
echo; echo

echo "==> 4. Resumen del mes"
curl -sS -L "${URL}?token=${TOKEN}&accion=resumen"
echo
