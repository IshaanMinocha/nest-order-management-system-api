#!/bin/sh
set -e

echo "🚀 Starting Order Management System..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Try to run seed (skip if it fails)
echo "🌱 Seeding database..."
echo "⚠️ Skipping seeding for now - will be handled manually"

# Start the application
echo "🎯 Starting NestJS application..."
exec "$@"
