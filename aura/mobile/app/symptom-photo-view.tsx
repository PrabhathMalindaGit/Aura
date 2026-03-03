import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { getPhotoMeta, type SymptomPhotoKind, type SymptomPhotoMeta } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
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

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Photo"
          subtitle={displayDate !== "Unknown" ? displayDate : "Symptom photo"}
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
        />
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

        <View style={styles.statusRow}>
          <StatusPill
            label={isPending ? "Pending sync" : "Uploaded"}
            variant={isPending ? "warning" : "success"}
          />
          <StatusPill label={kindLabel(displayKind)} variant="info" />
        </View>

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
          title="Details"
          subtitle={
            displayCreatedAt
              ? `Saved ${new Date(displayCreatedAt).toLocaleString()}`
              : "Saved time unavailable"
          }
          chips={[
            { text: `Date ${displayDate}`, tone: "muted" },
            { text: kindLabel(displayKind), tone: "muted" },
            { text: isPending ? "Pending sync" : "Uploaded", tone: isPending ? "warning" : "success" },
          ]}
        />

        <MediaCard
          leading={{ type: "icon", icon: "chat", tone: "muted" }}
          title="Notes"
          subtitle={displayNote ?? "No notes provided"}
        />

        {!isPending ? (
          <PrimaryButton
            label="Reload"
            onPress={() => {
              void loadRemote();
            }}
            disabled={isLoading}
          />
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
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
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
  });
}
