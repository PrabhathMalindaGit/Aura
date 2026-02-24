import { Redirect, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { getPhotoMeta, type SymptomPhotoKind, type SymptomPhotoMeta } from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

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

export default function SymptomPhotoViewScreen() {
  const auth = useAuth();
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
      <Screen title="Photo">
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
    <Screen title="Photo">
      <ScrollView contentContainerStyle={styles.container}>
        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <InlineNotice
            variant="warning"
            title="No image"
            message="This image is unavailable."
          />
        )}

        <View style={styles.metaCard}>
          <Text style={styles.metaTitle}>{kindLabel(displayKind)}</Text>
          <Text style={styles.metaLine}>Date: {displayDate}</Text>
          {displayCreatedAt ? (
            <Text style={styles.metaLine}>
              Saved: {new Date(displayCreatedAt).toLocaleString()}
            </Text>
          ) : null}
          {displayNote ? <Text style={styles.metaLine}>Note: {displayNote}</Text> : null}
          {isPending ? (
            <Text style={styles.pendingLabel}>Pending sync</Text>
          ) : null}
          {!isPending ? (
            <PrimaryButton
              label="Reload"
              onPress={() => {
                void loadRemote();
              }}
              disabled={isLoading}
            />
          ) : null}
        </View>
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
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: 320,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  metaCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: "#fff",
  },
  metaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  metaLine: {
    fontSize: 13,
    color: "#4b5563",
  },
  pendingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
});
