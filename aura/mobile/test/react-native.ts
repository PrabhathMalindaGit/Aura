import React from "react";

export type AppStateStatus = "active" | "background" | "inactive";
export type StyleProp<T> = T;
export type ViewStyle = Record<string, unknown>;

const listeners = new Set<(state: AppStateStatus) => void>();

export const Platform = {
  OS: "ios",
};

export function __setPlatformOS(nextOS: typeof Platform.OS): void {
  Platform.OS = nextOS;
}

export const AppState = {
  currentState: "active" as AppStateStatus,
  addEventListener: (
    _type: "change",
    listener: (state: AppStateStatus) => void
  ) => {
    listeners.add(listener);
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  },
};

export function __setAppState(nextState: AppStateStatus): void {
  AppState.currentState = nextState;
  listeners.forEach((listener) => listener(nextState));
}

export const View = ({
  children,
  ...props
}: Record<string, unknown> & { children?: React.ReactNode }) =>
  React.createElement("View", props, children);

export const Text = ({
  children,
  ...props
}: Record<string, unknown> & { children?: React.ReactNode }) =>
  React.createElement("Text", props, children);

export const Pressable = ({
  children,
  ...props
}: Record<string, unknown> & { children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode) }) =>
  React.createElement(
    "Pressable",
    props,
    typeof children === "function" ? children({ pressed: false }) : children
  );

export const StyleSheet = {
  absoluteFillObject: {},
  create: <T extends Record<string, unknown>>(styles: T) => styles,
};
