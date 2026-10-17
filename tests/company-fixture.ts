import { vi, expect } from "vitest";
import { config } from "../server/config";
export async function registerCompany(
  agent: any,
  input: {
    email: string;
    name: string;
    password: string;
    companyName: string;
    role: string;
  },
) {
  const previous = {
    verificationUrl: config.verificationUrl,
    verificationKey: config.verificationKey,
    companyOtpRequired: config.companyOtpRequired,
  };
  Object.assign(config, {
    verificationUrl: "https://verification.example.test/verify",
    verificationKey: "fixture-only-key",
    companyOtpRequired: false,
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(async (_url, options) => {
      const details = JSON.parse(String(options?.body));
      return new Response(
        JSON.stringify({
          verified: true,
          legalName: details.companyName,
          reference: "explicit-test-fixture",
          officialEmail: details.officialEmail,
          registrationNumber: details.registrationNumber,
          country: details.country,
        }),
        { status: 200 },
      );
    });
  try {
    const verified = await agent
      .post("/api/auth/company/verify")
      .send({
        companyName: input.companyName,
        officialEmail: input.email,
        country: "IN",
        registrationNumber: input.email,
        website: "https://example.test",
        industry: "Software",
        companyType: "Private company",
        address: "123 Test Street",
        phone: "1234567890",
        location: "Test City",
      });
    expect(verified.status).toBe(200);
    const registered = await agent
      .post("/api/auth/register")
      .send({
        ...input,
        username: input.email.split("@")[0],
        confirmPassword: input.password,
        verificationToken: verified.body.verificationToken,
      });
    expect(registered.status).toBe(201);
    expect(registered.headers["set-cookie"]).toBeUndefined();
    return await agent
      .post("/api/auth/login")
      .send({ email: input.email, password: input.password, role: "company" });
  } finally {
    fetch.mockRestore();
    Object.assign(config, previous);
  }
}
