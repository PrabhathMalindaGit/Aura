import * as Speech from "expo-speech";

export async function stopReadAloud(): Promise<void> {
  await Speech.stop();
}
