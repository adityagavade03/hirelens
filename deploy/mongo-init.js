// Runs only when the production volume is initialized for the first time.
db.getSiblingDB("hirelens").createUser({
  user: "hirelens",
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: "readWrite", db: "hirelens" }],
});
