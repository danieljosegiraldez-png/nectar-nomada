import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getProjectWorkspace, PartnerAccessError } from "../../../lib/partner/workspace";
import { updateTaskStatusFormAction } from "../../actions/partner";
import { AssetUploadForm } from "../../components/AssetUploadForm";
import { FieldSubmissionForm } from "../../components/FieldSubmissionForm";

export const dynamic = "force-dynamic";

const TASK_STATUSES = ["open", "in_progress", "submitted", "completed", "blocked"] as const;

export default async function PartnerProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Partner");

  let workspace;
  try {
    workspace = await getProjectWorkspace(user.userAccountId, projectId);
  } catch (error) {
    if (error instanceof PartnerAccessError) {
      notFound();
    }
    throw error;
  }

  const { project, tasks, submissions, assets, canSubmitTask, canSubmitData, canUploadMedia } = workspace;

  return (
    <div>
      <Link href="/partner" className="nn-back-link">
        {t("backToWorkspace")}
      </Link>

      <h1>{project.name}</h1>
      {project.description ? <p className="nn-muted">{project.description}</p> : null}

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("tasksHeading")}</h2>
        {tasks.length === 0 ? (
          <p className="nn-muted">{t("noTasks")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {tasks.map((task) => (
              <li key={task.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>{task.title}</h3>
                {task.description ? <p className="nn-muted">{task.description}</p> : null}
                <p className="nn-detail-meta">
                  <span>{t(`taskStatus_${task.status}` as "taskStatus_open")}</span>
                  {task.assignedTo ? <span>{t("assignedTo", { name: task.assignedTo.person.displayName })}</span> : null}
                </p>
                {canSubmitTask ? (
                  <form action={updateTaskStatusFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <select name="status" defaultValue={task.status}>
                      {TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`taskStatus_${status}` as "taskStatus_open")}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="nn-button">
                      {t("updateStatusButton")}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("submissionsHeading")}</h2>
        {submissions.length === 0 ? (
          <p className="nn-muted">{t("noSubmissions")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {submissions.map((submission) => (
              <li key={submission.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>{submission.title}</h3>
                <p>{submission.notes}</p>
                <p className="nn-muted">{submission.submittedBy.person.displayName}</p>
              </li>
            ))}
          </ul>
        )}

        {canSubmitData ? <FieldSubmissionForm projectId={projectId} /> : null}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("mediaHeading")}</h2>
        {assets.length === 0 ? (
          <p className="nn-muted">{t("noMedia")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {assets.map((asset) => (
              <li key={asset.id} className="nn-card" style={{ maxWidth: 200 }}>
                <p style={{ margin: 0, wordBreak: "break-all" }}>{asset.originalFilename ?? asset.assetType}</p>
                <p className="nn-muted">{asset.assetType}</p>
              </li>
            ))}
          </ul>
        )}

        {canUploadMedia ? <AssetUploadForm projectId={projectId} /> : null}
      </section>
    </div>
  );
}
