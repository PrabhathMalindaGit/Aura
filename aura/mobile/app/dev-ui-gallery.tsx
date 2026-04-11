import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getIllustration, type IllustrationKey } from "@/src/assets/illustrations";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { DomainIcon, DOMAIN_ICON_KEYS } from "@/src/components/IconSet";
import { MediaCard } from "@/src/components/MediaCard";
import { FadeSlideIn } from "@/src/components/Motion";
import { IconButton } from "@/src/components/IconButton";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { SmartImage } from "@/src/components/SmartImage";
import { StatusPill } from "@/src/components/StatusPill";
import { TipCard } from "@/src/components/TipCard";
import { TrackerTile } from "@/src/components/TrackerTile";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";
import { isPatientDebugUIEnabled } from "@/src/dev/renderAudit";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

const ILLUSTRATION_KEYS: IllustrationKey[] = [
  "today",
  "progress",
  "chat",
  "weekly",
  "offline",
  "safety",
  "checkinSuccess",
  "syncing",
];

const LOCAL_GALLERY_IMAGE = require("../src/assets/illustrations/ill_today.png");
const REMOTE_PREVIEW_URI = "https://picsum.photos/seed/aura-smart-image/900/600";
const BLURHASH_PREVIEW = "LKO2?U%2Tw=w]~RBVZRi};RPxuwH";

type SwatchProps = {
  label: string;
  color: string;
  textColor?: string;
};

function Swatch({ label, color, textColor }: SwatchProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.swatchWrap}>
      <View style={[styles.swatch, { backgroundColor: color }]}>
        <Text style={[styles.swatchLabel, textColor ? { color: textColor } : null]}>
          {label}
        </Text>
      </View>
      <Text style={styles.swatchCode}>{color}</Text>
    </View>
  );
}

function PlaceholderCard({ title, subtitle }: { title: string; subtitle: string }) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return (
    <Card variant="outlined">
      <View style={styles.placeholderContent}>
        <Text style={styles.placeholderTitle}>{title}</Text>
        <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
      </View>
    </Card>
  );
}

export default function DevUiGalleryScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [showMotionPreview, setShowMotionPreview] = useState(true);
  const [showRemoteImagePreview, setShowRemoteImagePreview] = useState(false);
  const [rangeValue, setRangeValue] = useState<"7" | "30" | "90">("30");
  const [modeValue, setModeValue] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [sizeValueSm, setSizeValueSm] = useState<"daily" | "weekly" | "monthly">("daily");
  const [sizeValueMd, setSizeValueMd] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [wrapValue, setWrapValue] = useState<"all" | "focus" | "recovery" | "caregiver">(
    "focus",
  );

  if (!isPatientDebugUIEnabled()) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Screen
      title="UI Gallery"
      header={<Text style={styles.subtitle}>Dev-only · design QA</Text>}
      contentContainerStyle={styles.container}
    >
      <Row
        title="Back"
        subtitle="Return to previous screen"
        onPress={() => {
          router.back();
        }}
      />

      <Section title="Theme & tokens snapshot" subtitle="Semantic colors and typography" card>
        <View style={styles.swatchGrid}>
          <Swatch label="Background" color={tokens.colors.background} textColor={tokens.colors.text} />
          <Swatch label="Surface" color={tokens.colors.surface} textColor={tokens.colors.text} />
          <Swatch
            label="Surface elevated"
            color={tokens.colors.surfaceElevated}
            textColor={tokens.colors.text}
          />
        </View>
        <View style={styles.swatchGrid}>
          <Swatch label="Primary" color={tokens.colors.primary} textColor={tokens.colors.primaryTextOn} />
          <Swatch label="Accent" color={tokens.colors.accent} textColor={tokens.colors.accentTextOn} />
        </View>
        <View style={styles.textSamples}>
          <Text style={styles.sampleTitle}>Heading sample (title)</Text>
          <Text style={styles.sampleBody}>
            Body sample with readable spacing for calm clinical content.
          </Text>
          <Text style={styles.sampleCaption}>Caption sample for supporting metadata.</Text>
        </View>
        <View style={styles.borderSample} />
      </Section>

      <Section title="Buttons" subtitle="Primary, secondary, and icon controls" card>
        <View style={styles.buttonColumn}>
          <PrimaryButton label="Primary action" onPress={() => {}} />
          <PrimaryButton label="Primary disabled" disabled onPress={() => {}} />
          <PrimaryButton label="Primary loading" loading onPress={() => {}} />
          <SecondaryButton label="Secondary action" onPress={() => {}} />
          <SecondaryButton label="Secondary disabled" disabled onPress={() => {}} />
          <View style={styles.iconButtonRow}>
            <IconButton accessibilityLabel="Gallery icon button example" label="★" onPress={() => {}} />
            <IconButton
              accessibilityLabel="Gallery icon button disabled example"
              label="☆"
              disabled
              onPress={() => {}}
            />
          </View>
        </View>
      </Section>

      <Section title="IconSet preview" subtitle="Canonical domain icon mapping" card>
        <View style={styles.iconGrid}>
          {DOMAIN_ICON_KEYS.map((key) => (
            <View key={key} style={styles.iconItem}>
              <DomainIcon icon={key} size={20} tone="accent" />
              <Text style={styles.iconItemLabel}>{key}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="SmartImage preview" subtitle="Local, contain/cover, and optional remote blurhash" card>
        <View style={styles.stackSm}>
          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>cover</Text>
            <SmartImage
              source={LOCAL_GALLERY_IMAGE}
              height={140}
              contentFit="cover"
              accessibilityLabel="SmartImage local cover preview"
            />
          </View>
          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>contain</Text>
            <SmartImage
              source={LOCAL_GALLERY_IMAGE}
              height={140}
              contentFit="contain"
              backgroundVariant="muted"
              accessibilityLabel="SmartImage local contain preview"
            />
          </View>
          <SecondaryButton
            label={showRemoteImagePreview ? "Hide remote previews" : "Load remote previews"}
            onPress={() => {
              setShowRemoteImagePreview((current) => !current);
            }}
          />
          {showRemoteImagePreview ? (
            <View style={styles.stackXs}>
              <Text style={styles.imageCaption}>remote URI</Text>
              <SmartImage
                source={REMOTE_PREVIEW_URI}
                height={140}
                contentFit="cover"
                accessibilityLabel="SmartImage remote preview"
              />
              <Text style={styles.imageCaption}>placeholder blurhash</Text>
              <SmartImage
                source={`${REMOTE_PREVIEW_URI}?blurhash=1`}
                height={140}
                contentFit="cover"
                placeholderBlurhash={BLURHASH_PREVIEW}
                accessibilityLabel="SmartImage blurhash placeholder preview"
              />
            </View>
          ) : null}
        </View>
      </Section>

      <Section title="Avatar preview" subtitle="Photo, initials, rings, and icon fallback" card>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarItem}>
            <Avatar
              name="Malinda Perera"
              photoSource={LOCAL_GALLERY_IMAGE}
              size={56}
              accessibilityLabel="Avatar photo preview"
            />
            <Text style={styles.avatarCaption}>Photo</Text>
          </View>
          <View style={styles.avatarItem}>
            <Avatar name="Malinda Perera" size={40} />
            <Text style={styles.avatarCaption}>Initials</Text>
          </View>
          <View style={styles.avatarItem}>
            <Avatar name="Malinda Perera" ring="ok" size={40} />
            <Text style={styles.avatarCaption}>Ring ok</Text>
          </View>
          <View style={styles.avatarItem}>
            <Avatar name="Malinda Perera" ring="attention" size={40} />
            <Text style={styles.avatarCaption}>Ring attention</Text>
          </View>
          <View style={styles.avatarItem}>
            <Avatar name="Malinda Perera" ring="safety" size={40} />
            <Text style={styles.avatarCaption}>Ring safety</Text>
          </View>
          <View style={styles.avatarItem}>
            <Avatar fallback="icon" iconKey="caregiver" size={40} />
            <Text style={styles.avatarCaption}>Icon fallback</Text>
          </View>
        </View>
        <View style={styles.avatarSizes}>
          <Avatar name="MP" size={32} ring="ok" />
          <Avatar name="MP" size={40} ring="ok" />
          <Avatar name="MP" size={56} ring="ok" />
          <Text style={styles.avatarCaption}>Size QA: 32 / 40 / 56</Text>
        </View>
      </Section>

      <Section title="MediaCard preview" subtitle="Premium media-first card variants" card>
        <View style={styles.mediaCardStack}>
          <MediaCard
            leading={{
              type: "thumbnail",
              source: LOCAL_GALLERY_IMAGE,
              fit: "cover",
              bg: "surface",
            }}
            title="Today rehab session"
            subtitle="Knee mobility routine with guided pacing and form checks."
            chips={[
              { text: "Today", tone: "info" },
              { text: "25 min", tone: "muted" },
              { text: "Low impact", tone: "success" },
            ]}
            statusPill={{ text: "Needs review", tone: "warning" }}
            onPress={() => {}}
            actions={[
              { label: "Start", onPress: () => {}, kind: "primary" },
              { label: "Later", onPress: () => {}, kind: "secondary" },
            ]}
          />

          <MediaCard
            leading={{
              type: "avatar",
              name: "Malinda Perera",
              ring: "ok",
            }}
            title="Care team check-in"
            subtitle="Clinician follow-up scheduled for this afternoon."
            chips={[
              { text: "Today", tone: "info" },
              { text: "30 min", tone: "muted" },
            ]}
            rightAccessory={<StatusPill label="On track" variant="success" />}
            onPress={() => {}}
          />

          <MediaCard
            leading={{
              type: "icon",
              icon: "appointments",
              tone: "accent",
            }}
            title="Upcoming appointment"
            subtitle="Tele-rehab session with your clinician."
            variant="compact"
            showChevron
            onPress={() => {}}
          />

          <MediaCard
            leading={{
              type: "thumbnail",
              source: LOCAL_GALLERY_IMAGE,
              fit: "contain",
              bg: "muted",
            }}
            title="Weekly summary ready"
            subtitle="Review your momentum and plan the next recovery block."
            chips={[
              { text: "Sleep", tone: "muted" },
              { text: "Hydration", tone: "info" },
              { text: "Mood", tone: "success" },
              { text: "Pain", tone: "warning" },
              { text: "PROM", tone: "muted" },
              { text: "Wearables", tone: "info" },
            ]}
            maxChips={3}
            statusPill={{ text: "Good", tone: "success" }}
            variant="emphasis"
            actions={[{ label: "Open report", onPress: () => {}, kind: "primary" }]}
          />
        </View>
      </Section>

      <Section title="TipCard preview" subtitle="Assistant-style guidance cards for chat and support" card>
        <View style={styles.mediaCardStack}>
          <TipCard
            tone="neutral"
            leading={{ type: "icon", icon: "insights", tone: "accent" }}
            title="Recovery tip"
            text="Ask short, specific questions to get guidance you can act on today."
            chips={["Exercises", "Pain"]}
            onPress={() => {}}
          />

          <TipCard
            tone="info"
            leading={{ type: "thumbnail", source: LOCAL_GALLERY_IMAGE, fit: "cover" }}
            title="Plan your next step"
            text="Review your daily plan and continue with one focused task."
            chips={["Plan", "Today", "Routine", "Reminder"]}
            actions={[
              { label: "Open plan", onPress: () => {}, kind: "primary" },
              { label: "Later", onPress: () => {}, kind: "secondary" },
            ]}
          />

          <TipCard
            tone="warning"
            compact
            leading={{ type: "icon", icon: "warning", tone: "warning" }}
            text="Something feels off? Share a short update so we can guide your next step."
            actions={[{ label: "Ask now", onPress: () => {}, kind: "secondary" }]}
          />

          <TipCard
            tone="safety"
            leading={{ type: "icon", icon: "safety", tone: "accent" }}
            title="Need support now?"
            text="Open your coping tools for a quick guided reset."
            chips={["Calm", "Breathing"]}
            actions={[{ label: "Open coping tools", onPress: () => {}, kind: "primary" }]}
          />
        </View>
      </Section>

      <Section title="TrackerTile preview" subtitle="Glanceable KPI tiles with micro visuals" card>
        <View style={styles.mediaCardStack}>
          <TrackerTile
            icon="progress"
            label="Pain"
            value="6.2/10"
            delta="↓ 0.4 vs last week"
            tone="warning"
            micro={{
              type: "sparkline",
              values: [7.4, 7.2, 6.9, 6.8, 6.6, 6.4, 6.2],
              tone: "warning",
            }}
          />
          <TrackerTile
            icon="hydration"
            label="Hydration"
            value="1.6L"
            delta="↑ 0.2L"
            tone="accent"
            micro={{
              type: "bars",
              values: [1.1, 1.0, 1.4, 1.2, 1.5, 1.3, 1.6],
            }}
          />
          <TrackerTile
            icon="sleep"
            label="Sleep"
            value="6.8h"
            delta="Stable"
            tone="success"
            micro={{
              type: "dots",
              values: [6.6, 6.9, 6.8, 6.7, 6.9, 6.8, 6.8],
            }}
          />
          <View style={styles.compactTilesRow}>
            <View style={styles.compactTileItem}>
              <TrackerTile
                icon="exercise"
                label="Adherence"
                value="82%"
                tone="primary"
                variant="compact"
                micro={{ type: "sparkline", values: [70, 72, 75, 78, 79, 80, 82] }}
              />
            </View>
            <View style={styles.compactTileItem}>
              <TrackerTile
                icon="nutrition"
                label="Nutrition"
                value="Good"
                tone="accent"
                variant="compact"
                micro={{ type: "ring", progress: 0.74 }}
              />
            </View>
            <View style={styles.compactTileItem}>
              <TrackerTile
                icon="meds"
                label="Meds"
                value="6/7"
                tone="success"
                variant="compact"
                micro={{ type: "dots", values: [1, 1, 1, 0, 1, 1, 1] }}
              />
            </View>
          </View>
        </View>
      </Section>

      <Section title="SegmentedControl preview" subtitle="Tokenized segmented options with fallback rendering" card>
        <View style={styles.stackSm}>
          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>Range selector</Text>
            <SegmentedControl
              value={rangeValue}
              options={[
                { value: "7", label: "7" },
                { value: "30", label: "30" },
                { value: "90", label: "90" },
              ]}
              onChange={setRangeValue}
              tone="primary"
              accessibilityLabel="Range selector"
            />
          </View>

          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>Mode selector with icons</Text>
            <SegmentedControl
              value={modeValue}
              options={[
                { value: "daily", label: "Daily", icon: "checkin" },
                { value: "weekly", label: "Weekly", icon: "weekly" },
                { value: "monthly", label: "Monthly", icon: "progress", disabled: true },
              ]}
              onChange={setModeValue}
              tone="accent"
              accessibilityLabel="Mode selector"
            />
          </View>

          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>Size variants</Text>
            <SegmentedControl
              value={sizeValueSm}
              size="sm"
              options={[
                { value: "daily", label: "Daily", icon: "checkin" },
                { value: "weekly", label: "Weekly", icon: "weekly" },
                { value: "monthly", label: "Monthly", icon: "progress" },
              ]}
              onChange={setSizeValueSm}
              tone="accent"
              accessibilityLabel="Small segmented control"
            />
            <SegmentedControl
              value={sizeValueMd}
              size="md"
              options={[
                { value: "daily", label: "Daily", icon: "checkin" },
                { value: "weekly", label: "Weekly", icon: "weekly" },
                { value: "monthly", label: "Monthly", icon: "progress" },
              ]}
              onChange={setSizeValueMd}
              tone="primary"
              accessibilityLabel="Medium segmented control"
            />
          </View>

          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>Wrap enabled</Text>
            <SegmentedControl
              value={wrapValue}
              allowWrap
              fullWidth={false}
              options={[
                { value: "all", label: "All" },
                { value: "focus", label: "Focus plan" },
                { value: "recovery", label: "Recovery" },
                { value: "caregiver", label: "Caregiver" },
              ]}
              onChange={setWrapValue}
              tone="accent"
              accessibilityLabel="Wrapped segmented control"
            />
          </View>
        </View>
      </Section>

      <Section title="Stunning effects preview" subtitle="Hero gradient + glass overlay primitives" card>
        <View style={styles.stackSm}>
          <HeroHeader
            title="Recovery Overview"
            subtitle="Calm visual emphasis for key daily context"
            left={<Avatar name="Malinda Perera" ring="ok" size={40} />}
            rightActions={[
              {
                icon: "bell",
                accessibilityLabel: "Notifications",
                onPress: () => {},
                tone: "accent",
              },
              {
                icon: "dots-horizontal",
                accessibilityLabel: "More options",
                onPress: () => {},
                tone: "muted",
              },
            ]}
          >
            <View style={styles.heroPillRow}>
              <StatusPill label="Synced" variant="success" />
              <StatusPill label="Plan ready" variant="info" />
            </View>
          </HeroHeader>

          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>GlassPanel (iOS blur / fallback elsewhere)</Text>
            <GlassPanel accessibilityLabel="Glass panel preview">
              <Row title="Today plan" subtitle="Mobility + strength block" />
              <SecondaryButton label="Open details" onPress={() => {}} />
            </GlassPanel>
          </View>

          <View style={styles.stackXs}>
            <Text style={styles.imageCaption}>GlassPanel (forced fallback)</Text>
            <GlassPanel
              forceFallback
              fallbackVariant="surface"
              fallbackOpacity={0.78}
              accessibilityLabel="Glass panel forced fallback preview"
            >
              <Row title="Fallback mode" subtitle="Consistent readable panel without blur." />
              <PrimaryButton label="Continue" onPress={() => {}} />
            </GlassPanel>
          </View>
        </View>
      </Section>

      <Section title="Card / Section / Row" subtitle="Structural primitives and row behavior" card>
        <Card>
          <Text style={styles.inlineLabel}>Card default</Text>
          <Text style={styles.inlineValue}>Used for balanced surface sections.</Text>
        </Card>
        <Card variant="elevated">
          <Text style={styles.inlineLabel}>Card elevated</Text>
          <Text style={styles.inlineValue}>Subtle depth for premium hierarchy.</Text>
        </Card>
        <Section
          title="Nested section sample"
          subtitle="Subtitle + right slot"
          right={<StatusPill label="Live" variant="success" />}
          card
        >
          <Text style={styles.inlineValue}>Section content inside a card group.</Text>
        </Section>
        <View style={styles.rowStack}>
          <Row
            title="Pressable row"
            subtitle="Opens details with chevron accessory"
            onPress={() => {}}
          />
          <Row
            title="Informational row"
            subtitle="This row is non-pressable and has no chevron"
            accessory="none"
          />
          <Row
            title="Row with value"
            subtitle="Long subtitle wraps to verify layout behavior across screen sizes and dynamic type."
            right={<Text style={styles.rightValue}>2h ago</Text>}
            onPress={() => {}}
          />
        </View>
      </Section>

      <Section title="Status components" subtitle="Pills, banners, and trust previews" card>
        <View style={styles.pillWrap}>
          <StatusPill label="Info" variant="info" />
          <StatusPill label="Success" variant="success" />
          <StatusPill label="Warning" variant="warning" />
          <StatusPill label="Danger (sample)" variant="danger" />
        </View>
        <Banner title="Info banner" message="General informational messaging style." variant="info" />
        <Banner
          title="Warning banner"
          message="Calm warning messaging for recoverable actions."
          variant="warning"
        />
        <Banner
          title="Error banner"
          message="Error state sample only for visual QA."
          variant="danger"
        />
        <Card variant="outlined">
          <View style={styles.stackSm}>
            <Text style={styles.inlineLabel}>Trust state preview</Text>
            <TrustCues
              status={{ kind: "syncing", pendingCount: 3, failedCount: 0 }}
              showLastUpdated
              lastUpdatedLabel="2m ago"
              showPending
              showSavedLocalHint
            />
            <TrustBanner status={{ kind: "offline", pendingCount: 2, failedCount: 0 }} />
            <TrustBanner status={{ kind: "serverDown", pendingCount: 0, failedCount: 0 }} />
            <TrustBanner status={{ kind: "syncing", pendingCount: 5, failedCount: 0 }} />
          </View>
        </Card>
      </Section>

      <Section title="EmptyState + illustrations" subtitle="Default and compact variants" card>
        <EmptyState
          illustrationKey="today"
          title="Default empty state sample"
          description="This shows the standard empty state spacing and hierarchy."
          ctaLabel="Sample CTA"
          onCtaPress={() => {}}
        />
        <EmptyState
          variant="compact"
          illustrationKey="progress"
          title="Compact empty state sample"
          description="Compact variant for embedded cards."
        />
        <View style={styles.illustrationGrid}>
          {ILLUSTRATION_KEYS.map((key) => (
            <Card key={key} variant="outlined" style={styles.illustrationCard}>
              <EmptyState
                variant="compact"
                imageSource={getIllustration(key)}
                title={key}
                description="Illustration key sample"
              />
            </Card>
          ))}
        </View>
      </Section>

      <Section title="Motion / Reduced Motion sanity" subtitle="Read-only OS motion preference" card>
        <Text style={styles.inlineValue}>
          Reduced motion: {reduceMotion ? "Enabled" : "Disabled"}
        </Text>
        <SecondaryButton
          label={showMotionPreview ? "Hide motion preview" : "Show motion preview"}
          onPress={() => {
            setShowMotionPreview((current) => !current);
          }}
        />
        <FadeSlideIn visible={showMotionPreview} reduceMotion={reduceMotion}>
          <Card variant="outlined">
            <Text style={styles.inlineLabel}>Motion preview</Text>
            <Text style={styles.inlineValue}>
              Fade/slide behavior should be subtle and instant when reduced motion is enabled.
            </Text>
          </Card>
        </FadeSlideIn>
      </Section>

      <Section title="New wow components placeholders" subtitle="Future premium primitives" card>
        <View style={styles.stackSm}>
          <PlaceholderCard title="CalendarHeatmap" subtitle="Coming soon · month-level adherence heatmap" />
        </View>
      </Section>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      marginBottom: tokens.spacing.sm,
    },
    swatchGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    iconItem: {
      minWidth: 120,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    iconItemLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      flexShrink: 1,
    },
    textSamples: {
      gap: tokens.spacing.xs,
    },
    stackXs: {
      gap: tokens.spacing.xs,
    },
    imageCaption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    avatarWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    avatarItem: {
      minWidth: 120,
      alignItems: "center",
      gap: tokens.spacing.xs,
      paddingVertical: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    avatarCaption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      textAlign: "center",
    },
    avatarSizes: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    mediaCardStack: {
      gap: tokens.spacing.md,
    },
    compactTilesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    compactTileItem: {
      flexGrow: 1,
      flexBasis: 200,
    },
    heroPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    sampleTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sampleBody: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    sampleCaption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    borderSample: {
      height: 1,
      backgroundColor: tokens.colors.border,
      marginTop: tokens.spacing.xs,
    },
    buttonColumn: {
      gap: tokens.spacing.sm,
    },
    iconButtonRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    inlineLabel: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    inlineValue: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    rowStack: {
      gap: tokens.spacing.sm,
    },
    rightValue: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    pillWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    stackSm: {
      gap: tokens.spacing.sm,
    },
    illustrationGrid: {
      gap: tokens.spacing.sm,
    },
    illustrationCard: {
      padding: tokens.spacing.md,
    },
    placeholderContent: {
      gap: tokens.spacing.xs,
    },
    placeholderTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    placeholderSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    swatchWrap: {
      width: 112,
      gap: 6,
    },
    swatch: {
      minHeight: 66,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    swatchLabel: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
      textAlign: "center",
    },
    swatchCode: {
      fontSize: 11,
      lineHeight: 14,
      color: tokens.colors.textMuted,
    },
  });
}
