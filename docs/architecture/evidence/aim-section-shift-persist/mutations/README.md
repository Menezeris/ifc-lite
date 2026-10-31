# Mutacia: posun rezu vydrzi (sectionUnderlays.ts)

`pending-keep-removed.patch` (mutant -> opraveny stav): `setSectionRegistry` bez vetvy `pending`
(register sa prebuduje naslepo z hosta).

Pozorovane lokalne rucne (`tsx --test`, mutant nahraty do suboru, potom obnoveny):
`sectionUnderlays.test.ts` -> 2 testy zlyhaju (posun -> stary stav hosta; dva posuny za sebou), 8 prejde.
Skript `check-test-revert-oracle.mjs` lokalne skoncil BASELINE-BROKEN (v kontajneri chyba
zavislosti viewera, design-kit 403), takze OBSERVED mu dodaje az CI v balicku.
