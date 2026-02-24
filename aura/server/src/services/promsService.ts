export type PromBandKey = "green" | "amber" | "red";

export type PromQuestionLike = {
  id: string;
  text: string;
  type: "likert";
  min: number;
  max: number;
  labels?: {
    minLabel?: string;
    maxLabel?: string;
  };
  required?: boolean;
  reverse?: boolean;
};

export type PromBand = {
  key: PromBandKey;
  min: number;
  max: number;
  label: string;
};

export type PromScoringConfig = {
  method: "sum";
  minRaw: number;
  maxRaw: number;
  normalizeTo100?: boolean;
  bands: PromBand[];
};

export type PromTemplateLike = {
  key: string;
  title: string;
  description?: string;
  version: number;
  questions: PromQuestionLike[];
  scoring: PromScoringConfig;
};

export type PromSubmissionAnswer = {
  questionId: string;
  value: number;
};

export type PromComputedScore = {
  raw: number;
  normalized: number;
  bandKey: PromBandKey;
  bandLabel: string;
};

export function buildDefaultPromTemplate(): PromTemplateLike {
  return {
    key: "AURA_RECOVERY_5",
    title: "Aura Recovery Check",
    description: "Quick 5-question recovery check-in for rehab follow-up.",
    version: 1,
    questions: [
      {
        id: "q1",
        text: "How much did pain interfere with your day today?",
        type: "likert",
        min: 0,
        max: 4,
        labels: {
          minLabel: "Not at all",
          maxLabel: "Extremely",
        },
        required: true,
      },
      {
        id: "q2",
        text: "How hard was it to complete your exercise plan today?",
        type: "likert",
        min: 0,
        max: 4,
        labels: {
          minLabel: "Very easy",
          maxLabel: "Very hard",
        },
        required: true,
      },
      {
        id: "q3",
        text: "How poor was your sleep quality last night?",
        type: "likert",
        min: 0,
        max: 4,
        labels: {
          minLabel: "Very good",
          maxLabel: "Very poor",
        },
        required: true,
      },
      {
        id: "q4",
        text: "How much did stress or low mood affect you today?",
        type: "likert",
        min: 0,
        max: 4,
        labels: {
          minLabel: "Not at all",
          maxLabel: "Extremely",
        },
        required: true,
      },
      {
        id: "q5",
        text: "How difficult were your normal daily activities today?",
        type: "likert",
        min: 0,
        max: 4,
        labels: {
          minLabel: "No difficulty",
          maxLabel: "Unable",
        },
        required: true,
      },
    ],
    scoring: {
      method: "sum",
      minRaw: 0,
      maxRaw: 20,
      normalizeTo100: true,
      bands: [
        {
          key: "green",
          min: 0,
          max: 33,
          label: "Low concern",
        },
        {
          key: "amber",
          min: 34,
          max: 66,
          label: "Moderate concern",
        },
        {
          key: "red",
          min: 67,
          max: 100,
          label: "High concern",
        },
      ],
    },
  };
}

function ensureFiniteInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

function normalizeQuestionSet(questions: PromQuestionLike[]): PromQuestionLike[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Template questions are required");
  }

  const seenIds = new Set<string>();

  const normalized = questions.map((question) => {
    const id = question.id?.trim();
    if (!id) {
      throw new Error("Question id is required");
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate question id: ${id}`);
    }
    seenIds.add(id);

    ensureFiniteInteger(question.min, `Question ${id} min`);
    ensureFiniteInteger(question.max, `Question ${id} max`);
    if (question.max < question.min) {
      throw new Error(`Question ${id} max must be >= min`);
    }

    return {
      ...question,
      id,
      required: question.required !== false,
      reverse: question.reverse === true,
    };
  });

  return normalized;
}

function normalizeBands(bands: PromBand[]): PromBand[] {
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new Error("At least one scoring band is required");
  }

  return bands.map((band) => {
    ensureFiniteInteger(band.min, `Band ${band.key} min`);
    ensureFiniteInteger(band.max, `Band ${band.key} max`);
    if (band.max < band.min) {
      throw new Error(`Band ${band.key} max must be >= min`);
    }

    return {
      ...band,
      label: band.label?.trim() || band.key,
    };
  });
}

export function validatePromSubmission(
  templateOrSnapshot: Pick<PromTemplateLike, "questions">,
  answers: PromSubmissionAnswer[]
): PromSubmissionAnswer[] {
  const questions = normalizeQuestionSet(templateOrSnapshot.questions);

  if (!Array.isArray(answers)) {
    throw new Error("answers must be an array");
  }

  const answersByQuestion = new Map<string, number>();

  for (const answer of answers) {
    const questionId = answer.questionId?.trim();
    if (!questionId) {
      throw new Error("Each answer must include questionId");
    }

    const question = questions.find((entry) => entry.id === questionId);
    if (!question) {
      throw new Error(`Unknown questionId: ${questionId}`);
    }

    ensureFiniteInteger(answer.value, `Answer ${questionId} value`);
    if (answer.value < question.min || answer.value > question.max) {
      throw new Error(`Answer ${questionId} must be between ${question.min} and ${question.max}`);
    }

    if (answersByQuestion.has(questionId)) {
      throw new Error(`Duplicate answer for questionId: ${questionId}`);
    }

    answersByQuestion.set(questionId, answer.value);
  }

  const missingRequired = questions.filter(
    (question) => question.required !== false && !answersByQuestion.has(question.id)
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required answers: ${missingRequired.map((question) => question.id).join(",")}`
    );
  }

  return questions
    .filter((question) => answersByQuestion.has(question.id))
    .map((question) => ({
      questionId: question.id,
      value: answersByQuestion.get(question.id) as number,
    }));
}

export function computePromScore(
  templateOrSnapshot: Pick<PromTemplateLike, "questions" | "scoring">,
  answers: PromSubmissionAnswer[]
): PromComputedScore {
  const questions = normalizeQuestionSet(templateOrSnapshot.questions);
  const scoring = templateOrSnapshot.scoring;

  if (!scoring || scoring.method !== "sum") {
    throw new Error("Unsupported scoring method");
  }

  const bands = normalizeBands(scoring.bands);
  const validated = validatePromSubmission({ questions }, answers);
  const answersByQuestion = new Map(validated.map((answer) => [answer.questionId, answer.value]));

  let raw = 0;
  for (const question of questions) {
    const value = answersByQuestion.get(question.id);
    if (typeof value !== "number") {
      continue;
    }

    const scoredValue = question.reverse ? question.max - value + question.min : value;
    raw += scoredValue;
  }

  const minRaw = scoring.minRaw;
  const maxRaw = scoring.maxRaw;
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw) || maxRaw <= minRaw) {
    throw new Error("Invalid scoring range");
  }

  const normalized =
    scoring.normalizeTo100 === false
      ? Math.round(raw)
      : Math.round(((raw - minRaw) / (maxRaw - minRaw)) * 100);
  const clampedNormalized = Math.max(0, Math.min(100, normalized));

  const matchedBand =
    bands.find((band) => clampedNormalized >= band.min && clampedNormalized <= band.max) ??
    bands[bands.length - 1];

  return {
    raw,
    normalized: clampedNormalized,
    bandKey: matchedBand.key,
    bandLabel: matchedBand.label,
  };
}
