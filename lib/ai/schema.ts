import { z } from "zod";

const nullableString = z.string().nullable();

function isValidDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const extractedTaskSchema = z.object({
  tempId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string(),
  assigneeName: nullableString,
  assigneeEmail: z.string().email().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidDate)
    .nullable(),
  priority: z.enum(["Low", "Medium", "High", "Highest"]),
  status: z.enum(["To do", "In progress", "Blocked", "Recommended"]),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  shouldCreateTask: z.boolean(),
});

export const taskExtractionSchema = z.object({
  tasks: z.array(extractedTaskSchema).max(100),
  excludedItems: z
    .array(
      z.object({
        text: z.string(),
        reason: z.string(),
      }),
    )
    .max(100),
});

const nullableStringJsonSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

export const TASK_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tempId: { type: "string" },
          title: { type: "string", maxLength: 500 },
          description: { type: "string" },
          assigneeName: nullableStringJsonSchema,
          assigneeEmail: nullableStringJsonSchema,
          dueDate: {
            anyOf: [
              {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              },
              { type: "null" },
            ],
          },
          priority: {
            type: "string",
            enum: ["Low", "Medium", "High", "Highest"],
          },
          status: {
            type: "string",
            enum: ["To do", "In progress", "Blocked", "Recommended"],
          },
          evidence: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          shouldCreateTask: { type: "boolean" },
        },
        required: [
          "tempId",
          "title",
          "description",
          "assigneeName",
          "assigneeEmail",
          "dueDate",
          "priority",
          "status",
          "evidence",
          "confidence",
          "shouldCreateTask",
        ],
      },
    },
    excludedItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          reason: { type: "string" },
        },
        required: ["text", "reason"],
      },
    },
  },
  required: ["tasks", "excludedItems"],
} as const;
