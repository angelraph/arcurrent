"use client";

import { useActionState } from "react";
import { createObligation, type CreateObligationState } from "./actions";

const initialState: CreateObligationState = {};

export function ObligationForm() {
  const [state, formAction, pending] = useActionState(createObligation, initialState);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <label className="col-span-2 text-sm font-medium sm:col-span-1">
        Vendor name
        <input name="vendorName" required className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
      </label>
      <label className="text-sm font-medium">
        Amount
        <input name="amount" type="number" step="0.000001" min="0" required className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
      </label>
      <label className="text-sm font-medium">
        Currency
        <select name="currency" defaultValue="USDC" className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900">
          <option value="USDC">USDC</option>
          <option value="EURC">EURC</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Due date
        <input name="dueDate" type="date" required className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
      </label>
      <label className="col-span-2 text-sm font-medium">
        Destination address (Arc Testnet, 0x...)
        <input name="destinationAddress" required placeholder="0x..." className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900" />
      </label>
      {state.error && <p className="col-span-2 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="col-span-2 mt-1 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Adding..." : "Add obligation"}
      </button>
    </form>
  );
}
