// "Use the safer alternative": turns a safety finding's advice into SQL that replaces the risky
// statement in the up migration. Advice is either SQL or numbered steps mixing prose and SQL;
// only the steps that belong in this migration stay executable, and everything that has to wait
// for an application deploy (backfills, the contract phase of expand/contract) is commented out.
import type { Finding, Statement } from '@dashdb/core/lite';
import type { MigrationTarget } from './compute';

const SQL_START =
  /^(ALTER|CREATE|DROP|UPDATE|INSERT|DELETE|WITH|SELECT|SET|BEGIN|COMMIT|RENAME|TRUNCATE)\b/i;
/** A step from here on can't run in this migration: it waits for a deploy or is repeated. */
const DEFERRED =
  /\[(migrate|contract)\]|\bdeploy|\bbatch|\brepeat|\blater\b|after a safe period|^or\b|\bthen add\b/i;

const comment = (line: string) => (line.trim() ? `-- ${line}` : '--');

interface Step {
  readonly head: string;
  readonly sql: readonly string[];
}

function parseSteps(text: string): Step[] | null {
  if (!/^1\. /.test(text)) return null;
  const steps: { head: string; sql: string[] }[] = [];
  for (const line of text.split('\n')) {
    const start = /^\d+\. (.*)$/.exec(line);
    if (start) steps.push({ head: start[1] ?? '', sql: [] });
    else steps.at(-1)?.sql.push(line.replace(/^ {3}/, ''));
  }
  return steps;
}

function stepsToSql(steps: readonly Step[]): string[] {
  const lines: string[] = [];
  let deferred = false;
  for (const step of steps) {
    if (!deferred && DEFERRED.test(step.head)) {
      deferred = true;
      lines.push('-- Not in this migration: run these after deploying application code.');
    }
    lines.push(`-- ${step.head}`);
    for (const line of step.sql) lines.push(deferred ? comment(line) : sqlOrComment(line, lines));
  }
  return lines;
}

/** Keeps comments and SQL (including a statement's continuation lines); prose becomes comments. */
function sqlOrComment(line: string, previous: readonly string[]): string {
  const trimmed = line.trim();
  if (line.startsWith('--') || SQL_START.test(trimmed)) return line;
  return trimmed !== '' && isContinuation(previous) ? line : comment(line);
}

/** Whether the previous emitted line is executable SQL that hasn't ended yet. */
function isContinuation(lines: readonly string[]): boolean {
  const last = lines.at(-1)?.trim() ?? '';
  return last !== '' && !last.startsWith('--') && !last.endsWith(';');
}

function plainToSql(text: string, target: MigrationTarget): string[] {
  // Framework migrations run as one script inside a transaction, where CONCURRENTLY fails.
  const needsOwnFile = target !== 'sql' && /\bCONCURRENTLY\b/.test(text);
  const lines: string[] = [];
  if (needsOwnFile) {
    lines.push(
      '-- Prisma and Drizzle run each migration file in a transaction, where CONCURRENTLY fails.',
      '-- Put this in a migration of its own and run it outside a transaction:',
    );
  }
  for (const line of text.split('\n')) {
    if (needsOwnFile) lines.push(line.startsWith('--') ? line : comment(line));
    else lines.push(sqlOrComment(line, lines));
  }
  return lines;
}

/** The SQL block that stands in for a finding's statement. */
export function alternativeSql(finding: Finding, target: MigrationTarget): string {
  const steps = parseSteps(finding.saferAlternative);
  const body = steps ? stepsToSql(steps) : plainToSql(finding.saferAlternative, target);
  return [
    `-- DashDB safer alternative (${finding.ruleId}): ${finding.title}`,
    '-- Review before running. The down migration still reverses the original change.',
    ...body,
  ].join('\n');
}

/** The statements a finding is about. */
export function findingStatements(finding: Finding, statements: readonly Statement[]): Statement[] {
  return statements.filter(
    (s) => s.operationId === finding.operationId || s.operationIds.includes(finding.operationId),
  );
}

/**
 * Applies chosen alternatives to an up file: the first statement of each finding becomes the
 * alternative (with the original kept as a comment), the rest are commented out. A statement
 * that also implements other operations (MySQL merges column changes) is kept, with the
 * alternative added above it as guidance. Alternatives whose statements aren't in the file are
 * appended at the end.
 */
export function applyAlternatives(
  contents: string,
  statements: readonly Statement[],
  findings: readonly Finding[],
  target: MigrationTarget,
): string {
  let result = contents;
  const appended: string[] = [];
  for (const finding of findings) {
    const block = alternativeSql(finding, target);
    const own = findingStatements(finding, statements);
    let placed = false;
    for (const [i, statement] of own.entries()) {
      if (!result.includes(statement.sql)) continue;
      const shared = statement.operationIds.length > 1;
      const original = statement.sql.split('\n').map(comment).join('\n');
      const replacement = shared
        ? `${block
            .split('\n')
            .map((l) => (l.startsWith('--') ? l : comment(l)))
            .join('\n')}\n${statement.sql}`
        : i === 0
          ? `${block}\n-- Replaces:\n${original}`
          : original;
      result = result.replace(statement.sql, () => replacement);
      placed = true;
    }
    if (!placed) appended.push(block);
  }
  return appended.length ? `${result.trimEnd()}\n\n${appended.join('\n\n')}\n` : result;
}

/**
 * The same substitutions as `applyAlternatives`, per statement: statement key → the SQL shown
 * in its place, for the Up tab.
 */
export function statementReplacements(
  views: readonly { readonly key: string; readonly statement: Statement }[],
  findings: readonly Finding[],
  target: MigrationTarget,
): Map<string, string> {
  const replacements = new Map<string, string>();
  for (const finding of findings) {
    const block = alternativeSql(finding, target);
    const own = views.filter((v) => findingStatements(finding, [v.statement]).length > 0);
    own.forEach(({ key, statement }, i) => {
      const original = statement.sql.split('\n').map(comment).join('\n');
      if (statement.operationIds.length > 1) {
        const guidance = block
          .split('\n')
          .map((l) => (l.startsWith('--') ? l : comment(l)))
          .join('\n');
        replacements.set(key, `${guidance}\n${statement.sql}`);
      } else {
        replacements.set(key, i === 0 ? `${block}\n-- Replaces:\n${original}` : original);
      }
    });
  }
  return replacements;
}
