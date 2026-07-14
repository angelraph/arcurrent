"use client";

import { useActionState } from "react";
import { createObligation, type CreateObligationState } from "./actions";

const initialState: CreateObligationState = {};

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function ObligationForm() {
  const [state, formAction, pending] = useActionState(createObligation, initialState);

  return (
    <form
      action={formAction}
      className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <label className="col-span-2 text-sm font-medium sm:col-span-1">
        Vendor name
        <input name="vendorName" required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Amount
        <input name="amount" type="number" step="0.000001" min="0" required className={`${inputClass} font-mono`} />
      </label>
      <label className="text-sm font-medium">
        Currency
        <select name="currency" defaultValue="USDC" className={inputClass}>
          <option value="USDC">USDC</option>
          <option value="EURC">EURC</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Due date
        <input name="dueDate" type="date" required className={inputClass} />
      </label>
      <label className="col-span-2 text-sm font-medium">
        Destination address (Arc Testnet, 0x...)
        <input
          name="destinationAddress"
          required
          placeholder="0x..."
          className={`${inputClass} font-mono`}
        />
      </label>
      {state.error && <p className="col-span-2 text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="col-span-2 mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Adding..." : "Add obligation"}
      </button>
    </form>
  );
}
