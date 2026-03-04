import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema';

const email = process.argv[2];

if (!email) {
  console.error('Usage: bun server/scripts/promote-admin.ts <email>');
  process.exit(1);
}

const [found] = await db
  .select({ id: user.id, name: user.name, role: user.role })
  .from(user)
  .where(eq(user.email, email));

if (!found) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

if (found.role === 'admin' || found.role === 'super_admin') {
  console.log(`${found.name} (${email}) is already ${found.role}`);
  process.exit(0);
}

await db.update(user).set({ role: 'admin' }).where(eq(user.id, found.id));

console.log(`Promoted ${found.name} (${email}) from ${found.role} → admin`);
