// prisma/seed.js
import "dotenv/config";
import bcrypt from "bcryptjs";
import pkg from "@prisma/client";

const { PrismaClient, Role } = pkg;

const prisma = new PrismaClient();

async function main() {
  const bridgetPassword = process.env.BRIDGET_PASSWORD;
  const danielPassword = process.env.DANIEL_PASSWORD;

  if (!bridgetPassword || !danielPassword) {
    throw new Error("Missing BRIDGET_PASSWORD or DANIEL_PASSWORD in .env");
  }

  const [bridgetHash, danielHash] = await Promise.all([
    bcrypt.hash(bridgetPassword, 12),
    bcrypt.hash(danielPassword, 12),
  ]);

  const bridget = await prisma.user.upsert({
    where: { email: "therainbowniche@gmail.com" },
    update: {},
    create: {
      email: "therainbowniche@gmail.com",
      name: "Bridget",
      role: Role.OPERATOR,
      hashedPassword: bridgetHash,
    },
  });

  const daniel = await prisma.user.upsert({
    where: { email: "dttruest@gmail.com" },
    update: {},
    create: {
      email: "dttruest@gmail.com",
      name: "Daniel",
      role: Role.SITTER,
      hashedPassword: danielHash,
    },
  });

  console.log("Seeded users:", { bridget, daniel });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
