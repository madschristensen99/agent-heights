#!/bin/bash
# Check all URLs and keyHelpUrls in the MCP catalog for 404s and other errors
CATALOG_FILE="shared/mcp-catalog.ts"

echo "=== Extracting URLs from catalog ==="
URLS=$(grep -oP '(?:url|keyHelpUrl):\s*"https?://[^"]+' "$CATALOG_FILE" | sed 's/.*: *"//' | sort -u)

TOTAL=$(echo "$URLS" | wc -l)
echo "Found $TOTAL unique URLs to check"
echo ""

BROKEN=()
ERRORS=()

i=0
while IFS= read -r url; do
  i=$((i + 1))
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 10 -X GET "$url" 2>/dev/null)
  
  if [ "$STATUS" = "404" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "500" ] || [ "$STATUS" = "000" ] || [ "$STATUS" = "502" ] || [ "$STATUS" = "503" ]; then
    echo "[$i/$TOTAL] ❌ $STATUS  $url"
    if [ "$STATUS" = "404" ]; then
      BROKEN+=("$url")
    else
      ERRORS+=("$STATUS|$url")
    fi
  else
    echo "[$i/$TOTAL] ✅ $STATUS  $url"
  fi
done <<< "$URLS"

echo ""
echo "=== SUMMARY ==="
echo "Total URLs checked: $TOTAL"
echo "404s (broken): ${#BROKEN[@]}"
echo "Other errors: ${#ERRORS[@]}"

if [ ${#BROKEN[@]} -gt 0 ]; then
  echo ""
  echo "--- 404 URLs ---"
  for url in "${BROKEN[@]}"; do
    echo "  $url"
  done
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo "--- Other error URLs ---"
  for entry in "${ERRORS[@]}"; do
    echo "  $entry"
  done
fi
