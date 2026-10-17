import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import {
  JobModel,
  ApplicationModel,
  InterviewModel,
  UserModel,
  CompanyModel,
  NotificationModel,
} from "./models.js";
import { ApiError, objectId, permit, accessibleJob } from "./security.js";

// Serialize shortlisting, distribution and scheduling across API processes on standalone MongoDB.
export async function withJobWorkflow<T>(
  jobId: string,
  work: () => Promise<T>,
): Promise<T> {
  const token = randomUUID();
  const acquired = await JobModel.findOneAndUpdate(
    {
      _id: jobId,
      $or: [
        { workflowLockUntil: { $exists: false } },
        { workflowLockUntil: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        workflowLock: token,
        workflowLockUntil: new Date(Date.now() + 60000),
      },
    },
  );
  if (!acquired)
    throw new ApiError(
      409,
      "This job is being updated. Refresh and try again.",
    );
  try {
    return await work();
  } finally {
    await JobModel.updateOne(
      { _id: jobId, workflowLock: token },
      { $unset: { workflowLock: 1, workflowLockUntil: 1 } },
    );
  }
}

// A company lease also protects capacity across different jobs/API processes.
// Always acquire the job lease first; settings updates release this lease before retrying jobs.
export async function withCompanyAllocation<T>(
  companyId: string,
  work: () => Promise<T>,
): Promise<T> {
  const token = randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 20 && !acquired; attempt++) {
    acquired = !!(await CompanyModel.findOneAndUpdate(
      {
        _id: companyId,
        $or: [
          { allocationLockUntil: { $exists: false } },
          { allocationLockUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          allocationLock: token,
          allocationLockUntil: new Date(Date.now() + 60000),
        },
      },
    ));
    if (!acquired) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!acquired)
    throw new ApiError(
      409,
      "Interviewer workloads are being updated. Please try again shortly.",
    );
  try {
    return await work();
  } finally {
    await CompanyModel.updateOne(
      { _id: companyId, allocationLock: token },
      { $unset: { allocationLock: 1, allocationLockUntil: 1 } },
    );
  }
}

const activeAssignmentStatuses = [
  "Shortlisted",
  "Interview Scheduled",
  "Interview Completed",
] as const;
export async function interviewerWorkloads(companyId: string) {
  const [people, applications, jobs] = await Promise.all([
    UserModel.find({ companyId, role: "hr" })
      .select("name email profile")
      .sort({ _id: 1 }),
    ApplicationModel.find({
      companyId,
      assignedHrId: { $type: "string" },
      status: { $in: activeAssignmentStatuses },
    }).select("assignedHrId jobId"),
    JobModel.find({ companyId, status: "published" }).select("hrRequests"),
  ]);
  return people.map((person) => {
    const activeCandidates = applications.filter(
      (a) => a.assignedHrId === person.id,
    ).length;
    const capacity = person.profile?.interviewCapacity ?? 20;
    return {
      hrId: person.id,
      name: person.name,
      email: person.email,
      availability: person.profile?.availability || "available",
      availabilityNote: person.profile?.availabilityNote || "",
      capacity,
      activeCandidates,
      remainingCapacity: Math.max(0, capacity - activeCandidates),
      acceptedJobs: jobs.filter((job) =>
        job.hrRequests.some(
          (r) => r.hrId === person.id && r.status === "accepted",
        ),
      ).length,
    };
  });
}

/** Caller must hold withJobWorkflow. Existing assignments and interviews never move automatically. */
export async function assignShortlistedWithinWorkflow(jobId: string) {
  const job = await JobModel.findById(jobId);
  if (!job || job.status !== "published") return { assigned: 0, pending: 0 };
  const candidates = await ApplicationModel.find({
    jobId,
    companyId: job.companyId,
    status: "Shortlisted",
    assignedHrId: { $exists: false },
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(200);
  if (!candidates.length) return { assigned: 0, pending: 0 };
  const company = await CompanyModel.findById(job.companyId).select("ownerId");
  if (!company) return { assigned: 0, pending: candidates.length };
  return withCompanyAllocation(job.companyId, async () => {
    const accepted = new Set(
      job.hrRequests.filter((r) => r.status === "accepted").map((r) => r.hrId),
    );
    const workloads = (await interviewerWorkloads(job.companyId)).filter(
      (h) => accepted.has(h.hrId) && h.availability === "available",
    );
    const counts = new Map<string, number>();
    const existingAssignments = await ApplicationModel.find({
      jobId,
      assignedHrId: { $type: "string" },
      status: { $in: activeAssignmentStatuses },
    }).select("assignedHrId");
    for (const a of existingAssignments)
      counts.set(a.assignedHrId!, (counts.get(a.assignedHrId!) || 0) + 1);
    const interviews = await InterviewModel.find({
      applicationId: { $in: candidates.map((a) => a.id) },
      status: { $ne: "cancelled" },
    }).select("applicationId");
    const protectedApplications = new Set(
      interviews.map((i) => i.applicationId),
    );
    let assigned = 0,
      pending = 0,
      newlyPending = 0;
    for (const candidate of candidates) {
      const eligible = workloads
        .filter((h) => h.activeCandidates < h.capacity)
        .sort(
          (a, b) =>
            a.activeCandidates - b.activeCandidates ||
            (counts.get(a.hrId) || 0) - (counts.get(b.hrId) || 0) ||
            a.hrId.localeCompare(b.hrId),
        );
      const hr = protectedApplications.has(candidate.id)
        ? undefined
        : eligible[0];
      if (!hr) {
        pending++;
        const reason = protectedApplications.has(candidate.id)
          ? "An existing interview requires company review before assignment."
          : !accepted.size
            ? "Waiting for an HR interviewer to accept this job's invitation."
            : !workloads.length
              ? "The accepted interviewers are currently unavailable."
              : "All available interviewers have reached their active candidate capacity.";
        if (!candidate.assignmentPendingAt) newlyPending++;
        await ApplicationModel.updateOne(
          {
            _id: candidate._id,
            status: "Shortlisted",
            assignedHrId: { $exists: false },
          },
          {
            $set: {
              assignmentPendingReason: reason,
              assignmentPendingAt: candidate.assignmentPendingAt || new Date(),
            },
          },
        );
        continue;
      }
      const update = await ApplicationModel.updateOne(
        {
          _id: candidate._id,
          status: "Shortlisted",
          assignedHrId: { $exists: false },
        },
        {
          $set: {
            assignedHrId: hr.hrId,
            assignedHrName: hr.name,
            assignedAt: new Date(),
          },
          $unset: { assignmentPendingAt: 1, assignmentPendingReason: 1 },
        },
      );
      if (!update.modifiedCount) continue;
      assigned++;
      hr.activeCandidates++;
      counts.set(hr.hrId, (counts.get(hr.hrId) || 0) + 1);
      await NotificationModel.insertMany([
        {
          userId: hr.hrId,
          message: `${candidate.candidateName} is assigned to you for ${job.title}. Review the submitted resume and schedule the interview.`,
          href: `/applications?jobId=${jobId}&applicationId=${candidate.id}`,
        },
        {
          userId: candidate.candidateId,
          message: `You are shortlisted for an interview for ${job.title}. ${hr.name} is your assigned interviewer and will schedule the next stage. This is not a job offer.`,
          href: "/applications",
        },
      ]);
    }
    if (newlyPending)
      await NotificationModel.create({
        userId: company.ownerId,
        message: `${newlyPending} shortlisted candidate${newlyPending === 1 ? " is" : "s are"} waiting for an interviewer for ${job.title}. Invite HRs, confirm availability, or increase capacity.`,
        href: `/jobs/${jobId}`,
      });
    return { assigned, pending };
  });
}

export async function autoAssignShortlistedCandidates(jobId: string) {
  return withJobWorkflow(jobId, () => assignShortlistedWithinWorkflow(jobId));
}

/** Persistent pending records are the retry queue; no in-memory assignment state is required. */
export async function retryPendingAssignments(companyId?: string) {
  const pending = await ApplicationModel.find({
    ...(companyId ? { companyId } : {}),
    status: "Shortlisted",
    assignedHrId: { $exists: false },
  })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(200)
    .select("jobId");
  for (const jobId of [...new Set(pending.map((a) => a.jobId))].slice(0, 20)) {
    try {
      await autoAssignShortlistedCandidates(jobId);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) throw error;
    }
  }
}

export function registerRecruitmentRoutes(app: Express) {
  app.get("/api/hr/workloads", permit("company"), async (req, res) => {
    res.json(await interviewerWorkloads(req.user.companyId || "__none"));
  });
  app.get("/api/hr/workload", permit("hr"), async (req, res) => {
    res.json(
      (await interviewerWorkloads(req.user.companyId || "__none")).find(
        (hr) => hr.hrId === req.user._id,
      ) || null,
    );
  });
  app.patch("/api/hr/workload-settings", permit("hr"), async (req, res) => {
    const settings = z
      .object({
        availability: z.enum(["available", "busy", "unavailable"]),
        interviewCapacity: z.number().int().min(1).max(500),
        availabilityNote: z.string().trim().max(500).default(""),
      })
      .strict()
      .parse(req.body);
    if (!req.user.companyId)
      throw new ApiError(
        409,
        "Join a company before changing interview capacity.",
      );
    await withCompanyAllocation(req.user.companyId, async () => {
      await UserModel.updateOne(
        { _id: req.user._id, role: "hr", companyId: req.user.companyId },
        {
          $set: {
            "profile.availability": settings.availability,
            "profile.interviewCapacity": settings.interviewCapacity,
            "profile.availabilityNote": settings.availabilityNote,
          },
        },
      );
    });
    await retryPendingAssignments(req.user.companyId);
    res.json(
      (await interviewerWorkloads(req.user.companyId)).find(
        (hr) => hr.hrId === req.user._id,
      ),
    );
  });
  app.post(
    "/api/jobs/:id/auto-distribution",
    permit("company"),
    async (req, res) => {
      const id = objectId.parse(req.params.id);
      await accessibleJob(req.user, id);
      res.json(await autoAssignShortlistedCandidates(id));
    },
  );
  app.get("/api/jobs/:id", permit("company", "hr"), async (req, res) => {
    const job = await JobModel.findOne({
      _id: objectId.parse(req.params.id),
      companyId: req.user.companyId || "__none",
      ...(req.user.role === "hr" ? { "hrRequests.hrId": req.user._id } : {}),
    });
    if (!job) throw new ApiError(404, "Job not found.");
    const myRequest = job.hrRequests.find((r) => r.hrId === req.user._id);
    const applications = await ApplicationModel.find({
      jobId: job.id,
      ...(req.user.role === "hr" && myRequest?.status !== "accepted"
        ? { _id: "000000000000000000000000" }
        : req.user.role === "hr"
          ? { assignedHrId: req.user._id }
          : {}),
    }).sort({ createdAt: -1 });
    const interviews = await InterviewModel.find({
      applicationId: { $in: applications.map((a) => a.id) },
      status: { $ne: "cancelled" },
    }).select(
      "applicationId status interviewerId scheduledAt roundIndex roundCount roundName",
    );
    const shortlisted = applications.filter(
      (a) =>
        [
          "Shortlisted",
          "Interview Scheduled",
          "Interview Completed",
          "Selected",
        ].includes(a.status) || a.assignedHrId,
    );
    const distributed = shortlisted.filter((a) => a.assignedHrId);
    const completed = interviews.filter((i) => i.status === "completed").length;
    const completedApplications = distributed.filter(
      (a) =>
        ["Selected", "Rejected"].includes(a.status) ||
        interviews.some(
          (i) =>
            i.applicationId === a.id &&
            i.status === "completed" &&
            (i.roundIndex || 0) + 1 >= (i.roundCount || 1),
        ),
    ).length;
    const active = interviews.filter((i) =>
      ["scheduled", "live"].includes(i.status),
    ).length;
    const accepted = job.hrRequests.filter(
      (r) => r.status === "accepted",
    ).length;
    const pending = job.hrRequests.filter((r) => r.status === "pending").length;
    const recruitmentStatus =
      job.status === "draft"
        ? "Draft"
        : job.status === "closed"
          ? "Closed"
          : distributed.length > 0 &&
              distributed.length === shortlisted.length &&
              completedApplications === distributed.length
            ? "Completed"
            : active || completed
              ? "Interview in Progress"
              : distributed.length
                ? "Ready to Schedule"
                : pending || accepted
                  ? "HR Assignment"
                  : shortlisted.length
                    ? "Candidates Shortlisted"
                    : applications.some((a) => a.status === "Under Review")
                      ? "Shortlisting"
                      : applications.length
                        ? "Applications Received"
                        : "Published";
    const result: any = job.toObject();
    if (req.user.role === "hr")
      result.hrRequests = result.hrRequests.filter(
        (r: any) => r.hrId === req.user._id,
      );
    res.json({
      job: result,
      applications,
      interviews,
      recruitmentStatus,
      counts: {
        applications: applications.length,
        shortlisted: shortlisted.length,
        distributed: distributed.length,
        pendingAssignments: applications.filter(
          (a) => a.status === "Shortlisted" && !a.assignedHrId,
        ).length,
        accepted,
        pending,
        completed,
        active,
      },
    });
  });

  app.patch("/api/jobs/:id/hr-count", permit("company"), async (req, res) => {
    const { requiredHrCount } = z
      .object({ requiredHrCount: z.number().int().min(1).max(100) })
      .strict()
      .parse(req.body);
    const id = objectId.parse(req.params.id);
    await accessibleJob(req.user, id);
    res.json(
      await withJobWorkflow(id, async () => {
        const job = await accessibleJob(req.user, id);
        if (
          job.hrRequests.filter((r) => r.status !== "declined").length >
          requiredHrCount
        )
          throw new ApiError(
            409,
            "The required count cannot be lower than your pending and accepted requests.",
          );
        job.requiredHrCount = requiredHrCount;
        await job.save();
        return job;
      }),
    );
  });

  app.post("/api/jobs/:id/hr-requests", permit("company"), async (req, res) => {
    const { hrIds } = z
      .object({
        hrIds: z
          .array(objectId)
          .min(1)
          .max(100)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Choose each HR only once",
          ),
      })
      .strict()
      .parse(req.body);
    const id = objectId.parse(req.params.id);
    await accessibleJob(req.user, id);
    const job = await withJobWorkflow(id, async () => {
      const job = await accessibleJob(req.user, id);
      if (job.status !== "published")
        throw new ApiError(409, "Publish this job before requesting HRs.");
      const shortlisted = await ApplicationModel.countDocuments({
        jobId: id,
        status: "Shortlisted",
      });
      const active = job.hrRequests.filter((r) => r.status !== "declined");
      if (hrIds.some((id) => active.some((r) => r.hrId === id)))
        throw new ApiError(
          409,
          "An HR already has a pending or accepted request for this job.",
        );
      if (active.length + hrIds.length > job.requiredHrCount)
        throw new ApiError(
          409,
          "Increase the required HR count before sending more requests.",
        );
      const hrs = await UserModel.find({
        _id: { $in: hrIds },
        companyId: req.user.companyId,
        role: "hr",
        "profile.availability": { $ne: "unavailable" },
      });
      if (hrs.length !== hrIds.length)
        throw new ApiError(
          400,
          "Choose available HR members from your company.",
        );
      for (const hrId of hrIds) {
        const previous = job.hrRequests.find((r) => r.hrId === hrId);
        const request = {
          hrId,
          status: "pending" as const,
          expectedCandidates: Math.ceil(shortlisted / job.requiredHrCount),
          requestedAt: new Date(),
          respondedAt: undefined,
        };
        if (previous) Object.assign(previous, request);
        else job.hrRequests.push(request);
      }
      await job.save();
      await NotificationModel.insertMany(
        hrIds.map((userId) => ({
          userId,
          message: `Interview request for ${job.title}. Review the instructions and accept or reject.`,
          href: "/assignments",
        })),
      );
      return job;
    });
    res.status(201).json(job);
  });

  app.get("/api/hr/assignments", permit("hr"), async (req, res) => {
    const jobs = await JobModel.find({
      companyId: req.user.companyId || "__none",
      "hrRequests.hrId": req.user._id,
    }).sort({ updatedAt: -1 });
    const result = await Promise.all(
      jobs.map(async (job) => ({
        ...job.toObject(),
        hrRequests: job.hrRequests.filter((r) => r.hrId === req.user._id),
        myRequest: {
          ...job.hrRequests.find((r) => r.hrId === req.user._id)!.toObject(),
          expectedCandidates: Math.ceil(
            (await ApplicationModel.countDocuments({
              jobId: job.id,
              $or: [
                {
                  status: {
                    $in: [
                      "Shortlisted",
                      "Interview Scheduled",
                      "Interview Completed",
                      "Selected",
                    ],
                  },
                },
                { assignedHrId: { $type: "string" } },
              ],
            })) / job.requiredHrCount,
          ),
        },
        assignedCandidateCount: await ApplicationModel.countDocuments({
          jobId: job.id,
          assignedHrId: req.user._id,
        }),
      })),
    );
    res.json(result);
  });

  app.patch("/api/hr/assignments/:id", permit("hr"), async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["accepted", "declined"]) })
      .strict()
      .parse(req.body);
    const id = objectId.parse(req.params.id);
    const exists = await JobModel.exists({
      _id: id,
      companyId: req.user.companyId || "__none",
      hrRequests: { $elemMatch: { hrId: req.user._id, status: "pending" } },
    });
    if (!exists)
      throw new ApiError(
        409,
        "This request is no longer pending. Refresh your assignments.",
      );
    const job = await withJobWorkflow(id, async () => {
      const updated = await JobModel.findOneAndUpdate(
        {
          _id: id,
          companyId: req.user.companyId,
          hrRequests: { $elemMatch: { hrId: req.user._id, status: "pending" } },
        },
        {
          $set: {
            "hrRequests.$.status": status,
            "hrRequests.$.respondedAt": new Date(),
          },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        throw new ApiError(409, "This request is no longer pending.");
      const company = await CompanyModel.findById(req.user.companyId);
      if (company)
        await NotificationModel.create({
          userId: company.ownerId,
          message: `${req.user.name} ${status === "declined" ? "rejected" : "accepted"} the interview request for ${updated.title}.`,
          href: `/jobs/${id}`,
        });
      if (status === "accepted") await assignShortlistedWithinWorkflow(id);
      return updated;
    });
    res.json({
      ...job.toObject(),
      hrRequests: job.hrRequests.filter((r) => r.hrId === req.user._id),
    });
  });

  app.patch(
    "/api/jobs/:id/distribution",
    permit("company"),
    async (req, res) => {
      const { assignments } = z
        .object({
          assignments: z
            .array(
              z
                .object({
                  applicationId: objectId,
                  hrId: objectId.nullable(),
                  expectedHrId: objectId.nullable(),
                })
                .strict(),
            )
            .min(1)
            .max(300)
            .refine(
              (rows) =>
                new Set(rows.map((r) => r.applicationId)).size === rows.length,
              "Assign each candidate only once",
            ),
        })
        .strict()
        .parse(req.body);
      const id = objectId.parse(req.params.id);
      await accessibleJob(req.user, id);
      await withJobWorkflow(id, async () => {
        const job = await accessibleJob(req.user, id);
        await withCompanyAllocation(job.companyId, async () => {
          const accepted = new Set(
            job.hrRequests
              .filter((r) => r.status === "accepted")
              .map((r) => r.hrId),
          );
          const members = await UserModel.find({
            _id: { $in: [...accepted] },
            role: "hr",
            companyId: req.user.companyId,
          }).select("_id name profile");
          const authorized = new Set(members.map((m) => m.id));
          const workloads = await interviewerWorkloads(job.companyId);
          const applications = await ApplicationModel.find({
            _id: { $in: assignments.map((r) => r.applicationId) },
            jobId: id,
            companyId: req.user.companyId,
          });
          if (applications.length !== assignments.length)
            throw new ApiError(404, "A candidate does not belong to this job.");
          const projected = new Map(
            workloads.map((h) => [h.hrId, h.activeCandidates]),
          );
          for (const row of assignments) {
            const application = applications.find(
              (a) => a.id === row.applicationId,
            )!;
            if (application.assignedHrId)
              projected.set(
                application.assignedHrId,
                (projected.get(application.assignedHrId) || 0) - 1,
              );
            if (row.hrId)
              projected.set(row.hrId, (projected.get(row.hrId) || 0) + 1);
          }
          const interviews = await InterviewModel.find({
            applicationId: { $in: applications.map((a) => a.id) },
            status: { $ne: "cancelled" },
          });
          for (const row of assignments) {
            const application = applications.find(
              (a) => a.id === row.applicationId,
            )!;
            if ((application.assignedHrId || null) !== row.expectedHrId)
              throw new ApiError(
                409,
                "Candidate assignments changed. Refresh before distributing again.",
              );
            if (row.hrId && !authorized.has(row.hrId))
              throw new ApiError(
                403,
                "Candidates can only be assigned to HRs who accepted this job.",
              );
            if (row.hrId && row.hrId !== application.assignedHrId) {
              const target = workloads.find((hr) => hr.hrId === row.hrId);
              if (!target || target.availability !== "available")
                throw new ApiError(409, "Choose an available interviewer.");
              if ((projected.get(row.hrId) || 0) > target.capacity)
                throw new ApiError(
                  409,
                  "This assignment exceeds the interviewer's active candidate capacity.",
                );
            }
            const existing = interviews.filter(
              (i) => i.applicationId === application.id,
            );
            // Older scheduled records may be linked only to their original, now accepted HR.
            const legacy =
              !application.assignedHrId &&
              row.hrId &&
              application.status === "Interview Scheduled" &&
              existing.length > 0 &&
              existing.every(
                (i) => i.status === "scheduled" && i.interviewerId === row.hrId,
              );
            if (application.status !== "Shortlisted" && !legacy)
              throw new ApiError(
                409,
                "Only shortlisted candidates can be distributed.",
              );
            if (existing.length && !legacy)
              throw new ApiError(
                409,
                "An interview already exists. Cancel a scheduled interview before changing its assignment.",
              );
          }
          const changedAssignments = assignments.filter(
            (row) => row.hrId !== row.expectedHrId,
          );
          if (changedAssignments.length)
            await ApplicationModel.bulkWrite(
              changedAssignments.map((row) => ({
                updateOne: {
                  filter: { _id: row.applicationId, jobId: id },
                  update: row.hrId
                    ? {
                        $set: {
                          assignedHrId: row.hrId,
                          assignedHrName: members.find((m) => m.id === row.hrId)
                            ?.name,
                          assignedAt: new Date(),
                        },
                        $unset: {
                          assignmentPendingAt: 1,
                          assignmentPendingReason: 1,
                        },
                      }
                    : {
                        $unset: {
                          assignedHrId: 1,
                          assignedHrName: 1,
                          assignedAt: 1,
                        },
                        $set: {
                          assignmentPendingAt: new Date(),
                          assignmentPendingReason:
                            "Waiting for automatic interviewer assignment.",
                        },
                      },
                },
              })),
            );
          const changedHrs = new Set(
            changedAssignments
              .flatMap((r) => [r.hrId, r.expectedHrId])
              .filter((v): v is string => !!v),
          );
          await NotificationModel.insertMany(
            [...changedHrs].map((userId) => ({
              userId,
              message: `Your assigned candidates for ${job.title} have been updated. Review the job instructions and candidate list.`,
              href: `/applications?jobId=${id}`,
            })),
          );
          for (const row of changedAssignments) {
            const candidate = applications.find(
              (a) => a.id === row.applicationId,
            )!;
            await NotificationModel.create({
              userId: candidate.candidateId,
              message: row.hrId
                ? `Your interviewer for ${job.title} is now ${members.find((m) => m.id === row.hrId)?.name || "an assigned HR"}. Your interviewer will schedule the next stage.`
                : `Your interview for ${job.title} is waiting for an available interviewer. Your shortlist status is unchanged.`,
              href: "/applications",
            });
          }
        });
      });
      res.json({ ok: true });
    },
  );
}
