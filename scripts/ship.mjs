import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function ship() {
  try {
    console.log('\n🚀 Starting the shipping process...\n');

    // 1. Git Add
    console.log('📦 Staging changes...');
    execSync('git add .', { stdio: 'inherit' });

    // 2. Commit Message
    const defaultMsg = `Update ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const commitMsg = await question(`📝 Commit message (default: "${defaultMsg}"): `);
    const finalMsg = commitMsg.trim() || defaultMsg;

    console.log(`\n💾 Committing: "${finalMsg}"...`);
    execSync(`git commit -m "${finalMsg}"`, { stdio: 'inherit' });

    // 3. Deployment Choice
    console.log('\n🌐 Where do you want to deploy?');
    console.log('1. Worker only');
    console.log('2. Pages only');
    console.log('3. Both (Worker & Pages)');
    console.log('4. None (Just commit)');
    
    const choice = await question('\nChoice (1-4): ');

    switch (choice.trim()) {
      case '1':
        console.log('\n⚡ Deploying Worker...');
        execSync('npm run worker:deploy', { stdio: 'inherit' });
        break;
      case '2':
        console.log('\n📄 Deploying Pages...');
        execSync('npm run pages:deploy', { stdio: 'inherit' });
        break;
      case '3':
        console.log('\n⚡ Deploying Worker...');
        execSync('npm run worker:deploy', { stdio: 'inherit' });
        console.log('\n📄 Deploying Pages...');
        execSync('npm run pages:deploy', { stdio: 'inherit' });
        break;
      case '4':
        console.log('\n✅ Skipping deploy. Just committed!');
        break;
      default:
        console.log('\n⚠️ Invalid choice, skipping deploy.');
    }

    console.log('\n✨ All done!\n');
  } catch (error) {
    console.error('\n❌ Error during shipping:', error.message);
  } finally {
    rl.close();
  }
}

ship();
