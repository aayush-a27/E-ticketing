/**
 * Creates the one super admin. This is the only way a super_admin account comes
 * into existence — there is no HTTP endpoint that can produce one, so no
 * request can ever escalate to it.
 *
 *   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='...' npm run bootstrap:admin
 *
 * Safe to re-run: an existing account is reported, never silently overwritten.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/utils/password.js';
import { ACCOUNT_STATUS, AUDIT_ACTIONS, ROLES } from '../src/constants/index.js';
import { recordAudit } from '../src/services/auditService.js';

async function prompt(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (silent) {
    // Suppress echo so the password does not land in the terminal scrollback.
    const onData = (char) => {
      if (['\n', '\r', '\u0004'].includes(char.toString())) return;
      stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
    };
    stdin.on('data', onData);
    const answer = await rl.question(question);
    stdin.off('data', onData);
    stdout.write('\n');
    rl.close();
    return answer;
  }
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

function validatePassword(password) {
  if (!password || password.length < 12) {
    throw new Error('The super admin password must be at least 12 characters');
  }
}

async function main() {
  await connectDatabase();

  const email = (env.SUPER_ADMIN_EMAIL || (await prompt('Super admin email: '))).trim().toLowerCase();
  if (!email) throw new Error('An email address is required');

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === ROLES.SUPER_ADMIN) {
      console.log(`A super admin already exists for ${email}. Nothing to do.`);
      return;
    }
    throw new Error(
      `${email} already exists with role "${existing.role}". ` +
        'Use a different address, or promote the account deliberately through the admin API.',
    );
  }

  const anySuperAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN }).select('email');
  if (anySuperAdmin) {
    console.warn(`Note: a super admin already exists (${anySuperAdmin.email}). Creating another.`);
  }

  const name = (env.SUPER_ADMIN_NAME || (await prompt('Name: '))).trim() || 'Platform Admin';
  const password = env.SUPER_ADMIN_PASSWORD || (await prompt('Password: ', { silent: true }));
  validatePassword(password);

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: ROLES.SUPER_ADMIN,
    accountStatus: ACCOUNT_STATUS.ACTIVE,
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    resourceType: 'User',
    resourceId: user._id,
    after: { role: ROLES.SUPER_ADMIN, via: 'bootstrap script' },
    reason: 'Initial super admin bootstrap',
  });

  console.log(`\nSuper admin created: ${user.email}`);
  console.log('Remove SUPER_ADMIN_PASSWORD from your .env now.');
}

main()
  .catch((error) => {
    console.error(`\nBootstrap failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
