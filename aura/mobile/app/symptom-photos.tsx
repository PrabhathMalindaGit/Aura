import { Redirect, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
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
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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

  const patientId = auth.patient?.id ?? "";
  const [serverItems, setServerItems] = useState<SymptomPhotoItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingPhotoUpload[]>([]);
  const [draftPhoto, setDraftPhoto] = useState<DraftPhoto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

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
      <Screen title="Symptom photos">
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
    <Screen title="Symptom photos">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed label="Last refreshed" value={photosRefresh.label} />
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

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — new photos are saved locally and marked pending."
          />
        ) : null}

        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Section title="Actions">
          <Text style={styles.metaText}>Pending uploads: {pendingItems.length}</Text>
          <PrimaryButton
            label="Add photo"
            onPress={openPickMenu}
            disabled={isSaving || isSyncing}
          />
          <PrimaryButton
            label={isSyncing ? "Syncing..." : "Sync now"}
            loading={isSyncing}
            disabled={isOffline || isSyncing || pendingItems.length === 0}
            onPress={() => {
              void syncPending();
            }}
          />
        </Section>

        {draftPhoto ? (
          <Section title="New photo">
            <Image source={{ uri: draftPhoto.uri }} style={styles.previewImage} />
            <Text style={styles.metaText}>Date: {draftPhoto.date}</Text>

            <View style={styles.kindRow}>
              {KIND_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  style={({ pressed }) => [
                    styles.kindChip,
                    draftPhoto.kind === option.key ? styles.kindChipActive : null,
                    pressed ? styles.kindChipPressed : null,
                  ]}
                  onPress={() => {
                    setDraftPhoto((current) =>
                      current ? { ...current, kind: option.key } : current
                    );
                  }}
                >
                  <Text
                    style={
                      draftPhoto.kind === option.key
                        ? styles.kindChipTextActive
                        : styles.kindChipText
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.noteInput}
              multiline
              maxLength={280}
              placeholder="Optional note (max 280)"
              value={draftPhoto.note}
              onChangeText={(value) => {
                setDraftPhoto((current) =>
                  current ? { ...current, note: value } : current
                );
              }}
            />

            <PrimaryButton
              label={isSaving ? "Saving..." : "Save photo"}
              loading={isSaving}
              disabled={isSaving}
              onPress={() => {
                void saveDraft();
              }}
            />
            <PrimaryButton
              label="Discard"
              disabled={isSaving}
              onPress={() => {
                setDraftPhoto(null);
              }}
            />
          </Section>
        ) : null}

        <Section title="Recent photos">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : mergedItems.length === 0 ? (
            <Text style={styles.metaText}>
              No symptom photos yet. Add one to start tracking.
            </Text>
          ) : (
            mergedItems.map((item) => {
              const key = item.pending ? `pending-${item.localId}` : item.id;
              const source = item.pending
                ? { uri: item.localFileUri ?? "" }
                : ({
                    uri: `${API_BASE}/patient/photos/${encodeURIComponent(item.id)}/file`,
                    headers: auth.token
                      ? { Authorization: `Bearer ${auth.token}` }
                      : undefined,
                  } as any);

              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => [
                    styles.photoRow,
                    pressed ? styles.photoRowPressed : null,
                  ]}
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
                  <Image source={source} style={styles.thumbnail} />
                  <View style={styles.photoMeta}>
                    <Text style={styles.photoTitle}>
                      {item.kind.charAt(0).toUpperCase() + item.kind.slice(1)}
                    </Text>
                    <Text style={styles.metaText}>Date: {item.date}</Text>
                    <Text style={styles.metaText}>{formatDateTime(item.createdAt)}</Text>
                    {item.notePreview ? (
                      <Text style={styles.metaText}>{item.notePreview}</Text>
                    ) : null}
                    {item.pending ? (
                      <Text style={styles.pendingLabel}>Pending sync</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 100,
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  kindRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kindChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  kindChipActive: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  kindChipPressed: {
    opacity: 0.9,
  },
  kindChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  kindChipTextActive: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
    backgroundColor: "#fff",
  },
  photoRow: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  photoRowPressed: {
    opacity: 0.9,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  photoMeta: {
    flex: 1,
    gap: 2,
  },
  photoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  pendingLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
});
