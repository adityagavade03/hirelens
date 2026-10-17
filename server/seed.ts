import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import {
  connectDatabase,
  UserModel,
  CompanyModel,
  ResumeModel,
  JobModel,
  ApplicationModel,
  InterviewModel,
  NotificationModel,
} from "./models.js";
import { config } from "./config.js";
import { matchResume } from "./matching.js";
import { curatedQuestions } from "./problems.js";
async function pdf(text: string) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).text("SAMPLE RESUME — HIRELENS DEMONSTRATION");
    doc.moveDown().fontSize(11).text(text);
    doc.end();
  });
}
async function seed() {
  if (config.production)
    throw new Error("Demo seeding is disabled in production.");
  if (!config.demoLogin)
    throw new Error(
      "Demo data is disabled. Set ALLOW_DEMO_LOGIN=true explicitly before seeding a separate demonstration database.",
    );
  await connectDatabase(config.mongo);
  if (await UserModel.exists({ email: "company@demo.hirelens.local" })) {
    console.log("Sample workspace already exists. Existing records preserved.");
    await mongoose.disconnect();
    return;
  }
  const password = process.env.DEMO_PASSWORD || "HireLensDemo!2026";
  const hash = await bcrypt.hash(password, 12);
  const owner = await UserModel.create({
    name: "Aditya Rao",
    email: "company@demo.hirelens.local",
    passwordHash: hash,
    role: "company",
    sample: true,
  });
  const company = await CompanyModel.create({
    ownerId: owner._id.toString(),
    name: "Evergreen Labs",
    identifier: "HL-DEMO-2026",
    description:
      "A fictional product studio building thoughtful digital experiences. All records marked sample are for student demonstrations.",
    website: "https://example.com",
    location: "Bengaluru, India",
    sample: true,
  });
  owner.companyId = company._id.toString();
  await owner.save();
  const hr = await UserModel.create({
    name: "Maya Chen",
    email: "hr@demo.hirelens.local",
    passwordHash: hash,
    role: "hr",
    companyId: company._id.toString(),
    sample: true,
    profile: {
      expertise: "Frontend engineering, system design, technical interviewing",
    },
  });
  const jobSpecs = [
    [
      "Frontend Engineer",
      "React, TypeScript, Accessibility",
      "Remote",
      "0–2 years",
    ],
    [
      "Backend Developer",
      "Node.js, MongoDB, API design",
      "Bengaluru, India",
      "1–3 years",
    ],
    [
      "Full-stack Engineer",
      "React, Node.js, TypeScript, SQL",
      "Hybrid · Bengaluru",
      "2–4 years",
    ],
    [
      "Product Design Intern",
      "Figma, Prototyping, User research",
      "Remote",
      "Open to students",
    ],
    ["Python Developer", "Python, SQL, Testing", "Pune, India", "0–2 years"],
  ];
  const jobs = [];
  for (const [title, skills, location, experience] of jobSpecs)
    jobs.push(
      await JobModel.create({
        companyId: company._id.toString(),
        companyName: company.name,
        title,
        description: `Join our sample ${title.toLowerCase()} team to build useful, accessible products. Work closely with designers and engineers, explain your technical decisions, and learn through thoughtful code reviews. This is a fictional job for the HireLens student demonstration.`,
        skills: skills.split(", "),
        experience,
        location,
        employment: title.includes("Intern") ? "Internship" : "Full-time",
        criteria:
          "Clear technical explanations, practical project evidence, testing, and thoughtful trade-offs.",
        hrRequests: [
          {
            hrId: hr._id.toString(),
            status: "pending",
            expectedCandidates: 0,
            requestedAt: new Date(),
          },
        ],
        status: "published",
        sample: true,
      }),
    );
  const candidates = [
    {
      name: "Alex Morgan",
      email: "candidate@demo.hirelens.local",
      skills: ["React", "TypeScript", "JavaScript", "Accessibility"],
      status: "Interview Scheduled",
      job: 0,
    },
    {
      name: "Priya Sharma",
      email: "priya@demo.hirelens.local",
      skills: ["Node.js", "MongoDB", "API design", "Testing"],
      status: "Shortlisted",
      job: 1,
    },
    {
      name: "Noah Williams",
      email: "noah@demo.hirelens.local",
      skills: ["React", "Node.js", "TypeScript"],
      status: "Under Review",
      job: 2,
    },
    {
      name: "Kiara Patel",
      email: "kiara@demo.hirelens.local",
      skills: ["React", "JavaScript"],
      status: "Applied",
      job: 0,
    },
    {
      name: "Daniel Kim",
      email: "daniel@demo.hirelens.local",
      skills: ["Python", "SQL"],
      status: "Interview Scheduled",
      job: 4,
    },
    {
      name: "Emma Wilson",
      email: "emma@demo.hirelens.local",
      skills: ["Figma", "Prototyping"],
      status: "Applied",
      job: 3,
    },
  ];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const content = `${c.name}\nSample candidate profile — fictional demonstration data.\nSkills: ${c.skills.join(", ")}.\nEducation: B.Tech Computer Science, Example University.\nExperience: Built student projects and collaborated in a team.\nProjects: Developed an accessible task planner using ${c.skills.join(", ")}. Added unit tests and documented API decisions.`;
    const candidate = await UserModel.create({
      name: c.name,
      email: c.email,
      passwordHash: hash,
      role: "candidate",
      sample: true,
      profile: {
        location: "India",
        headline: "Building thoughtful software, one project at a time.",
        education: "B.Tech Computer Science — Example University (sample)",
        skills: c.skills,
        experience:
          "Student projects and collaborative coursework. This is fictional demonstration data.",
        projects: `A task planner built with ${c.skills.join(", ")}. Included tests and documented technical decisions.`,
      },
    });
    const resume = await ResumeModel.create({
      ownerId: candidate._id.toString(),
      name: "sample-resume.pdf",
      text: content,
      data: await pdf(content),
      sample: true,
    });
    candidate.profile.resumeId = resume._id.toString();
    await candidate.save();
    const job = jobs[c.job];
    const snapshot = JSON.parse(JSON.stringify(candidate.profile));
    const application = await ApplicationModel.create({
      jobId: job._id.toString(),
      companyId: company._id.toString(),
      candidateId: candidate._id.toString(),
      candidateName: c.name,
      companyName: company.name,
      jobTitle: job.title,
      resumeId: resume._id.toString(),
      snapshot,
      match: matchResume(job.skills, snapshot, content),
      status: c.status as
        "Applied" | "Under Review" | "Shortlisted" | "Interview Scheduled",
      sample: true,
    });
    if (c.status === "Interview Scheduled") {
      await InterviewModel.create({
        applicationId: application._id.toString(),
        companyId: company._id.toString(),
        candidateId: candidate._id.toString(),
        interviewerId: hr._id.toString(),
        candidateName: c.name,
        companyName: company.name,
        jobTitle: job.title,
        scheduledAt: new Date(Date.now() + (i === 0 ? 2 : 25) * 3600000),
        timezone: "Asia/Kolkata",
        duration: 45,
        type: "technical",
        topics: job.skills.slice(0, 3),
        difficulty: "Intermediate",
        questions: curatedQuestions(job.skills.slice(0, 3)),
        problemId: i === 0 ? "sum-pairs" : "unique-count",
        sample: true,
      });
      await NotificationModel.create({
        userId: candidate._id.toString(),
        message:
          "Your sample interview has been scheduled. Visit Interviews for details.",
        href: "/interviews",
      });
    }
  }
  for (const job of jobs) {
    const count = await ApplicationModel.countDocuments({
      jobId: job.id,
      status: { $in: ["Shortlisted", "Interview Scheduled"] },
    });
    await JobModel.updateOne(
      { _id: job._id },
      { $set: { "hrRequests.0.expectedCandidates": count } },
    );
  }
  await NotificationModel.create({
    userId: owner._id.toString(),
    message:
      "Welcome to your sample workspace. All statistics come from clearly labeled demonstration records.",
    href: "/jobs",
  });
  console.log(
    "Created sample workspace. No AI scores, execution results or interview answers have been invented.",
  );
  console.log(
    "Demo accounts: company@demo.hirelens.local, hr@demo.hirelens.local, candidate@demo.hirelens.local",
  );
  console.log("Password: the DEMO_PASSWORD value, or the documented default.");
  await mongoose.disconnect();
}
seed().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
