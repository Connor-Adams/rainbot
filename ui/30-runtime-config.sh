#!/bin/sh
# Rewrites runtime-config.js from the environment on every container start, so
# one built image can point at any API host without a rebuild. The nginx image
# runs every executable /docker-entrypoint.d/*.sh before starting nginx.
#
# ui/public/runtime-config.js is the committed placeholder Vite copies into
# dist/ (index.html loads it as a module before main.tsx); this overwrites it.
# The dist dir is COPY --chown'd to the unprivileged nginx uid so this write
# succeeds without root.
#
# Empty is the same as unset to the consumers — ui/src/lib/api.ts and main.tsx
# both fall back when the value is falsy.
set -eu

CONFIG_JS=/usr/share/nginx/html/runtime-config.js

# Values are URLs in practice, but a stray quote or backslash would produce a
# syntax error that takes the whole app down, so escape both.
esc() {
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > "${CONFIG_JS}" <<EOF
(function () {
  globalThis.__RAINBOT_CONFIG__ = {
    VITE_API_BASE_URL: "$(esc "${VITE_API_BASE_URL:-}")",
    VITE_AUTH_BASE_URL: "$(esc "${VITE_AUTH_BASE_URL:-}")",
    VITE_DEBUG_LOGS: "$(esc "${VITE_DEBUG_LOGS:-}")",
  };
})();
EOF

echo "runtime-config.js written (VITE_API_BASE_URL=${VITE_API_BASE_URL:-<unset>})"
