import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '@/src/theme/tokens';

type SymptomChipOption<T extends string> = {
  value: T;
  label: string;
};

type SymptomChipGroupProps<T extends string> = {
  label?: string;
  options: SymptomChipOption<T>[];
  selectedValues: T[];
  onToggle: (value: T) => void;
};

export function SymptomChipGroup<T extends string>({
  label,
  options,
  selectedValues,
  onToggle,
}: SymptomChipGroupProps<T>) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.group}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${option.label}`}
              accessibilityState={{ selected }}
              onPress={() => onToggle(option.value)}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : null,
                pressed ? styles.chipPressed : null,
              ]}
            >
              <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    group: {
      gap: tokens.spacing.sm,
    },
    label: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.sm,
    },
    chip: {
      minHeight: 44,
      paddingHorizontal: tokens.spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSelected: {
      borderColor: tokens.colors.accent,
      backgroundColor: tokens.colors.accent,
    },
    chipPressed: {
      opacity: 0.84,
    },
    chipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    chipTextSelected: {
      color: tokens.colors.accentTextOn,
    },
  });
}
