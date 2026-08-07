"use client";

import { useActionState } from "react";
import { topUpEscrow, type TopUpEscrowState } from "./actions";

const initialState: TopUpEscrowState = {};

export function TopUpEscrowButton() {
  const [state, formAction, pending] = useActionState(topUpEscrow, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-1.5">
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-accent shadow-sm transition hover:bg-accent-soft disabled:opacity-50"
      >
        {pending ? "Topping up..." : "Top up escrow (+$20)"}
      </button>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && <p className="text-xs text-success">{state.success}</p>}
    </form>
  );
}
