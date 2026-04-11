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
              accessibilityHint={selected ? 'Currently selected' : 'Double tap to select'}
              accessibilityState={{ selected }}
              onPress={() => onToggle(option.value)}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : null,
                pressed ? styles.chipPressed : null,
              ]}
            >
              <View style={styles.chipContent}>
                <View
                  style={[
                    styles.selectionDot,
                    selected ? styles.selectionDotSelected : null,
                  ]}
                />
                <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                  {option.label}
                </Text>
              </View>
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
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primarySoft,
      borderWidth: 1.5,
    },
    chipPressed: {
      opacity: 0.84,
    },
    chipContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    selectionDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceSubtle,
    },
    selectionDotSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    chipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    chipTextSelected: {
      color: tokens.colors.primary,
    },
  });
}
