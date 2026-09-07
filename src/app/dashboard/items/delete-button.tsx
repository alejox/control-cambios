"use client";

import { useTransition } from "react";
import { eliminarItem } from "./actions";

export default function DeleteButton({ itemId, numero }: { itemId: string; numero: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar el item #${numero}? Esto también borra sus depósitos.`)) {
          return;
        }
        startTransition(async () => {
          try {
            await eliminarItem(itemId);
          } catch (e) {
            alert((e as Error).message);
          }
        });
      }}
      className="text-[13px] text-ink-soft transition hover:text-critical disabled:opacity-50"
    >
      {pending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
