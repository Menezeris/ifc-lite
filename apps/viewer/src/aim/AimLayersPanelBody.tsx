/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Body of the AIM layers panel (AimLayersPanel.tsx): one row per derivation
 * rule with a local eye (shows/hides that rule's derived relations in
 * Relationship records), name, active relation count, mode, enabled state and
 * the last run. Enabled/mode are display-only.
 */

import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DerivationRuleWire, DerivationsLayerWire } from './derivations-protocol';
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

export interface AimLayersPanelBodyProps {
  layer: DerivationsLayerWire;
  hiddenRuleIds: readonly string[];
  relationsVisible: boolean;
  onToggleRule: (ruleId: string) => void;
}

export function AimLayersPanelBody({ layer, hiddenRuleIds, relationsVisible, onToggleRule }: AimLayersPanelBodyProps) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-900" aria-label="AIM vrstvy" data-aim-layers>
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
    </section>
  );
}
