import { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { useTokens } from "@/src/theme/tokens";

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: KeyboardTypeOptions;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  secureTextEntry,
  autoCapitalize = "none",
  keyboardType = "default",
}: TextFieldProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.textMuted}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        selectionColor={tokens.colors.primary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused ? styles.inputFocused : null]}
      />
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrapper: {
      gap: tokens.spacing.xs + 2,
    },
    label: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.textMuted,
      letterSpacing: 0.24,
      textTransform: "uppercase",
    },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.lg,
      backgroundColor: tokens.colors.surface,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    inputFocused: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    helper: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
  });
}
