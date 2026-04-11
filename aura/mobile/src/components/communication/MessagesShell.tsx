import React, { useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeroHeader, type HeroHeaderAction } from "@/src/components/HeroHeader";
import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { useTokens } from "@/src/theme/tokens";

export type MessagesShellShortcut = {
  key: string;
  label: string;
  icon: DomainIconKey;
  accessibilityLabel: string;
  onPress: () => void;
};

type MessagesShellProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  rightActions?: HeroHeaderAction[];
  statusContent?: ReactNode;
  contextContent?: ReactNode;
  shortcuts?: MessagesShellShortcut[];
  children: ReactNode;
  composer?: ReactNode;
  testID?: string;
};

export function MessagesShell({
  title,
  subtitle,
  left,
  rightActions = [],
  statusContent,
  contextContent,
  shortcuts = [],
  children,
  composer,
  testID,
}: MessagesShellProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View testID={testID} style={styles.flex}>
      <View style={styles.topArea}>
        <HeroHeader
          variant="compact"
          title={title}
          subtitle={subtitle}
          left={left}
          rightActions={rightActions}
        >
          {statusContent ? <View style={styles.statusWrap}>{statusContent}</View> : null}
        </HeroHeader>

        {contextContent ? <View style={styles.contextWrap}>{contextContent}</View> : null}

        {shortcuts.length > 0 ? (
          <View style={styles.shortcutsWrap}>
            <Text style={styles.shortcutsLabel}>Quick links</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shortcutsRow}
            >
              {shortcuts.map((shortcut) => (
                <Pressable
                  key={shortcut.key}
                  accessibilityRole="button"
                  accessibilityLabel={shortcut.accessibilityLabel}
                  onPress={shortcut.onPress}
                  style={({ pressed }) => [
                    styles.shortcutChip,
                    pressed ? styles.shortcutChipPressed : null,
                  ]}
                >
                  <View
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                    style={styles.shortcutIconWrap}
                  >
                    <DomainIcon
                      icon={shortcut.icon}
                      tone="primary"
                      size={16}
                      accessibilityLabel={`${shortcut.label} icon`}
                    />
                  </View>
                  <Text style={styles.shortcutChipText}>{shortcut.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <View style={styles.contentWrap}>{children}</View>

      {composer ? <View style={styles.composerWrap}>{composer}</View> : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    topArea: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.sm,
    },
    statusWrap: {
      gap: tokens.spacing.sm,
    },
    contextWrap: {
      gap: tokens.spacing.sm,
    },
    shortcutsWrap: {
      gap: tokens.spacing.sm,
    },
    shortcutsLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    shortcutsRow: {
      gap: tokens.spacing.sm,
      paddingRight: tokens.spacing.sm,
    },
    shortcutChip: {
      minHeight: 42,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
    },
    shortcutChipPressed: {
      opacity: 0.84,
    },
    shortcutIconWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    shortcutChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    contentWrap: {
      flex: 1,
      minHeight: 0,
    },
    composerWrap: {
      paddingTop: tokens.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
    },
  });
}
