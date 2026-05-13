import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Platform } from "react-native";

type VoiceCommandPlatform = typeof Platform.OS;

export function isVoiceCommandRuntimeSupported(
  platformOS: VoiceCommandPlatform = Platform.OS,
): boolean {
  if (platformOS === "web") {
    return false;
  }

  try {
    return (
      ExpoSpeechRecognitionModule.isRecognitionAvailable() &&
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
    );
  } catch {
    return false;
  }
}
