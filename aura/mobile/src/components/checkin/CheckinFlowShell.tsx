import React, { useMemo, useState, type ReactNode, type RefObject } from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader, type HeroHeaderAction } from "@/src/components/HeroHeader";
import {
  CheckinStepNavigator,
  type CheckinStepNavigatorItem,
} from "@/src/components/checkin/CheckinStepNavigator";
import { useTokens } from "@/src/theme/tokens";

type CheckinFlowShellProps = {
  title: string;
  subtitle: string;
  currentStepTitle: string;
  currentStepDescription?: string;
  left?: ReactNode;
  rightActions?: HeroHeaderAction[];
  statusContent?: ReactNode;
  helperContent?: ReactNode;
  steps: CheckinStepNavigatorItem[];
  activeStep: number;
  onSelectStep: (index: number) => void;
  footer?: ReactNode;
  footerSpacerHeight?: number;
  scrollContentStyle?: StyleProp<ViewStyle>;
  scrollViewRef?: RefObject<ScrollView | null>;
  children: ReactNode;
};

export function CheckinFlowShell({
  title,
  subtitle,
  currentStepTitle,
  currentStepDescription,
  left,
  rightActions = [],
  statusContent,
  helperContent,
  steps,
  activeStep,
  onSelectStep,
  footer,
  footerSpacerHeight = 0,
  scrollContentStyle,
  scrollViewRef,
  children,
}: CheckinFlowShellProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [measuredFooterHeight, setMeasuredFooterHeight] = useState(0);
  const footerBreathingRoom = tokens.spacing.xl;
  const fallbackFooterReserve = tokens.spacing.xxxl * 3 + tokens.spacing.lg;
  const resolvedFooterSpacerHeight = footer
    ? Math.max(
        footerSpacerHeight,
        measuredFooterHeight > 0
          ? measuredFooterHeight + footerBreathingRoom
          : fallbackFooterReserve,
      )
    : tokens.spacing.xxxl;

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: resolvedFooterSpacerHeight },
          scrollContentStyle,
        ]}
      >
        <HeroHeader
          variant="compact"
          title={title}
          subtitle={subtitle}
          left={left}
          rightActions={rightActions}
        >
          <View style={styles.headerBody}>
            <Text style={styles.currentStepTitle}>{currentStepTitle}</Text>
            {currentStepDescription ? (
              <Text style={styles.currentStepDescription}>{currentStepDescription}</Text>
            ) : null}
            {statusContent ? <View style={styles.statusWrap}>{statusContent}</View> : null}
          </View>
        </HeroHeader>

        <CheckinStepNavigator
          steps={steps}
          activeStep={activeStep}
          onSelectStep={onSelectStep}
        />

        {helperContent ? <View style={styles.helperWrap}>{helperContent}</View> : null}

        {children}
      </ScrollView>

      {footer ? (
        <View
          style={styles.footerWrap}
          onLayout={({ nativeEvent }) => {
            const nextHeight = Math.ceil(nativeEvent.layout.height);
            if (!Number.isFinite(nextHeight)) {
              return;
            }
            Promise.resolve().then(() => {
              setMeasuredFooterHeight((current) =>
                current === nextHeight ? current : nextHeight
              );
            });
          }}
        >
          <GlassPanel
            intensity={28}
            fallbackVariant="surface"
            fallbackOpacity={0.96}
            style={styles.footerPanel}
            accessibilityLabel="Check-in footer actions"
          >
            {footer}
          </GlassPanel>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    scrollContent: {
      gap: tokens.spacing.md,
    },
    headerBody: {
      gap: tokens.spacing.xs,
    },
    currentStepTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    currentStepDescription: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    statusWrap: {
      gap: tokens.spacing.xs,
    },
    helperWrap: {
      gap: tokens.spacing.sm,
    },
    footerWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: tokens.spacing.md,
      paddingBottom: tokens.spacing.sm,
    },
    footerPanel: {
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: "rgba(215, 224, 231, 0.92)",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      ...(tokens.elevation?.card ?? {}),
    },
  });
}
