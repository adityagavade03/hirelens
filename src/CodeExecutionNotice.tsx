import { Notice } from "./ui";

export function CodeExecutionNotice({
  publicDemo,
  practice,
  available,
}: {
  publicDemo?: boolean;
  practice: boolean;
  available?: boolean;
}) {
  if (!publicDemo) return null;
  return (
    <Notice>
      <strong>Public Judge0 runner · personal practice only.</strong>{" "}
      {practice && available ? (
        <>
          Run examples, Run custom input and Submit solution send your source
          code, standard input and test inputs to Judge0's public service, where
          submitted code may be stored. Use sample code without personal
          information or secrets. Availability and usage limits can change.
        </>
      ) : practice ? (
        <>
          Public practice execution is not enabled for this workspace. You can
          write and save code while the administrator connects an execution
          service.
        </>
      ) : (
        <>
          Code execution for hiring interviews needs a managed or self-hosted
          execution service. The public demo cannot run candidate assessments.
          You can still save and discuss code here.
        </>
      )}
    </Notice>
  );
}
