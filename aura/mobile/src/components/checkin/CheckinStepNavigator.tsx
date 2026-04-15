import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { useTokens } from "@/src/theme/tokens";
import { getCheckinStepVisualState } from "@/src/components/checkin/checkinFlowState";

export type CheckinStepNavigatorItem = {
  key: string;
  label: string;
  icon: DomainIconKey;
};

type CheckinStepNavigatorProps = {
  steps: CheckinStepNavigatorItem[];
  activeStep: number;
  onSelectStep: (index: number) => void;
  testID?: string;
};

export function CheckinStepNavigator({
  steps,
  activeStep,
  onSelectStep,
  testID,
}: CheckinStepNavigatorProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={styles.row}>
        {steps.map((step, index) => {
          const state = getCheckinStepVisualState(index, activeStep);
          const isActive = state === "active";
          const isDone = state === "done";

          return (
            <View key={step.key} style={styles.segment}>
              {index > 0 ? (
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.connector,
                    isDone ? styles.connectorDone : null,
                    index === activeStep ? styles.connectorActive : null,
                  ]}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}: ${step.label}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => onSelectStep(index)}
                style={({ pressed }) => [
                  styles.item,
                  pressed ? styles.itemPressed : null,
                ]}
              >
                <View
                  style={[
                    styles.marker,
                    isActive ? styles.markerActive : null,
                    isDone ? styles.markerDone : null,
                  ]}
                >
                  {isDone ? (
                    <Text style={styles.doneGlyph}>✓</Text>
                  ) : (
                    <View
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                    >
                      <DomainIcon
                        icon={step.icon}
                        size={16}
                        tone={isActive ? "text" : isDone ? "success" : "muted"}
                        accessibilityLabel={`${step.label} step icon`}
                      />
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    isActive ? styles.labelActive : null,
                    isDone ? styles.labelDone : null,
                  ]}
                >
                  {step.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrap: {
      paddingVertical: tokens.spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    segment: {
      flex: 1,
      position: "relative",
    },
    connector: {
      position: "absolute",
      top: 16,
      left: "-50%",
      right: "50%",
      height: 2,
      backgroundColor: tokens.colors.border,
    },
    connectorDone: {
      backgroundColor: tokens.colors.success,
    },
    connectorActive: {
      backgroundColor: tokens.colors.primary,
    },
    item: {
      alignItems: "center",
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.xs,
    },
    itemPressed: {
      opacity: 0.82,
    },
    marker: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    markerActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    markerDone: {
      backgroundColor: tokens.colors.successSoft,
      borderColor: tokens.colors.success,
    },
    doneGlyph: {
      color: tokens.colors.success,
      fontSize: 14,
      lineHeight: 14,
      fontWeight: tokens.typography.weights.semibold,
    },
    label: {
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      textAlign: "center",
    },
    labelActive: {
      color: tokens.colors.text,
      fontWeight: tokens.typography.weights.semibold,
    },
    labelDone: {
      color: tokens.colors.textMuted,
    },
  });
}
