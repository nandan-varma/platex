import type {
  CompileOptions,
  CompileResult,
  LatexError,
  LatexWarning,
  RawPassLog,
} from '../types.js';
import { detectBibliography, runBibliography } from './bibtex.js';
import { runEngine } from './compiler.js';
import { needsRerun, parseLog } from './log-parser.js';

/**
 * Run the full LaTeX compilation pipeline for a document already written to tmpDir.
 * Implements standard TeX multi-pass logic (LaTeX → bibliography → reruns until stable).
 *
 * `timeout` is an overall wall-clock budget for the *entire* pipeline (all LaTeX
 * passes plus the bibliography pass combined), not a per-process allowance —
 * each subprocess is given whatever time remains in the budget when it starts,
 * and the pipeline stops rather than starting another pass once the budget is
 * exhausted. This keeps total run time bounded by `timeout`, matching what
 * callers (e.g. the remote HTTP client) assume when sizing their own deadlines.
 */
export async function runPasses(
  tmpDir: string,
  options: Required<Pick<CompileOptions, 'engine' | 'passes' | 'bibliography' | 'timeout'>> &
    Pick<CompileOptions, 'signal'>,
): Promise<Pick<CompileResult, 'errors' | 'warnings' | 'logs'>> {
  const { engine, passes, bibliography, timeout, signal } = options;

  const deadline = Date.now() + timeout;
  const remainingTime = () => Math.max(0, deadline - Date.now());

  const allLogs: RawPassLog[] = [];
  const allErrors: LatexError[] = [];
  const allWarnings: LatexWarning[] = [];
  let passNumber = 0;

  // ── Pass 1 ──────────────────────────────────────────────────────────────────
  passNumber++;
  const log1 = await runEngine({ engine, tmpDir, passNumber, timeout: remainingTime(), signal });
  allLogs.push(log1);

  const parsed1 = parseLog(log1.log, 'latex');
  allErrors.push(...parsed1.errors);
  allWarnings.push(...parsed1.warnings);

  // Any non-zero exit (fatal error, crash, or timeout) — stop immediately,
  // no PDF will exist and further passes can't recover the compile.
  if (log1.exitCode !== 0 || remainingTime() <= 0) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  // ── Bibliography pass ────────────────────────────────────────────────────────
  const bibNeeded = bibliography !== 'none' && (await detectBibliography(tmpDir));
  if (bibNeeded) {
    passNumber++;
    const bibLog = await runBibliography({
      bibEngine: bibliography,
      tmpDir,
      passNumber,
      timeout: remainingTime(),
      signal,
    });
    if (bibLog) {
      allLogs.push(bibLog);
      const parsedBib = parseLog(bibLog.log, bibliography === 'biber' ? 'biber' : 'bibtex');
      allErrors.push(...parsedBib.errors);
      allWarnings.push(...parsedBib.warnings);
    }
  }

  // ── Pass 2 ──────────────────────────────────────────────────────────────────
  const needsPass2 =
    bibNeeded ||
    (passes === 'auto' && needsRerun(log1.log)) ||
    (typeof passes === 'number' && passes >= 2);
  if (!needsPass2 || remainingTime() <= 0) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  passNumber++;
  const log2 = await runEngine({ engine, tmpDir, passNumber, timeout: remainingTime(), signal });
  allLogs.push(log2);

  const parsed2 = parseLog(log2.log, 'latex');
  // Don't re-add errors from pass 2 if they're identical to pass 1 (references resolving)
  for (const err of parsed2.errors) {
    if (!allErrors.some((e) => e.message === err.message && e.line === err.line)) {
      allErrors.push(err);
    }
  }
  allWarnings.push(...parsed2.warnings);

  if (log2.exitCode !== 0 || remainingTime() <= 0) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  // ── Pass 3 ──────────────────────────────────────────────────────────────────
  const needsPass3 =
    (passes === 'auto' && needsRerun(log2.log)) || (typeof passes === 'number' && passes >= 3);
  if (!needsPass3) {
    return { errors: allErrors, warnings: allWarnings, logs: allLogs };
  }

  passNumber++;
  const log3 = await runEngine({ engine, tmpDir, passNumber, timeout: remainingTime(), signal });
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
