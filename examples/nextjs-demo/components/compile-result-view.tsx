import type { LatexError, LatexWarning } from 'platex';
import { AlertCircle, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface SerializedCompileResult {
  pdfDataUri: string | null;
  errors: LatexError[];
  warnings: LatexWarning[];
}

export interface CompileStats {
  elapsedMs: number;
  pdfBytes: number | null;
}

export function CompileResultView({
  pdfDataUri,
  errors,
  warnings,
  stats,
}: SerializedCompileResult & { stats?: CompileStats }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b bg-muted/40 py-3">
          <CardTitle className="text-sm font-medium">Rendered PDF</CardTitle>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {stats && <span>{stats.elapsedMs}ms</span>}
            {stats?.pdfBytes != null && <span>{(stats.pdfBytes / 1024).toFixed(1)} KB</span>}
            <Badge variant={pdfDataUri ? 'secondary' : 'destructive'}>
              {pdfDataUri ? 'compiled' : 'failed'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pdfDataUri ? (
            <embed src={pdfDataUri} type="application/pdf" className="block h-[640px] w-full" />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No PDF produced — see errors below.
            </div>
          )}
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>
            {errors.length} error{errors.length > 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1">
              {errors.map((e, i) => (
                <li key={i}>
                  <code className="font-mono text-xs">
                    {e.file ?? 'main.tex'}
                    {e.line ? `:${e.line}` : ''}
                  </code>{' '}
                  — {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert className="border-warning/40 bg-warning/10 [&>svg]:text-warning">
          <TriangleAlert className="size-4" />
          <AlertTitle>
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {warnings.map((w, i) => (
                <Badge key={i} variant="outline" className="font-mono text-[11px] font-normal">
                  {w.code}
                  {w.line ? ` :${w.line}` : ''}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
