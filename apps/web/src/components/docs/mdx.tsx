import { rules } from '@dashdb/core';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import { ACTIONS, GROUP_ORDER, type EditorAction } from '@/editor/actions';
import { EXPORT_FORMATS, IMPORT_FORMATS, MAX_IMPORT_BYTES } from '@/editor/formats';
import { formatShortcut } from '@/editor/shortcuts';
import { DIALECT_NAMES, RULE_GUIDES } from '@/guides/rule-guides';

// Components the docs' MDX can use. The tables below are generated from the code they describe
// (the editor's action registry, its import and export formats, the safety rules), so the docs
// can't drift from the product.

/** Every editor command with its shortcut, grouped as in the in-app cheat sheet. */
function KeyboardShortcuts() {
  const actions: readonly EditorAction[] = ACTIONS;
  return (
    <>
      {GROUP_ORDER.map((group) => (
        <div key={group}>
          <h3>{group}</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Command</th>
                <th scope="col">Windows and Linux</th>
                <th scope="col">macOS</th>
              </tr>
            </thead>
            <tbody>
              {actions
                .filter((a) => a.group === group)
                .map((action) => (
                  <tr key={action.id}>
                    <td>{action.title}</td>
                    <td>
                      <Keys keys={formatShortcut(action.shortcut, false)} />
                    </td>
                    <td>
                      <Keys keys={formatShortcut(action.shortcut, true)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Keys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="bg-fd-muted text-fd-foreground rounded border px-1.5 font-mono text-[0.85em]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** The schema formats the import dialog reads, and those the export dialog writes. */
function FormatTable({ kind }: { kind: 'import' | 'export' }) {
  const rows: { id: string; label: string; extension?: string }[] =
    kind === 'import'
      ? Object.entries(IMPORT_FORMATS).map(([id, f]) => ({ id, label: f.label }))
      : Object.entries(EXPORT_FORMATS).map(([id, f]) => ({
          id,
          label: f.label,
          extension: f.extension,
        }));
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Format</th>
          {kind === 'export' && <th scope="col">File</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.label}</td>
            {row.extension && (
              <td>
                <code>.{row.extension}</code>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The largest schema file the import dialog accepts, e.g. "2 MB". */
function MaxImportSize() {
  return <>{MAX_IMPORT_BYTES / 1024 / 1024} MB</>;
}

/** Every safety rule, with links to its guide for each database it applies to. */
function SafetyRules() {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Rule</th>
          <th scope="col">What goes wrong</th>
          <th scope="col">Guides</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => {
          const guide = RULE_GUIDES[rule.id];
          return (
            <tr key={rule.id} data-rule={rule.id}>
              <td>
                <strong>{guide?.title ?? rule.id}</strong>
                <br />
                <code>{rule.id}</code>
              </td>
              <td>{guide?.risk}</td>
              <td>
                {rule.dialects.map((dialect, i) => (
                  <span key={dialect}>
                    {i > 0 && ', '}
                    <Link href={`/guides/${dialect}/${rule.id}`}>{DIALECT_NAMES[dialect]}</Link>
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The number of safety rules, for prose ("DashDB checks 12 rules"). */
function RuleCount() {
  return <>{rules.length}</>;
}

export const docsMdxComponents: MDXComponents = {
  ...defaultMdxComponents,
  Callout,
  Card,
  Cards,
  Step,
  Steps,
  Tab,
  Tabs,
  KeyboardShortcuts,
  FormatTable,
  MaxImportSize,
  SafetyRules,
  RuleCount,
};
