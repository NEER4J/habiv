/**
 * Google / GitHub sign-in in a popup: /auth/callback?popup=<id> finishes the sign-in inside the
 * popup (setting the session cookies for every tab) and reports back to the tab that opened it on
 * this BroadcastChannel. Not window.opener: the providers' pages send COOP headers that cut it.
 */
export const OAUTH_POPUP_CHANNEL = "habiv-oauth";

/** `to` is where the redirect flow would have gone (with ?welcome=1 when there is no handle yet). */
export type OAuthPopupResult = { id: string; to?: string; error?: string };

export const POPUP_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
