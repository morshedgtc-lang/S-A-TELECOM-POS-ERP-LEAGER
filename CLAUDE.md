# CLAUDE.md

@AGENTS.md

## Claude-specific notes

- Before changing the database, read `docs/ERD.md` and the invariants table in it.
- Before porting a legacy feature, read the matching section in `docs/LEGACY_ANALYSIS.md` and search `legacy/SA_Telecom_POS_v1_1.html` for the feature's function names. The file is large, so use targeted search rather than reading it whole.
- For backend changes, run `npm test` in `backend/` before finishing. For frontend changes, run `npm run build` in `frontend/`.
- Do not edit `legacy/`.
