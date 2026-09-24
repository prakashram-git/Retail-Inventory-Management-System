export const AUTH_CHANNEL_NAME = "mall_auth_channel";

export type AuthChannelMessage = { type: "SESSION_TERMINATED" };

/** Tells every other open tab of this browser that the user signed out. */
export function broadcastSessionTerminated(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.postMessage({ type: "SESSION_TERMINATED" } satisfies AuthChannelMessage);
  channel.close();
}

/** Returns an unsubscribe function. The sending tab never receives its own message. */
export function listenForSessionTermination(onTerminated: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<AuthChannelMessage>) => {
    if (event.data?.type === "SESSION_TERMINATED") onTerminated();
  };
  return () => channel.close();
}
