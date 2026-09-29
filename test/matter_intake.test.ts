import assert from "node:assert/strict";
import test from "node:test";
import { decideMatterAction, matterIntakeSchema } from "../src/matter_intake.js";

test("an outstanding signed document enters follow-up inside the 72-hour window", () => {
  const matter = matterIntakeSchema.parse({
    matterId: "MAT-2048",
    clientName: "Jordan Lee",
    legalIssue: "Review the settlement terms before the filing deadline.",
    signedDocument: {
      label: "settlement authorization",
      delivered: false
    },
    deadline: "2026-10-03T12:00:00.000Z"
  });

  const decision = decideMatterAction(matter, new Date("2026-10-01T12:00:00.000Z"));

  assert.deepEqual(decision, {
    action: "deadline-follow-up",
    hoursUntilDeadline: 48,
    summary: "The signed settlement authorization is outstanding with 48 hours until the deadline."
  });
});

test("a delivered signed document moves the matter to client response", () => {
  const matter = matterIntakeSchema.parse({
    matterId: "MAT-2049",
    clientName: "Morgan Chen",
    legalIssue: "Confirm receipt and summarize the next procedural step.",
    signedDocument: {
      label: "engagement letter",
      delivered: true,
      deliveredAt: "2026-10-01T09:00:00.000Z"
    },
    deadline: "2026-10-08T12:00:00.000Z"
  });

  const decision = decideMatterAction(matter, new Date("2026-10-01T12:00:00.000Z"));

  assert.equal(decision.action, "document-delivered");
});
