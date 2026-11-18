import { after } from "next/server";

import { sendDueEmailsSafely } from "@/lib/send-emails";

// Sends the notification emails that are due, once the response has gone out,
// so an email problem can't slow or fail the action that caused it (Stage 8;
// CLAUDE.md §8). Call it after the database change succeeded and before any
// redirect(), which throws and would skip anything below it. Never wrap it in
// a callback form: sendDueEmailsSafely takes its dependencies as an argument
// in tests, so it is called here with none.
export function sendEmailsAfterResponse(): void {
  after(() => sendDueEmailsSafely());
}
