# Security policy

## Status

The FastAPI backend and `publicmode.py` controls are an experimental self-hosted reference, not a production-ready public service. The public-mode implementation has known integration gaps: the widget does not provide a Turnstile challenge/token flow, CORS/CSP behavior needs deployment-specific testing, and content-length limits do not replace robust streaming request-size enforcement. Do not expose it to the public internet or enable `GUIDE_PUBLIC_MODE=1` as a production control without an independent security review and additional hardening.

## Safe evaluation

- Use the static demo with `data-mock="1"` to evaluate the widget without an API.
- Keep the backend bound to `localhost` and restrict access while testing.
- Use a dedicated low-privilege OpenAI-compatible API key via a secret manager/environment, never source control.
- Do not put private knowledge, credentials, internal addresses, or personal information in tours or `GUIDE_SITE_MAP`.
- Treat prompt instructions, sanitization, CORS, and rate limits as defense-in-depth only—not as security boundaries.
- Obtain consent and rights for voice recordings; do not clone a voice without explicit authorization.

## Reporting

Please report vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting feature when available. Do not publish exploit details before a fix is available.