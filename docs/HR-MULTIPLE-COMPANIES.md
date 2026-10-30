# HR accounts working with multiple companies

One HR account can join multiple company teams using the same email address and
password. Existing accounts keep their original company membership.

1. Each company invites the HR account's registered email from its Team page.
2. The HR signs in and accepts each company invitation on the Team page.
3. The HR chooses a joined company using the Company selector in the workspace.
4. The company sends job interview requests; the HR accepts each job separately.
5. Assigned candidates and interviews appear in that company's workspace.

Joining a company does not automatically accept its jobs or grant access to every
candidate. Job acceptance and individual candidate assignment are still required.
Companies cannot see the HR's other memberships or their other companies' data.

The selected company is kept per browser tab and survives refreshes. Switching
clears the previous workspace before loading the next company. Authenticated
downloads and live room connections carry the same validated company context.
An invitation by itself never grants access: the HR must accept it first.

Availability and the configured candidate capacity are account preferences.
Capacity is applied separately to each company's active candidate count. Calendar
conflict checks cover all companies, so the same HR cannot be scheduled for
overlapping interviews at different companies. These checks do not disclose the
other company's appointment details.

No destructive migration or password reset is needed. Legacy `companyId` remains
the default membership; new memberships are added atomically to `companyIds`.
Every API request independently validates the HR's selected membership. Company
and Candidate accounts cannot acquire HR access by supplying a company selector.
