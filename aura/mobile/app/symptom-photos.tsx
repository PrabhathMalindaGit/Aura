import { Redirect, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  listPhotos,
  uploadPhoto,
  type PhotoUploadPayload,
  type SymptomPhotoItem,
  type SymptomPhotoKind,
} from "@/src/api/patient";
import { isApiError, type ApiError } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { SmartImage } from "@/src/components/SmartImage";
import { StatusPill } from "@/src/components/StatusPill";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  getPendingPhotoUploads,
  addPendingPhotoUpload,
  ensurePendingPhotosDirectory,
  removePendingPhotoUpload,
  type PendingPhotoUpload,
} from "@/src/state/pendingPhotoUploads";
import {
  getCachedPhotosList,
  setCachedPhotosList,
} from "@/src/state/photosCache";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

type DraftPhoto = {
  uri: string;
  mimeType: string;
  date: string;
  kind: SymptomPhotoKind;
  note: string;
};

type CombinedPhotoItem = SymptomPhotoItem & {
  pending: boolean;
  note?: string;
};

const KIND_OPTIONS: Array<{ key: SymptomPhotoKind; label: string }> = [
  { key: "swelling", label: "Swelling" },
  { key: "wound", label: "Wound" },
  { key: "rash", label: "Rash" },
  { key: "other", label: "Other" },
];

function toFriendlyPhotoError(error: unknown, title: string): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  let appError: ApiError;
  if (isApiError(error)) {
    appError = error;
  } else {
    const fallback = normalizeUnknownError(error);
    appError = {
      title: fallback.title,
      message: fallback.message,
      kind: fallback.kind,
      retryable: fallback.retryable,
      detail: fallback.detail,
    };
  }

  if (appError.kind === "offline") {
    return {
      title,
      message: "You’re offline. Photo saved locally and pending sync.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the service. Saved locally for sync.",
      kind: "network",
      retryable: true,
    };
  }
  if (appError.kind === "server") {
    return {
      title,
      message: "Server error. Try syncing again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Please check your photo and try again.",
      kind: "validation",
      retryable: false,
    };
  }
  return {
    title,
    message: appError.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
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

function guessMimeType(uri: string, fallback = "image/jpeg"): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".heic")) {
    return "image/heic";
  }
  if (lower.endsWith(".heif")) {
    return "image/heif";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return fallback;
}

function toPendingItem(entry: PendingPhotoUpload): CombinedPhotoItem {
  return {
    id: entry.localId,
    date: entry.date,
    kind: entry.kind,
    notePreview: entry.note?.slice(0, 80),
    createdAt: entry.createdAt,
    pending: true,
    localId: entry.localId,
    localFileUri: entry.localFileUri,
    note: entry.note,
  };
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

async function pickFromCamera(): Promise<DraftPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  const mimeType = guessMimeType(asset.uri, asset.mimeType ?? "image/jpeg");
  return {
    uri: asset.uri,
    mimeType,
    date: todayISO(),
    kind: "other",
    note: "",
  };
}

async function pickFromLibrary(): Promise<DraftPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsMultipleSelection: false,
  });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  const mimeType = guessMimeType(asset.uri, asset.mimeType ?? "image/jpeg");
  return {
    uri: asset.uri,
    mimeType,
    date: todayISO(),
    kind: "other",
    note: "",
  };
}

export default function SymptomPhotosScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const photosRefresh = useLastRefreshed("photos");
  const photosLoadError = useLastError("photosLoad");
  const photoUploadError = useLastError("photoUpload");
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const patientId = auth.patient?.id ?? "";
  const [serverItems, setServerItems] = useState<SymptomPhotoItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingPhotoUpload[]>([]);
  const [draftPhoto, setDraftPhoto] = useState<DraftPhoto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);
  const [segment, setSegment] = useState<"all" | "pending" | "uploaded">("all");

  const mergedItems = useMemo<CombinedPhotoItem[]>(() => {
    const pending = pendingItems.map((entry) => toPendingItem(entry));
    const remote = serverItems.map((entry) => ({
      ...entry,
      pending: false,
      note: undefined,
    }));
    return [...pending, ...remote].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
  }, [pendingItems, serverItems]);

  const filteredItems = useMemo(() => {
    if (segment === "pending") {
      return mergedItems.filter((item) => item.pending);
    }
    if (segment === "uploaded") {
      return mergedItems.filter((item) => !item.pending);
    }
    return mergedItems;
  }, [mergedItems, segment]);

  const reloadPending = useCallback(async () => {
    if (!patientId) {
      setPendingItems([]);
      return;
    }
    const pending = await getPendingPhotoUploads(patientId);
    setPendingItems(pending);
  }, [patientId]);

  const loadPhotos = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cached, pending] = await Promise.all([
        getCachedPhotosList(patientId),
        getPendingPhotoUploads(patientId),
      ]);
      setServerItems(cached?.items ?? []);
      setPendingItems(pending);
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — showing saved photos and pending uploads.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const [items, pending] = await Promise.all([
        listPhotos(auth.token, { limit: 40 }),
        getPendingPhotoUploads(patientId),
      ]);
      setServerItems(items);
      setPendingItems(pending);
      await setCachedPhotosList(patientId, items);
      await photosRefresh.refreshLocal();
      await photosLoadError.clear();
    } catch (error) {
      const friendly = toFriendlyPhotoError(error, "Couldn’t load photos");
      await photosLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cached, pending] = await Promise.all([
        getCachedPhotosList(patientId),
        getPendingPhotoUploads(patientId),
      ]);
      setServerItems(cached?.items ?? []);
      setPendingItems(pending);
      setNotice({
        variant: cached ? "warning" : "error",
        title: friendly.title,
        message: cached ? "Showing saved photo list." : friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [auth.token, isOffline, patientId, photosLoadError, photosRefresh]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadPhotos();
      return undefined;
    }, [auth.status, loadPhotos])
  );

  const queueDraftLocally = useCallback(
    async (draft: DraftPhoto): Promise<boolean> => {
      if (!patientId) {
        return false;
      }
      const dir = await ensurePendingPhotosDirectory();
      if (!dir) {
        return false;
      }
      const extension = mimeToExtension(draft.mimeType);
      const localCopyUri = `${dir}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`;

      await FileSystem.copyAsync({
        from: draft.uri,
        to: localCopyUri,
      });

      await addPendingPhotoUpload(patientId, {
        date: draft.date,
        kind: draft.kind,
        note: draft.note,
        localFileUri: localCopyUri,
        mimeType: draft.mimeType,
      });
      await reloadPending();
      return true;
    },
    [patientId, reloadPending]
  );

  const saveDraft = useCallback(async () => {
    if (!auth.token || !patientId || !draftPhoto) {
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const payload: PhotoUploadPayload = {
      uri: draftPhoto.uri,
      mimeType: draftPhoto.mimeType,
      date: draftPhoto.date,
      kind: draftPhoto.kind,
      note: draftPhoto.note.trim() ? draftPhoto.note.trim().slice(0, 280) : undefined,
    };

    if (isOffline) {
      const queued = await queueDraftLocally(draftPhoto);
      if (queued) {
        await photoUploadError.setLocalError({
          title: "Upload pending",
          message: "You’re offline. Photo saved locally and pending sync.",
          kind: "offline",
          retryable: true,
        });
        setDraftPhoto(null);
        setNotice({
          variant: "warning",
          title: "Saved locally",
          message: "Photo is pending upload and will sync when you tap Sync now.",
        });
      } else {
        setNotice({
          variant: "error",
          title: "Couldn’t save offline photo",
          message: "The app could not store the image locally.",
        });
      }
      setIsSaving(false);
      return;
    }

    try {
      await uploadPhoto(auth.token, payload);
      await photoUploadError.clear();
      setDraftPhoto(null);
      await loadPhotos();
      setNotice({
        variant: "info",
        title: "Photo uploaded",
        message: "Your symptom photo was uploaded successfully.",
      });
    } catch (error) {
      const friendly = toFriendlyPhotoError(error, "Couldn’t upload photo");
      await photoUploadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const queued = await queueDraftLocally(draftPhoto);
      if (queued) {
        setDraftPhoto(null);
        setNotice({
          variant: "warning",
          title: friendly.title,
          message: "Saved locally and queued for sync.",
        });
      } else {
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    auth.token,
    draftPhoto,
    isOffline,
    loadPhotos,
    patientId,
    photoUploadError,
    queueDraftLocally,
  ]);

  const syncPending = useCallback(async () => {
    if (!auth.token || !patientId || isOffline) {
      return;
    }

    const pending = await getPendingPhotoUploads(patientId);
    if (pending.length === 0) {
      return;
    }

    setIsSyncing(true);
    setNotice(null);

    for (const entry of pending) {
      try {
        await uploadPhoto(auth.token, {
          uri: entry.localFileUri,
          mimeType: entry.mimeType,
          date: entry.date,
          kind: entry.kind,
          note: entry.note,
        });
        await removePendingPhotoUpload(patientId, entry.localId);
        try {
          await FileSystem.deleteAsync(entry.localFileUri, { idempotent: true });
        } catch {
          // best-effort local cleanup
        }
      } catch (error) {
        const friendly = toFriendlyPhotoError(error, "Couldn’t sync photos");
        await photoUploadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: "Sync stopped. Remaining photos are still pending.",
        });
        setIsSyncing(false);
        await reloadPending();
        return;
      }
    }

    await photoUploadError.clear();
    await loadPhotos();
    setNotice({
      variant: "info",
      title: "Sync complete",
      message: "All pending photos were uploaded.",
    });
    setIsSyncing(false);
  }, [auth.token, isOffline, loadPhotos, patientId, photoUploadError, reloadPending]);

  const openPickMenu = useCallback(() => {
    Alert.alert("Add symptom photo", "Choose photo source", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Camera",
        onPress: () => {
          void (async () => {
            const picked = await pickFromCamera();
            if (!picked) {
              return;
            }
            setDraftPhoto(picked);
          })();
        },
      },
      {
        text: "Photo library",
        onPress: () => {
          void (async () => {
            const picked = await pickFromLibrary();
            if (!picked) {
              return;
            }
            setDraftPhoto(picked);
          })();
        },
      },
    ]);
  }, []);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Symptom photos"
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

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Symptom photos"
          subtitle={`${mergedItems.length} photos · ${pendingItems.length} pending`}
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? "Patient"}
              fallback="icon"
              iconKey="photos"
              ring={isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "photos",
              tone: "accent",
              accessibilityLabel: "Add photo",
              onPress: openPickMenu,
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
      <FlatList
        data={filteredItems}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        keyExtractor={(item) => (item.pending ? `pending-${item.localId}` : item.id)}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => {
          const imageSource = item.pending
            ? { uri: item.localFileUri ?? "" }
            : ({
                uri: `${API_BASE}/patient/photos/${encodeURIComponent(item.id)}/file`,
                headers: auth.token
                  ? { Authorization: `Bearer ${auth.token}` }
                  : undefined,
              } as unknown as { uri: string });

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.kind} photo from ${item.date}. Status: ${item.pending ? "Pending upload" : "Uploaded"}.`}
              style={({ pressed }) => [styles.tilePressable, pressed ? styles.tilePressed : null]}
              onPress={() => {
                if (item.pending) {
                  router.push({
                    pathname: "/symptom-photo-view" as never,
                    params: {
                      mode: "pending",
                      localFileUri: item.localFileUri ?? "",
                      date: item.date,
                      kind: item.kind,
                      note: item.note ?? "",
                      createdAt: item.createdAt,
                    },
                  });
                  return;
                }

                router.push({
                  pathname: "/symptom-photo-view" as never,
                  params: { id: item.id },
                });
              }}
            >
              <View style={styles.tileImageWrap}>
                <SmartImage
                  source={imageSource}
                  height={112}
                  radius={tokens.radius.md}
                  contentFit="cover"
                  backgroundVariant="muted"
                  accessibilityLabel={`${item.kind} photo`}
                />
                <View style={styles.tileStatusWrap}>
                  <StatusPill
                    label={item.pending ? "Pending" : "Uploaded"}
                    variant={item.pending ? "warning" : "success"}
                    accessible={false}
                  />
                </View>
              </View>
              <Text numberOfLines={1} style={styles.tileTitle}>
                {item.kind.charAt(0).toUpperCase() + item.kind.slice(1)}
              </Text>
              <Text numberOfLines={1} style={styles.tileMeta}>
                {formatDateTime(item.createdAt)}
              </Text>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={styles.stack}>
            {__DEV__ ? (
              <View style={styles.devBlock}>
                <SecondaryButton
                  label={showDevDiagnostics ? "Hide diagnostics" : "Diagnostics (dev)"}
                  onPress={() => {
                    setShowDevDiagnostics((current) => !current);
                  }}
                />
                {showDevDiagnostics ? (
                  <View style={styles.devMetaWrap}>
                    <LastRefreshed label="Last refreshed" value={photosRefresh.label} compact />
                    <LastFailedAttempt
                      label="Last photo load failure"
                      value={photosLoadError.label}
                      title={photosLoadError.lastError?.title}
                      message={photosLoadError.lastError?.message}
                      compact
                    />
                    <LastFailedAttempt
                      label="Last photo upload failure"
                      value={photoUploadError.label}
                      title={photoUploadError.lastError?.title}
                      message={photoUploadError.lastError?.message}
                      compact
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {isOffline ? (
              <Banner
                variant="warning"
                title="Offline"
                message="Offline — new photos are saved locally and marked pending."
              />
            ) : null}

            {notice ? (
              <Banner
                variant={toBannerVariant(notice.variant)}
                title={notice.title}
                message={notice.message}
              />
            ) : null}

            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "photos", tone: "accent" }}
                  title={`${mergedItems.length}`}
                  subtitle="Total photos"
                />
              </View>
              <View style={styles.summaryCol}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "warning", tone: "warning" }}
                  title={`${pendingItems.length}`}
                  subtitle="Pending uploads"
                />
              </View>
            </View>

            <SegmentedControl
              value={segment}
              onChange={(next) => {
                setSegment(next);
              }}
              options={[
                { value: "all", label: "All", icon: "photos" },
                { value: "pending", label: "Pending", icon: "warning" },
                { value: "uploaded", label: "Uploaded", icon: "success" },
              ]}
              accessibilityLabel="Photo filter"
            />

            <View style={styles.actionRow}>
              <View style={styles.actionCol}>
                <PrimaryButton
                  label="Add photo"
                  onPress={openPickMenu}
                  disabled={isSaving || isSyncing}
                />
              </View>
              <View style={styles.actionCol}>
                <SecondaryButton
                  label={isSyncing ? "Syncing..." : "Sync now"}
                  loading={isSyncing}
                  disabled={isOffline || isSyncing || pendingItems.length === 0}
                  onPress={() => {
                    void syncPending();
                  }}
                />
              </View>
            </View>

            {draftPhoto ? (
              <View style={styles.draftCard}>
                <Text style={styles.draftTitle}>New photo</Text>
                <SmartImage
                  source={{ uri: draftPhoto.uri }}
                  height={220}
                  radius={tokens.radius.lg}
                  contentFit="cover"
                  backgroundVariant="muted"
                  accessibilityLabel="Selected symptom photo"
                />

                <Text style={styles.draftMeta}>Date: {draftPhoto.date}</Text>

                <View style={styles.kindRow}>
                  {KIND_OPTIONS.map((option) => {
                    const isActive = draftPhoto.kind === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        accessibilityRole="button"
                        accessibilityLabel={`Set kind ${option.label}`}
                        onPress={() => {
                          setDraftPhoto((current) =>
                            current ? { ...current, kind: option.key } : current
                          );
                        }}
                        style={({ pressed }) => [
                          styles.kindChip,
                          isActive ? styles.kindChipActive : null,
                          pressed ? styles.kindChipPressed : null,
                        ]}
                      >
                        <Text style={isActive ? styles.kindChipTextActive : styles.kindChipText}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.noteInput}
                  multiline
                  maxLength={280}
                  placeholder="Optional note (max 280)"
                  placeholderTextColor={tokens.colors.textMuted}
                  value={draftPhoto.note}
                  onChangeText={(value) => {
                    setDraftPhoto((current) =>
                      current ? { ...current, note: value } : current
                    );
                  }}
                />

                <View style={styles.actionRow}>
                  <View style={styles.actionCol}>
                    <PrimaryButton
                      label={isSaving ? "Saving..." : "Save photo"}
                      loading={isSaving}
                      disabled={isSaving}
                      onPress={() => {
                        void saveDraft();
                      }}
                    />
                  </View>
                  <View style={styles.actionCol}>
                    <SecondaryButton
                      label="Discard"
                      disabled={isSaving}
                      onPress={() => {
                        setDraftPhoto(null);
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <EmptyState
              illustrationKey="progress"
              title="No symptom photos"
              description="Add one to start a visual timeline."
              ctaLabel="Add photo"
              onCtaPress={openPickMenu}
            />
          )
        }
        ListFooterComponent={<View style={styles.bottomSpacer} />}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    stack: {
      gap: tokens.spacing.md,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 120,
    },
    devBlock: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    devMetaWrap: {
      gap: tokens.spacing.xs,
    },
    summaryRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    summaryCol: {
      flex: 1,
      minWidth: 0,
    },
    actionRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    actionCol: {
      flex: 1,
      minWidth: 0,
    },
    draftCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    draftTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    draftMeta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    kindRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    kindChip: {
      minHeight: 40,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: 999,
      paddingHorizontal: tokens.spacing.sm + 2,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceElevated,
    },
    kindChipActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    kindChipPressed: {
      opacity: 0.88,
    },
    kindChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    kindChipTextActive: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    noteInput: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
      textAlignVertical: "top",
      backgroundColor: tokens.colors.surfaceElevated,
      color: tokens.colors.text,
    },
    gridRow: {
      gap: tokens.spacing.sm,
    },
    tilePressable: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.xs,
      gap: tokens.spacing.xs,
      marginBottom: tokens.spacing.sm,
    },
    tilePressed: {
      opacity: 0.9,
    },
    tileImageWrap: {
      position: "relative",
    },
    tileStatusWrap: {
      position: "absolute",
      top: tokens.spacing.xs,
      left: tokens.spacing.xs,
    },
    tileTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    tileMeta: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
    },
    bottomSpacer: {
      height: tokens.spacing.md,
    },
  });
}
