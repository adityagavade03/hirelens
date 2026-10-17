import type { Company } from "../shared/types";
import { Field } from "./ui";
export function CompanyIdentityFields({
  company,
  email,
}: {
  company?: Partial<Company>;
  email?: string;
}) {
  return (
    <>
      <Field label="Legal company name">
        <input
          name="companyName"
          required
          minLength={2}
          maxLength={150}
          defaultValue={company?.name}
          autoComplete="organization"
          placeholder="Company’s registered name"
        />
      </Field>
      <div className="form-grid">
        <Field label="Official company email">
          <input
            name="officialEmail"
            type="email"
            required
            readOnly={!!email}
            defaultValue={email || company?.officialEmail}
            autoComplete="email"
            placeholder="recruiting@company.com"
          />
        </Field>
        <Field label="Company website">
          <input
            name="website"
            type="url"
            required
            defaultValue={company?.website}
            placeholder="https://company.com"
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field
          label="Registration / identification code"
          hint="If applicable in your country; checked by the verification provider."
        >
          <input
            name="registrationNumber"
            maxLength={100}
            defaultValue={company?.registrationNumber}
          />
        </Field>
        <Field
          label="Country code"
          hint="Two letters, for example IN, US or GB."
        >
          <input
            name="country"
            required
            pattern="[A-Za-z]{2}"
            maxLength={2}
            defaultValue={company?.country || "IN"}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Industry">
          <input
            name="industry"
            required
            minLength={2}
            maxLength={120}
            defaultValue={company?.industry}
            placeholder="e.g. Software & technology"
          />
        </Field>
        <Field label="Company type">
          <select
            name="companyType"
            defaultValue={company?.companyType || "Private company"}
          >
            {[
              "Private company",
              "Public company",
              "Partnership",
              "Sole proprietorship",
              "Nonprofit",
              "Government",
              "Other",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Registered address">
        <textarea
          name="address"
          required
          minLength={5}
          maxLength={600}
          rows={2}
          defaultValue={company?.address}
          autoComplete="street-address"
        />
      </Field>
      <div className="form-grid">
        <Field label="City / location">
          <input
            name="location"
            required
            minLength={2}
            maxLength={200}
            defaultValue={company?.location}
          />
        </Field>
        <Field label="Company contact number">
          <input
            name="phone"
            type="tel"
            required
            minLength={5}
            maxLength={40}
            defaultValue={company?.phone}
            autoComplete="tel"
          />
        </Field>
      </div>
    </>
  );
}
