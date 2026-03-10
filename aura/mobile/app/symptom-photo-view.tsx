import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { getPhotoMeta, type SymptomPhotoKind, type SymptomPhotoMeta } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SmartImage } from "@/src/components/SmartImage";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { useTokens } from "@/src/theme/tokens";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

function kindLabel(kind: SymptomPhotoKind): string {
  if (kind === "swelling") {
    return "Swelling";
  }
  if (kind === "wound") {
    return "Wound";
  }
  if (kind === "rash") {
    return "Rash";
  }
  return "Other";
}

function normalizeKind(value: unknown): SymptomPhotoKind {
  return value === "swelling" || value === "wound" || value === "rash"
    ? value
    : "other";
}

function mimeToExtension(mimeType: string): string {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/heic") {
    return "heic";
  }
  if (mimeType === "image/heif") {
    return "heif";
  }
  return "jpg";
}

function formatFileSize(value?: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (!value || value <= 0) {
    return "0 B";
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function formatDate(value?: string): string {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "Unknown time";
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SymptomPhotoViewScreen() {
  const auth = useAuth();
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const params = useLocalSearchParams<{
    id?: string;
    mode?: string;
    localFileUri?: string;
    date?: string;
    kind?: string;
    note?: string;
    createdAt?: string;
  }>();

  const isPending = params.mode === "pending";
  const photoId = typeof params.id === "string" ? params.id : "";

  const [meta, setMeta] = useState<SymptomPhotoMeta | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(
    isPending && typeof params.localFileUri === "string" ? params.localFileUri : null
  );
  const [isLoading, setIsLoading] = useState(!isPending);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const loadRemote = useCallback(async () => {
    if (!auth.token || !photoId || isPending) {
      return;
    }

    setIsLoading(true);
    setNotice(null);
    try {
      const fetchedMeta = await getPhotoMeta(auth.token, photoId);
      setMeta(fetchedMeta);

      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        throw new Error("No cache directory available.");
      }
      const target = `${baseDir}symptom-photo-${photoId}-${Date.now()}.${mimeToExtension(
        fetchedMeta.mimeType
      )}`;
      const response = await FileSystem.downloadAsync(
        `${API_BASE}/patient/photos/${encodeURIComponent(photoId)}/file`,
        target,
        {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      setImageUri(response.uri);
    } catch {
      setNotice({
        variant: "error",
        title: "Couldn’t load photo",
        message: "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [auth.token, isPending, photoId]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      if (isPending) {
        setIsLoading(false);
        return;
      }
      void loadRemote();
      return undefined;
    }, [auth.status, isPending, loadRemote])
  );

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Photo"
            subtitle="Loading"
            left={<Avatar size={40} name={auth.patient?.displayName ?? "Patient"} fallback="icon" iconKey="photos" />}
          />
        }
      >
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const pendingKind = normalizeKind(params.kind);
  const pendingDate = typeof params.date === "string" ? params.date : "Unknown";
  const pendingNote =
    typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
  const pendingCreatedAt =
    typeof params.createdAt === "string" ? params.createdAt : undefined;

  const displayKind = isPending ? pendingKind : meta?.kind ?? "other";
  const displayDate = isPending ? pendingDate : meta?.date ?? "Unknown";
  const displayNote = isPending ? pendingNote : meta?.note;
  const displayCreatedAt = isPending ? pendingCreatedAt : meta?.createdAt;
  const photoStatusLabel = isPending ? "Pending sync" : "Uploaded";
  const photoStatusTone = isPending ? "warning" : "success";
  const photoStoryTitle = isPending
    ? "This photo is saved on this device and waiting to sync"
    : "This photo is part of your symptom timeline";
  const photoStoryNote = isPending
    ? "The image is stored locally for now. Once it syncs, it becomes part of your shared symptom history."
    : "Use the capture date, symptom type, and note below to remember what this photo was documenting.";
  const reviewSubtitle =
    displayDate !== "Unknown" ? `${formatDate(displayCreatedAt)} · ${kindLabel(displayKind)}` : "Symptom photo";

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Photo"
          subtitle="Visual symptom review"
          left={<Avatar size={40} name={auth.patient?.displayName ?? "Patient"} fallback="icon" iconKey="photos" />}
          rightActions={[
            {
              icon: "chevron-left",
              tone: "muted",
              accessibilityLabel: "Go back",
              onPress: () => router.back(),
            },
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => router.push("/safety" as never),
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill label={photoStatusLabel} variant={photoStatusTone} accessible={false} />
            <StatusPill label={kindLabel(displayKind)} variant="info" accessible={false} />
            <StatusPill label={displayDate !== "Unknown" ? displayDate : "Date unavailable"} variant="neutral" accessible={false} />
          </View>
        </HeroHeader>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Card variant="elevated" padding={tokens.spacing.lg} style={styles.storyCard}>
          <View style={styles.storyHeader}>
            <View style={styles.storyTitleWrap}>
              <Text style={styles.storyEyebrow}>Visual review</Text>
              <Text style={styles.storyTitle}>{photoStoryTitle}</Text>
            </View>
            <StatusPill label={photoStatusLabel} variant={photoStatusTone} accessible={false} />
          </View>
          <Text style={styles.storyBody}>{photoStoryNote}</Text>
          <View style={styles.storyMetricRow}>
            <View style={styles.storyMetric}>
              <Text style={styles.storyMetricValue}>{kindLabel(displayKind)}</Text>
              <Text style={styles.storyMetricLabel}>Symptom type</Text>
            </View>
            <View style={styles.storyMetric}>
              <Text style={styles.storyMetricValue}>{displayDate}</Text>
              <Text style={styles.storyMetricLabel}>Capture date</Text>
            </View>
            <View style={styles.storyMetric}>
              <Text style={styles.storyMetricValue}>{formatFileSize(meta?.sizeBytes)}</Text>
              <Text style={styles.storyMetricLabel}>Image size</Text>
            </View>
          </View>
        </Card>

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
          <Text style={styles.sectionEyebrow}>Photo</Text>
          <Text style={styles.sectionTitle}>Review what was captured</Text>
          <Text style={styles.sectionBody}>
            Start with the image, then use the details below to understand when it was taken and
            what it was documenting.
          </Text>
        </Card>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : imageUri ? (
          <SmartImage
            source={{ uri: imageUri }}
            height={300}
            radius={tokens.radius.xl}
            contentFit="contain"
            backgroundVariant="muted"
            accessibilityLabel="Symptom photo"
          />
        ) : (
          <Banner
            variant="warning"
            title="No image"
            message="This image is unavailable."
          />
        )}

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
          <Text style={styles.sectionEyebrow}>Details</Text>
          <Text style={styles.sectionTitle}>Photo context</Text>
          <Text style={styles.sectionBody}>
            These details help keep the image useful as part of your symptom history, especially
            when you compare it with future captures.
          </Text>
        </Card>

        <View style={styles.metricGrid}>
          <View style={styles.metricTileWrap}>
            <TrackerTile
              icon="photos"
              label="Status"
              value={isPending ? "Pending" : "Uploaded"}
              delta="Upload"
              tone={isPending ? "warning" : "success"}
              micro={{ type: "dots", values: [0.4, 0.5, 0.6, isPending ? 0.35 : 0.8] }}
            />
          </View>
          <View style={styles.metricTileWrap}>
            <TrackerTile
              icon="checkin"
              label="Type"
              value={kindLabel(displayKind)}
              delta="Symptom"
              tone="accent"
              micro={{ type: "dots", values: [0.45, 0.5, 0.55, 0.58] }}
            />
          </View>
          <View style={styles.metricTileWrap}>
            <TrackerTile
              icon="weekly"
              label="Date"
              value={displayDate}
              delta="Recorded"
              tone="muted"
              micro={{ type: "dots", values: [0.5, 0.5, 0.5, 0.5] }}
            />
          </View>
          <View style={styles.metricTileWrap}>
            <TrackerTile
              icon="info"
              label="File size"
              value={formatFileSize(meta?.sizeBytes)}
              delta="Image"
              tone="muted"
              micro={{ type: "dots", values: [0.45, 0.52, 0.54, 0.6] }}
            />
          </View>
        </View>

        <MediaCard
          leading={{ type: "icon", icon: "info", tone: "muted" }}
          title="Photo summary"
          subtitle={displayCreatedAt ? `Saved ${formatDateTime(displayCreatedAt)}` : "Saved time unavailable"}
          chips={[
            { text: `Date ${displayDate}`, tone: "muted" },
            { text: kindLabel(displayKind), tone: "muted" },
            { text: isPending ? "Pending sync" : "Uploaded", tone: isPending ? "warning" : "success" },
          ]}
          statusPill={{ text: photoStatusLabel, tone: photoStatusTone }}
        />

        <MediaCard
          leading={{ type: "icon", icon: "chat", tone: "muted" }}
          title="Capture note"
          subtitle={displayNote ?? "No note was added for this photo."}
          chips={[
            { text: reviewSubtitle, tone: "muted" },
            ...(displayNote ? [{ text: "Note saved", tone: "info" as const }] : []),
          ]}
        />

        {!isPending ? (
          <View style={styles.footerAction}>
            <Text style={styles.footerTitle}>Refresh when you need an updated copy</Text>
            <Text style={styles.footerBody}>
              If the image or detail card looks out of date, reload it from your symptom timeline.
            </Text>
            <PrimaryButton
              label="Reload photo"
              onPress={() => {
                void loadRemote();
              }}
              disabled={isLoading}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    storyCard: {
      gap: tokens.spacing.md,
    },
    storyHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    storyTitleWrap: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    storyMetricRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    storyMetric: {
      flex: 1,
      minWidth: 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    storyMetricValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyMetricLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    sectionIntro: {
      gap: tokens.spacing.xs,
    },
    sectionEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    metricTileWrap: {
      width: "48%",
      minWidth: 0,
    },
    footerAction: {
      gap: tokens.spacing.sm,
    },
    footerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    footerBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
  });
}
