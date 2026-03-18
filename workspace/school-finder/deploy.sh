#!/bin/bash
# Deploy school-finder to Vercel
# Run from the school-finder directory

echo "Building static export..."
node node_modules/next/dist/bin/next build

echo ""
echo "Deploying to Vercel..."
npx vercel out/ --prod --yes

echo ""
echo "Done! Your site should be live at the URL above."
