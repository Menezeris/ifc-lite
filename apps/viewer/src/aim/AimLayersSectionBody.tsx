/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Body of the AIM LAYERS section (lazy, see AimLayersSection.tsx): a
 * collapsible header (rule count, link to `layer.manageUrl` where rules are
 * changed) and one row per derivation rule with a local eye (shows/hides that
 * rule's derived relations in Relationship records), name, active relation
 * count, mode, enabled state and the last run. Enabled/mode are display-only.
 *
 * State, actions and the entry-chunk icons come in as props from the slot, so
 * this chunk does not pull entry modules out into shared chunks.
 */

import type { ComponentType } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DerivationRuleWire, DerivationsLayerWire } from './bridge-protocol';
import { formatRelativeTime } from './derivationsFormat';

interface RuleRowProps {
  rule: DerivationRuleWire;
  hidden: boolean;
  relationsVisible: boolean;
  onToggleRule: (ruleId: string) => void;
}

function RuleRow({ rule, hidden, relationsVisible, onToggleRule }: RuleRowProps) {
  const shown = relationsVisible && !hidden;
  return (
    <div className={cn('flex items-start gap-1.5 px-2 py-1 text-xs', !rule.enabled && 'opacity-60')} data-aim-rule={rule.id}>
      <button
        type="button"
        className="p-[3px] shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-pressed={!hidden}
        aria-label={hidden ? `Zobraziť vzťahy pravidla ${rule.name}` : `Skryť vzťahy pravidla ${rule.name}`}
        title={relationsVisible ? undefined : 'AIM vzťahy sú vypnuté v záložke AIM'}
        onClick={() => onToggleRule(rule.id)}
      >
        {shown ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 min-w-0 truncate text-zinc-900 dark:text-zinc-100" title={`${rule.name} (${rule.targetClasses.join(', ')})`}>
            {rule.name}
          </span>
          <span className="text-2xs font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 text-zinc-500 dark:text-zinc-400 shrink-0" title="Aktívne vzťahy">
            {rule.count}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500 dark:text-zinc-400">
          <span title="Režim pravidla">{rule.mode}</span>
          <span
            className={cn('px-1 border', rule.enabled ? 'border-primary/40 text-primary' : 'border-zinc-300 dark:border-zinc-700')}
            title="Zapnutie mení dáta: robí sa cez odkaz na správu pravidiel"
          >
            {rule.enabled ? 'on' : 'off'}
          </span>
          {rule.lastRun ? (
            <span
              className="ml-auto truncate"
              title={`Posledný beh ${rule.lastRun.at}: ${rule.lastRun.status}, zapísané ${rule.lastRun.written}, uzavreté ${rule.lastRun.closed}`}
            >
              {formatRelativeTime(rule.lastRun.at)} {rule.lastRun.status}
            </span>
          ) : (
            <span className="ml-auto text-zinc-400">bez behu</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Entry-chunk icons the slot hands in. */
export interface AimLayersIcons {
  chevron: ComponentType<{ className?: string }>;
  section: ComponentType<{ className?: string }>;
  link: ComponentType<{ className?: string }>;
}

export interface AimLayersSectionBodyProps {
  layer: DerivationsLayerWire;
  /** `layer.manageUrl` when safe to open (http/https), else null. */
  manageUrl: string | null;
  open: boolean;
  hiddenRuleIds: readonly string[];
  relationsVisible: boolean;
  icons: AimLayersIcons;
  onToggleRule: (ruleId: string) => void;
  onSetOpen: (open: boolean) => void;
}

export function AimLayersSectionBody({
  layer, manageUrl, open, hiddenRuleIds, relationsVisible, icons, onToggleRule, onSetOpen,
}: AimLayersSectionBodyProps) {
  const { chevron: ChevronRight, section: SectionIcon, link: ExternalLink } = icons;
  return (
    <section className="shrink-0 border-t-2 border-zinc-200 dark:border-zinc-800" aria-label="AIM vrstvy" data-aim-layers>
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={() => onSetOpen(!open)}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 text-zinc-500 transition-transform', open && 'rotate-90')} />
          <SectionIcon className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-2xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">AIM vrstvy</span>
          <span className="text-2xs font-mono text-zinc-400 dark:text-zinc-500 ml-auto">{layer.rules.length}</span>
        </button>
        {manageUrl && (
          <a
            href={manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-primary"
            title="Spravovať pravidlá (GitHub workflow odvodenie); viewer sa obnoví sám po novej revízii"
            aria-label="Spravovať pravidlá"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {open && (
        <div className="max-h-48 overflow-y-auto scrollbar-thin bg-white dark:bg-black divide-y divide-zinc-100 dark:divide-zinc-900">
          {layer.rules.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">Žiadne pravidlá</p>}
          {layer.rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              hidden={hiddenRuleIds.includes(rule.id)}
              relationsVisible={relationsVisible}
              onToggleRule={onToggleRule}
            />
          ))}
          {layer.models.length > 0 && (
            <p className="px-3 py-1.5 text-2xs font-mono text-zinc-500 dark:text-zinc-400 truncate" title="Aktuálne revízie modelov">
              {layer.models.map((m) => `${m.model} v${m.revision}`).join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
