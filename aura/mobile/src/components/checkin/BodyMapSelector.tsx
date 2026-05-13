import React, { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import bodyMapBack from '../../../assets/body-map/body-map-back.png';
import bodyMapFront from '../../../assets/body-map/body-map-front.png';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { StatusPill } from '@/src/components/StatusPill';
import { useTokens } from '@/src/theme/tokens';
import type { CheckinBodyMapDraft } from '@/src/types/checkin';
import { regionLabel, type BodyMapRegion } from '@/src/utils/bodyMapLabels';

type BodyMapView = 'front' | 'back';

type BodyMapSelectorProps = {
  value: CheckinBodyMapDraft;
  onToggleRegion: (region: BodyMapRegion) => void;
  onSetPrimaryRegion: (region: BodyMapRegion) => void;
};

type Hotspot = {
  region: BodyMapRegion;
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
};

const MIN_HOTSPOT_TOUCH_SIZE = 44;
const BODY_MAP_IMAGES = {
  front: bodyMapFront,
  back: bodyMapBack,
} as const;

function getHotspotHitSlop(spot: Hotspot) {
  const vertical = Math.max(0, Math.ceil((MIN_HOTSPOT_TOUCH_SIZE - spot.height) / 2));
  const horizontal = Math.max(0, Math.ceil((MIN_HOTSPOT_TOUCH_SIZE - spot.width) / 2));

  return {
    top: vertical,
    bottom: vertical,
    left: horizontal,
    right: horizontal,
  };
}

const FRONT_HOTSPOTS: Hotspot[] = [
  { region: 'head', x: 112, y: 16, width: 40, height: 48, radius: 20 },
  { region: 'neck', x: 113, y: 66, width: 34, height: 26, radius: 12 },
  { region: 'shoulder_left', x: 74, y: 84, width: 42, height: 34, radius: 18 },
  { region: 'shoulder_right', x: 144, y: 84, width: 42, height: 34, radius: 18 },
  { region: 'arm_left', x: 50, y: 114, width: 38, height: 82, radius: 19 },
  { region: 'arm_right', x: 172, y: 114, width: 38, height: 82, radius: 19 },
  { region: 'elbow_left', x: 42, y: 195, width: 40, height: 34, radius: 17 },
  { region: 'elbow_right', x: 178, y: 195, width: 40, height: 34, radius: 17 },
  { region: 'wrist_hand_left', x: 30, y: 230, width: 52, height: 46, radius: 20 },
  { region: 'wrist_hand_right', x: 178, y: 230, width: 52, height: 46, radius: 20 },
  { region: 'hip_left', x: 92, y: 204, width: 38, height: 44, radius: 20 },
  { region: 'hip_right', x: 130, y: 204, width: 38, height: 44, radius: 20 },
  { region: 'knee_left', x: 94, y: 280, width: 34, height: 38, radius: 17 },
  { region: 'knee_right', x: 132, y: 280, width: 34, height: 38, radius: 17 },
  { region: 'ankle_foot_left', x: 86, y: 348, width: 42, height: 34, radius: 16 },
  { region: 'ankle_foot_right', x: 132, y: 348, width: 42, height: 34, radius: 16 },
];

const BACK_HOTSPOTS: Hotspot[] = [
  { region: 'head', x: 112, y: 12, width: 40, height: 50, radius: 20 },
  { region: 'neck', x: 113, y: 62, width: 34, height: 28, radius: 12 },
  { region: 'upper_back', x: 82, y: 84, width: 96, height: 70, radius: 28 },
  { region: 'lower_back', x: 90, y: 158, width: 80, height: 56, radius: 22 },
  { region: 'shoulder_left', x: 70, y: 86, width: 44, height: 34, radius: 18 },
  { region: 'shoulder_right', x: 146, y: 86, width: 44, height: 34, radius: 18 },
  { region: 'arm_left', x: 48, y: 118, width: 40, height: 82, radius: 20 },
  { region: 'arm_right', x: 172, y: 118, width: 40, height: 82, radius: 20 },
  { region: 'elbow_left', x: 42, y: 198, width: 40, height: 34, radius: 17 },
  { region: 'elbow_right', x: 178, y: 198, width: 40, height: 34, radius: 17 },
  { region: 'wrist_hand_left', x: 30, y: 232, width: 52, height: 46, radius: 20 },
  { region: 'wrist_hand_right', x: 178, y: 232, width: 52, height: 46, radius: 20 },
  { region: 'hip_left', x: 90, y: 216, width: 42, height: 44, radius: 21 },
  { region: 'hip_right', x: 128, y: 216, width: 42, height: 44, radius: 21 },
  { region: 'knee_left', x: 94, y: 286, width: 34, height: 38, radius: 17 },
  { region: 'knee_right', x: 132, y: 286, width: 34, height: 38, radius: 17 },
  { region: 'ankle_foot_left', x: 86, y: 350, width: 42, height: 34, radius: 16 },
  { region: 'ankle_foot_right', x: 132, y: 350, width: 42, height: 34, radius: 16 },
];

export function BodyMapSelector({ value, onToggleRegion, onSetPrimaryRegion }: BodyMapSelectorProps) {
  const [view, setView] = useState<BodyMapView>('front');
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const hotspots = view === 'front' ? FRONT_HOTSPOTS : BACK_HOTSPOTS;

  return (
    <View style={styles.stack}>
      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'front', label: 'Front' },
          { value: 'back', label: 'Back' },
        ]}
        size="sm"
        tone="primary"
        accessibilityLabel="Body map view"
      />

      <View style={styles.canvas}>
        <Image
          accessibilityLabel={`${view === 'front' ? 'Front' : 'Back'} body map`}
          accessibilityRole="image"
          contentFit="cover"
          source={BODY_MAP_IMAGES[view]}
          style={styles.bodyMapImage}
          testID={`body-map-image-${view}`}
        />

        {hotspots.map((spot) => {
          const selected = value.selectedRegions.includes(spot.region);
          const primary = value.primaryRegion === spot.region;
          return (
            <Pressable
              key={`${view}-${spot.region}`}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${regionLabel(spot.region)} area${primary ? ', primary pain area' : ''}`}
              accessibilityHint="Toggles this body area. Selected areas can be marked as the most bothersome area below."
              accessibilityState={{ selected }}
              hitSlop={getHotspotHitSlop(spot)}
              onPress={() => onToggleRegion(spot.region)}
              style={({ pressed }) => [
                styles.hotspot,
                {
                  left: spot.x,
                  top: spot.y,
                  width: spot.width,
                  height: spot.height,
                  borderRadius: spot.radius ?? 14,
                },
                selected ? styles.hotspotSelected : null,
                primary ? styles.hotspotPrimary : null,
                pressed ? styles.hotspotPressed : null,
              ]}
            >
              {primary ? <Text style={styles.primaryGlyph}>★</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {value.selectedRegions.length > 0 ? (
        <View style={styles.selectionStack}>
          <Text style={styles.selectionLabel}>Selected regions</Text>
          <View style={styles.selectionRow}>
            {value.selectedRegions.map((region) => {
              const isPrimary = value.primaryRegion === region;
              return (
                <Pressable
                  key={`primary-${region}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isPrimary
                      ? `${regionLabel(region)} is the most bothersome selected area`
                      : `Mark ${regionLabel(region)} as the most bothersome area`
                  }
                  accessibilityHint="Sets which selected body area should be summarized as primary."
                  accessibilityState={{ selected: isPrimary }}
                  onPress={() => onSetPrimaryRegion(region)}
                  style={({ pressed }) => [
                    styles.selectionChip,
                    isPrimary ? styles.selectionChipPrimary : null,
                    pressed ? styles.selectionChipPressed : null,
                  ]}
                >
                  <Text style={[styles.selectionChipText, isPrimary ? styles.selectionChipTextPrimary : null]}>
                    {regionLabel(region)}
                  </Text>
                  {isPrimary ? <StatusPill label="Primary" variant="warning" accessible={false} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Text style={styles.helperText}>Tap body regions to mark where symptoms are showing up today.</Text>
      )}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    stack: {
      gap: tokens.spacing.md,
    },
    canvas: {
      position: 'relative',
      alignSelf: 'center',
      width: 260,
      height: 390,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceSubtle,
      overflow: 'hidden',
    },
    bodyMapImage: {
      width: '100%',
      height: '100%',
    },
    hotspot: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    hotspotSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.scheme === 'dark' ? 'rgba(70, 130, 255, 0.24)' : 'rgba(47, 111, 237, 0.14)',
    },
    hotspotPrimary: {
      borderColor: tokens.colors.success,
      backgroundColor: tokens.scheme === 'dark' ? 'rgba(47, 143, 131, 0.30)' : 'rgba(47, 143, 131, 0.20)',
    },
    hotspotPressed: {
      opacity: 0.82,
    },
    primaryGlyph: {
      color: tokens.colors.success,
      fontSize: 12,
      lineHeight: 14,
      fontWeight: tokens.typography.weights.semibold,
    },
    selectionStack: {
      gap: tokens.spacing.sm,
    },
    selectionLabel: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    selectionRow: {
      gap: tokens.spacing.sm,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    selectionChip: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
      maxWidth: '100%',
    },
    selectionChipPrimary: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primarySoft,
    },
    selectionChipPressed: {
      opacity: 0.84,
    },
    selectionChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    selectionChipTextPrimary: {
      color: tokens.colors.primary,
    },
    helperText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
