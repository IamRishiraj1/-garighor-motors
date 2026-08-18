const { PrismaClient } = require("@prisma/client");

// A single shared Prisma instance, reused across every route file so we
// don't open a new database connection pool per request.
const prisma = new PrismaClient();

module.exports = prisma;
