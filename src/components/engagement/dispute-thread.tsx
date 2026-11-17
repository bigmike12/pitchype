import { CircleCheck, CircleSlash, Scale } from "lucide-react";

import { ProofLinks, ProofShots } from "@/components/engagement/proof-list";
import { Rounds } from "@/components/engagement/rounds";
import { StatementForm } from "@/components/engagement/statement-form";
import { WithdrawDisputeForm } from "@/components/engagement/withdraw-dispute-form";
import { Callout } from "@/components/ui/callout";
import { SectionCard } from "@/components/ui/section-card";
import { deliverableText, formatDay } from "@/lib/campaign";
import { formatDateTime } from "@/lib/creator-profile";
import type { EngagementDetails } from "@/lib/db/applications";
import type { DisputeView } from "@/lib/db/disputes";
import type { SubmissionView } from "@/lib/db/submissions";
import {
  describeDisputeEnd,
  DISPUTE_EXPECTATIONS,
  OPENED_FROM_WORDS,
  STATEMENT_AUTHOR_LABEL,
  type DisputeViewer,
} from "@/lib/dispute-words";
import type {
  StatementState,
  WithdrawDisputeState,
} from "@/lib/dispute-statement";
import { formatNaira } from "@/lib/money";

/**
 * One dispute as both people and admins see it: how it stands (or how it
 * ended), what the job was, the work sent in, and every statement oldest
 * first with who wrote it. While it is open anyone on it can add a statement,
 * and the person who opened it can withdraw. The page around it (header,
 * decide form) is the caller's; each caller passes the Server Actions for its
 * own role.
 */
export function DisputeThread({
  dispute,
  hire,
  rounds,
  viewer,
  statementAction,
  withdrawAction,
}: {
  dispute: DisputeView;
  hire: EngagementDetails;
  rounds: SubmissionView[];
  viewer: { id: string; role: DisputeViewer };
  statementAction: (
    previous: StatementState,
    form: FormData,
  ) => Promise<StatementState>;
  /** Only the people on the hire can withdraw (and only the opener sees it). */
  withdrawAction?: (
    previous: WithdrawDisputeState,
    form: FormData,
  ) => Promise<WithdrawDisputeState>;
}) {
  const open = dispute.status === "open";
  const openerIsCreator = dispute.openedBy === hire.creator.id;
  const names = {
    creator: hire.creator.name,
    business: hire.business.name,
    opener: openerIsCreator ? hire.creator.name : hire.business.name,
  };
  const end = describeDisputeEnd(dispute, hire, viewer.role, names);

  return (
    <div className="space-y-4">
      {end ? (
        <Callout
          tone="info"
          icon={dispute.status === "decided" ? CircleCheck : CircleSlash}
          title={end.title}
        >
          <p>{end.body}</p>
          {dispute.decisionReason && (
            <p className="mt-2">
              <span className="font-semibold">Reason given:</span>{" "}
              <span className="whitespace-pre-line">
                {dispute.decisionReason}
              </span>
            </p>
          )}
        </Callout>
      ) : (
        <Callout
          tone="info"
          icon={Scale}
          title={`${names.opener} opened a dispute ${OPENED_FROM_WORDS[dispute.openedFrom]}`}
        >
          <p>{DISPUTE_EXPECTATIONS}</p>
          <p className="mt-2">Nothing is paid out while it is open.</p>
        </Callout>
      )}

      <SectionCard id="terms-title" title="What the job was" padded>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-muted">Campaign</dt>
            <dd className="font-semibold text-ink">{hire.campaign.title}</dd>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-muted">Agreed price</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(hire.agreedPriceKobo)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Work due by</dt>
              <dd className="font-semibold text-ink">
                {formatDay(hire.campaign.deliverBy)}
              </dd>
            </div>
          </div>
          {hire.campaign.deliverables.length > 0 && (
            <div>
              <dt className="text-muted">Asked to post</dt>
              <dd>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink">
                  {hire.campaign.deliverables.map((deliverable, index) => (
                    <li key={index}>{deliverableText(deliverable)}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Brief</dt>
            <dd className="mt-1 whitespace-pre-line text-body">
              {hire.campaign.brief}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">
          This is the campaign as it reads now. Its price, requirements and
          deliverables can’t change once it is live.
        </p>
      </SectionCard>

      {rounds.length > 0 && (
        <SectionCard id="rounds-title" title="The work sent in">
          <Rounds rounds={rounds} />
        </SectionCard>
      )}

      <SectionCard
        id="statements-title"
        title="Statements"
        aside={
          <span className="rounded-full bg-surface-card px-2 py-0.5 text-xs font-semibold text-ink tabular-nums">
            {dispute.statements.length}
          </span>
        }
      >
        <ol className="divide-y divide-hairline">
          {dispute.statements.map((statement, index) => {
            const label = STATEMENT_AUTHOR_LABEL[statement.authorRole];
            return (
              <li
                key={statement.id}
                className="space-y-3 px-4 py-4 text-sm sm:px-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold text-ink">
                    {label}
                    {statement.authorRole !== "admin" && (
                      <span className="font-normal text-muted">
                        {" "}
                        · {statement.authorName}
                      </span>
                    )}
                    {index === 0 && (
                      <span className="font-normal text-muted">
                        {" "}
                        · opened the dispute
                      </span>
                    )}
                  </p>
                  <time dateTime={statement.createdAt} className="text-muted">
                    {formatDateTime(statement.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-line text-body">
                  {statement.body}
                </p>
                <ProofLinks links={statement.links} />
                <ProofShots
                  files={statement.files}
                  label={`a statement by ${label.toLowerCase()}`}
                />
              </li>
            );
          })}
        </ol>
        {open && (
          <div className="border-t border-hairline p-4 sm:p-5">
            <StatementForm
              disputeId={dispute.id}
              action={statementAction}
              placeholder={
                viewer.role === "admin"
                  ? "Ask a question or ask for more proof."
                  : undefined
              }
            />
          </div>
        )}
      </SectionCard>

      {open && withdrawAction && dispute.openedBy === viewer.id && (
        <WithdrawDisputeForm
          disputeId={dispute.id}
          action={withdrawAction}
          backTo={
            dispute.openedFrom === "denied"
              ? "work sent back"
              : "work in progress"
          }
        />
      )}
    </div>
  );
}
