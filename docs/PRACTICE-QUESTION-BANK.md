# Coding practice bank

The bank adds 300 original coding problems: 100 Easy, 100 Medium and 100 Hard.
The earlier Pair sum and Distinct values warm-ups remain available, giving 302
public questions in total. Search by keyword and filter by difficulty or topic
on the Candidate Practice page. Results are paginated rather than rendering
hundreds of full statements at once.

Each new question has an explicit standard-input/standard-output statement,
constraints, two public examples and at least three hidden test cases. Tasks span
numbers, arrays, strings, matrices, data structures, greedy algorithms, dynamic
programming, graphs, trees and advanced algorithms. Reference solvers produce
deterministic fixtures on the server. They and the hidden cases are omitted from
the public question API and the client bundle. Independent expected-answer and
small-case differential tests supplement fixture consistency checks.

Select a question title to read its statement and examples. Select Practice to
open a coding-only workspace with Python, JavaScript, Java, C and C++ editors.
This creates a personal session with no job/company association. It does not
request camera/microphone access or start an AI interview. Drafts are saved per
language in the candidate's account. The practice journal reopens the workspace;
Finish coding practice closes it while retaining saved code and execution history.

Run uses custom standard input. Submit checks all public/hidden cases. Hidden
results contain verdicts/resources but not their input, output, compiler text or
stderr. Execution depends on a functioning configured Judge0 service. Draft
editing and question browsing remain available when no executor is connected;
results and accepted verdicts are never invented.

The owner selected private execution, so the hosted service is not switched to
the public demonstration runner. The prepared private-server instructions are
in [PRIVATE-EXECUTION-SETUP.md](PRIVATE-EXECUTION-SETUP.md). A compatible dedicated
execution host and authenticated HTTPS endpoint are still required to activate
Run and Submit. The preparation command does not provision or pay for a server.

The five-language diagnostics in `npm run code:check` must pass against that
actual endpoint before activation. Question-bank tests do not establish that a
remote execution service exists or that every language has run on that service.
