#!/bin/sh
set -e

echo "Applying database migrations..."
npx drizzle-kit migrate --config=server/drizzle.config.ts

echo "Starting Stock Scout..."
exec "$@"
