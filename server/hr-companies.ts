import type { Express } from "express";
import { z } from "zod";
import { CompanyModel } from "./models.js";
import {
  ApiError,
  assertHrMembership,
  hrCompanyIds,
  localCompanyAccessAllowed,
  objectId,
  permit,
} from "./security.js";
export {
  assertHrMembership,
  hrCompanyIds,
  hrMemberFilter,
} from "./security.js";

export function registerHrCompanyRoutes(app: Express) {
  app.get("/api/hr/companies", permit("hr"), async (req, res) => {
    const companies = await CompanyModel.find({
      _id: { $in: hrCompanyIds(req.user) },
    })
      .select("name")
      .sort({ name: 1, _id: 1 });
    const allowed = await Promise.all(
      companies.map(async (company) =>
        (await localCompanyAccessAllowed({ companyId: company.id }))
          ? {
              _id: company.id,
              name: company.name,
              active: company.id === req.user.companyId,
            }
          : null,
      ),
    );
    res.json(allowed.filter((company) => company !== null));
  });
  app.patch("/api/hr/companies/active", permit("hr"), async (req, res) => {
    const { companyId } = z
      .object({ companyId: objectId })
      .strict()
      .parse(req.body);
    await assertHrMembership(req.user, companyId);
    if (!(await CompanyModel.exists({ _id: companyId })))
      throw new ApiError(404, "Company not found.");
    // The frontend stores this selection per tab and sends it on subsequent
    // requests. Never overwrite the HR's default or other memberships here.
    res.json({ user: { ...req.user, companyId } });
  });
}
