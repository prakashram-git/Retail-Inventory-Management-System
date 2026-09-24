export const AUTH_CHANNEL_NAME = "mall_auth_channel";

export type AuthChannelMessage = { type: "FORCE_LOGOUT"; timestamp: number };

/** Tells every other open tab of this browser that the user signed out. */
export function broadcastForceLogout(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.postMessage({ type: "FORCE_LOGOUT", timestamp: Date.now() } satisfies AuthChannelMessage);
  channel.close();
}

/** Returns an unsubscribe function. The sending tab never receives its own message. */
export function listenForForceLogout(onForceLogout: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<AuthChannelMessage>) => {
    if (event.data?.type === "FORCE_LOGOUT") onForceLogout();
  };
  return () => channel.close();
}
