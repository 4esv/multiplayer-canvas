#!/usr/bin/env bash
#
# Render the Open Graph / social cards into src/static/img/og/.
#
#   bash scripts/og/render.sh                  # every card
#   bash scripts/og/render.sh --only about,feed  # just these
#
# One 1200x630 PNG per page, drawn by scripts/og/render.mjs: the site's own
# parts (tokens, kit, pixel title, marks, the page's own figure), laid out by
# scripts/og/cards.mjs and scripts/og/card.css, drawn by Chrome and put on the
# ramp. Every page's card is derived from the content and the canvas, so there
# is no manifest to keep in step and a content edit is a rerun.
#
# THE STANDARD: every page on the site MUST have an OG card (test/og.test.js).
# A new door is one entry in cards.mjs; a new content entry is a card of its
# own with no entry at all.
#
# Needs Chrome (CHROME_PATH, or the usual places) and `npm ci` done.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
exec node scripts/og/render.mjs "$@"
