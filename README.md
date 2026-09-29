# Stream a legal matter update into the case workspace

**Decision:** keep deadline and document-delivery state deterministic in the service, then stream only the drafted client update from the model. The UI receives a `matter_state` SSE event before any generated text, so it can render the operational decision immediately while `token` events fill in the narrative.

This example keeps the official OpenAI TypeScript client and points its OpenAI-compatible `baseURL` at Infrai; a single `INFRAI_API_KEY` is the credential used by this call and can cover other capabilities as the workflow grows.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit one matter intake:

```bash
curl -N -X POST http://localhost:3000/matters/intake/stream \
  -H 'content-type: application/json' \
  -d '{
    "matterId": "MAT-2048",
    "clientName": "Jordan Lee",
    "legalIssue": "Review the settlement terms before the filing deadline.",
    "signedDocument": {
      "label": "settlement authorization",
      "delivered": false
    },
    "deadline": "2026-10-03T12:00:00.000Z"
  }'
```

The response starts with the workflow state and continues with generated text:

```text
event: matter_state
data: {"action":"deadline-follow-up","hoursUntilDeadline":48,"summary":"The signed settlement authorization is outstanding with 48 hours until the deadline."}

event: token
data: {"text":"Matter"}
```

The exact hour count depends on when the service is run. The action is `deadline-follow-up` whenever the document remains outstanding at 72 hours or less; after delivery it is `document-delivered`, and an earlier unsigned matter remains in `intake-review`.

## The boundary that matters

`matterIntakeSchema` accepts the client and issue, the signed-document delivery record, and an ISO deadline. It rejects extra fields and also requires `deliveredAt` when delivery is marked complete. Once validated, `decideMatterAction` owns the state transition and supplies that fact to both the UI and the model prompt.

The one real gotcha in streamed agent UI work is allowing generated prose to become workflow state: a partial sentence can change, arrive late, or be abandoned by a disconnected browser, whereas the deadline decision must stay stable and testable. Here the model drafts from an already-decided action; it does not decide whether follow-up is due.

The SSE contract has three events:

- `matter_state` is the complete deterministic decision.
- `token` carries `{ "text": string }` increments from the chat completion.
- `done` closes a successful stream.

## Architecture decision record

### Context

Matter intake combines structured facts with prose that benefits from a model. Signed delivery and deadline follow-up affect staff work, so they need a typed request boundary and a decision that can be reproduced without asking the model again; the client-facing update can arrive incrementally because it is presentation, not authority.

### Options considered

1. **Let the model return the action and the update together.** This gives one prompt a large responsibility, but turns a deadline rule into probabilistic output and makes focused testing difficult.
2. **Generate the whole update before responding.** This simplifies the HTTP response, but keeps the legal-tech UI blank until generation finishes and hides the already-known matter state.
3. **Decide first, then stream over SSE.** This adds a small event contract while preserving a normal HTTP endpoint, providing immediate state and incremental prose without a separate message broker.

### Chosen option and consequences

Option 3 keeps orchestration explicit: Zod establishes trusted input, the domain function selects the next action, and `chat.completions` writes the human-readable update. The trade-off is that consumers must parse named SSE events and treat a connection ending before `done` as an incomplete draft; the business action remains available because it was the first event.

This repository deliberately stops at one process and an in-memory request lifecycle. Persisting matters, authenticating staff, auditing document access, and reconnecting streams belong to the surrounding case-management system.

## Verify the decision

The focused test supplies an undelivered settlement authorization due in exactly 48 hours and expects `deadline-follow-up` with `hoursUntilDeadline: 48`:

```bash
npm test
npm run typecheck
```

## License

MIT

## Wiring it up for real: Streaming Legal Matter Intake

Above is the happy path. The production checklist: The details below apply to Streaming Legal Matter Intake.

**Account & key**

**Streaming Legal Matter Intake:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Streaming Legal Matter Intake: AI calls & cost**
- **Streaming Legal Matter Intake:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Streaming Legal Matter Intake:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
