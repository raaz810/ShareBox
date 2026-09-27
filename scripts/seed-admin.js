const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@sharebox.local";
  const password = process.env.ADMIN_PASSWORD || "AdminPass123!";
  const name = "System Administrator";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "ADMIN" || !existing.isActive) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", isActive: true },
      });
      console.log(`Updated existing user ${email} to role ADMIN and active.`);
    } else {
      console.log(`Admin user ${email} already exists and is active.`);
    }
    return;
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  const admin = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log(`Successfully created Admin account:`);
  console.log(`- Email:    ${admin.email}`);
  console.log(`- Password: ${password}`);
  console.log(`- Role:     ${admin.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
