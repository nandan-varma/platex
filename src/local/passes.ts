import type { CompileOptions, CompileResult, LatexError, LatexWarning, RawPassLog } from '../types.js';
import { runEngine } from './compiler.js';
import { runBibliography, detectBibliography } from './bibtex.js';
import { parseLog, needsRerun } from './log-parser.js';

/**
 * Run the full LaTeX compilation pipeline for a document already written to tmpDir.
 * Mirrors Overleaf's CLSI multi-pass logic exactly.
 */
export async function runPasses(
  tmpDir: string,
  options: Required<Pick<CompileOptions, 'engine' | 'passes' | 'bibliography' | 'timeout'>>,
): Promise<Pick<CompileResult, 'errors' | 'warnings' | 'logs'>> {
  const { engine, passes, bibliography, timeout } = options;

  const allLogs: RawPassLog[] = [];
  const allErrors: LatexError[] = [];
  const allWarnings: LatexWarning[] = [];
  let passNumber = 0;

  // ── Pass 1 ──────────────────────────────────────────────────────────────────
  passNumber++;
  const log1 = await runEngine({ engine, tmpDir, passNumber, timeout });
  allLogs.push(log1);

  const parsed1 = parseLog(log1.log, 'latex');
  allErrors.push(...parsed1.errors);
  allWarnings.push(...parsed1.warnings);

  // Fatal error on first pass — stop immediately, no PDF will exist
  if (parsed1.errors.length > 0 && log1.exitCode !== 0) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  // ── Bibliography pass ────────────────────────────────────────────────────────
  const bibNeeded = bibliography !== 'none' && (await detectBibliography(tmpDir));
  if (bibNeeded) {
    passNumber++;
    const bibLog = await runBibliography({ bibEngine: bibliography, tmpDir, passNumber, timeout });
    if (bibLog) {
      allLogs.push(bibLog);
      const parsedBib = parseLog(bibLog.log, bibliography === 'biber' ? 'biber' : 'bibtex');
      allErrors.push(...parsedBib.errors);
      allWarnings.push(...parsedBib.warnings);
    }
  }

  // ── Pass 2 ──────────────────────────────────────────────────────────────────
  const needsPass2 = bibNeeded || (passes === 'auto' && needsRerun(log1.log)) || (typeof passes === 'number' && passes >= 2);
  if (!needsPass2) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  passNumber++;
  const log2 = await runEngine({ engine, tmpDir, passNumber, timeout });
  allLogs.push(log2);

  const parsed2 = parseLog(log2.log, 'latex');
  // Don't re-add errors from pass 2 if they're identical to pass 1 (references resolving)
  for (const err of parsed2.errors) {
    if (!allErrors.some((e) => e.message === err.message && e.line === err.line)) {
      allErrors.push(err);
    }
  }
  allWarnings.push(...parsed2.warnings);

  // ── Pass 3 ──────────────────────────────────────────────────────────────────
  const needsPass3 = (passes === 'auto' && needsRerun(log2.log)) || (typeof passes === 'number' && passes >= 3);
  if (!needsPass3) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  passNumber++;
  const log3 = await runEngine({ engine, tmpDir, passNumber, timeout });
  allLogs.push(log3);

  const parsed3 = parseLog(log3.log, 'latex');
  for (const err of parsed3.errors) {
    if (!allErrors.some((e) => e.message === err.message && e.line === err.line)) {
      allErrors.push(err);
    }
  }
  allWarnings.push(...parsed3.warnings);

  return { errors: allErrors, warnings: allWarnings, logs: allLogs };
}
