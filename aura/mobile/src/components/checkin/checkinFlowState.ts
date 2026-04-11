export type CheckinNoticeLike = {
  variant: "info" | "success" | "warning" | "danger";
  title: string;
  message: string;
  retryable?: boolean;
} | null;

export type CheckinStepVisualState = "active" | "done" | "upcoming";

export function getCheckinStepVisualState(
  index: number,
  activeStep: number,
): CheckinStepVisualState {
  if (index < activeStep) {
    return "done";
  }

  if (index === activeStep) {
    return "active";
  }

  return "upcoming";
}

export function getCheckinPrimaryActionLabel(activeStep: number): string {
  if (activeStep <= 0) {
    return "Continue to Recovery";
  }

  if (activeStep === 1) {
    return "Continue to Support";
  }

  if (activeStep === 2) {
    return "Continue to Review";
  }

  return "Submit check-in";
}

export function resolveCheckinHelperNotice(
  notice: CheckinNoticeLike,
  validationMessage: string | null,
): CheckinNoticeLike {
  if (!notice || notice.variant === "success") {
    return null;
  }

  if (validationMessage && notice.title === "Check your entries") {
    return null;
  }

  return notice;
}
