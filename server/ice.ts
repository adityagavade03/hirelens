import { createHmac } from "node:crypto";
import { config } from "./config.js";
import { ApiError } from "./security.js";
import { twilioCredentialConfigurationIssues } from "./provider-configuration.js";
import { readProviderJson } from "./provider-response.js";

type IceServer = { urls: string[]; username?: string; credential?: string };
type IceConfiguration = { iceServers: IceServer[] };

function credentialTtl() {
  return Number.isFinite(config.turnTtl)
    ? Math.floor(Math.min(86400, Math.max(60, config.turnTtl)))
    : 3600;
}

// The provider endpoint is fixed; returned browser destinations must also belong
// to Twilio's documented STUN/TURN domain families, never arbitrary URLs.
function validTwilioIceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  const match =
    /^(stun|stuns|turn|turns):([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(stun|turn)\.twilio\.com:([0-9]{1,5})(?:\?transport=(udp|tcp))?$/.exec(
      value,
    );
  return !!(
    match &&
    match[1].startsWith(match[3]) &&
    Number(match[4]) >= 1 &&
    Number(match[4]) <= 65535 &&
    (!match[1].endsWith("s") || match[5] !== "udp")
  );
}

function temporaryCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    /^[\x21-\x7e]+$/.test(value) &&
    ![
      config.twilioAccountSid,
      config.twilioApiKeySid,
      config.twilioApiKeySecret,
      config.twilioAuthToken,
      config.turnSecret,
    ]
      .filter(Boolean)
      .includes(value)
  );
}

async function twilioIceConfiguration(): Promise<IceConfiguration> {
  if (twilioCredentialConfigurationIssues(config).length)
    throw new ApiError(
      503,
      "Twilio relay credentials are incomplete or invalid. Ask the administrator to run the provider checks.",
    );
  const ttl = credentialTtl();
  const username = config.twilioApiKeySid || config.twilioAccountSid;
  const password = config.twilioApiKeySid
    ? config.twilioApiKeySecret
    : config.twilioAuthToken;
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Tokens.json`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ Ttl: String(ttl) }).toString(),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Relay token request was not accepted");
    }
    const data = await readProviderJson(response);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Invalid relay token response");
    const result = data as Record<string, unknown>;
    const returnedTtl = ["string", "number"].includes(typeof result.ttl)
      ? Number(result.ttl)
      : Number.NaN;
    if (
      result.account_sid !== config.twilioAccountSid ||
      !Number.isInteger(returnedTtl) ||
      returnedTtl < 60 ||
      returnedTtl > ttl ||
      !Array.isArray(result.ice_servers) ||
      !result.ice_servers.length ||
      result.ice_servers.length > 16
    )
      throw new Error("Invalid relay token response");
    const iceServers: IceServer[] = result.ice_servers.map((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new Error("Invalid ICE server");
      const row = entry as Record<string, unknown>;
      // Current NTS uses urls; accept its legacy singular url field as well.
      const suppliedUrls = row.urls ?? row.url;
      const urls = Array.isArray(suppliedUrls) ? suppliedUrls : [suppliedUrls];
      if (!urls.length || urls.length > 8 || !urls.every(validTwilioIceUrl))
        throw new Error("Invalid ICE URLs");
      const turn = urls.some((url) => /^turns?:/.test(url));
      if (turn) {
        if (
          urls.some((url) => !/^turns?:/.test(url)) ||
          !temporaryCredential(row.username) ||
          !temporaryCredential(row.credential)
        )
          throw new Error("Invalid temporary relay credentials");
        return { urls, username: row.username, credential: row.credential };
      }
      return { urls };
    });
    if (!iceServers.some((entry) => entry.credential))
      throw new Error("No authenticated relay was provided");
    // Do not return account metadata, API credentials or the raw provider body.
    return { iceServers };
  } catch {
    throw new ApiError(
      502,
      "The video relay provider could not issue valid temporary credentials. Check the Twilio service, credentials and network access, then retry.",
    );
  }
}

export async function iceConfiguration(
  userId: string,
): Promise<IceConfiguration> {
  if (config.turnProvider === "twilio") return twilioIceConfiguration();
  if (config.turnProvider !== "hmac")
    throw new ApiError(503, "TURN_PROVIDER must be hmac or twilio.");
  if (config.production && config.turnLocalDev)
    throw new ApiError(
      503,
      "A local test relay cannot serve production interviews. Configure a public TURN relay.",
    );
  const parse = (value: string) =>
    value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const stun = parse(config.stunUrl),
    turn = parse(config.turnUrl);
  if (
    stun.some((url) => !/^stuns?:[^\s]+$/.test(url)) ||
    turn.some((url) => !/^turns?:[^\s]+$/.test(url))
  )
    throw new ApiError(
      503,
      "Video server settings need attention. Ask the administrator to check STUN/TURN URLs.",
    );
  const iceServers: IceServer[] = [];
  if (stun.length) iceServers.push({ urls: stun });
  if (turn.length && config.turnSecret) {
    const username = `${Math.floor(Date.now() / 1000) + credentialTtl()}:${userId}`;
    iceServers.push({
      urls: turn,
      username,
      credential: createHmac("sha1", config.turnSecret)
        .update(username)
        .digest("base64"),
    });
  }
  return { iceServers };
}
