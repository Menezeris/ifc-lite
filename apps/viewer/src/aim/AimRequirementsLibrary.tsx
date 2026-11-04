/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Karta "Requirements library" (AIM D-182, #351): hotové IDS z knižnice požiadaviek a IDS priradené k projektu.
 * Do projektu sa IDS dostane len vedomým "Priradiť k projektu" (nemenná kópia s pôvodom); odtiaľ ide do IDS Studia
 * a Data validation. Väzba IDS na modely je ručná. Dáta aj zápisy robí host, karta len ukazuje a posiela žiadosti.
 * Lenivo z `AimCenterPane.tsx`.
 */

import { useEffect } from 'react';
import { assign, bind, cancelChoice, loadCatalog, openIds, setAuthor, useAimReqlib } from './aimReqlib.js';
import { libraryBrowserHref, libraryStateText, runStateText, shortSha, type LibraryState } from './reqlibPlan.js';
import { postAimNavigate } from './aimPanelStore';

interface LibItem {
  path: string; code: string; sha256: string | null; title: string | null; ids_version: string | null;
  specs: Array<{ identifier: string | null; name: string }>; state: LibraryState; aim?: { code: string; version: number | null };
  last_change: { sha: string; date: string | null; author: string | null } | null; error?: string;
  release?: { library: string | null } | null;
}
interface Library {
  configured: boolean; error?: string; repo?: string; ref?: string; dir?: string; commit?: string; items?: LibItem[]; note?: string;
}
interface ProjectItem {
  code: string; title: string; origin: string; status: string;
  derived_from: { code: string; version: number; newer_exists: boolean } | null;
  versions: Array<{ version: number; author: string | null; created_at: string; library_commit: string | null; library_code: string | null; source: string }>;
  models: Array<{ model: string }>;
  runs: Array<{ model: string; version: number; checked_at: string; specs: string; results_failed: number; engine_version: string | null; created_by: string | null; based_on: Record<string, number>; stale: boolean | null; ids_stale: boolean }>;
}
interface Project { items: ProjectItem[]; containers: Array<{ model: string }>; schema_missing?: boolean }

const BTN = 'min-h-6 shrink-0 rounded border px-2 text-2xs font-medium hover:bg-muted disabled:opacity-50';
const date = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

export function AimRequirementsLibrary() {
  const { data, loading, error, busy, notice, choice, author } = useAimReqlib();
  useEffect(() => { void loadCatalog(); }, []);
  const library = (data?.library ?? null) as Library | null;
  const project = (data?.project ?? null) as Project | null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background text-xs" data-testid="aim-requirements-library">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <strong className="text-sm">Requirements library</strong>
        <span className="text-2xs text-muted-foreground">Knižnica požiadaviek: IDS sa do projektu dostane len priradením.</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-2xs">
          Meno
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value.slice(0, 120))}
            placeholder="kto priraďuje"
            className="h-6 w-36 rounded border bg-background px-1"
          />
        </label>
        <button type="button" className={BTN} onClick={() => postAimNavigate(libraryBrowserHref())} data-testid="aim-reqlib-browser">Prehliadač knižnice</button>
        <button type="button" className={BTN} disabled={loading} onClick={() => void loadCatalog()}>{loading ? 'Načítavam...' : 'Obnoviť'}</button>
      </div>
      {error && <p className="px-3 py-2 text-destructive">{error}</p>}
      {notice && <output className={`block px-3 py-2 ${notice.kind === 'error' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</output>}
      {choice && (
        <div className="m-3 rounded border border-amber-500/60 p-2" data-testid="aim-reqlib-choice">
          <p className="mb-2">{choice.message}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} onClick={() => void assign(choice, { as_new: true })}>Nové IDS {choice.code}</button>
            {choice.candidates.map((c) => (
              <button key={c} type="button" className={BTN} onClick={() => void assign(choice, { continue_code: c })}>Nová verzia {c} (premenované)</button>
            ))}
            <button type="button" className={BTN} onClick={cancelChoice}>Zrušiť</button>
          </div>
        </div>
      )}

      <section className="px-3 py-2">
        <h3 className="mb-1 text-xs font-semibold">V knižnici</h3>
        {!library && !loading && !error && <p className="text-muted-foreground">Načítavam knižnicu...</p>}
        {library && !library.configured && <p className="text-muted-foreground">{library.error}</p>}
        {library?.configured && library.error && <p className="text-destructive">{library.error}</p>}
        {library?.configured && library.commit && (
          <p className="mb-1 text-2xs text-muted-foreground">{library.repo} · {library.ref} · {library.dir}/ · commit {shortSha(library.commit)}</p>
        )}
        {library?.note && <p className="text-muted-foreground">{library.note}</p>}
        <ul className="space-y-1">
          {(library?.items ?? []).map((it) => (
            <li key={it.path} className="rounded border px-2 py-1" data-testid="aim-reqlib-library-item">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{it.code}</strong>
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                {it.release?.library && (
                  <button type="button" className={BTN} onClick={() => postAimNavigate(libraryBrowserHref(it))} title={it.path}>Poznámka</button>
                )}
                <button
                  type="button"
                  className={BTN}
                  disabled={!!busy || !it.sha256 || it.state === 'assigned' || it.state === 'collision' || it.state === 'invalid' || !library?.commit}
                  onClick={() => void assign({ path: it.path, commit: library!.commit!, sha256: it.sha256! })}
                >
                  {busy === it.path ? 'Priraďujem...' : 'Priradiť k projektu'}
                </button>
              </div>
              <div className="text-2xs text-muted-foreground">
                {libraryStateText(it.state, it.aim ? { code: it.aim.code, version: it.aim.version } : undefined)}
                {it.ids_version ? ` · verzia IDS ${it.ids_version}` : ''} · {it.specs.length} špecifikácií
                {it.last_change ? ` · zmena ${shortSha(it.last_change.sha)} ${date(it.last_change.date)}` : ''}
                {it.sha256 ? ` · sha256 ${it.sha256.slice(0, 10)}` : ''}
                {it.error ? ` · ${it.error}` : ''}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-3 py-2">
        <h3 className="mb-1 text-xs font-semibold">V projekte (AIM)</h3>
        {project?.schema_missing && <p className="text-2xs text-amber-700">Väzby na modely a pôvod verzií čakajú na migráciu v AIM.</p>}
        {project && project.items.length === 0 && <p className="text-muted-foreground">Projekt zatiaľ nemá žiadne IDS.</p>}
        <ul className="space-y-2">
          {(project?.items ?? []).map((p) => {
            const latest = p.versions[0];
            return (
              <li key={p.code} className="rounded border px-2 py-1" data-testid="aim-reqlib-project-item">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{p.code}</strong>
                  <span className="text-2xs text-muted-foreground">{p.origin === 'library' ? 'z knižnice, len na čítanie' : 'pracovné, nie je z knižnice'}</span>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  {latest && (
                    <>
                      <button type="button" className={BTN} disabled={!!busy} onClick={() => void openIds(p.code, latest.version, 'studio')}>IDS Studio</button>
                      <button type="button" className={BTN} disabled={!!busy} onClick={() => void openIds(p.code, latest.version, 'validation')}>Data validation</button>
                    </>
                  )}
                </div>
                {p.derived_from && (
                  <p className="text-2xs text-muted-foreground">
                    Odvodené z {p.derived_from.code} v{p.derived_from.version}{p.derived_from.newer_exists ? ' (v projekte je novšia verzia)' : ''}
                  </p>
                )}
                <details className="text-2xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Verzia v{latest?.version ?? '?'}{latest?.library_commit ? ` · commit ${shortSha(latest.library_commit)}` : ''} · {latest?.author ?? ''} {date(latest?.created_at)} ({p.versions.length} verzií)
                  </summary>
                  <ul className="ml-3 list-disc">
                    {p.versions.map((v) => (
                      <li key={v.version}>
                        v{v.version} · {v.source === 'import' ? 'priradené' : v.source}{v.library_code ? ` ${v.library_code}` : ''}{v.library_commit ? ` @ ${shortSha(v.library_commit)}` : ''} · {v.author ?? ''} {date(v.created_at)}
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs">
                  <span className="text-muted-foreground">Modely:</span>
                  {(project?.containers ?? []).map((c) => {
                    const bound = p.models.some((m) => m.model === c.model);
                    return (
                      <label key={c.model} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={bound}
                          disabled={!!busy || project?.schema_missing}
                          onChange={(e) => void bind(p.code, c.model, e.target.checked)}
                        />
                        {c.model}
                      </label>
                    );
                  })}
                </div>
                {p.runs.length > 0 && (
                  <ul className="mt-1 text-2xs">
                    {p.runs.map((r) => (
                      <li key={r.model}>
                        {r.model}: {r.specs} špecifikácií splnených, nesplnených prvkov {r.results_failed} · v{r.version}
                        {Object.entries(r.based_on).map(([m, rev]) => ` · ${m} v${rev}`).join('')} · {r.engine_version ?? ''} · {r.created_by ?? ''} {date(r.checked_at)} · {runStateText(r)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
