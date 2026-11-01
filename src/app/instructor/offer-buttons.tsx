"use client";

import { useActionState } from "react";
import { respondOffer } from "./actions";

export function OfferButtons({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(respondOffer, undefined);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="id" value={offerId} />
      <div className="flex gap-2">
        <button
          name="decision"
          value="accept"
          disabled={pending}
          className="min-h-11 flex-1 rounded-[10px] bg-brand text-sm font-medium text-white disabled:opacity-60"
        >
          수락
        </button>
        <button
          name="decision"
          value="decline"
          disabled={pending}
          className="min-h-11 flex-1 rounded-[10px] border border-[#D9A46A] bg-white text-sm text-[#7A3E06] disabled:opacity-60"
        >
          거절
        </button>
      </div>
      {state?.message && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
