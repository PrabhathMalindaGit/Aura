import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

const auraBackground = require("../assets/backgrounds/aura-background.png");

export function AppBackground() {
  const tokens = useTokens();

  return (
    <View
      style={[styles.wrap, { backgroundColor: tokens.colors.background }]}
    >
      <Image
        source={auraBackground}
        contentFit="cover"
        priority="low"
        style={styles.image}
        transition={0}
      />
      <View style={styles.readabilityOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.82,
  },
  readabilityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
});
