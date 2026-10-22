# Shared upload storage budget

`STORAGE_BUDGET_MB` optionally sets a shared upload ceiling in MiB. Leave it blank
to preserve the existing local storage behavior. It must be a positive whole
number; malformed settings stop startup.

For a dedicated MongoDB Atlas Free cluster, use:

```env
STORAGE_BUDGET_MB=400
STORAGE_BUDGET_SCOPE=atlas-cluster
```

Atlas Free limits the total uncompressed BSON data and indexes in **all**
databases to 0.5 GB. The cluster scope uses Atlas's `atlasSize` command to count
that aggregate. A 400 MiB upload ceiling leaves space for ordinary application
records, index growth and measurement differences below the provider limit.
Do not share this cluster with unrelated applications whose writes HireLens
cannot control.

For a database on a different MongoDB deployment, `STORAGE_BUDGET_SCOPE=database`
uses that database's uncompressed `dataSize` plus `indexSize`. This is the default
scope; it does not account for other databases on the server.

The guard covers new recording segments, all three resume upload flows and
company logos. It counts the incoming BSON document and reserves another 64 KiB
for metadata and indexes. A shared MongoDB lease serializes the capacity check
and upload write across app instances. Replacing a logo is conservatively
counted as the full incoming upload.

When capacity is insufficient, the upload returns HTTP 507 with
`STORAGE_BUDGET_EXCEEDED`. If statistics are unavailable or the app database user
lacks permission to read them, the upload returns HTTP 503 with
`STORAGE_CHECK_UNAVAILABLE`; cluster scope never silently falls back to narrower
database statistics. Confirm a small upload with the deployed database user
before opening the workspace to candidates.

Existing files remain readable, and an idempotent retry of an already saved
recording segment still succeeds. This setting does not delete or expire data,
and it does not impose an absolute cap on ordinary non-upload application writes.
The administrator should review usage and obtain permission before removing any
stored recruitment data.

MongoDB references:

- [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Atlas Free and Flex storage statistics](https://www.mongodb.com/docs/atlas/free-tier-commands/)
