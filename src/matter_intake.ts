import { z } from "zod";

export const matterIntakeSchema = z.object({
  matterId: z.string().min(1).max(80),
  clientName: z.string().min(1).max(120),
  legalIssue: z.string().min(10).max(4_000),
  signedDocument: z.object({
    label: z.string().min(1).max(160),
    delivered: z.boolean(),
    deliveredAt: z.string().datetime().optional()
  }),
  deadline: z.string().datetime()
}).strict().superRefine((matter, context) => {
  if (matter.signedDocument.delivered && !matter.signedDocument.deliveredAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["signedDocument", "deliveredAt"],
      message: "deliveredAt is required when the signed document has been delivered"
    });
  }
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;
export type MatterAction = "deadline-follow-up" | "document-delivered" | "intake-review";

export interface MatterDecision {
  action: MatterAction;
  hoursUntilDeadline: number;
  summary: string;
}

export function decideMatterAction(matter: MatterIntake, now: Date): MatterDecision {
  const hoursUntilDeadline = Math.ceil(
    (new Date(matter.deadline).getTime() - now.getTime()) / 3_600_000
  );

  if (!matter.signedDocument.delivered && hoursUntilDeadline <= 72) {
    return {
      action: "deadline-follow-up",
      hoursUntilDeadline,
      summary: `The signed ${matter.signedDocument.label} is outstanding with ${hoursUntilDeadline} hours until the deadline.`
    };
  }

  if (matter.signedDocument.delivered) {
    return {
      action: "document-delivered",
      hoursUntilDeadline,
      summary: `The signed ${matter.signedDocument.label} was delivered; prepare the client-facing intake response.`
    };
  }

  return {
    action: "intake-review",
    hoursUntilDeadline,
    summary: `The matter is in intake review with ${hoursUntilDeadline} hours until the deadline.`
  };
}

export function buildAgentMessages(matter: MatterIntake, decision: MatterDecision) {
  return [
    {
      role: "system" as const,
      content: "You assist a legal operations team. State confirmed facts only, keep dates exact, and end with the next human action. Do not give legal advice."
    },
    {
      role: "user" as const,
      content: [
        `Matter: ${matter.matterId}`,
        `Client: ${matter.clientName}`,
        `Issue: ${matter.legalIssue}`,
        `Signed document: ${matter.signedDocument.label}`,
        `Delivery recorded: ${matter.signedDocument.delivered ? "yes" : "no"}`,
        `Deadline: ${matter.deadline}`,
        `Workflow action: ${decision.action}`,
        `Workflow fact: ${decision.summary}`,
        "Draft a concise status update for the matter workspace."
      ].join("\n")
    }
  ];
}
