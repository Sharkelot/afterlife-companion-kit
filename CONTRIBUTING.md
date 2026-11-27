# Contributing

1. Keep changes portable; do not add private domains, local filesystem paths, internal network addresses, credentials, generated model weights, or unapproved reference art.
2. Do not add user voice recordings or personal information to fixtures.
3. Add or update automated tests for behavior changes.
4. Run `make check` before opening a pull request.
5. Keep documentation truthful about verified and experimental behavior. In particular, do not call the backend production-ready or claim a desktop installer is included.

Pull requests are checked by Ruff, pytest, Node's JavaScript parser, and Gitleaks.