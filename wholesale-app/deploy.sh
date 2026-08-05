#!/bin/bash
set -e

echo "================================================"
echo "   WholesalePro — Firebase Deployment Script"
echo "================================================"
echo ""

# Step 1: Check Firebase CLI
if ! command -v firebase &> /dev/null; then
  echo "Installing Firebase CLI..."
  npm install -g firebase-tools
fi

echo "Firebase CLI version: $(firebase --version)"
echo ""

# Step 2: Login
echo "Logging in to Firebase (browser will open)..."
firebase login

# Step 3: Build
echo ""
echo "Building production bundle..."
npm run build
echo "✓ Build complete"

# Step 4: Deploy
echo ""
echo "Deploying to Firebase Hosting (project: prabhusweets-a2e12)..."
firebase deploy --only hosting

echo ""
echo "================================================"
echo "✓ Deployment complete!"
echo "  Your app is live at:"
echo "  https://prabhusweets-a2e12.web.app"
echo "================================================"
