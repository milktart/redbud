#!/bin/bash

# Script to replace console.log/error/warn with Winston logger in controllers
# Phase 2 - Code Quality Improvement

CONTROLLERS_DIR="/home/user/bluebonnet/controllers"

# Find all JS files in controllers with console statements
files=$(grep -rl "console\." "$CONTROLLERS_DIR" --include="*.js")

for file in $files; do
  echo "Processing $file..."

  # Check if file already has logger import
  if ! grep -q "const logger = require.*logger" "$file"; then
    # Find the position to insert logger import (after other requires)
    # Insert after the last require statement
    sed -i "/^const.*= require/a const logger = require('../utils/logger');" "$file"
  fi

  # Replace console.error with logger.error
  sed -i "s/console\.error(/logger.error(/g" "$file"

  # Replace console.warn with logger.warn
  sed -i "s/console\.warn(/logger.warn(/g" "$file"

  # Replace console.log with logger.info
  sed -i "s/console\.log(/logger.info(/g" "$file"

  echo "✓ Completed $file"
done

echo ""
echo "Summary:"
echo "Files processed: $(echo "$files" | wc -w)"
echo "Replacements made:"
grep -r "logger\." "$CONTROLLERS_DIR" --include="*.js" | wc -l
