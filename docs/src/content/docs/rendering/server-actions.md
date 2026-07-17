---
title: Server Actions
description: >-
  A form submits straight to compileAction, a function marked 'use server' —
  no fetch, no hand-written API route.
sidebar:
  label: Server Actions
---

A form submits straight to `compileAction`, a function marked `'use server'` —
no fetch, no hand-written API route. Next.js generates the RPC wiring; state is
managed with React's `useActionState`.

```tsx
// app/docs/rendering/server-actions/actions.ts
'use server';
import { compile } from '@nandan-varma/platex';

export async function compileAction(_prevState: State, formData: FormData) {
  const source = String(formData.get('source') ?? '');
  const result = await compile(source, { bibliography: 'bibtex' });

  return {
    pdf: result.pdf ? result.pdf.toString('base64') : null,
    errors: result.errors,
  };
}

// app/docs/rendering/server-actions/form.tsx
'use client';
import { useActionState } from 'react';
import { compileAction } from './actions';

export function Form({ initialSource }: { initialSource: string }) {
  const [state, formAction, isPending] = useActionState(compileAction, initialState);
  return (
    <form action={formAction}>
      <textarea name="source" defaultValue={initialSource} />
      <button type="submit" disabled={isPending}>Compile</button>
    </form>
  );
}
```
