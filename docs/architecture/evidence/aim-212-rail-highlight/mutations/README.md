# AIM #212: dôkazy mutácií (aimSideDock)

Test `apps/viewer/src/aim/aimSideDock.test.ts` importuje nový modul, takže revert oracle by bol
INCONCLUSIVE; mutácie sú ručne zapísané mutant -> opravené (`git diff -R`).

| Patch | Mutácia | Výsledok testu s mutantom |
|---|---|---|
| `01-collapsed-guard.patch` | odstránený návrat pri `sidebarMode === 'collapsed'` | 2 testy padajú |
| `02-properties-fallback.patch` | odstránený návrat stĺpca na vlastnosti pri odpojenom aktívnom paneli | 2 testy padajú |

Overené lokálne: `git apply -R <patch>` + `npx tsx --import ./src/test/vite-module-hooks.mjs --test
src/aim/aimSideDock.test.ts` -> `fail 2`, po obnove `fail 0`. `check-test-revert-oracle.mjs` sa v cloud
session nedal spustiť (`tsx` nenájdený, bez `pnpm install`), preto ho spustí rýchle CI.
