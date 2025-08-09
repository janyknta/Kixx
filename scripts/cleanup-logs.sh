#!/bin/bash

# Script to remove console logs from production builds
# Run this before building for production

echo "Cleaning up console logs for production build..."

# Find all TypeScript and JavaScript files in src directory
find src -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | while read file; do
  # Skip Logger.ts as it needs console for development
  if [[ $file == *"Logger.ts"* ]]; then
    continue
  fi
  
  # Remove console.log, console.info, console.warn, console.error
  # Keep console.assert for debugging
  sed -i.bak -E '/console\.(log|info|warn|error)/d' "$file"
  
  # Remove the backup file
  rm -f "$file.bak"
done

echo "Console logs cleanup complete!"
echo "Note: Logger service will still work in development mode"