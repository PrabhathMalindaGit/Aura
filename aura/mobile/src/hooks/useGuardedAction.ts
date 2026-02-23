import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";

type UseGuardedActionOptions = {
  isBlocked: boolean;
  blockedMessage?: string;
};

type ActionFn = () => void | Promise<void>;

export function useGuardedAction(options: UseGuardedActionOptions) {
  const blockedMessage =
    options.blockedMessage ?? "You’re offline. Try again when connected.";
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const run = useCallback(
    async (actionFn: ActionFn) => {
      if (options.isBlocked) {
        if (Platform.OS === "web") {
          setInlineMessage(blockedMessage);
        } else {
          Alert.alert("Offline", blockedMessage);
        }
        return;
      }

      setInlineMessage(null);
      await actionFn();
    },
    [blockedMessage, options.isBlocked]
  );

  const clearInlineMessage = useCallback(() => {
    setInlineMessage(null);
  }, []);

  return {
    run,
    isBlocked: options.isBlocked,
    blockedMessage,
    inlineMessage,
    clearInlineMessage,
  };
}
