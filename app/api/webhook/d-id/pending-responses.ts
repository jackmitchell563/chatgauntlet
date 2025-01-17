// Store for pending video generations
// In a production environment, this should be in a database or Redis
const pendingResponses: Map<string, (url: string) => void> = new Map();

export function registerPendingResponse(talkId: string): Promise<string> {
  return new Promise((resolve) => {
    pendingResponses.set(talkId, resolve);
  });
}

export function resolvePendingResponse(talkId: string, url: string) {
  const resolver = pendingResponses.get(talkId);
  if (resolver) {
    resolver(url);
    pendingResponses.delete(talkId);
  }
} 