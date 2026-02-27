export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  void server;
  return client;
}
