# Asset and license inventory — 2026-11-05

This is provenance inspection, not proof of legal title or a distribution license for the whole project.

| Asset/dependency | Repository evidence / purpose | Rights status / action |
|---|---|---|
| React / React DOM / Scheduler | Installed lockfile runtime packages and LICENSE files | MIT notices retained in `apps/web/public/THIRD-PARTY-NOTICES.txt`; exact package license text copied, not invented |
| lucide-react | Runtime icons; installed LICENSE | ISC with Feather/MIT attribution in installed package. Exact installed notice retained in third-party notices |
| Web starter Walking/Reading/Water SVGs | Hand-authored source paths in `apps/web/src/visuals.tsx`, no fetched third-party illustration files | Source provenance visible but ownership/derivative rights still require owner confirmation, including supplied concept image |
| PWA icons / native app icon | `public/icon.svg`, generated PNGs and `scripts/make_icon.py`; native resource | Verify owner entitlement to ship branding/design, source and generated sizes; no external brand ownership assumed |
| User-supplied concept/reference screenshots | Conversation references, not copied into production image assets | User supplying a reference does not by itself establish commercial reuse rights; owner to confirm authorization/acceptable derivation |
| User-selected photos and exported backups | Local file bytes / canvas-normalized derivatives; no stock service or cloud upload | User content; product should not solicit prohibited/sensitive uploads. Final terms/privacy need suitable rights treatment, not invented assignment |
| System SF Symbols / fonts | SwiftUI/system fonts, native symbol names; web system font stacks | Review current Apple/platform terms for intended use. No bundled external web font files |
| Synthetic EXIF test JPEG | `apps/web/tests/fixtures/orientation-6.jpg`, generated colored fixture, not a user photograph | Test-only synthetic image; not deployed as product artwork |
| Vite, Vitest, Playwright, TypeScript and types | Pinned development/test/build packages | Not all code ships as runtime. Lockfile and installed license files are audit inputs; owner should review tooling redistribution if distributing tooling/source |
| Project source license | No top-level LICENSE found | Owner must choose and confirm project ownership/distribution terms; no open-source license added without that decision |

The runtime notice is reachable through About → Local data & privacy → Privacy, terms & support information. It is a third-party notice, not a Privacy Policy/Terms substitute. Update it whenever runtime packages change. No dependency advisory was treated as a license clearance.
