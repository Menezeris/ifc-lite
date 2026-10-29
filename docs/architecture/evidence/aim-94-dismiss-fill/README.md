# AIM #94 s výplňou miestnosti z #164: dôkaz, že test chytí revert

Test-only zmena (`apps/viewer/src/aim/focus-dismiss-fill.test.ts`), produkčný kód sa nemení.
Revert oracle tu nemá čo vrátiť, preto je dôkaz ručný: do `visibility-commands.ts` sa vložila
chyba, test bežal (`npx tsx --import ./src/test/vite-module-hooks.mjs --test src/aim/focus-dismiss-fill.test.ts`),
kód sa vrátil. Spustené 2026-10-29 na základe `4b0707e7` (vetva #164).

| Mutácia | Výsledok testu |
|---|---|
| bez mutácie | 6 z 6 prechádza |
| `clearFocus` vráti farby, ale nevymaže výplň (`focused = []` namiesto `forgetFocus()`) | 3 z 6 zlyhajú (klik, Esc, CLEAR_FOCUS/SELECT/RESET_COLORS nechajú oranžovú výplň) |
| Esc nič nerobí (`isDismissKey` vetva vypustená) | 1 z 6 zlyhá |
| klik na plátno nič nerobí (`isClickGesture` vetva vypustená) | 1 z 6 zlyhá |
